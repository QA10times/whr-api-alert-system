import { randomBytes } from 'node:crypto';
import { parseAuthUsers } from '../config/auth-users.parser';
import { durationToSeconds, validateEnv } from '../config/env.validation';
import { CryptoService } from './crypto.service';
import { AllExceptionsFilter, ConflictFieldException, fieldKey, flattenValidationErrors } from './errors';
import { mergeHeaders, parseHeaderLines, setHeader } from './headers.util';
import { getPath, JSON_PATH_RE } from './json-path.util';

const KEY = randomBytes(32).toString('base64');

describe('getPath', () => {
  const body = { count: 3, data: { total: 0, items: [{ id: 1 }, { id: 2 }] }, list: [{}, {}] };
  it('resolves nested keys and array indexes', () => {
    expect(getPath(body, 'count')).toBe(3);
    expect(getPath(body, 'data.total')).toBe(0);
    expect(getPath(body, 'data.items.1.id')).toBe(2);
    expect(getPath(body, 'list')).toHaveLength(2);
  });
  it('returns undefined for missing segments and non-objects', () => {
    expect(getPath(body, 'nope')).toBeUndefined();
    expect(getPath(body, 'count.x')).toBeUndefined();
    expect(getPath(body, 'list.x')).toBeUndefined();
    expect(getPath(null, 'a')).toBeUndefined();
    expect(getPath('text', 'length')).toBeUndefined();
  });
  it('does not walk the prototype', () => {
    expect(getPath({}, 'constructor')).toBeUndefined();
  });
  it('key pattern matches the design rule', () => {
    expect(JSON_PATH_RE.test('data.total')).toBe(true);
    expect(JSON_PATH_RE.test('$meta.count-x')).toBe(true);
    expect(JSON_PATH_RE.test('data..total')).toBe(false);
    expect(JSON_PATH_RE.test('data[0]')).toBe(false);
  });
});

describe('headers util', () => {
  it('parses Name: value lines', () => {
    expect(parseHeaderLines('X-A: 1\n\nAccept: text/plain: x\r\n')).toEqual({ 'X-A': '1', Accept: 'text/plain: x' });
    expect(() => parseHeaderLines('nocolon')).toThrow();
  });
  it('merges case-insensitively, later layer wins with its spelling', () => {
    expect(mergeHeaders({ 'x-team': 'a', Accept: 'x' }, { 'X-Team': 'b' }, null)).toEqual({ Accept: 'x', 'X-Team': 'b' });
  });
  it('setHeader replaces any case', () => {
    expect(setHeader({ cookie: 'a' }, 'Cookie', 'b')).toEqual({ Cookie: 'b' });
  });
});

describe('CryptoService', () => {
  const svc = new CryptoService({ ENCRYPTION_KEY: KEY });
  it('round-trips with a random IV', () => {
    const a = svc.encrypt('secret');
    const b = svc.encrypt('secret');
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('secret');
  });
  it('round-trips JSON and treats empty as null', () => {
    const c = svc.encryptJson({ token: 't' });
    expect(svc.decryptJson(c)).toEqual({ token: 't' });
    expect(svc.encryptJson({})).toBeNull();
    expect(svc.decryptJson(null)).toBeNull();
  });
  it('detects tampering and wrong keys', () => {
    const c = svc.encrypt('secret');
    const parts = c.split('.');
    const data = Buffer.from(parts[3], 'base64');
    data[0] ^= 1;
    parts[3] = data.toString('base64');
    expect(() => svc.decrypt(parts.join('.'))).toThrow();
    const other = new CryptoService({ ENCRYPTION_KEY: randomBytes(32).toString('base64') });
    expect(() => other.decrypt(c)).toThrow();
  });
  it('rejects a short key', () => {
    expect(() => new CryptoService({ ENCRYPTION_KEY: 'c2hvcnQ=' })).toThrow();
  });
});

describe('parseAuthUsers', () => {
  it('parses and lower-cases emails, keeps bcrypt values', () => {
    const m = parseAuthUsers('{"Nishant@Example.com":"pw","b@x.io":"$2b$12$abc"}');
    expect(m.get('nishant@example.com')).toBe('pw');
    expect(m.get('b@x.io')).toBe('$2b$12$abc');
  });
  it.each(['not json', '[]', '{}', '{"a@b.c":""}', '{"nope":"x"}', '{"a@b.c":1}'])('rejects %s', (v) => {
    expect(() => parseAuthUsers(v)).toThrow();
  });
});

describe('validateEnv', () => {
  const base = { AUTH_USERS: '{"a@b.c":"x"}', JWT_SECRET: 'x'.repeat(32), DB_PASSWORD: 'p', ENCRYPTION_KEY: KEY };
  it('applies design defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN).toBe('12h');
    expect(env.RUNNER_TICK_MS).toBe(15000);
    expect(env.RUNNER_ENABLED).toBe(true);
    expect(env.ALERT_TIMEZONE).toBe('Asia/Kolkata');
    expect(env.SECRET_ACCESS_RATE_PER_MIN).toBe(30);
    expect(env.RUN_RETENTION_DAYS).toBe(30);
  });
  it('coerces strings', () => {
    const env = validateEnv({ ...base, RUNNER_ENABLED: 'false', PORT: '4001' });
    expect(env.RUNNER_ENABLED).toBe(false);
    expect(env.PORT).toBe(4001);
  });
  it('fails on bad AUTH_USERS or key', () => {
    expect(() => validateEnv({ ...base, AUTH_USERS: 'a:b' })).toThrow(/AUTH_USERS/);
    expect(() => validateEnv({ ...base, ENCRYPTION_KEY: 'short' })).toThrow(/ENCRYPTION_KEY/);
    expect(() => validateEnv({ ...base, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
  });
  it('converts durations', () => {
    expect(durationToSeconds('12h')).toBe(43200);
    expect(durationToSeconds('3600')).toBe(3600);
    expect(durationToSeconds('2d')).toBe(172800);
  });
});

describe('error shape', () => {
  it('maps credential fields to the form path', () => {
    expect(fieldKey('auth.config.token')).toBe('auth.token');
    expect(fieldKey('baseUrl')).toBe('baseUrl');
  });
  it('flattens nested validation errors', () => {
    const f = flattenValidationErrors([
      { property: 'name', constraints: { isNotEmpty: 'Give it a name.' }, children: [] },
      {
        property: 'auth',
        children: [{ property: 'config', children: [{ property: 'token', constraints: { isString: 'bad token' }, children: [] }] }],
      },
    ]);
    expect(f).toEqual({ name: 'Give it a name.', 'auth.token': 'bad token' });
  });
  it('filter keeps fields and status', () => {
    const body = new AllExceptionsFilter().toBody(new ConflictFieldException('A module with that name exists.'));
    expect(body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'A module with that name exists.',
      fields: { name: 'A module with that name exists.' },
    });
  });
  it('hides unknown errors', () => {
    expect(new AllExceptionsFilter().toBody(new Error('db password is x')).message).not.toMatch(/password/);
  });
});
