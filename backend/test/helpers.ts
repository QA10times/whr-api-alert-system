import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export const USER = { email: 'tester@example.com', password: 'Secret#1' };

export interface TestApp {
  app: INestApplication;
  ds: DataSource;
  http: () => ReturnType<typeof request>;
  token: string;
  /** Authenticated request helpers. */
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  del: (url: string) => request.Test;
  close: () => Promise<void>;
}

/** Boots the full AppModule against the test database, like main.ts does. */
export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  Object.assign(process.env, overrides);
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  const ds = app.get(DataSource);
  const server = app.getHttpServer();
  const http = () => request(server);
  const login = await http().post('/api/auth/login').set('X-Forwarded-For', '10.0.0.250').send(USER);
  const token = login.body.accessToken as string;
  const auth = (t: request.Test) => t.set('Authorization', `Bearer ${token}`);
  return {
    app,
    ds,
    http,
    token,
    get: (url) => auth(http().get(url)),
    post: (url, body) => auth(http().post(url)).send(body ?? {}),
    patch: (url, body) => auth(http().patch(url)).send(body ?? {}),
    del: (url) => auth(http().delete(url)),
    close: () => app.close(),
  };
}

/** Wipes config and run data between suites; keeps platforms/environments/runner_state. */
export async function resetData(ds: DataSource): Promise<void> {
  await ds.query(`TRUNCATE alerts, api_runs, apis, modules, email_group_members, email_groups, audit_log RESTART IDENTITY CASCADE`);
  await ds.query(`UPDATE runner_state SET environment_id = NULL, current_api_id = NULL, batch_total = 0, batch_done = 0, heartbeat_at = NULL`);
}

export async function envId(ds: DataSource, key: 'gtm' | 'geo'): Promise<number> {
  const [{ id }] = await ds.query(`SELECT id FROM platform_environments WHERE key = $1`, [key]);
  return id;
}
