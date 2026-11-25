// lib/api.ts — section 7.1
export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  fields?: Record<string, string>;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ErrorBody,
  ) {
    super(body?.message ?? 'Request failed');
  }
}
export const NETWORK_ERROR = 'Couldn’t reach the server. Check your connection and try again.';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, { statusCode: 0, error: 'Network', message: NETWORK_ERROR });
  }
  const text = await r.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (r.status === 401 && typeof window !== 'undefined') {
    window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  if (!r.ok) {
    const body = (data as ErrorBody | undefined) ?? { statusCode: r.status, error: '', message: r.statusText };
    throw new ApiError(r.status, body);
  }
  return data as T;
}

export const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
});
export const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });
export const del: RequestInit = { method: 'DELETE' };
