import { AUTH_KEYS, AuthConfig, AuthConfigKey, ApiAuthMethod, AuthMethod } from './types';

export const DEFAULT_API_KEY_HEADER = 'X-API-Key';

export interface AuthStatus {
  method: ApiAuthMethod;
  configured: boolean;
  missing: AuthConfigKey[];
}

/** Required keys that are absent or blank for the method. INHERIT and NONE never miss anything. */
export function missingKeys(method: ApiAuthMethod, cfg: AuthConfig | null | undefined): AuthConfigKey[] {
  if (method === 'INHERIT') return [];
  return AUTH_KEYS[method].required.filter((k) => !cfg?.[k]);
}

export function authStatus(method: ApiAuthMethod, cfg: AuthConfig | null | undefined): AuthStatus {
  const missing = missingKeys(method, cfg);
  return { method, configured: missing.length === 0, missing };
}

/** Keep only keys the method uses, dropping blanks. */
export function pickUsed(method: ApiAuthMethod, cfg: AuthConfig | null | undefined): AuthConfig {
  if (method === 'INHERIT' || !cfg) return {};
  const out: AuthConfig = {};
  for (const k of AUTH_KEYS[method as AuthMethod].used) {
    const v = cfg[k];
    if (typeof v === 'string' && v !== '') out[k] = v;
  }
  return out;
}

/**
 * PATCH rules (design → Credentials): an omitted key keeps the stored value, an empty string clears it,
 * a new value replaces it. Changing the method drops keys the new method does not use.
 */
export function mergeAuthConfig(
  stored: AuthConfig | null | undefined,
  method: ApiAuthMethod,
  incoming: AuthConfig | null | undefined,
): AuthConfig {
  const next: AuthConfig = { ...(stored ?? {}) };
  for (const [k, v] of Object.entries(incoming ?? {}) as [AuthConfigKey, string | undefined][]) {
    if (v === undefined) continue;
    if (v === '') delete next[k];
    else next[k] = v;
  }
  return pickUsed(method, next);
}

/** Effective auth: the API's own unless INHERIT, else the module's. */
export function effectiveAuth(
  apiMethod: ApiAuthMethod,
  apiCfg: AuthConfig | null,
  moduleMethod: AuthMethod,
  moduleCfg: AuthConfig | null,
): { method: AuthMethod; config: AuthConfig; source: 'api' | 'module' } {
  if (apiMethod !== 'INHERIT') return { method: apiMethod, config: apiCfg ?? {}, source: 'api' };
  return { method: moduleMethod, config: moduleCfg ?? {}, source: 'module' };
}
