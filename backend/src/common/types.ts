export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;

export type AuthMethod = 'NONE' | 'BEARER' | 'BASIC' | 'API_KEY' | 'COOKIE';
export type ApiAuthMethod = AuthMethod | 'INHERIT';
export const AUTH_METHODS: AuthMethod[] = ['NONE', 'BEARER', 'BASIC', 'API_KEY', 'COOKIE'];

export type AlertState = 'OK' | 'FAILING' | 'ALERTED';
export type AlertStatus = 'PENDING' | 'SENT' | 'FAILED';
export type AlertKind = 'FAILURE' | 'RECOVERY';

export interface AuthConfig {
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  apiKey?: string;
  cookie?: string;
}
export type AuthConfigKey = keyof AuthConfig;

/** Config keys each method uses; the first list is required (headerName defaults to X-API-Key). */
export const AUTH_KEYS: Record<AuthMethod, { used: AuthConfigKey[]; required: AuthConfigKey[] }> = {
  NONE: { used: [], required: [] },
  BEARER: { used: ['token'], required: ['token'] },
  BASIC: { used: ['username', 'password'], required: ['username', 'password'] },
  API_KEY: { used: ['headerName', 'apiKey'], required: ['apiKey'] },
  COOKIE: { used: ['cookie'], required: ['cookie'] },
};

/** One hit as shown on cards and stored on alerts: {code, passed, reason}. */
export interface Hit {
  code: number | null;
  passed: boolean;
  reason: string | null;
}

/** Authenticated user attached to the request by the JWT guard. */
export interface AuthUser {
  email: string;
}
