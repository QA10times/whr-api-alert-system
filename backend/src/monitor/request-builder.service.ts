import { Injectable } from '@nestjs/common';
import type { Api } from '../apis/entities/api.entity';
import { DEFAULT_API_KEY_HEADER, effectiveAuth, missingKeys } from '../common/auth-config';
import { CryptoService } from '../common/crypto.service';
import { HeaderMap, hasHeader, mergeHeaders, setHeader } from '../common/headers.util';
import type { AuthConfig, AuthConfigKey, AuthMethod, HttpMethod } from '../common/types';
import type { MonitorModule } from '../modules/entities/module.entity';

/** An auth value sent as a header; secret is null when the credential is missing. */
export interface AuthHeaderPart {
  name: string;
  prefix: string;
  secretKey: AuthConfigKey;
  secret: string | null;
}

export interface BuiltRequest {
  method: HttpMethod;
  url: string;
  /** Module headers overlaid by API headers, plus Accept / Content-Type defaults. No auth. */
  headers: HeaderMap;
  auth: {
    method: AuthMethod;
    source: 'api' | 'module';
    header: AuthHeaderPart | null;
    basic: { username: string | null; password: string | null } | null;
  };
  body: string | null;
  missing: AuthConfigKey[];
}

type ModuleLike = Pick<MonitorModule, 'baseUrl' | 'authMethod' | 'headers'> & { authConfig: AuthConfig | null };
type ApiLike = Pick<Api, 'method' | 'endpoint' | 'baseUrlOverride' | 'authMethod' | 'headers' | 'body'> & {
  authConfig: AuthConfig | null;
};

/** Pure core of RequestBuilder: effective URL, auth, merged headers and body. */
export function buildRequest(api: ApiLike, mod: ModuleLike): BuiltRequest {
  const base = (api.baseUrlOverride ?? mod.baseUrl).replace(/\/+$/, '');
  const url = base + api.endpoint;
  const auth = effectiveAuth(api.authMethod, api.authConfig, mod.authMethod, mod.authConfig);
  const cfg = auth.config;

  const headers = mergeHeaders(mod.headers, api.headers);
  if (!hasHeader(headers, 'Accept')) setHeader(headers, 'Accept', 'application/json');
  const body = api.body === null || api.body === undefined ? null : JSON.stringify(api.body);
  if (body !== null && !hasHeader(headers, 'Content-Type')) setHeader(headers, 'Content-Type', 'application/json');

  let header: AuthHeaderPart | null = null;
  let basic: BuiltRequest['auth']['basic'] = null;
  switch (auth.method) {
    case 'BEARER':
      header = { name: 'Authorization', prefix: 'Bearer ', secretKey: 'token', secret: cfg.token || null };
      break;
    case 'API_KEY':
      header = { name: cfg.headerName || DEFAULT_API_KEY_HEADER, prefix: '', secretKey: 'apiKey', secret: cfg.apiKey || null };
      break;
    case 'COOKIE':
      header = { name: 'Cookie', prefix: '', secretKey: 'cookie', secret: cfg.cookie || null };
      break;
    case 'BASIC':
      basic = { username: cfg.username || null, password: cfg.password || null };
      break;
  }

  return {
    method: api.method,
    url,
    headers,
    auth: { method: auth.method, source: auth.source, header, basic },
    body,
    missing: missingKeys(auth.method, cfg),
  };
}

/**
 * Headers exactly as the runner sends them. A missing credential is left out
 * (the API is still checked and will likely fail with 401).
 */
export function sendHeaders(r: BuiltRequest): HeaderMap {
  const out: HeaderMap = { ...r.headers };
  const h = r.auth.header;
  if (h && h.secret !== null) setHeader(out, h.name, h.prefix + h.secret);
  const b = r.auth.basic;
  if (b && (b.username !== null || b.password !== null)) {
    setHeader(out, 'Authorization', 'Basic ' + Buffer.from(`${b.username ?? ''}:${b.password ?? ''}`).toString('base64'));
  }
  return out;
}

@Injectable()
export class RequestBuilder {
  constructor(private readonly crypto: CryptoService) {}

  /** api.module must be loaded. Decrypts stored credentials. */
  build(api: Api & { module: MonitorModule }): BuiltRequest {
    return buildRequest(
      { ...api, authConfig: this.crypto.decryptJson<AuthConfig>(api.authConfigEnc) },
      { ...api.module, authConfig: this.crypto.decryptJson<AuthConfig>(api.module.authConfigEnc) },
    );
  }
}
