import { DataSource } from 'typeorm';
import { createDataSource } from '../src/database/data-source';
import { migrateAndSeed } from '../src/database/run-migrations';

describe('database', () => {
  let ds: DataSource;
  beforeAll(async () => {
    ds = createDataSource(process.env as never);
    await ds.initialize();
  });
  afterAll(() => ds.destroy());

  it('has the ten design tables and named indexes', async () => {
    const tables = await ds.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'typeorm_migrations' ORDER BY 1`,
    );
    expect(tables.map((t: { table_name: string }) => t.table_name)).toEqual([
      'alerts',
      'api_runs',
      'apis',
      'audit_log',
      'email_group_members',
      'email_groups',
      'modules',
      'platform_environments',
      'platforms',
      'runner_state',
    ]);
    const idx = await ds.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname ~ '^(ix|ux|brin)_' ORDER BY 1`);
    expect(idx.map((r: { indexname: string }) => r.indexname)).toEqual([
      'brin_runs_time',
      'ix_alerts_api_time',
      'ix_alerts_pending',
      'ix_apis_due',
      'ix_apis_module_order',
      'ix_apis_state',
      'ix_apis_tag',
      'ix_audit_target',
      'ix_audit_time',
      'ix_modules_email_group',
      'ix_runs_api_time',
      'ux_email_groups_name',
      'ux_member_group_email',
    ]);
  });

  it('seeds whr with gtm as default and geo, idempotently', async () => {
    await migrateAndSeed(process.env);
    const envs = await ds.query(
      `SELECT p.key AS platform, e.key, e.is_default FROM platform_environments e JOIN platforms p ON p.id = e.platform_id ORDER BY e.id`,
    );
    expect(envs).toEqual([
      { platform: 'whr', key: 'gtm', is_default: true },
      { platform: 'whr', key: 'geo', is_default: false },
    ]);
    expect(await ds.query(`SELECT id FROM runner_state`)).toEqual([{ id: 1 }]);
  });

  it('enforces case-insensitive unique group names and the INHERIT check on modules', async () => {
    await ds.query(`INSERT INTO email_groups (name) VALUES ('Sales')`);
    await expect(ds.query(`INSERT INTO email_groups (name) VALUES ('sales')`)).rejects.toThrow(/ux_email_groups_name/);
    const [{ id: envId }] = await ds.query(`SELECT id FROM platform_environments WHERE key='gtm'`);
    await expect(
      ds.query(`INSERT INTO modules (environment_id, name, base_url, auth_method) VALUES ($1, 'x', 'http://x', 'INHERIT')`, [envId]),
    ).rejects.toThrow(/check/i);
    await ds.query(`DELETE FROM email_groups`);
  });
});
