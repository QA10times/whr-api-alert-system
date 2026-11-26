// Signs in once and saves the session for every spec that does not test sign-in itself.
import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const statePath = path.join(__dirname, '.auth', 'state.json');
  mkdirSync(path.dirname(statePath), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.context().storageState({ path: statePath });
  await browser.close();
}
