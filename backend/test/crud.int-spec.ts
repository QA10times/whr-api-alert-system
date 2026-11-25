import { createTestApp, envId, resetData, TestApp } from './helpers';

const moduleBody = (environmentId: number, over: object = {}) => ({
  name: 'Search and discovery',
  environmentId,
  baseUrl: 'https://gtm.whr.ai/',
  auth: { method: 'BEARER', config: { token: 'secret-token' } },
  headers: { 'X-Team': 'search' },
  frequencyMinutes: 5,
  emailGroupId: null,
  isActive: true,
  ...over,
});
const apiBody = (over: object = {}) => ({
  name: 'Autocomplete',
  method: 'GET',
  endpoint: '/api/v1/suggest?q=mar',
  baseUrlOverride: null,
  auth: { method: 'INHERIT', config: {} },
  headers: {},
  body: null,
  tagKey: 'owner',
  tagValue: 'search-team',
  countKey: 'count',
  dataKey: 'data',
  frequencyMinutes: null,
  isActive: true,
  ...over,
});

describe('config CRUD', () => {
  let t: TestApp;
  let gtm: number;
  beforeAll(async () => {
    t = await createTestApp({ SECRET_ACCESS_RATE_PER_MIN: '30' });
    gtm = await envId(t.ds, 'gtm');
  });
  beforeEach(() => resetData(t.ds));
  afterAll(() => t.close());

  it('GET /platforms lists whr with gtm default and geo', async () => {
    const r = await t.get('/api/platforms').expect(200);
    expect(r.body).toEqual([
      {
        id: expect.any(Number),
        key: 'whr',
        name: 'WHR',
        environments: [
          { id: gtm, key: 'gtm', name: 'GTM', baseUrl: 'https://gtm.whr.ai', isDefault: true },
          { id: expect.any(Number), key: 'geo', name: 'GEO', baseUrl: 'https://geo.whr.ai', isDefault: false },
        ],
      },
    ]);
  });

  describe('email groups', () => {
    it('creates with normalised, de-duplicated emails and 409s on a case-insensitive clash', async () => {
      const r = await t.post('/api/email-groups', { name: 'Technical', emails: ['A@x.com', 'a@x.com ', 'b@x.com'] }).expect(201);
      expect(r.body).toMatchObject({ name: 'Technical', memberCount: 2, usedBy: [] });
      expect(r.body.members.map((m: { email: string }) => m.email)).toEqual(['a@x.com', 'b@x.com']);
      const c = await t.post('/api/email-groups', { name: 'technical' }).expect(409);
      expect(c.body.fields).toEqual({ name: expect.stringContaining('already exists') });
    });

    it('rejects bad emails with fields', async () => {
      const r = await t.post('/api/email-groups', { name: 'Sales', emails: ['nope'] }).expect(400);
      expect(r.body).toMatchObject({ statusCode: 400, error: 'Bad Request', fields: { emails: expect.any(String) } });
    });

    it('adds members reporting added vs existing; renames; removes a member', async () => {
      const g = (await t.post('/api/email-groups', { name: 'Sales', emails: ['a@x.com'] })).body;
      const add = await t.post(`/api/email-groups/${g.id}/members`, { emails: ['A@X.com', 'c@x.com'] }).expect(200);
      expect(add.body.added).toEqual(['c@x.com']);
      expect(add.body.existing).toEqual(['a@x.com']);
      expect(add.body.memberCount).toBe(2);
      await t.patch(`/api/email-groups/${g.id}`, { name: 'Sales team' }).expect(200);
      const member = add.body.members.find((m: { email: string }) => m.email === 'c@x.com');
      await t.del(`/api/email-groups/${g.id}/members/${member.id}`).expect(204);
      const list = (await t.get('/api/email-groups')).body;
      expect(list[0]).toMatchObject({ name: 'Sales team', memberCount: 1 });
    });

    it('deleting a group leaves its modules with no group', async () => {
      const g = (await t.post('/api/email-groups', { name: 'Ops', emails: ['o@x.com'] })).body;
      const m = (await t.post('/api/modules', moduleBody(gtm, { emailGroupId: g.id })).expect(201)).body;
      expect(m.emailGroup).toEqual({ id: g.id, name: 'Ops', memberCount: 1 });
      expect((await t.get('/api/email-groups')).body[0].usedBy).toEqual([{ id: m.id, name: m.name, environment: 'gtm' }]);
      await t.del(`/api/email-groups/${g.id}`).expect(204);
      expect((await t.get(`/api/modules/${m.id}`)).body.emailGroup).toBeNull();
    });
  });

  describe('modules', () => {
    it('creates, strips the trailing slash, hides credentials and reports auth status', async () => {
      const r = await t.post('/api/modules', moduleBody(gtm)).expect(201);
      expect(r.body).toMatchObject({
        name: 'Search and discovery',
        environment: 'gtm',
        baseUrl: 'https://gtm.whr.ai',
        auth: { method: 'BEARER', configured: true, missing: [] },
        headers: { 'X-Team': 'search' },
        frequencyMinutes: 5,
        failureThreshold: 5,
        apis: [],
      });
      expect(JSON.stringify(r.body)).not.toContain('secret-token');
      const [{ auth_config_enc }] = await t.ds.query(`SELECT auth_config_enc FROM modules WHERE id = $1`, [r.body.id]);
      expect(auth_config_enc).toMatch(/^v1\./);
      expect(auth_config_enc).not.toContain('secret-token');
    });

    it('400s with per-field messages', async () => {
      const r = await t
        .post('/api/modules', moduleBody(gtm, { name: '', baseUrl: 'ftp://x', frequencyMinutes: 0, headers: { 'bad name': 'x' }, auth: { method: 'BEARER', config: { token: 5 } } }))
        .expect(400);
      expect(Object.keys(r.body.fields).sort()).toEqual(['auth.token', 'baseUrl', 'frequencyMinutes', 'headers', 'name']);
    });

    it('409s on a duplicate name in the same environment, case-insensitively', async () => {
      await t.post('/api/modules', moduleBody(gtm)).expect(201);
      const r = await t.post('/api/modules', moduleBody(gtm, { name: 'SEARCH AND DISCOVERY' })).expect(409);
      expect(r.body.fields.name).toContain('already exists');
      const geo = await envId(t.ds, 'geo');
      await t.post('/api/modules', moduleBody(geo)).expect(201);
    });

    it('PATCH keeps omitted credentials, clears on "", reports missing, and drops keys on method change', async () => {
      const m = (await t.post('/api/modules', moduleBody(gtm, { auth: { method: 'BASIC', config: { username: 'u', password: 'p' } } }))).body;
      await t.patch(`/api/modules/${m.id}`, { auth: { method: 'BASIC', config: { username: 'u2' } } }).expect(200);
      expect((await t.get(`/api/modules/${m.id}/credentials`)).body).toEqual({ username: 'u2', password: 'p' });
      const cleared = await t.patch(`/api/modules/${m.id}`, { auth: { method: 'BASIC', config: { password: '' } } }).expect(200);
      expect(cleared.body.auth).toEqual({ method: 'BASIC', configured: false, missing: ['password'] });
      await t.patch(`/api/modules/${m.id}`, { auth: { method: 'BEARER', config: { token: 't' } } }).expect(200);
      expect((await t.get(`/api/modules/${m.id}/credentials`)).body).toEqual({ token: 't' });
    });

    it('PATCH rejects null for required fields but accepts a partial body', async () => {
      const m = (await t.post('/api/modules', moduleBody(gtm))).body;
      await t.patch(`/api/modules/${m.id}`, { name: null }).expect(400);
      const r = await t.patch(`/api/modules/${m.id}`, { isActive: false }).expect(200);
      expect(r.body).toMatchObject({ isActive: false, name: 'Search and discovery' });
    });

    it('lists by environment with API and failing counts; delete cascades to APIs', async () => {
      const m = (await t.post('/api/modules', moduleBody(gtm))).body;
      const a = (await t.post(`/api/modules/${m.id}/apis`, apiBody()).expect(201)).body;
      await t.ds.query(`UPDATE apis SET state = 'FAILING' WHERE id = $1`, [a.id]);
      const list = (await t.get('/api/modules?env=gtm').expect(200)).body;
      expect(list).toEqual([expect.objectContaining({ id: m.id, apiCount: 1, failingCount: 1, emailGroup: null, environment: 'gtm' })]);
      expect((await t.get('/api/modules?env=geo')).body).toEqual([]);
      await t.del(`/api/modules/${m.id}`).expect(204);
      await t.get(`/api/apis/${a.id}`).expect(404);
    });
  });

  describe('apis', () => {
    let moduleId: number;
    beforeEach(async () => {
      moduleId = (await t.post('/api/modules', moduleBody(gtm))).body.id;
    });

    it('creates an API that inherits the module; detail shows effective values', async () => {
      const r = await t.post(`/api/modules/${moduleId}/apis`, apiBody()).expect(201);
      expect(r.body).toMatchObject({
        moduleId,
        name: 'Autocomplete',
        tag: { key: 'owner', value: 'search-team' },
        passRule: { countKey: 'count', dataKey: 'data' },
        frequencyMinutes: 5,
        frequencySource: 'module',
        ownFrequencyMinutes: null,
        effectiveBaseUrl: 'https://gtm.whr.ai',
        moduleAuthMethod: 'BEARER',
        auth: { method: 'INHERIT', configured: true, missing: [] },
        lastHits: [],
        consecutiveFailures: 0,
        failureThreshold: 5,
        state: 'OK',
        lastPassed: null,
        environment: 'gtm',
      });
    });

    it('validates endpoint, keys, tag pair and body', async () => {
      const r = await t
        .post(`/api/modules/${moduleId}/apis`, apiBody({ endpoint: 'no-slash', countKey: 'data[0]', body: 'text', method: 'TRACE' }))
        .expect(400);
      expect(Object.keys(r.body.fields).sort()).toEqual(['body', 'countKey', 'endpoint', 'method']);
      const tag = await t.post(`/api/modules/${moduleId}/apis`, apiBody({ tagValue: '' })).expect(400);
      expect(tag.body.fields).toEqual({ tagValue: expect.stringContaining('both') });
      // blank keys mean "skip the check"
      const ok = await t.post(`/api/modules/${moduleId}/apis`, apiBody({ countKey: '', dataKey: '', tagKey: '', tagValue: '' })).expect(201);
      expect(ok.body.passRule).toEqual({ countKey: null, dataKey: null });
      expect(ok.body.tag).toBeNull();
      // arrays are valid JSON bodies
      await t.post(`/api/modules/${moduleId}/apis`, apiBody({ name: 'Arr', method: 'POST', body: [1, { a: 2 }] })).expect(201);
    });

    it('a fingerprint change resets the streak; name/tag/frequency changes keep it', async () => {
      const a = (await t.post(`/api/modules/${moduleId}/apis`, apiBody())).body;
      const failing = async () =>
        t.ds.query(`UPDATE apis SET consecutive_failures = 3, state = 'FAILING', first_failed_at = now(), next_run_at = now() + interval '1 hour' WHERE id = $1`, [a.id]);

      await failing();
      const keep = await t.patch(`/api/apis/${a.id}`, apiBody({ name: 'Renamed', tagValue: 'other' })).expect(200);
      expect(keep.body).toMatchObject({ consecutiveFailures: 3, state: 'FAILING', name: 'Renamed' });
      expect(keep.body.streakReset).toBeUndefined();

      const freq = await t.patch(`/api/apis/${a.id}`, { frequencyMinutes: 2 }).expect(200);
      expect(freq.body).toMatchObject({ consecutiveFailures: 3, frequencyMinutes: 2, frequencySource: 'api' });
      const [{ due }] = await t.ds.query(`SELECT next_run_at <= now() AS due FROM apis WHERE id = $1`, [a.id]);
      expect(due).toBe(true);

      const reset = await t.patch(`/api/apis/${a.id}`, { endpoint: '/api/v2/suggest' }).expect(200);
      expect(reset.body).toMatchObject({ consecutiveFailures: 0, state: 'OK', streakReset: true });
      const [{ first_failed_at }] = await t.ds.query(`SELECT first_failed_at FROM apis WHERE id = $1`, [a.id]);
      expect(first_failed_at).toBeNull();

      await failing();
      const auth = await t.patch(`/api/apis/${a.id}`, { auth: { method: 'BEARER', config: { token: 'own' } } }).expect(200);
      expect(auth.body.streakReset).toBe(true);
      await failing();
      const sameAuth = await t.patch(`/api/apis/${a.id}`, { auth: { method: 'BEARER', config: {} } }).expect(200);
      expect(sameAuth.body.streakReset).toBeUndefined();
    });

    it('copy curl returns the full command, sets no-store and writes an audit row without secrets', async () => {
      const a = (await t.post(`/api/modules/${moduleId}/apis`, apiBody({ method: 'POST', body: { q: "it's" } }))).body;
      const r = await t.get(`/api/apis/${a.id}/curl`).set('X-Forwarded-For', '203.0.113.7').expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.missing).toEqual([]);
      expect(r.body.curl).toContain(`curl -sS -X POST 'https://gtm.whr.ai/api/v1/suggest?q=mar'`);
      expect(r.body.curl).toContain(`-H 'Authorization: Bearer secret-token'`);
      expect(r.body.curl).toContain(`-H 'X-Team: search'`);
      expect(r.body.curl).toContain(`--data-raw '{"q":"it'\\''s"}'`);
      const audit = await t.ds.query(`SELECT actor_email, action, target_type, target_id, host(ip) AS ip FROM audit_log`);
      expect(audit).toEqual([{ actor_email: 'tester@example.com', action: 'COPY_CURL', target_type: 'API', target_id: a.id, ip: '203.0.113.7' }]);
    });

    it('credential reveal for an API is audited; INHERIT reveals nothing', async () => {
      const own = (await t.post(`/api/modules/${moduleId}/apis`, apiBody({ auth: { method: 'COOKIE', config: { cookie: 'sid=1' } } }))).body;
      expect((await t.get(`/api/apis/${own.id}/credentials`).expect(200)).body).toEqual({ cookie: 'sid=1' });
      const inh = (await t.post(`/api/modules/${moduleId}/apis`, apiBody({ name: 'B' }))).body;
      expect((await t.get(`/api/apis/${inh.id}/credentials`).expect(200)).body).toEqual({});
      const rows = await t.ds.query(`SELECT action, target_type FROM audit_log ORDER BY id`);
      expect(rows).toEqual([
        { action: 'REVEAL_CREDENTIALS', target_type: 'API' },
        { action: 'REVEAL_CREDENTIALS', target_type: 'API' },
      ]);
    });

    it('404s cleanly', async () => {
      const r = await t.get('/api/apis/99999').expect(404);
      expect(r.body).toEqual({ statusCode: 404, error: 'Not Found', message: 'That API no longer exists.' });
    });
  });

  it('environment summary matches the design example shape', async () => {
    const g = (await t.post('/api/email-groups', { name: 'Technical', emails: ['t@x.com'] })).body;
    const m = (await t.post('/api/modules', moduleBody(gtm, { emailGroupId: g.id }))).body;
    const a = (await t.post(`/api/modules/${m.id}/apis`, apiBody())).body;
    const results: [number | null, boolean, string | null][] = [
      [200, true, null],
      [200, true, null],
      [200, false, 'count = 0'],
      [503, false, 'HTTP 503'],
      [503, false, 'HTTP 503'],
      [503, false, 'HTTP 503'],
    ];
    for (const [i, [code, ok, reason]] of results.entries()) {
      await t.ds.query(
        `INSERT INTO api_runs (api_id, executed_at, status_code, is_success, failure_reason) VALUES ($1, now() - ($2 || ' minutes')::interval, $3, $4, $5)`,
        [a.id, String(60 - i), code, ok, reason],
      );
    }
    await t.ds.query(`UPDATE apis SET state = 'ALERTED', consecutive_failures = 4, last_status_code = 503, last_passed = false, last_failure_reason = 'HTTP 503', last_run_at = now() WHERE id = $1`, [a.id]);

    const s = (await t.get('/api/platforms/whr/environments/gtm/summary').expect(200)).body;
    expect(s).toMatchObject({
      platform: 'whr',
      environment: { key: 'gtm', baseUrl: 'https://gtm.whr.ai' },
      counts: { apis: 1, failing: 1, alertsOpen: 1, modules: 1 },
      modules: [
        {
          id: m.id,
          name: 'Search and discovery',
          frequencyMinutes: 5,
          emailGroup: { id: g.id, name: 'Technical' },
          isActive: true,
          apis: [
            {
              id: a.id,
              lastStatusCode: 503,
              lastPassed: false,
              lastFailureReason: 'HTTP 503',
              consecutiveFailures: 4,
              failureThreshold: 5,
              state: 'ALERTED',
              lastHits: [
                { code: 200, passed: true, reason: null },
                { code: 200, passed: false, reason: 'count = 0' },
                { code: 503, passed: false, reason: 'HTTP 503' },
                { code: 503, passed: false, reason: 'HTTP 503' },
                { code: 503, passed: false, reason: 'HTTP 503' },
              ],
            },
          ],
        },
      ],
    });
    await t.get('/api/platforms/whr/environments/nope/summary').expect(404);
    // paused APIs do not count as failing
    await t.patch(`/api/apis/${a.id}`, { isActive: false });
    expect((await t.get('/api/platforms/whr/environments/gtm/summary')).body.counts).toEqual({ apis: 1, failing: 0, alertsOpen: 0, modules: 1 });
  });
});

describe('secret access rate limit', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ SECRET_ACCESS_RATE_PER_MIN: '3' });
    await resetData(t.ds);
  });
  afterAll(async () => {
    process.env.SECRET_ACCESS_RATE_PER_MIN = '30';
    await t.close();
  });

  it('copy curl and reveal share one per-user limit', async () => {
    const gtm = await envId(t.ds, 'gtm');
    const m = (await t.post('/api/modules', moduleBody(gtm))).body;
    const a = (await t.post(`/api/modules/${m.id}/apis`, apiBody())).body;
    const codes = [
      (await t.get(`/api/apis/${a.id}/curl`)).status,
      (await t.get(`/api/modules/${m.id}/credentials`)).status,
      (await t.get(`/api/apis/${a.id}/curl`)).status,
      (await t.get(`/api/apis/${a.id}/credentials`)).status,
    ];
    expect(codes).toEqual([200, 200, 200, 429]);
    // ordinary routes are not limited
    await t.get(`/api/apis/${a.id}`).expect(200);
  });
});
