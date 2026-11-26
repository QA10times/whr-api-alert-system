// Integration tests: a throwaway PostgreSQL 16 (embedded-postgres) on TEST_DB_PORT, migrated + seeded.
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { startEmbeddedPg } from '../scripts/pg-embedded';
import { migrateAndSeed } from '../src/database/run-migrations';

export const TEST_DIR = path.join(__dirname, '..', '.pgdata-test');

export default async function globalSetup(): Promise<void> {
  const port = Number(process.env.TEST_DB_PORT ?? 5433);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: 'localhost',
    DB_PORT: String(port),
    DB_NAME: 'alerts_test',
    DB_USER: 'alerts',
    DB_PASSWORD: 'alerts-test',
    AUTH_USERS: JSON.stringify({ 'tester@example.com': 'Secret#1', 'hash@example.com': '$2a$04$ieo5vZzxQ2n3cSXWf..QteJqPd7JopkrltEdQydaYvQR3mfapo//6' /* Hashed#1 */ }),
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_EXPIRES_IN: '12h',
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    APP_BASE_URL: 'http://dashboard.test',
    RUNNER_ENABLED: 'false', // tests drive the runner explicitly
    SMTP_HOST: '',
  });
  rmSync(TEST_DIR, { recursive: true, force: true });
  const pg = await startEmbeddedPg({
    dataDir: TEST_DIR,
    port,
    user: 'alerts',
    password: 'alerts-test',
    database: 'alerts_test',
    persistent: false,
  });
  (globalThis as { __PG__?: unknown }).__PG__ = pg;
  await migrateAndSeed(process.env);
}
