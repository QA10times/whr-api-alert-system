// E4, E6–E12: the Monitor screen against the real backend and runner, with the mock target API.
import { expect, test, type Page } from '@playwright/test';
import {
  backend,
  cleanBackend,
  createApi,
  createModule,
  resetMock,
  runApiAndWait,
  scriptMock,
  uid,
  waitFirstRun,
  waitRunnerIdle,
} from './fixtures';

test.describe.configure({ mode: 'serial' });

const card = (page: Page, name: string) => page.getByRole('article', { name });
const stat = (page: Page, label: string) =>
  page.locator('section[aria-label="Platform"]').getByText(label, { exact: true }).locator('xpath=preceding-sibling::div[1]');

test.beforeEach(async ({ page }) => {
  await page.goto('/?env=gtm');
  await waitRunnerIdle(page);
  await cleanBackend(page);
  await resetMock();
});

/** One module with one API at the mock; waits for the automatic first check, then scripts the mock. */
async function oneApi(page: Page, opts: { groupId?: number | null; responses?: object[] } = {}) {
  const m = await createModule(page, { emailGroupId: opts.groupId ?? null });
  const endpoint = `/e2e/${uid()}`;
  const a = await createApi(page, m.id, { endpoint });
  await waitFirstRun(page, [a.id]); // new APIs are due at once
  if (opts.responses) await scriptMock(endpoint, opts.responses as never);
  return { module: m, api: a, endpoint };
}

test('E4 toggling geo puts env=geo in the URL and shows geo cards and counts', async ({ page }) => {
  const gtm = await createModule(page, { name: `GTM ${uid()}` });
  const g1 = await createApi(page, gtm.id);
  const g2 = await createApi(page, gtm.id);
  const geo = await createModule(page, { name: `GEO ${uid()}`, env: 'geo' });
  const geoApi = await createApi(page, geo.id);
  await waitFirstRun(page, [g1.id, g2.id, geoApi.id]);

  await page.goto('/?env=gtm');
  await expect(stat(page, 'APIs')).toHaveText('2');
  await expect(page.getByRole('heading', { name: gtm.name })).toBeVisible();

  await page.getByRole('group', { name: 'Environment' }).getByRole('button', { name: 'geo' }).click();
  await expect(page).toHaveURL(/env=geo/);
  await expect(page.getByRole('group', { name: 'Environment' }).getByRole('button', { name: 'geo' })).toHaveAttribute('aria-pressed', 'true');
  await expect(stat(page, 'APIs')).toHaveText('1');
  await expect(stat(page, 'Modules')).toHaveText('1');
  await expect(page.getByRole('heading', { name: geo.name })).toBeVisible();
  await expect(card(page, geoApi.name)).toBeVisible();
  await expect(page.getByRole('heading', { name: gtm.name })).toHaveCount(0);
});

test('E6 200 with count 0 shows a red card "200, but count = 0" and a striped hit', async ({ page }) => {
  const { api } = await oneApi(page, { responses: [{ status: 200, body: { count: 0, data: [] } }] });
  await runApiAndWait(page, api.id);
  await page.reload();
  const c = card(page, api.name);
  await expect(c.getByTestId('status-badge')).toHaveAttribute('data-tone', 'bad');
  await expect(c.getByTestId('status-badge')).toHaveText('200');
  await expect(c.getByText('200, but count = 0')).toBeVisible();
  await expect(c.locator('[data-hit]').last()).toHaveAttribute('data-hit', 'check');
});

test('E7 200 with one object in data shows "200, but data has 1 object"', async ({ page }) => {
  const { api } = await oneApi(page, { responses: [{ status: 200, body: { count: 5, data: [{}] } }] });
  await runApiAndWait(page, api.id);
  await page.reload();
  const c = card(page, api.name);
  await expect(c.getByText('200, but data has 1 object')).toBeVisible();
  await expect(c.getByTestId('status-badge')).toHaveAttribute('data-tone', 'bad');
});

test('E8 200 with count 5 and two objects shows a green badge and a green hit', async ({ page }) => {
  const { api } = await oneApi(page, { responses: [{ status: 200, body: { count: 5, data: [{}, {}] } }] });
  await runApiAndWait(page, api.id);
  await page.reload();
  const c = card(page, api.name);
  await expect(c.getByTestId('status-badge')).toHaveAttribute('data-tone', 'ok');
  await expect(c.getByTestId('status-badge')).toHaveText('200');
  await expect(c.locator('[data-hit]').last()).toHaveAttribute('data-hit', 'ok');
});

test('E9 + E10 five failed cycles send an alert; recovery sends a recovery row and resets the streak', async ({ page }) => {
  const group = await backend.post<{ id: number; name: string }>(page, '/email-groups', {
    name: `Technical ${uid()}`,
    emails: ['oncall@example.com'],
  });
  const { api, endpoint } = await oneApi(page, { groupId: group.id, responses: [{ status: 503, body: { error: 'down' } }] });

  for (let i = 0; i < 5; i++) await runApiAndWait(page, api.id);
  await page.reload();

  // E9
  const c = card(page, api.name);
  await expect(c.getByText('Alert sent')).toBeVisible();
  await expect(c.getByTestId('status-badge')).toHaveText('503');
  const alerts = page.getByRole('region', { name: 'Recent alerts' });
  const row = alerts.getByRole('row').filter({ hasText: api.name });
  await expect(row).toHaveCount(1);
  await expect(row.getByText('HTTP 503 × 5')).toBeVisible();
  await expect(row.getByText(`${group.name} (1)`)).toBeVisible();
  await row.getByRole('button', { name: 'View email' }).click();
  const dialog = page.getByRole('dialog', { name: 'Alert email preview' });
  await expect(dialog.getByText(`${api.name} failing — 503 × 5 (owner: e2e-team)`)).toBeVisible();
  await expect(dialog.getByText('Sent', { exact: true })).toBeVisible();
  const body = dialog.locator('pre');
  await expect(body).toContainText('Status:          503 Service Unavailable');
  await expect(body).toContainText(/Observed at:\s+\d{1,2} \w{3} \d{4}, \d{2}:\d{2}:\d{2} IST/);
  await expect(body).toContainText('Tag:             owner = e2e-team');
  await page.keyboard.press('Escape');

  // E10
  await scriptMock(endpoint, [{ status: 200, body: { count: 3, data: [{}, {}, {}] } }]);
  await runApiAndWait(page, api.id);
  await page.reload();
  await expect(card(page, api.name).getByTestId('status-badge')).toHaveAttribute('data-tone', 'ok');
  await expect(card(page, api.name).getByText('Alert sent')).toHaveCount(0);
  await expect(card(page, api.name).getByText('last 5 hits')).toBeVisible(); // streak reset
  await expect(card(page, api.name)).toHaveAttribute('data-state', 'ok');
  const recovered = alerts.getByRole('row').filter({ hasText: api.name }).filter({ hasText: 'Recovered' });
  await expect(recovered).toHaveCount(1);
  await expect(stat(page, 'Alerts open')).toHaveText('0');
});

test('E11 a check cycle with 3 APIs counts 1 → 3 and outlines one card at a time', async ({ page }) => {
  const m = await createModule(page);
  const apis = [];
  for (let i = 0; i < 3; i++) apis.push(await createApi(page, m.id, { endpoint: `/e2e/cycle-${i}` }));
  await waitFirstRun(page, apis.map((a) => a.id));
  for (let i = 0; i < 3; i++) await scriptMock(`/e2e/cycle-${i}`, [{ status: 200, body: { count: 2, data: [{}, {}] }, delayMs: 2500 }]);

  await page.reload();
  await page.getByRole('button', { name: 'Run a check cycle' }).click();

  const progress = page.getByTestId('run-progress');
  const seen = new Set<number>();
  let maxOutlined = 0;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const text = (await progress.textContent()) ?? '';
    const n = /Checking (\d+) of 3/.exec(text);
    if (n) seen.add(Number(n[1]));
    maxOutlined = Math.max(maxOutlined, await page.locator('article[data-checking]').count());
    if (/Checked 3 APIs/.test(text)) break;
    await page.waitForTimeout(150);
  }
  await expect(progress).toHaveText(/Checked 3 APIs at/);
  expect([...seen].sort()).toEqual(expect.arrayContaining([1, 3]));
  expect(Math.max(...seen)).toBe(3);
  expect(maxOutlined).toBe(1);
});

test('E12 Copy curl on a cookie-auth POST API copies Cookie, module headers and the body', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const m = await createModule(page, { headers: { 'X-Client': 'whr-monitor' } });
  const api = await createApi(page, m.id, {
    method: 'POST',
    auth: { method: 'COOKIE', config: { cookie: 'session=abc123; csrftoken=xyz' } },
    body: { q: 'saas', limit: 5 },
  });
  await waitFirstRun(page, [api.id]);
  await page.reload();

  await card(page, api.name).getByRole('button', { name: /Copy curl/ }).click();
  // the toast text also sits in a screen-reader live region
  await expect(page.getByText(`curl for ${api.name} copied with its auth, headers and body.`).first()).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(`curl -sS -X POST '`);
  expect(text).toContain(`-H 'Cookie: session=abc123; csrftoken=xyz'`);
  expect(text).toContain(`-H 'X-Client: whr-monitor'`);
  expect(text).toContain(`--data-raw '{"q":"saas","limit":5}'`);
});
