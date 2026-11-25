import { describe, expect, it } from 'vitest';
import { absoluteTime, failureText, frequencyLabel, hitLabel, passRuleText, plural, relativeTime, statusLabel } from '@/lib/format';
import { apiSchema, groupSchema, moduleSchema } from '@/lib/schemas';
import {
  authToApi,
  bodyFromApi,
  bodyToApi,
  emptyAuth,
  frequencyToApi,
  headersToObject,
  nullToEmpty,
  objectToHeaders,
  parseEmails,
} from '@/lib/transform';
import { safeNext } from '@/app/login/LoginForm';

describe('transform', () => {
  it('splits header lines on the first colon, skips blanks, last duplicate wins', () => {
    expect(headersToObject('X-Client: whr-monitor\n\n  X-Url: http://a:1  \nX-Client: second')).toEqual({
      'X-Client': 'second',
      'X-Url': 'http://a:1',
    });
    expect(objectToHeaders({ A: '1', B: '2' })).toBe('A: 1\nB: 2');
  });
  it('round-trips body JSON and blank', () => {
    expect(bodyToApi('  ')).toBeNull();
    expect(bodyToApi('{"a":1}')).toEqual({ a: 1 });
    expect(bodyFromApi(null)).toBe('');
    expect(bodyFromApi({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
  it('maps frequency "" to null and back', () => {
    expect(frequencyToApi('')).toBeNull();
    expect(frequencyToApi(10)).toBe(10);
    expect(nullToEmpty(null)).toBe('');
  });
  it('sends only dirty credentials on edit', () => {
    const auth = { ...emptyAuth('BASIC'), username: 'u', password: 'new' };
    expect(authToApi(auth, { password: true }, false)).toEqual({ method: 'BASIC', config: { password: 'new' } });
    expect(authToApi(auth, {}, false)).toEqual({ method: 'BASIC', config: {} });
    // a dirty field that is now empty clears it
    expect(authToApi({ ...emptyAuth('BEARER') }, { token: true }, false)).toEqual({ method: 'BEARER', config: { token: '' } });
  });
  it('sends all filled fields on create or method change', () => {
    const auth = { ...emptyAuth('API_KEY'), apiKey: 'k' };
    expect(authToApi(auth, undefined, true)).toEqual({ method: 'API_KEY', config: { headerName: 'X-API-Key', apiKey: 'k' } });
    expect(authToApi(auth, { method: true }, false).config.apiKey).toBe('k');
  });
  it('parses emails: lower-case, de-dupe, flags bad ones', () => {
    expect(parseEmails('A@x.com, a@x.com; bad  b@y.io')).toEqual({ valid: ['a@x.com', 'b@y.io'], invalid: ['bad'] });
  });
});

describe('format', () => {
  const now = Date.parse('2026-11-25T09:35:02Z');
  it('relative time thresholds', () => {
    expect(relativeTime('2026-11-25T09:34:30Z', now)).toBe('just now');
    expect(relativeTime('2026-11-25T09:31:02Z', now)).toBe('4 min ago');
    expect(relativeTime('2026-11-25T07:35:02Z', now)).toBe('2 h ago');
    expect(relativeTime(null, now)).toBe('never');
  });
  it('absolute time is IST', () => {
    expect(absoluteTime('2026-11-25T09:35:02Z')).toBe('25 Nov 2026, 15:05:02 IST');
  });
  it('status label', () => {
    expect(statusLabel(null, true)).toBe('TIMEOUT');
    expect(statusLabel(null, false)).toBe('—');
    expect(statusLabel(503, true)).toBe('503');
  });
  it('failure text prefixes 200s', () => {
    expect(failureText(200, 'count = 0')).toBe('200, but count = 0');
    expect(failureText(503, 'HTTP 503')).toBe('HTTP 503');
    expect(failureText(null, null)).toBe('Timeout, no response');
    expect(hitLabel({ code: 200, passed: false, reason: 'count = 0' })).toBe('200 but count = 0');
  });
  it('labels', () => {
    expect(frequencyLabel(5, 'api')).toBe('Every 5 min (API)');
    expect(frequencyLabel(5, 'module')).toBe('Every 5 min');
    expect(plural(1, 'API')).toBe('1 API');
    expect(plural(3, 'email')).toBe('3 emails');
    expect(passRuleText('count', null)).toBe('Passes on status 200, count > 0');
  });
});

describe('schemas', () => {
  const api = {
    name: 'Event search',
    method: 'GET',
    endpoint: '/api/v1/events',
    baseUrlOverride: '',
    auth: emptyAuth('INHERIT'),
    headers: '',
    body: '',
    tagKey: '',
    tagValue: '',
    countKey: 'count',
    dataKey: 'data',
    frequencyMinutes: '',
    isActive: true,
  };
  const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message);

  it('accepts a valid API', () => expect(apiSchema.safeParse(api).success).toBe(true));
  it('section 13 error messages', () => {
    expect(msg(apiSchema.safeParse({ ...api, endpoint: 'api/v1' }))).toContain('Endpoint must start with / (for example /api/v1/events).');
    expect(msg(apiSchema.safeParse({ ...api, body: '{nope' }))).toContain('Request body must be valid JSON.');
    expect(msg(apiSchema.safeParse({ ...api, tagKey: 'owner' }))).toContain('Fill in both the tag name and value, or leave both blank.');
    expect(msg(apiSchema.safeParse({ ...api, headers: 'no colon' }))).toContain('Each header line needs the form Name: value.');
    expect(msg(apiSchema.safeParse({ ...api, countKey: 'a..b' }))).toContain('Count key can use letters, digits, _ and dots, like data.total.');
    expect(msg(apiSchema.safeParse({ ...api, frequencyMinutes: 0 }))?.length).toBeGreaterThan(0);
  });
  it('module: trims trailing slash, rejects bad frequency and INHERIT', () => {
    const m = {
      name: 'M',
      environmentId: 1,
      baseUrl: 'https://gtm.whr.ai/',
      auth: emptyAuth('NONE'),
      headers: '',
      frequencyMinutes: 5,
      emailGroupId: null,
      isActive: true,
    };
    const ok = moduleSchema.safeParse(m);
    expect(ok.success && ok.data.baseUrl).toBe('https://gtm.whr.ai');
    expect(msg(moduleSchema.safeParse({ ...m, frequencyMinutes: 2000 }))).toContain('Frequency must be between 1 and 1440 minutes.');
    expect(msg(moduleSchema.safeParse({ ...m, baseUrl: 'gtm.whr.ai' }))).toContain('Base URL must start with http:// or https://');
    expect(msg(moduleSchema.safeParse({ ...m, auth: emptyAuth('INHERIT') }))).toContain('Pick an auth method.');
  });
  it('group needs a name', () => {
    expect(msg(groupSchema.safeParse({ name: ' ', emails: '' }))).toContain('Give the group a name.');
  });
});

describe('safeNext (open redirect guard)', () => {
  it('only follows single-slash paths', () => {
    expect(safeNext('/modules?env=geo')).toBe('/modules?env=geo');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
