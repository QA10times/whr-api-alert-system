// npm run e2e:api — the backend for Playwright without Docker:
// a fresh embedded PostgreSQL 16 (E2E_DB_PORT, default 5434), migrations + seed, then the real NestJS app
// with a fast runner tick and log-only mail. Playwright's webServer starts this and waits for /api/health.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { startEmbeddedPg } from './pg-embedded';

async function main() {
  const dbPort = Number(process.env.E2E_DB_PORT ?? 5434);
  const apiPort = Number(process.env.E2E_API_PORT ?? 3100);
  Object.assign(process.env, {
    NODE_ENV: 'development',
    PORT: String(apiPort),
    APP_BASE_URL: process.env.E2E_APP_BASE_URL ?? 'http://localhost:3200',
    DB_HOST: 'localhost',
    DB_PORT: String(dbPort),
    DB_NAME: 'alerts_e2e',
    DB_USER: 'alerts',
    DB_PASSWORD: 'alerts-e2e',
    AUTH_USERS: process.env.E2E_AUTH_USERS ?? JSON.stringify({ 'e2e@example.com': 'E2e#Pass1' }),
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_EXPIRES_IN: '12h',
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    SMTP_HOST: '', // alert emails go to the log and count as sent
    RUNNER_ENABLED: 'true',
    RUNNER_TICK_MS: process.env.E2E_RUNNER_TICK_MS ?? '500',
    SECRET_ACCESS_RATE_PER_MIN: '1000',
  });

  const dataDir = path.join(__dirname, '..', '.pgdata-e2e');
  rmSync(dataDir, { recursive: true, force: true });
  const pg = await startEmbeddedPg({ dataDir, port: dbPort, user: 'alerts', password: 'alerts-e2e', database: 'alerts_e2e', persistent: false });

  // imported after the env is set: config validation reads process.env at module load
  const { migrateAndSeed } = await import('../src/database/run-migrations');
  await migrateAndSeed(process.env);
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  configureApp(app);
  await app.listen(apiPort, '0.0.0.0');
  console.log(`e2e api on :${apiPort}, db on :${dbPort}`);

  const stop = async () => {
    await app.close().catch(() => undefined);
    await pg.stop().catch(() => undefined);
    rmSync(dataDir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
