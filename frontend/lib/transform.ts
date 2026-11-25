// lib/transform.ts — section 10.2 form <-> DTO
import type { AuthConfig, AuthMethod } from './types';

export function headersToObject(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); // duplicate names: last wins
  }
  return out;
}
export function objectToHeaders(obj: Record<string, string> | null | undefined): string {
  return Object.entries(obj ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

export function bodyToApi(text: string): unknown | null {
  const t = text.trim();
  return t ? JSON.parse(t) : null;
}
export function bodyFromApi(body: unknown | null | undefined): string {
  return body === null || body === undefined ? '' : JSON.stringify(body, null, 2);
}

export const emptyToNull = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t ? t : null;
};
export const nullToEmpty = (s: string | number | null | undefined): string =>
  s === null || s === undefined ? '' : String(s);

export function frequencyToApi(v: string | number | null | undefined): number | null {
  return v === '' || v === null || v === undefined ? null : Number(v);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    (EMAIL.test(e) ? valid : invalid).push(e);
  }
  return { valid, invalid };
}

export const METHOD_FIELDS: Record<AuthMethod | 'INHERIT', (keyof AuthConfig)[]> = {
  INHERIT: [],
  NONE: [],
  BEARER: ['token'],
  BASIC: ['username', 'password'],
  API_KEY: ['headerName', 'apiKey'],
  COOKIE: ['cookie'],
};

export interface AuthForm extends AuthConfig {
  method: AuthMethod | 'INHERIT';
}
export type AuthDirty = Partial<Record<keyof AuthForm, boolean>> | undefined;

/**
 * Section 10.3: send only credential fields the user changed, for the chosen method.
 * On create, or when the method itself changed, every non-empty field of the method is sent.
 */
export function authToApi(auth: AuthForm, dirty: AuthDirty, isCreate: boolean): { method: AuthForm['method']; config: AuthConfig } {
  const fields = METHOD_FIELDS[auth.method];
  const methodChanged = isCreate || !!dirty?.method;
  const config: AuthConfig = {};
  for (const f of fields) {
    const value = auth[f] ?? '';
    if (dirty?.[f] || (methodChanged && value !== '')) config[f] = value;
  }
  return { method: auth.method, config };
}

export function emptyAuth(method: AuthForm['method']): AuthForm {
  return { method, token: '', username: '', password: '', headerName: 'X-API-Key', apiKey: '', cookie: '' };
}
