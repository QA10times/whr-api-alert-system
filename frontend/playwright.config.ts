// Playwright e2e (frontend design §15.2).
//
// Default (no Docker): starts three local servers —
//   backend  : embedded PostgreSQL + NestJS (backend `npm run e2e:api`, runner tick 500 ms) on :3100
//   mock     : mock-target on :4100
//   web      : `next start` on :3200 (run `npm run build` first)
// Against docker compose instead: `docker compose --profile test up -d`, then
//   E2E_BASE_URL=http://localhost:8080 E2E_MOCK_URL=http://localhost:4000 E2E_MOCK_TARGET_URL=http://mock-target:4000 npm run e2e
import { defineConfig, devices } from '@playwright/test';

const external = !!process.env.E2E_BASE_URL;
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
process.env.E2E_MOCK_URL ??= 'http://localhost:4100';
process.env.E2E_MOCK_TARGET_URL ??= process.env.E2E_MOCK_URL;
process.env.E2E_EMAIL ??= 'e2e@example.com';
process.env.E2E_PASSWORD ??= 'E2e#Pass1';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1, // one shared backend and a single sequential runner
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    storageState: 'tests/e2e/.auth/state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: external
    ? undefined
    : [
        {
          command: 'npm --prefix ../backend run e2e:api',
          url: 'http://localhost:3100/api/health',
          timeout: 180_000,
          reuseExistingServer: false,
          stdout: 'ignore',
          stderr: 'pipe',
        },
        {
          command: 'node ../mock-target/server.js',
          url: 'http://localhost:4100/__health',
          env: { PORT: '4100' },
          reuseExistingServer: false,
        },
        {
          command: 'npx next start -p 3200',
          url: 'http://localhost:3200/login',
          env: { API_INTERNAL_URL: 'http://localhost:3100', COOKIE_SECURE: 'false' },
          timeout: 120_000,
          reuseExistingServer: false,
        },
      ],
});
