import type { Transporter } from 'nodemailer';
import { Client } from 'pg';
import { AlertsService } from '../src/alerts/alerts.service';
import { MailerService } from '../src/alerts/mailer.service';
import { RetentionService } from '../src/monitor/retention.service';
import { RUNNER_LOCK_KEY, SchedulerService } from '../src/monitor/scheduler.service';
import { createTestApp, envId, resetData, TestApp } from './helpers';
import { StubServer } from './stub-server';

interface Sent {
  to: string;
  subject: string;
  text: string;
}

describe('sequential runner, pass rule and alerts', () => {
  let t: TestApp;
  let stub: StubServer;
  let runner: SchedulerService;
  let sent: Sent[];
  let smtpFails = false;
  let gtm: number;

  const run = () => runner.runOnce();
  const runApi = async (id: number) => {
    await t.post(`/api/apis/${id}/run`).expect(202);
    return run();
  };

  async function setup(opts: { group?: boolean; threshold?: number; apis?: object[] } = {}) {
    let emailGroupId: number | null = null;
    if (opts.group !== false) {
      emailGroupId = (await t.post('/api/email-groups', { name: 'Technical', emails: ['oncall@example.com', 'lead@example.com'] })).body.id;
    }
    const m = (
      await t
        .post('/api/modules', {
          name: 'Search',
          environmentId: gtm,
          baseUrl: stub.url,
          auth: { method: 'BEARER', config: { token: 'tok' } },
          headers: { 'X-Team': 'search' },
          frequencyMinutes: 5,
          emailGroupId,
          isActive: true,
        })
        .expect(201)
    ).body;
    if (opts.threshold) await t.ds.query(`UPDATE modules SET failure_threshold = $1 WHERE id = $2`, [opts.threshold, m.id]);
    const list = opts.apis ?? [{}];
    const apis = [];
    for (const [i, over] of list.entries()) {
      apis.push(
        (
          await t
            .post(`/api/modules/${m.id}/apis`, {
              name: `Event search ${i}`,
              method: 'GET',
              endpoint: `/api/v1/events/${i}`,
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
            })
            .expect(201)
        ).body,
      );
    }
    // new APIs are due immediately; tests run them explicitly
    await t.ds.query(`UPDATE apis SET next_run_at = now() + interval '1 hour'`);
    return { module: m, apis };
  }

  beforeAll(async () => {
    stub = new StubServer();
    await stub.start();
    t = await createTestApp({ ALERT_SEND_RECOVERY: 'true', APP_BASE_URL: 'http://dashboard.test' });
    runner = t.app.get(SchedulerService);
    gtm = await envId(t.ds, 'gtm');
    t.app.get(MailerService).useTransport({
      sendMail: async (m: Sent) => {
        if (smtpFails) throw new Error('SMTP 421 try again later');
        sent.push(m);
        return {};
      },
    } as unknown as Transporter);
  });
  beforeEach(async () => {
    await resetData(t.ds);
    stub.reset();
    sent = [];
    smtpFails = false;
  });
  afterAll(async () => {
    await t.close();
    await stub.stop();
  });

  it('checks every API in an environment strictly one at a time and reports progress', async () => {
    const { apis } = await setup({ apis: [{}, {}, {}] });
    for (const a of apis) stub.script(`/api/v1/events/${apis.indexOf(a)}`, [{ status: 200, body: { count: 2, data: [{}, {}] }, delayMs: 80 }]);

    const q = await t.post('/api/platforms/whr/environments/gtm/run').expect(202);
    expect(q.body).toMatchObject({ queued: 3, running: true, environment: 'gtm', done: 0, total: 3 });
    expect(await run()).toBe(3);

    expect(stub.maxInflight).toBe(1);
    expect(stub.requests.map((r) => r.path)).toEqual(['/api/v1/events/0', '/api/v1/events/1', '/api/v1/events/2']);
    const status = (await t.get('/api/runner/status').expect(200)).body;
    expect(status).toMatchObject({ running: false, environment: null, currentApi: null, done: 3, total: 3 });
    expect(status.heartbeatAt).not.toBeNull();

    const rows = await t.ds.query(`SELECT last_passed, last_status_code, state, next_run_at - last_run_at AS gap FROM apis ORDER BY id`);
    expect(rows.every((r: { last_passed: boolean }) => r.last_passed)).toBe(true);
    expect(rows[0].gap).toMatchObject({ minutes: 5 });
    expect((await t.get(`/api/apis/${apis[0].id}/runs`)).body[0]).toMatchObject({ statusCode: 200, passed: true, countValue: 2, itemCount: 2 });
  });

  it('sends exactly the request the curl shows: auth, merged headers, body', async () => {
    const { apis } = await setup({ apis: [{ method: 'POST', body: { q: 'saas' }, headers: { 'x-team': 'api' } }] });
    await runApi(apis[0].id);
    const r = stub.requests[0];
    expect(r).toMatchObject({ method: 'POST', path: '/api/v1/events/0', body: '{"q":"saas"}' });
    expect(r.headers).toMatchObject({ authorization: 'Bearer tok', 'x-team': 'api', accept: 'application/json', 'content-type': 'application/json' });
  });

  it('5 failed hits send one alert email; the 6th does not; the first pass sends a recovery', async () => {
    const { apis } = await setup();
    const id = apis[0].id;
    stub.script('/api/v1/events/0', [{ status: 503, body: { error: 'upstream' } }]);

    for (let i = 1; i <= 4; i++) {
      await runApi(id);
      expect(sent).toHaveLength(0);
    }
    let card = (await t.get(`/api/apis/${id}`)).body;
    expect(card).toMatchObject({ consecutiveFailures: 4, state: 'FAILING', lastStatusCode: 503, lastPassed: false, lastFailureReason: 'HTTP 503' });

    await runApi(id);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('lead@example.com, oncall@example.com');
    expect(sent[0].subject).toBe('[WHR · GTM] Event search 0 failing — 503 × 5 (owner: search-team)');
    expect(sent[0].text).toContain(`Open in dashboard: http://dashboard.test/apis/${id}`);

    await runApi(id);
    expect(sent).toHaveLength(1);
    card = (await t.get(`/api/apis/${id}`)).body;
    expect(card).toMatchObject({ consecutiveFailures: 6, state: 'ALERTED' });

    const alerts = (await t.get('/api/alerts?env=gtm&limit=50')).body;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      apiId: id,
      kind: 'FAILURE',
      statusCode: 503,
      failureReason: 'HTTP 503',
      tag: { key: 'owner', value: 'search-team' },
      groupName: 'Technical',
      recipients: ['lead@example.com', 'oncall@example.com'],
      status: 'SENT',
      attempts: 1,
    });
    const detail = (await t.get(`/api/alerts/${alerts[0].id}`)).body;
    expect(detail.subject).toBe(sent[0].subject);
    expect(detail.bodyText).toBe(sent[0].text);
    expect(detail.lastResults).toHaveLength(5);
    expect(detail.lastResults.every((h: { code: number }) => h.code === 503)).toBe(true);

    // group edits after the fact do not rewrite history
    const g = (await t.get('/api/email-groups')).body[0];
    await t.post(`/api/email-groups/${g.id}/members`, { emails: ['new@example.com'] });
    expect((await t.get(`/api/alerts/${alerts[0].id}`)).body.recipients).toEqual(['lead@example.com', 'oncall@example.com']);

    stub.script('/api/v1/events/0', [{ status: 200, body: { count: 3, data: [{}, {}, {}] } }]);
    await runApi(id);
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toBe('[WHR · GTM] Event search 0 recovered — 200');
    card = (await t.get(`/api/apis/${id}`)).body;
    expect(card).toMatchObject({ consecutiveFailures: 0, state: 'OK', lastPassed: true, lastFailureReason: null });
    const kinds = (await t.get('/api/alerts?env=gtm')).body.map((a: { kind: string }) => a.kind);
    expect(kinds).toEqual(['RECOVERY', 'FAILURE']);
    expect((await t.get('/api/alerts?env=geo')).body).toEqual([]);
  });

  it('200 with a failing body check counts toward the streak with the first failed check as reason', async () => {
    const { apis } = await setup({ threshold: 2 });
    stub.script('/api/v1/events/0', [
      { status: 200, body: { count: 0, data: [{}, {}] } },
      { status: 200, body: { count: 4, data: [{}] } },
    ]);
    await runApi(apis[0].id);
    await runApi(apis[0].id);
    const runs = (await t.get(`/api/apis/${apis[0].id}/runs`)).body;
    expect(runs.map((r: { failureReason: string }) => r.failureReason)).toEqual(['data has 1 object', 'count = 0']);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Failed check:    200 but data has 1 object');
  });

  it('timeouts, network errors and redirects are failures with no status (or the 3xx)', async () => {
    const { apis } = await setup({ apis: [{}, {}, { baseUrlOverride: 'http://127.0.0.1:1' }] });
    await t.ds.query(`UPDATE apis SET timeout_ms = 300`);
    stub.script('/api/v1/events/0', [{ hang: true }]);
    stub.script('/api/v1/events/1', [{ status: 302, headers: { Location: '/elsewhere' } }]);
    await t.post('/api/platforms/whr/environments/gtm/run').expect(202);
    await run();
    const rows = await t.ds.query(`SELECT status_code, failure_reason, error_message, latency_ms FROM api_runs ORDER BY id`);
    expect(rows[0]).toMatchObject({ status_code: null, failure_reason: 'Timeout, no response' });
    expect(rows[0].latency_ms).toBeGreaterThanOrEqual(250);
    expect(rows[1]).toMatchObject({ status_code: 302, failure_reason: 'HTTP 302' });
    expect(rows[2]).toMatchObject({ status_code: null, failure_reason: 'Network error, no response' });
    expect(rows[2].error_message).toMatch(/ECONNREFUSED/);
    expect(stub.requests.filter((r) => r.path === '/elsewhere')).toHaveLength(0);
    expect((await t.get(`/api/apis/${apis[0].id}`)).body.lastStatusCode).toBeNull();
  });

  it('a module with no group stores the alert as FAILED with "no recipients"', async () => {
    const { apis } = await setup({ group: false, threshold: 1 });
    stub.script('/api/v1/events/0', [{ status: 500 }]);
    await runApi(apis[0].id);
    expect(sent).toHaveLength(0);
    const [a] = (await t.get('/api/alerts?env=gtm')).body;
    expect(a).toMatchObject({ status: 'FAILED', errorMessage: 'no recipients', recipients: [], groupName: null });
    expect(await t.app.get(AlertsService).retryPending()).toBe(0);
  });

  it('SMTP errors leave the alert FAILED and the retry gives up after 3 attempts', async () => {
    const { apis } = await setup({ threshold: 1 });
    stub.script('/api/v1/events/0', [{ status: 500 }]);
    smtpFails = true;
    await runApi(apis[0].id);
    const alerts = t.app.get(AlertsService);
    let [a] = (await t.get('/api/alerts?env=gtm')).body;
    expect(a).toMatchObject({ status: 'FAILED', attempts: 1, errorMessage: 'SMTP 421 try again later' });
    await alerts.retryPending();
    await alerts.retryPending();
    await alerts.retryPending();
    [a] = (await t.get('/api/alerts?env=gtm')).body;
    expect(a.attempts).toBe(3);
    smtpFails = false;
    expect(await alerts.retryPending()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('a retry delivers once SMTP is back', async () => {
    const { apis } = await setup({ threshold: 1 });
    stub.script('/api/v1/events/0', [{ status: 500 }]);
    smtpFails = true;
    await runApi(apis[0].id);
    smtpFails = false;
    await t.app.get(AlertsService).retryPending();
    expect(sent).toHaveLength(1);
    expect((await t.get('/api/alerts?env=gtm')).body[0]).toMatchObject({ status: 'SENT', attempts: 2 });
  });

  it('paused APIs and modules are skipped; Run now on a paused API is refused', async () => {
    const { module, apis } = await setup({ apis: [{}, { isActive: false }] });
    await t.post(`/api/apis/${apis[1].id}/run`).expect(409);
    await t.patch(`/api/modules/${module.id}`, { isActive: false }).expect(200);
    await t.post('/api/platforms/whr/environments/gtm/run').expect(202);
    expect(await run()).toBe(0);
    expect(stub.requests).toHaveLength(0);
  });

  it('never runs while another runner holds the advisory lock', async () => {
    const { apis } = await setup();
    const other = new Client({
      host: 'localhost',
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await other.connect();
    try {
      await other.query('SELECT pg_advisory_lock($1)', [RUNNER_LOCK_KEY]);
      await t.post(`/api/apis/${apis[0].id}/run`).expect(202);
      expect(await run()).toBe(0);
      expect(stub.requests).toHaveLength(0);
      await other.query('SELECT pg_advisory_unlock($1)', [RUNNER_LOCK_KEY]);
      expect(await run()).toBe(1);
    } finally {
      await other.end();
    }
  });

  it('an edit that resets the streak during a probe is not overwritten', async () => {
    const { apis } = await setup({ threshold: 3 });
    const id = apis[0].id;
    stub.script('/api/v1/events/0', [{ status: 500 }]);
    await runApi(id);
    await runApi(id);
    stub.script('/api/v1/events/0', [{ status: 500, delayMs: 300 }]);
    await t.post(`/api/apis/${id}/run`).expect(202);
    const running = run();
    await new Promise((ok) => setTimeout(ok, 100));
    await t.patch(`/api/apis/${id}`, { endpoint: '/api/v1/events/0?v=2' }).expect(200); // fingerprint change → reset to 0
    await running;
    const card = (await t.get(`/api/apis/${id}`)).body;
    expect(card.consecutiveFailures).toBe(1); // 0 after the reset, +1 for the in-flight result
    expect(sent).toHaveLength(0);
  });

  it('retention deletes runs older than RUN_RETENTION_DAYS', async () => {
    const { apis } = await setup();
    await t.ds.query(
      `INSERT INTO api_runs (api_id, executed_at, is_success) SELECT $1, now() - interval '40 days', true FROM generate_series(1, 25)`,
      [apis[0].id],
    );
    await t.ds.query(`INSERT INTO api_runs (api_id, executed_at, is_success) VALUES ($1, now(), true)`, [apis[0].id]);
    expect(await t.app.get(RetentionService).prune(30)).toBe(25);
    expect((await t.ds.query(`SELECT count(*)::int AS n FROM api_runs`))[0].n).toBe(1);
  });
});
