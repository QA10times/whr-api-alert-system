// E1–E3: sign-in, the login rate limit, and the session gate.
// Runs with a fresh context (no saved session). E2 runs last because it uses up the login limit.
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

const EMAIL = process.env.E2E_EMAIL!;
const PASSWORD = process.env.E2E_PASSWORD!;

async function signIn(page: import('@playwright/test').Page, password = PASSWORD) {
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('E1 sign in with a valid AUTH_USERS pair lands on /?env=gtm with an httpOnly session cookie', async ({ page, context }) => {
  await page.goto('/login');
  await signIn(page);
  await expect(page).toHaveURL(/\/\?env=gtm$/);
  const session = (await context.cookies()).find((c) => c.name === 'whr_session');
  expect(session).toBeDefined();
  expect(session!.httpOnly).toBe(true);
  expect(session!.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('whr_session');
});

test('E3 opening /modules without a session redirects to login and returns after sign-in', async ({ page }) => {
  await page.goto('/modules');
  await expect(page).toHaveURL(/\/login\?next=%2Fmodules$/);
  await signIn(page);
  await expect(page).toHaveURL(/\/modules(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible();
});

test('E2 wrong password repeatedly shows the 401 message, then the 429 message', async ({ page }) => {
  await page.goto('/login');
  const alert = page.locator('form').getByRole('alert'); // Next.js has its own route-announcer alert
  await signIn(page, 'wrong-password');
  await expect(alert).toHaveText('That email and password don’t match an account in AUTH_USERS.');
  // 5 attempts a minute per client; earlier sign-ins in this run may already count toward it
  let limited = false;
  for (let i = 0; i < 5 && !limited; i++) {
    await signIn(page, 'wrong-password');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    limited = (await alert.textContent()) === 'Too many attempts. Try again in a minute.';
  }
  expect(limited).toBe(true);
});
