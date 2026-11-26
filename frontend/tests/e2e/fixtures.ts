// Shared helpers: backend calls through the Next.js /api proxy (session cookie from storageState)
// and control of the mock target API.
import { expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';

export const MOCK_URL = process.env.E2E_MOCK_URL!; // where the tests reach the mock
export const MOCK_TARGET_URL = process.env.E2E_MOCK_TARGET_URL!; // where the backend reaches it

export interface MockResponse {
  status?: number;
  body?: unknown;
  delayMs?: number;
  hang?: boolean;
}

export async function mock(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: MOCK_URL });
}

export async function scriptMock(path: string, responses: MockResponse[], repeat = true) {
  const m = await mock();
  const r = await m.post('/__script', { data: { path, responses, repeat } });
  expect(r.ok()).toBeTruthy();
  await m.dispose();
}

export async function mockRequests(): Promise<{ method: string; path: string; headers: Record<string, string>; body: string }[]> {
  const m = await mock();
  const r = await (await m.get('/__requests')).json();
  await m.dispose();
  return r;
}

export async function resetMock() {
  const m = await mock();
  await m.post('/__reset');
  await m.dispose();
}

/** Unique suffix so specs never collide with each other's data. */
export const uid = () => Math.random().toString(36).slice(2, 8);

async function call<T>(page: Page, method: 'get' | 'post' | 'patch' | 'delete', url: string, data?: unknown): Promise<T> {
  const r = await page.request[method](`/api${url}`, data === undefined ? undefined : { data });
  if (!r.ok()) throw new Error(`${method.toUpperCase()} ${url} → ${r.status()} ${await r.text()}`);
  return r.status() === 204 ? (undefined as T) : ((await r.json()) as T);
}

export const backend = {
  get: <T>(page: Page, url: string) => call<T>(page, 'get', url),
  post: <T>(page: Page, url: string, data?: unknown) => call<T>(page, 'post', url, data ?? {}),
  patch: <T>(page: Page, url: string, data: unknown) => call<T>(page, 'patch', url, data),
  del: (page: Page, url: string) => call<void>(page, 'delete', url),
};

export async function envId(page: Page, key: 'gtm' | 'geo'): Promise<number> {
  const platforms = await backend.get<{ key: string; environments: { id: number; key: string }[] }[]>(page, '/platforms');
  return platforms.find((p) => p.key === 'whr')!.environments.find((e) => e.key === key)!.id;
}

/** A module pointing at the mock target, created through the API (UI creation is covered by E5). */
export async function createModule(
  page: Page,
  over: Partial<{ name: string; env: 'gtm' | 'geo'; emailGroupId: number | null; auth: object; headers: Record<string, string>; frequencyMinutes: number }> = {},
) {
  return backend.post<{ id: number; name: string }>(page, '/modules', {
    name: over.name ?? `E2E module ${uid()}`,
    environmentId: await envId(page, over.env ?? 'gtm'),
    baseUrl: MOCK_TARGET_URL,
    auth: over.auth ?? { method: 'NONE', config: {} },
    headers: over.headers ?? {},
    frequencyMinutes: over.frequencyMinutes ?? 60,
    emailGroupId: over.emailGroupId ?? null,
    isActive: true,
  });
}

export async function createApi(page: Page, moduleId: number, over: Record<string, unknown> = {}) {
  return backend.post<{ id: number; name: string; endpoint: string }>(page, `/modules/${moduleId}/apis`, {
    name: `E2E api ${uid()}`,
    method: 'GET',
    endpoint: `/e2e/${uid()}`,
    baseUrlOverride: null,
    auth: { method: 'INHERIT', config: {} },
    headers: {},
    body: null,
    tagKey: 'owner',
    tagValue: 'e2e-team',
    countKey: 'count',
    dataKey: 'data',
    frequencyMinutes: null,
    isActive: true,
    ...over,
  });
}

/** Removes every module and group the specs created so each spec starts clean. */
export async function cleanBackend(page: Page) {
  for (const env of ['gtm', 'geo']) {
    const mods = await backend.get<{ id: number }[]>(page, `/modules?env=${env}`);
    for (const m of mods) await backend.del(page, `/modules/${m.id}`);
  }
  const groups = await backend.get<{ id: number }[]>(page, '/email-groups');
  for (const g of groups) await backend.del(page, `/email-groups/${g.id}`);
}

/** Run now through the same queue the UI uses, then wait until the runner is idle again. */
export async function runApiAndWait(page: Page, apiId: number) {
  await backend.post(page, `/apis/${apiId}/run`);
  await waitRunnerIdle(page);
}

/**
 * New APIs are due at once and the runner picks them up on its next tick, which may be after
 * the runner status already reads idle. Wait until each has a first result, then for idle.
 */
export async function waitFirstRun(page: Page, apiIds: number[]) {
  for (const id of apiIds) {
    await expect
      .poll(async () => (await backend.get<{ lastRunAt: string | null }>(page, `/apis/${id}`)).lastRunAt, { timeout: 30_000 })
      .not.toBeNull();
  }
  await waitRunnerIdle(page);
}

export async function waitRunnerIdle(page: Page) {
  await expect
    .poll(async () => (await backend.get<{ running: boolean }>(page, '/runner/status')).running, { timeout: 30_000 })
    .toBe(false);
}
