import type { EntityManager } from 'typeorm';
import { authStatus, AuthStatus } from '../common/auth-config';
import type { AlertState, AuthConfig, AuthMethod, Hit, HttpMethod } from '../common/types';
import type { MonitorModule } from '../modules/entities/module.entity';
import type { Api } from './entities/api.entity';

/** Card shape (design → example environment summary). */
export interface ApiCardData {
  id: number;
  name: string;
  method: HttpMethod;
  endpoint: string;
  tag: { key: string; value: string } | null;
  passRule: { countKey: string | null; dataKey: string | null };
  frequencyMinutes: number;
  frequencySource: 'api' | 'module';
  isActive: boolean;
  lastStatusCode: number | null;
  lastPassed: boolean | null;
  lastFailureReason: string | null;
  lastRunAt: string | null;
  lastHits: Hit[];
  consecutiveFailures: number;
  failureThreshold: number;
  state: AlertState;
}
export interface ApiRow extends ApiCardData {
  moduleId: number;
  baseUrlOverride: string | null;
  sortOrder: number;
}
export interface ApiDetail extends ApiRow {
  moduleName: string;
  environment: string;
  effectiveBaseUrl: string;
  moduleBaseUrl: string;
  moduleFrequencyMinutes: number;
  moduleAuthMethod: AuthMethod;
  auth: AuthStatus;
  headers: Record<string, string>;
  body: unknown | null;
  ownFrequencyMinutes: number | null;
  timeoutMs: number;
  streakReset?: boolean;
}

type ModFreq = Pick<MonitorModule, 'frequencyMinutes' | 'failureThreshold'>;

/** Effective frequency = API value, else module value, else the default (5). */
export function effectiveFrequency(api: Pick<Api, 'frequencyMinutes'>, mod: Pick<MonitorModule, 'frequencyMinutes'> | null, fallback = 5) {
  if (api.frequencyMinutes) return { minutes: api.frequencyMinutes, source: 'api' as const };
  return { minutes: mod?.frequencyMinutes ?? fallback, source: 'module' as const };
}

export function toCard(api: Api, mod: ModFreq, hits: Hit[]): ApiCardData {
  const f = effectiveFrequency(api, mod);
  return {
    id: api.id,
    name: api.name,
    method: api.method,
    endpoint: api.endpoint,
    tag: api.tagKey && api.tagValue ? { key: api.tagKey, value: api.tagValue } : null,
    passRule: { countKey: api.countKey, dataKey: api.dataKey },
    frequencyMinutes: f.minutes,
    frequencySource: f.source,
    isActive: api.isActive,
    lastStatusCode: api.lastStatusCode,
    lastPassed: api.lastPassed,
    lastFailureReason: api.lastFailureReason,
    lastRunAt: api.lastRunAt ? api.lastRunAt.toISOString() : null,
    lastHits: hits,
    consecutiveFailures: api.consecutiveFailures,
    failureThreshold: mod.failureThreshold,
    state: api.state,
  };
}

export function toRow(api: Api, mod: ModFreq, hits: Hit[]): ApiRow {
  return { ...toCard(api, mod, hits), moduleId: api.moduleId, baseUrlOverride: api.baseUrlOverride, sortOrder: api.sortOrder };
}

export function toDetail(
  api: Api,
  mod: MonitorModule & { environment: { key: string } },
  hits: Hit[],
  apiAuth: AuthConfig | null,
): ApiDetail {
  return {
    ...toRow(api, mod, hits),
    moduleName: mod.name,
    environment: mod.environment.key,
    effectiveBaseUrl: api.baseUrlOverride ?? mod.baseUrl,
    moduleBaseUrl: mod.baseUrl,
    moduleFrequencyMinutes: mod.frequencyMinutes,
    moduleAuthMethod: mod.authMethod,
    auth: authStatus(api.authMethod, apiAuth),
    headers: api.headers ?? {},
    body: api.body ?? null,
    ownFrequencyMinutes: api.frequencyMinutes,
    timeoutMs: api.timeoutMs,
  };
}

/** Last 5 hits per API, oldest first (LATERAL over ix_runs_api_time). */
export async function loadLastHits(m: EntityManager, apiIds: number[]): Promise<Map<number, Hit[]>> {
  const out = new Map<number, Hit[]>(apiIds.map((id) => [id, []]));
  if (!apiIds.length) return out;
  const rows: { api_id: number; status_code: number | null; is_success: boolean; failure_reason: string | null }[] = await m.query(
    `SELECT a.id AS api_id, h.status_code, h.is_success, h.failure_reason
       FROM unnest($1::int[]) AS a(id)
       CROSS JOIN LATERAL (
         SELECT status_code, is_success, failure_reason, executed_at
           FROM api_runs r WHERE r.api_id = a.id
          ORDER BY executed_at DESC LIMIT 5
       ) h
      ORDER BY a.id, h.executed_at ASC`,
    [apiIds],
  );
  for (const r of rows) out.get(r.api_id)!.push({ code: r.status_code, passed: r.is_success, reason: r.failure_reason });
  return out;
}
