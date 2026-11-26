import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AlertsService } from '../alerts/alerts.service';
import { effectiveFrequency } from '../apis/api.mapper';
import { Api } from '../apis/entities/api.entity';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';
import { FailureTrackerService } from './failure-tracker.service';
import { HttpProber } from './http-prober.service';
import { RequestBuilder } from './request-builder.service';
import { ResponseValidator } from './response-validator.service';

/** pg_try_advisory_lock key: only one runner (in any container) calls monitored APIs at a time. */
export const RUNNER_LOCK_KEY = 42;
export const BATCH_LIMIT = 200;

/**
 * The sequential runner (design → Scheduler and sequential runner). Every RUNNER_TICK_MS it loads due
 * APIs and checks them strictly one after another: build, probe, validate, record.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Runner');
  private isRunning = false;
  private wakeRequested = false;
  private stopped = false;
  private current: Promise<number> | null = null;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(ENV) private readonly env: Env,
    private readonly registry: SchedulerRegistry,
    private readonly builder: RequestBuilder,
    private readonly prober: HttpProber,
    private readonly validator: ResponseValidator,
    private readonly tracker: FailureTrackerService,
    private readonly alerts: AlertsService,
  ) {}

  get enabled(): boolean {
    return this.env.RUNNER_ENABLED;
  }

  onApplicationBootstrap() {
    if (!this.enabled) return;
    this.registry.addInterval('runner-tick', setInterval(() => void this.tick(), this.env.RUNNER_TICK_MS));
    this.log.log(`Runner started: tick every ${this.env.RUNNER_TICK_MS} ms`);
    void this.tick(); // overdue APIs run on the first tick after a restart
  }

  async onApplicationShutdown() {
    this.stopped = true;
    if (this.registry.doesExist('interval', 'runner-tick')) this.registry.deleteInterval('runner-tick');
    await this.current?.catch(() => undefined);
  }

  /** Manual runs call this: start a tick now if this process runs the runner, else the next tick picks them up. */
  wake(): void {
    if (!this.enabled || this.stopped) return;
    if (this.isRunning) this.wakeRequested = true;
    else void this.tick();
  }

  tick(): Promise<number> {
    const p = this.runOnce().catch((e) => {
      this.log.error(`Runner tick failed: ${e instanceof Error ? e.stack : e}`);
      return 0;
    });
    return p;
  }

  /** One tick; resolves with the number of APIs checked. Public so tests can drive the runner. */
  async runOnce(): Promise<number> {
    if (this.isRunning) {
      this.wakeRequested = true;
      return 0;
    }
    this.isRunning = true;
    const run = this.locked();
    this.current = run;
    try {
      return await run;
    } finally {
      this.isRunning = false;
      this.current = null;
    }
  }

  private async locked(): Promise<number> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    try {
      const [{ locked }] = await qr.query(`SELECT pg_try_advisory_lock($1) AS locked`, [RUNNER_LOCK_KEY]);
      if (!locked) return 0; // another runner holds it
      let processed = 0;
      try {
        do {
          this.wakeRequested = false;
          processed += await this.batch();
        } while (this.wakeRequested && !this.stopped);
      } finally {
        await this.ds.query(
          `UPDATE runner_state SET current_api_id = NULL, environment_id = NULL, batch_done = GREATEST(batch_done, batch_total), heartbeat_at = now() WHERE id = 1`,
        );
        await qr.query(`SELECT pg_advisory_unlock($1)`, [RUNNER_LOCK_KEY]);
      }
      return processed;
    } finally {
      await qr.release();
    }
  }

  private async batch(): Promise<number> {
    await this.ds.query(`UPDATE runner_state SET heartbeat_at = now() WHERE id = 1`);
    const due: { id: number }[] = await this.ds.query(
      `SELECT a.id FROM apis a JOIN modules mo ON mo.id = a.module_id
        WHERE a.is_active AND mo.is_active AND a.next_run_at <= now()
        ORDER BY a.next_run_at, a.module_id, a.sort_order
        LIMIT $1`,
      [BATCH_LIMIT],
    );
    if (!due.length) return 0;

    await this.ds.query(`UPDATE runner_state SET batch_total = $1, batch_done = 0, heartbeat_at = now() WHERE id = 1`, [due.length]);
    const started = Date.now();
    const sends: Promise<void>[] = [];
    let shortestFrequency = Infinity;

    // Strictly one after another: never two monitored calls at once.
    for (const { id } of due) {
      if (this.stopped) break;
      const api = await this.ds.getRepository(Api).findOne({
        where: { id },
        relations: { module: { environment: { platform: true } } },
      });
      if (api && api.isActive && api.module.isActive) {
        await this.ds.query(`UPDATE runner_state SET current_api_id = $1, heartbeat_at = now() WHERE id = 1`, [id]);
        const freq = effectiveFrequency(api, api.module, this.env.DEFAULT_FREQUENCY_MINUTES).minutes;
        shortestFrequency = Math.min(shortestFrequency, freq);
        const lateMs = Date.now() - api.nextRunAt.getTime();
        if (lateMs > freq * 60_000) {
          this.log.warn(`API ${id} (${api.name}) ran ${Math.round(lateMs / 1000)} s late, more than its ${freq} min frequency`);
        }
        try {
          const req = this.builder.build(api);
          const probe = await this.prober.probe(req, api.timeoutMs);
          const v = this.validator.validate(api, probe);
          const env = api.module.environment;
          const alertIds = await this.tracker.record(id, req, probe, v, { platformKey: env.platform.key, envKey: env.key });
          // Sent right after the transaction commits; never blocks the next check.
          for (const alertId of alertIds) sends.push(this.alerts.deliver(alertId).catch((e) => this.log.error(`Alert ${alertId}: ${e}`)));
        } catch (e) {
          this.log.error(`Checking API ${id} failed: ${e instanceof Error ? e.stack : e}`);
          // avoid retrying a broken API on every tick
          await this.ds.query(`UPDATE apis SET next_run_at = now() + ($2 || ' minutes')::interval WHERE id = $1`, [id, String(freq)]);
        }
      }
      await this.ds.query(`UPDATE runner_state SET batch_done = batch_done + 1, heartbeat_at = now() WHERE id = 1`);
    }
    await this.ds.query(`UPDATE runner_state SET current_api_id = NULL WHERE id = 1`);
    await Promise.allSettled(sends);

    const tookMs = Date.now() - started;
    if (Number.isFinite(shortestFrequency) && tookMs > shortestFrequency * 60_000) {
      this.log.warn(`Cycle of ${due.length} APIs took ${Math.round(tookMs / 1000)} s, longer than the shortest frequency (${shortestFrequency} min)`);
    }
    if (due.length === BATCH_LIMIT) this.wakeRequested = true; // more are due
    return due.length;
  }
}
