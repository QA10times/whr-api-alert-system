import { formatDuration, formatWithUtc, passRuleText, renderAlert, AlertContext } from '../alerts/alert-render';
import { nextStreak, Streak } from './failure-tracker.service';
import { validateResponse } from './response-validator.service';

const ok200 = (json: unknown) => ({ statusCode: 200, errorKind: null, isJson: true, json });
const rule = { countKey: 'count', dataKey: 'data' };

describe('ResponseValidator (pass rule table)', () => {
  it('passes on 200, count > 0 and more than 1 object', () => {
    expect(validateResponse(rule, ok200({ count: 5, data: [{}, {}] }))).toEqual({ passed: true, reason: null, countValue: 5, itemsCount: 2 });
  });
  it.each([
    [{ statusCode: 503, errorKind: null, isJson: false, json: undefined }, 'HTTP 503'],
    [{ statusCode: 201, errorKind: null, isJson: true, json: { count: 5, data: [{}, {}] } }, 'HTTP 201'],
    [{ statusCode: 301, errorKind: null, isJson: false, json: undefined }, 'HTTP 301'],
    [{ statusCode: null, errorKind: 'TIMEOUT' as const, isJson: false, json: undefined }, 'Timeout, no response'],
    [{ statusCode: null, errorKind: 'NETWORK_ERROR' as const, isJson: false, json: undefined }, 'Network error, no response'],
  ])('check 1 (status): %j → %s', (probe, reason) => {
    expect(validateResponse(rule, probe)).toMatchObject({ passed: false, reason });
  });
  it.each([
    [{ data: [{}, {}] }, 'count missing or not a number'],
    [{ count: '5', data: [{}, {}] }, 'count missing or not a number'],
    [{ count: 0, data: [{}, {}] }, 'count = 0'],
    [{ count: -1, data: [{}, {}] }, 'count = -1'],
  ])('check 2 (count): %j → %s', (json, reason) => {
    expect(validateResponse(rule, ok200(json))).toMatchObject({ passed: false, reason });
  });
  it.each([
    [{ count: 1 }, 'data missing or not an array'],
    [{ count: 1, data: {} }, 'data missing or not an array'],
    [{ count: 1, data: [{}] }, 'data has 1 object'],
    [{ count: 1, data: [] }, 'data has 0 objects'],
    [{ count: 1, data: [1, 'x', null, {}] }, 'data has 1 object'],
  ])('check 3 (data array): %j → %s', (json, reason) => {
    expect(validateResponse(rule, ok200(json))).toMatchObject({ passed: false, reason });
  });
  it('checks in order: count before data', () => {
    expect(validateResponse(rule, ok200({ count: 0, data: [] })).reason).toBe('count = 0');
  });
  it('resolves nested keys', () => {
    expect(validateResponse({ countKey: 'data.total', dataKey: 'result.items' }, ok200({ data: { total: 3 }, result: { items: [{}, {}, {}] } })).passed).toBe(true);
  });
  it('blank keys skip checks; a non-JSON 200 passes on status alone', () => {
    const text = { statusCode: 200, errorKind: null, isJson: false, json: undefined };
    expect(validateResponse({ countKey: null, dataKey: null }, text).passed).toBe(true);
    expect(validateResponse({ countKey: 'count', dataKey: null }, text).reason).toBe('response is not JSON');
    expect(validateResponse({ countKey: null, dataKey: 'data' }, text).reason).toBe('response is not JSON');
  });
});

describe('nextStreak (alert rule)', () => {
  const t = (i: number) => new Date(Date.UTC(2026, 10, 24, 9, i));
  const ok: Streak = { consecutiveFailures: 0, state: 'OK', firstFailedAt: null };

  it('4 failures stay FAILING, the 5th alerts once, the 6th does not re-alert', () => {
    let s = ok;
    const alerts: (string | null)[] = [];
    for (let i = 0; i < 6; i++) {
      const r = nextStreak(s, false, t(i), 5, true);
      alerts.push(r.alert);
      s = r.next;
      if (i < 4) expect(s.state).toBe('FAILING');
    }
    expect(alerts).toEqual([null, null, null, null, 'FAILURE', null]);
    expect(s).toEqual({ consecutiveFailures: 6, state: 'ALERTED', firstFailedAt: t(0) });
  });

  it('a pass after an alert sends a recovery and resets', () => {
    const r = nextStreak({ consecutiveFailures: 7, state: 'ALERTED', firstFailedAt: t(0) }, true, t(9), 5, true);
    expect(r).toEqual({ next: ok, alert: 'RECOVERY', streakStartedAt: t(0) });
  });

  it('no recovery email when disabled, or when the streak never alerted', () => {
    expect(nextStreak({ consecutiveFailures: 7, state: 'ALERTED', firstFailedAt: t(0) }, true, t(9), 5, false).alert).toBeNull();
    expect(nextStreak({ consecutiveFailures: 3, state: 'FAILING', firstFailedAt: t(0) }, true, t(9), 5, true).alert).toBeNull();
  });

  it('a pass mid-streak means the next failures start over', () => {
    let s = ok;
    for (const passed of [false, false, false, false, true, false, false, false, false]) s = nextStreak(s, passed, t(0), 5, true).next;
    expect(s).toMatchObject({ consecutiveFailures: 4, state: 'FAILING' });
  });

  it('honours the module threshold', () => {
    expect(nextStreak(ok, false, t(0), 1, true).alert).toBe('FAILURE');
  });
});

describe('alert email', () => {
  const base: AlertContext = {
    kind: 'FAILURE',
    platformKey: 'whr',
    envKey: 'gtm',
    moduleName: 'Search',
    apiId: 14,
    apiName: 'Event search',
    tag: { key: 'owner', value: 'search-team' },
    method: 'GET',
    url: 'https://gtm.whr.ai/api/v1/events/search?q=saas',
    statusCode: 503,
    errorKind: null,
    reason: 'HTTP 503',
    failures: 5,
    observedAt: new Date('2026-11-24T09:35:02Z'),
    firstFailedAt: new Date('2026-11-24T09:15:01Z'),
    latencyMs: 812,
    snippet: '{"error":"upstream"}',
    lastResults: [503, 503, 503, 502, 503].map((code) => ({ code, passed: false, reason: `HTTP ${code}` })),
    passRule: { countKey: 'count', dataKey: 'data' },
    groupName: 'technical',
    appBaseUrl: 'https://alerts.10times.internal/',
    timeZone: 'Asia/Kolkata',
  };

  it('formats IST with UTC alongside, and durations', () => {
    expect(formatWithUtc(base.observedAt, 'Asia/Kolkata')).toBe('24 Nov 2026, 15:05:02 IST  (2026-11-24T09:35:02Z)');
    expect(formatDuration(20 * 60_000 + 1000)).toBe('20 min');
    expect(formatDuration(65 * 60_000)).toBe('1 h 5 min');
    expect(passRuleText(base.passRule)).toBe('200, count > 0, data[] > 1 object');
  });

  it('renders the failure email in the design format', () => {
    const { subject, body } = renderAlert(base);
    expect(subject).toBe('[WHR · GTM] Event search failing — 503 × 5 (owner: search-team)');
    expect(body).toContain('Status:          503 Service Unavailable  (5 consecutive failed checks)');
    expect(body).toContain('Failed check:    HTTP 503');
    expect(body).toContain('Observed at:     24 Nov 2026, 15:05:02 IST  (2026-11-24T09:35:02Z)');
    expect(body).toContain('Failing since:   24 Nov 2026, 14:45:01 IST');
    expect(body).toContain('Tag:             owner = search-team');
    expect(body).toContain('Request:         GET https://gtm.whr.ai/api/v1/events/search?q=saas');
    expect(body).toContain('Last 5 results:  503, 503, 503, 502, 503');
    expect(body).toContain('Open in dashboard: https://alerts.10times.internal/apis/14');
    expect(body).toContain('Sent to group:   technical');
    expect(body).not.toContain('&quot;'); // plain text, not HTML-escaped
  });

  it('describes body-check failures and timeouts', () => {
    expect(renderAlert({ ...base, statusCode: 200, reason: 'count = 0' }).body).toContain('Failed check:    200 but count = 0');
    const t = renderAlert({ ...base, statusCode: null, errorKind: 'TIMEOUT', reason: 'Timeout, no response', latencyMs: 15000, tag: null });
    expect(t.subject).toBe('[WHR · GTM] Event search failing — TIMEOUT × 5');
    expect(t.body).toContain('Latency:         15000 ms (timeout)');
  });

  it('renders the recovery email with downtime', () => {
    const r = renderAlert({ ...base, kind: 'RECOVERY', statusCode: 200, reason: null, observedAt: new Date('2026-11-24T09:45:01Z') });
    expect(r.subject).toBe('[WHR · GTM] Event search recovered — 200');
    expect(r.body).toContain('Downtime:        30 min');
    expect(r.body).toContain('Status:          200 OK');
  });
});
