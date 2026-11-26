import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';
import path from 'node:path';
import type { AlertKind, Hit } from '../common/types';

export interface AlertContext {
  kind: AlertKind;
  platformKey: string;
  envKey: string;
  moduleName: string;
  apiId: number;
  apiName: string;
  tag: { key: string; value: string } | null;
  method: string;
  url: string;
  statusCode: number | null;
  errorKind: 'TIMEOUT' | 'NETWORK_ERROR' | null;
  reason: string | null;
  failures: number;
  observedAt: Date;
  firstFailedAt: Date;
  latencyMs: number | null;
  snippet: string | null;
  lastResults: Hit[];
  passRule: { countKey: string | null; dataKey: string | null };
  groupName: string | null;
  appBaseUrl: string;
  timeZone: string;
}

const isoSeconds = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** "24 Nov 2026, 15:05:02 IST" in the alert timezone. */
export function formatLocal(d: Date, timeZone: string): string {
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  const abbr =
    new Intl.DateTimeFormat('en-IN', { timeZone, timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ??
    timeZone;
  return `${local} ${abbr}`;
}

/** "24 Nov 2026, 15:05:02 IST  (2026-11-24T09:35:02Z)" */
export function formatWithUtc(d: Date, timeZone: string): string {
  return `${formatLocal(d, timeZone)}  (${isoSeconds(d)})`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

export function passRuleText(r: { countKey: string | null; dataKey: string | null }): string {
  return ['200', r.countKey && `${r.countKey} > 0`, r.dataKey && `${r.dataKey}[] > 1 object`].filter(Boolean).join(', ');
}

const hitLabel = (h: Hit) => (h.code !== null ? String(h.code) : h.reason?.startsWith('Network') ? 'NETWORK_ERROR' : 'TIMEOUT');

function statusLabel(c: AlertContext): string {
  return c.statusCode !== null ? String(c.statusCode) : (c.errorKind ?? 'TIMEOUT');
}

function statusLine(c: AlertContext): string {
  if (c.statusCode === null) return `${c.errorKind ?? 'TIMEOUT'} (no response)`;
  const phrase = STATUS_CODES[c.statusCode];
  return phrase ? `${c.statusCode} ${phrase}` : String(c.statusCode);
}

const load = (name: string) =>
  Handlebars.compile(readFileSync(path.join(__dirname, 'templates', `${name}.hbs`), 'utf8'), { noEscape: true, strict: true });

let templates: { failure: HandlebarsTemplateDelegate; recovery: HandlebarsTemplateDelegate } | null = null;

/** Subject and plain-text body; the three required fields (status, time, tag) lead both. */
export function renderAlert(c: AlertContext): { subject: string; body: string } {
  templates ??= { failure: load('failure'), recovery: load('recovery') };
  const prefix = `[${c.platformKey.toUpperCase()} · ${c.envKey.toUpperCase()}]`;
  const tagText = c.tag ? `${c.tag.key} = ${c.tag.value}` : '—';
  const common = {
    statusLine: statusLine(c),
    passRule: passRuleText(c.passRule),
    observedAt: formatWithUtc(c.observedAt, c.timeZone),
    failingSince: formatLocal(c.firstFailedAt, c.timeZone),
    tag: tagText,
    moduleName: c.moduleName,
    apiName: c.apiName,
    request: `${c.method} ${c.url}`,
    latency: c.latencyMs === null ? '—' : `${c.latencyMs} ms${c.errorKind === 'TIMEOUT' ? ' (timeout)' : ''}`,
    lastResults: c.lastResults.map(hitLabel).join(', ') || '—',
    dashboardUrl: `${c.appBaseUrl.replace(/\/+$/, '')}/apis/${c.apiId}`,
    groupName: c.groupName ?? '(no group)',
  };

  if (c.kind === 'RECOVERY') {
    return {
      subject: `${prefix} ${c.apiName} recovered — ${statusLabel(c)}`.slice(0, 300),
      body: templates.recovery({ ...common, downtime: formatDuration(c.observedAt.getTime() - c.firstFailedAt.getTime()) }),
    };
  }
  const tagSubject = c.tag ? ` (${c.tag.key}: ${c.tag.value})` : '';
  return {
    subject: `${prefix} ${c.apiName} failing — ${statusLabel(c)} × ${c.failures}${tagSubject}`.slice(0, 300),
    body: templates.failure({
      ...common,
      failures: c.failures,
      failedCheck: c.statusCode === 200 && c.reason ? `200 but ${c.reason}` : (c.reason ?? statusLine(c)),
      response: c.snippet ? c.snippet.slice(0, 300) : '(no response body)',
    }),
  };
}
