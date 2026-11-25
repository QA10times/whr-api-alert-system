// lib/format.ts — section 11 display rules
import type { Hit } from './types';

export const FAILURE_THRESHOLD = 5;

const abs = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const clock = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function absoluteTime(iso: string | null): string {
  if (!iso) return 'Never';
  return `${abs.format(new Date(iso))} IST`;
}
export function clockTime(when: string | Date): string {
  return clock.format(typeof when === 'string' ? new Date(when) : when);
}
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** Badge text: the code, TIMEOUT for null after a run, — before the first run. */
export function statusLabel(code: number | null, ran: boolean): string {
  if (!ran) return '—';
  return code === null ? 'TIMEOUT' : String(code);
}

/** Reason line shown under a failed hit. Backend reason as is, prefixed for 200s. */
export function failureText(code: number | null, reason: string | null): string {
  if (code === 200) return `200, but ${reason ?? 'a check failed'}`;
  if (code === null) return reason ?? 'Timeout, no response';
  return reason ?? `HTTP ${code}`;
}

/** Short label for one hit, used in the strip aria-label. */
export function hitLabel(h: Hit): string {
  if (h.passed) return `${h.code} passed`;
  if (h.code === 200) return `200 but ${h.reason ?? 'a check failed'}`;
  if (h.code === null) return 'Timeout';
  return `HTTP ${h.code}`;
}

export function alertPill(code: number | null, reason: string | null): string {
  if (code === 200) return `200, ${reason ?? 'check failed'} × ${FAILURE_THRESHOLD}`;
  if (code === null) return `Timeout × ${FAILURE_THRESHOLD}`;
  return `HTTP ${code} × ${FAILURE_THRESHOLD}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function frequencyLabel(min: number, source: 'api' | 'module'): string {
  return `Every ${min} min${source === 'api' ? ' (API)' : ''}`;
}
export function tableFrequency(min: number, source: 'api' | 'module'): string {
  return `${min} min${source === 'module' ? ' (module)' : ''}`;
}

export function passRuleText(countKey: string | null, dataKey: string | null): string {
  const parts = ['status 200'];
  if (countKey) parts.push(`${countKey} > 0`);
  if (dataKey) parts.push(`${dataKey}[] > 1 object`);
  return `Passes on ${parts.join(', ')}`;
}

export const AUTH_LABEL: Record<string, string> = {
  NONE: 'None',
  BEARER: 'Bearer token',
  BASIC: 'Basic',
  API_KEY: 'API key header',
  COOKIE: 'Cookie',
  INHERIT: 'Same as module',
};

export const MISSING_LABEL: Record<string, string> = {
  token: 'token',
  username: 'username',
  password: 'password',
  apiKey: 'API key',
  headerName: 'header name',
  cookie: 'cookie',
};
