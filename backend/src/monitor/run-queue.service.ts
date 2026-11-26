import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlatformsService } from '../platforms/platforms.service';
import { SchedulerService } from './scheduler.service';

export interface RunnerStatus {
  running: boolean;
  environment: string | null;
  currentApi: { id: number; name: string } | null;
  done: number;
  total: number;
  heartbeatAt: string | null;
}

/**
 * Manual runs set next_run_at = now() and wake the runner. They join the same single queue,
 * so they never run in parallel with scheduled hits.
 */
@Injectable()
export class RunQueueService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly platforms: PlatformsService,
    private readonly scheduler: SchedulerService,
  ) {}

  async status(): Promise<RunnerStatus> {
    const [r] = await this.ds.query(
      `SELECT rs.batch_total, rs.batch_done, rs.heartbeat_at, rs.current_api_id, a.name AS api_name, e.key AS env_key
         FROM runner_state rs
         LEFT JOIN apis a ON a.id = rs.current_api_id
         LEFT JOIN platform_environments e ON e.id = rs.environment_id
        WHERE rs.id = 1`,
    );
    if (!r) return { running: false, environment: null, currentApi: null, done: 0, total: 0, heartbeatAt: null };
    return {
      running: r.current_api_id !== null || r.batch_done < r.batch_total,
      environment: r.env_key,
      currentApi: r.current_api_id ? { id: r.current_api_id, name: r.api_name } : null,
      done: r.batch_done,
      total: r.batch_total,
      heartbeatAt: r.heartbeat_at ? new Date(r.heartbeat_at).toISOString() : null,
    };
  }

  /** POST /apis/:id/run */
  async runApi(id: number): Promise<RunnerStatus & { queued: number }> {
    const [api] = await this.ds.query(
      `SELECT a.id, a.is_active, mo.is_active AS module_active FROM apis a JOIN modules mo ON mo.id = a.module_id WHERE a.id = $1`,
      [id],
    );
    if (!api) throw new NotFoundException('That API no longer exists.');
    if (!api.is_active || !api.module_active) throw new ConflictException('This API is paused. Turn it on to run it.');
    await this.ds.query(`UPDATE apis SET next_run_at = now() WHERE id = $1`, [id]);
    await this.markQueued(1, null);
    this.scheduler.wake();
    return { queued: 1, ...(await this.status()) };
  }

  /** POST /platforms/:key/environments/:env/run — queue every active API in the environment. */
  async runEnvironment(platformKey: string, envKey: string): Promise<RunnerStatus & { queued: number }> {
    const env = await this.platforms.environment(platformKey, envKey);
    // TypeORM returns [rows, rowCount] for UPDATE on Postgres
    const [, queued]: [unknown[], number] = await this.ds.query(
      `UPDATE apis a SET next_run_at = now()
         FROM modules mo
        WHERE mo.id = a.module_id AND mo.environment_id = $1 AND a.is_active AND mo.is_active`,
      [env.id],
    );
    if (queued) await this.markQueued(queued, env.id);
    this.scheduler.wake();
    return { queued, ...(await this.status()) };
  }

  /** When idle, show the queued work at once ("Checking 0 of 8") until the runner takes over. */
  private async markQueued(count: number, environmentId: number | null) {
    await this.ds.query(
      `UPDATE runner_state SET batch_total = $1, batch_done = 0, environment_id = $2
        WHERE id = 1 AND current_api_id IS NULL AND batch_done >= batch_total`,
      [count, environmentId],
    );
    if (environmentId !== null) {
      await this.ds.query(`UPDATE runner_state SET environment_id = $1 WHERE id = 1 AND environment_id IS NULL`, [environmentId]);
    }
  }
}
