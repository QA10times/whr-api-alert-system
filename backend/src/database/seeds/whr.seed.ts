import type { DataSource } from 'typeorm';

/**
 * Platform whr with environments gtm (default) and geo, plus the single runner_state row.
 * Idempotent: safe on every boot; never overwrites edited values.
 */
export async function seedWhr(ds: DataSource): Promise<void> {
  await ds.transaction(async (m) => {
    await m.query(`INSERT INTO platforms (key, name) VALUES ('whr', 'WHR') ON CONFLICT (key) DO NOTHING`);
    const [{ id }] = await m.query(`SELECT id FROM platforms WHERE key = 'whr'`);
    await m.query(
      `INSERT INTO platform_environments (platform_id, key, name, default_base_url, is_default)
       VALUES ($1, 'gtm', 'GTM', 'https://gtm.whr.ai', true),
              ($1, 'geo', 'GEO', 'https://geo.whr.ai', false)
       ON CONFLICT (platform_id, key) DO NOTHING`,
      [id],
    );
    await m.query(`INSERT INTO runner_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  });
}
