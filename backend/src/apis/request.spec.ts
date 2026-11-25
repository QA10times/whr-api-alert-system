import { authStatus, mergeAuthConfig, missingKeys } from '../common/auth-config';
import { buildRequest, sendHeaders } from '../monitor/request-builder.service';
import { effectiveFrequency } from './api.mapper';
import { renderCurl, shQuote } from './curl.service';
import { fingerprint, FingerprintInput } from './fingerprint';

const mod = (over: object = {}) => ({
  baseUrl: 'https://gtm.whr.ai',
  authMethod: 'BEARER' as const,
  authConfig: { token: 'mod-token' },
  headers: { 'X-Team': 'module', Accept: 'application/xml' },
  ...over,
});
const api = (over: object = {}) => ({
  method: 'GET' as const,
  endpoint: '/api/v1/events?limit=1',
  baseUrlOverride: null,
  authMethod: 'INHERIT' as const,
  authConfig: null,
  headers: { 'x-team': 'api' },
  body: null,
  ...over,
});

describe('mergeAuthConfig (PATCH credential rules)', () => {
  it('omitted keeps, empty clears, new replaces', () => {
    const stored = { username: 'u', password: 'p' };
    expect(mergeAuthConfig(stored, 'BASIC', {})).toEqual(stored);
    expect(mergeAuthConfig(stored, 'BASIC', { password: '' })).toEqual({ username: 'u' });
    expect(mergeAuthConfig(stored, 'BASIC', { password: 'p2' })).toEqual({ username: 'u', password: 'p2' });
  });
  it('drops keys the new method does not use', () => {
    expect(mergeAuthConfig({ username: 'u', password: 'p' }, 'BEARER', { token: 't' })).toEqual({ token: 't' });
    expect(mergeAuthConfig({ token: 't' }, 'NONE', undefined)).toEqual({});
    expect(mergeAuthConfig({ token: 't' }, 'INHERIT', undefined)).toEqual({});
  });
  it('reports missing keys per method', () => {
    expect(missingKeys('BASIC', { username: 'u' })).toEqual(['password']);
    expect(missingKeys('API_KEY', {})).toEqual(['apiKey']); // headerName defaults to X-API-Key
    expect(missingKeys('INHERIT', null)).toEqual([]);
    expect(authStatus('BEARER', { token: 'x' })).toEqual({ method: 'BEARER', configured: true, missing: [] });
    expect(authStatus('COOKIE', null)).toEqual({ method: 'COOKIE', configured: false, missing: ['cookie'] });
  });
});

describe('RequestBuilder', () => {
  it('inherits module base URL and auth; API headers win case-insensitively; Accept kept from module', () => {
    const r = buildRequest(api(), mod());
    expect(r.url).toBe('https://gtm.whr.ai/api/v1/events?limit=1');
    expect(r.headers).toEqual({ Accept: 'application/xml', 'x-team': 'api' });
    expect(r.auth.source).toBe('module');
    expect(sendHeaders(r)).toMatchObject({ Authorization: 'Bearer mod-token' });
    expect(r.body).toBeNull();
    expect(r.missing).toEqual([]);
  });
  it('uses the API override and own auth; adds Accept and Content-Type defaults with a body', () => {
    const r = buildRequest(
      api({ baseUrlOverride: 'http://mock-target:4000/', authMethod: 'API_KEY', authConfig: { apiKey: 'k' }, method: 'POST', body: { q: 1 } }),
      mod({ headers: {} }),
    );
    expect(r.url).toBe('http://mock-target:4000/api/v1/events?limit=1');
    expect(sendHeaders(r)).toEqual({ 'x-team': 'api', Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Key': 'k' });
    expect(r.body).toBe('{"q":1}');
  });
  it('basic auth becomes an Authorization header; cookie auth a Cookie header', () => {
    const b = buildRequest(api({ authMethod: 'BASIC', authConfig: { username: 'u', password: 'p' } }), mod());
    expect(sendHeaders(b).Authorization).toBe('Basic ' + Buffer.from('u:p').toString('base64'));
    const c = buildRequest(api({ authMethod: 'COOKIE', authConfig: { cookie: 'sid=1' } }), mod());
    expect(sendHeaders(c).Cookie).toBe('sid=1');
  });
  it('a missing credential is reported and left out of the sent request', () => {
    const r = buildRequest(api({ authMethod: 'BEARER', authConfig: {} }), mod());
    expect(r.missing).toEqual(['token']);
    expect(sendHeaders(r).Authorization).toBeUndefined();
  });
  it('NONE sends no auth even if the module has some', () => {
    const r = buildRequest(api({ authMethod: 'NONE' }), mod());
    expect(sendHeaders(r).Authorization).toBeUndefined();
  });
});

describe('effective frequency', () => {
  it('API value, else module value, else 5', () => {
    expect(effectiveFrequency({ frequencyMinutes: 2 }, { frequencyMinutes: 10 })).toEqual({ minutes: 2, source: 'api' });
    expect(effectiveFrequency({ frequencyMinutes: null }, { frequencyMinutes: 10 })).toEqual({ minutes: 10, source: 'module' });
    expect(effectiveFrequency({ frequencyMinutes: null }, null)).toEqual({ minutes: 5, source: 'module' });
  });
});

describe('copy curl', () => {
  it('single-quotes with the bash escape', () => {
    expect(shQuote(`it's`)).toBe(`'it'\\''s'`);
  });
  it('renders URL, auth, headers and body like the design table', () => {
    const r = buildRequest(api({ method: 'POST', body: { name: "O'Brien" } }), mod({ headers: {} }));
    expect(renderCurl(r)).toBe(
      [
        `curl -sS -X POST 'https://gtm.whr.ai/api/v1/events?limit=1'`,
        `-H 'Authorization: Bearer mod-token'`,
        `-H 'x-team: api'`,
        `-H 'Accept: application/json'`,
        `-H 'Content-Type: application/json'`,
        `--data-raw '{"name":"O'\\''Brien"}'`,
      ].join(' \\\n  '),
    );
  });
  it('renders basic auth with -u and missing values as markers', () => {
    const b = buildRequest(api({ authMethod: 'BASIC', authConfig: { username: 'u' } }), mod({ headers: {} }));
    expect(renderCurl(b)).toContain(`-u 'u:<password>'`);
    const t = buildRequest(api({ authMethod: 'BEARER', authConfig: {} }), mod({ headers: {} }));
    expect(renderCurl(t)).toContain(`-H 'Authorization: Bearer <token>'`);
    const k = buildRequest(api({ authMethod: 'API_KEY', authConfig: { headerName: 'X-Key' } }), mod({ headers: {} }));
    expect(renderCurl(k)).toContain(`-H 'X-Key: <apiKey>'`);
  });
  it('the auth header replaces a plain header of the same name', () => {
    const r = buildRequest(api({ headers: { authorization: 'stale' } }), mod({ headers: {} }));
    const curl = renderCurl(r);
    expect(curl).toContain('Bearer mod-token');
    expect(curl).not.toContain('stale');
  });
});

describe('fingerprint', () => {
  const base: FingerprintInput = {
    method: 'GET',
    endpoint: '/a',
    baseUrlOverride: null,
    authMethod: 'INHERIT',
    authConfig: null,
    headers: { 'X-A': '1', 'X-B': '2' },
    body: { a: 1, b: 2 },
    countKey: 'count',
    dataKey: 'data',
  };
  it('ignores key order and header-name case', () => {
    expect(fingerprint({ ...base, headers: { 'x-b': '2', 'x-a': '1' }, body: { b: 2, a: 1 } })).toBe(fingerprint(base));
  });
  it.each([
    ['method', { method: 'POST' }],
    ['endpoint', { endpoint: '/b' }],
    ['base URL', { baseUrlOverride: 'http://x' }],
    ['auth method', { authMethod: 'NONE' }],
    ['auth value', { authConfig: { token: 't' } }],
    ['headers', { headers: { 'X-A': '9' } }],
    ['body', { body: null }],
    ['count key', { countKey: null }],
    ['data key', { dataKey: 'items' }],
  ])('changes with %s', (_, over) => {
    expect(fingerprint({ ...base, ...over } as FingerprintInput)).not.toBe(fingerprint(base));
  });
});
