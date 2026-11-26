// E5, E13, E16: module and API forms.
import { expect, test, type Page } from '@playwright/test';
import { cleanBackend, createApi, createModule, MOCK_TARGET_URL, resetMock, scriptMock, uid, waitFirstRun, waitRunnerIdle } from './fixtures';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/modules?env=gtm');
  await waitRunnerIdle(page);
  await cleanBackend(page);
  await resetMock();
});

async function openModule(page: Page, moduleId: number) {
  await page.goto(`/modules?env=gtm&module=${moduleId}`);
  await expect(page.getByRole('region', { name: 'Selected module' })).toBeVisible();
}

test('E5 create a module and an API in the UI; it appears on Monitor with a grey — badge', async ({ page }) => {
  const moduleName = `Search ${uid()}`;
  const apiName = `Event search ${uid()}`;
  const endpoint = `/e2e/${uid()}`;
  // hold the first automatic check open so the card is seen before any result
  await scriptMock(endpoint, [{ status: 200, body: { count: 5, data: [{}, {}] }, delayMs: 10_000 }]);

  await page.goto('/modules?env=gtm');
  await page.getByRole('button', { name: 'New module' }).first().click();
  const md = page.getByRole('dialog', { name: 'New module' });
  await md.getByLabel('Module name').fill(moduleName);
  await md.getByLabel('Base URL').fill(MOCK_TARGET_URL);
  await md.getByLabel('Auth method').selectOption('NONE');
  await md.getByRole('button', { name: 'Create module' }).click();
  await expect(md).toBeHidden();
  await expect(page.getByRole('heading', { name: moduleName })).toBeVisible();

  await page.getByRole('region', { name: 'Selected module' }).getByRole('button', { name: 'Add API' }).first().click();
  const ad = page.getByRole('dialog', { name: 'Add API' });
  await ad.getByLabel('API name').fill(apiName);
  await ad.getByLabel('Endpoint').fill(endpoint);
  await ad.getByLabel('Tag name').fill('owner');
  await ad.getByLabel('Tag value').fill('search-team');
  await expect(ad.getByLabel('Count key')).toHaveValue('count');
  await expect(ad.getByLabel('Data array key')).toHaveValue('data');
  await ad.getByRole('button', { name: 'Add API' }).click();
  await expect(ad).toBeHidden();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Monitor' }).click();
  const c = page.getByRole('article', { name: apiName });
  await expect(c).toBeVisible();
  await expect(c.getByTestId('status-badge')).toHaveText('—');
  await expect(c.getByTestId('status-badge')).toHaveAttribute('data-tone', 'idle');
  await expect(c.getByText('Passes on status 200, count > 0, data[] > 1 object')).toBeVisible();
  await expect(c.getByText('owner: search-team')).toBeVisible();
});

test('E13 Show credentials then changing only the token sends only auth.config.token', async ({ page }) => {
  const m = await createModule(page);
  const api = await createApi(page, m.id, { auth: { method: 'BEARER', config: { token: 'old-token' } } });
  await waitFirstRun(page, [api.id]);
  await openModule(page, m.id);

  await page.getByRole('button', { name: `Edit ${api.name}` }).click();
  const d = page.getByRole('dialog', { name: 'Edit API' });
  const token = d.getByLabel('Bearer token');
  await expect(token).toHaveValue('');
  await expect(token).toHaveAttribute('placeholder', 'Saved — leave blank to keep');
  // controlled checkbox: it ticks once the audited reveal request returns
  const show = d.getByLabel('Show credentials');
  await show.click();
  await expect(show).toBeChecked();
  await expect(token).toHaveValue('old-token');
  await expect(token).toHaveAttribute('type', 'text');
  await token.fill('new-token');

  const patch = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes(`/api/apis/${api.id}`));
  await d.getByRole('button', { name: 'Save changes' }).click();
  const body = (await patch).postDataJSON();
  expect(body.auth).toEqual({ method: 'BEARER', config: { token: 'new-token' } });
  await expect(d).toBeHidden();
});

test('E16 keyboard only: the API form tabs in order and Escape returns focus to the Edit button', async ({ page }) => {
  const m = await createModule(page);
  const api = await createApi(page, m.id);
  await waitFirstRun(page, [api.id]);
  await openModule(page, m.id);

  const edit = page.getByRole('button', { name: `Edit ${api.name}` });
  await edit.focus();
  await page.keyboard.press('Enter');
  const d = page.getByRole('dialog', { name: 'Edit API' });
  await expect(d).toBeVisible();
  await expect(d.getByLabel('API name')).toBeFocused();

  const order: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { id: el?.id ?? '', inDialog: !!el?.closest('[role="dialog"]') };
    });
    expect(info.inDialog).toBe(true); // focus stays trapped in the dialog
    if (info.id) order.push(info.id);
  }
  expect(order.slice(0, 9)).toEqual(['a-method', 'a-endpoint', 'a-base', 'a-tagk', 'a-tagv', 'a-count', 'a-data', 'a-auth', 'f-frequencyMinutes']);

  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  await expect(edit).toBeFocused();
});
