import type { AuthConfig } from '../common/types';

/** JSON with sorted object keys, so equal values always serialise the same. */
export function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export interface FingerprintInput {
  method: string;
  endpoint: string;
  baseUrlOverride: string | null;
  authMethod: string;
  authConfig: AuthConfig | null;
  headers: Record<string, string> | null;
  body: unknown;
  countKey: string | null;
  dataKey: string | null;
}

/**
 * The request fingerprint (design → Validation rules): method, endpoint, base URL, auth, headers, body,
 * count key, data key. A change resets the failure streak; name, tag, frequency or active do not.
 */
export function fingerprint(f: FingerprintInput): string {
  const headers = Object.fromEntries(Object.entries(f.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return stableStringify({
    method: f.method,
    endpoint: f.endpoint,
    baseUrlOverride: f.baseUrlOverride ?? null,
    authMethod: f.authMethod,
    authConfig: f.authConfig ?? {},
    headers,
    body: f.body ?? null,
    countKey: f.countKey ?? null,
    dataKey: f.dataKey ?? null,
  });
}
