import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { effectiveFrequency } from '../apis/api.mapper';
import { Api } from '../apis/entities/api.entity';
import { AlertsService } from '../alerts/alerts.service';
import type { AlertKind, AlertState } from '../common/types';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';
import { MonitorModule } from '../modules/entities/module.entity';
import { ApiRun } from './entities/api-run.entity';
import type { ProbeResult } from './http-prober.service';
import type { BuiltRequest } from './request-builder.service';
import type { Validation } from './response-validator.service';

export interface Streak {
  consecutiveFailures: number;
  state: AlertState;
  firstFailedAt: Date | null;
}

/**
 * The alert rule (design → FailureTrackerService.record), as a pure function.
 * One failing streak sends one email; the first pass after an alert sends a recovery.
 */
export function nextStreak(
  cur: Streak,
  passed: boolean,
  executedAt: Date,
  threshold: number,
  sendRecovery: boolean,
): { next: Streak; alert: AlertKind | null; streakStartedAt: Date | null } {
  if (passed) {
    const alert = cur.state === 'ALERTED' && sendRecovery ? 'RECOVERY' : null;
    return { next: { consecutiveFailures: 0, state: 'OK', firstFailedAt: null }, alert, streakStartedAt: cur.firstFailedAt };
  }
  const n = cur.consecutiveFailures + 1;
  const firstFailedAt = n === 1 ? executedAt : (cur.firstFailedAt ?? executedAt);
  let state: AlertState = cur.state === 'ALERTED' ? 'ALERTED' : 'FAILING';
  let alert: AlertKind | null = null;
  if (n >= threshold && state !== 'ALERTED') {
    alert = 'FAILURE';
    state = 'ALERTED';
  }
  return { next: { consecutiveFailures: n, state, firstFailedAt }, alert, streakStartedAt: firstFailedAt };
}

export interface RecordContext {
  platformKey: string;
  envKey: string;
}

@Injectable()
export class FailureTrackerService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly alerts: AlertsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Saves the run and updates the API's live state in one transaction. Returns ids of alerts
   * to send once the transaction has committed.
   */
  async record(apiId: number, req: BuiltRequest, probe: ProbeResult, v: Validation, ctx: RecordContext): Promise<string[]> {
    return this.ds.transaction(async (m) => {
      // Lock the row and re-read it: an edit during the probe (e.g. a streak reset) must not be overwritten.
      const locked = await m.query(`SELECT id FROM apis WHERE id = $1 FOR UPDATE`, [apiId]);
      if (!locked.length) return []; // deleted while being checked
      const api = await m.getRepository(Api).findOneOrFail({ where: { id: apiId } });
      const mod = await m.getRepository(MonitorModule).findOneOrFail({ where: { id: api.moduleId } });

      await m.getRepository(ApiRun).insert({
        apiId,
        executedAt: probe.executedAt,
        statusCode: probe.statusCode,
        latencyMs: probe.latencyMs,
        isSuccess: v.passed,
        failureReason: v.reason,
        countValue: v.countValue,
        itemsCount: v.itemsCount,
        errorMessage: probe.errorMessage,
        responseSnippet: probe.snippet,
      });

      const { next, alert, streakStartedAt } = nextStreak(
        { consecutiveFailures: api.consecutiveFailures, state: api.state, firstFailedAt: api.firstFailedAt },
        v.passed,
        probe.executedAt,
        mod.failureThreshold,
        this.env.ALERT_SEND_RECOVERY,
      );

      const ids: string[] = [];
      if (alert) {
        const id = await this.alerts.enqueue(m, {
          kind: alert,
          api,
          module: mod,
          platformKey: ctx.platformKey,
          envKey: ctx.envKey,
          method: req.method,
          url: req.url,
          probe,
          reason: v.reason,
          failures: alert === 'FAILURE' ? next.consecutiveFailures : api.consecutiveFailures,
          firstFailedAt: streakStartedAt ?? probe.executedAt,
        });
        if (id) ids.push(id);
      }

      const freq = effectiveFrequency(api, mod, this.env.DEFAULT_FREQUENCY_MINUTES).minutes;
      await m.getRepository(Api).update(
        { id: apiId },
        {
          consecutiveFailures: next.consecutiveFailures,
          state: next.state,
          firstFailedAt: next.firstFailedAt,
          lastStatusCode: probe.statusCode,
          lastPassed: v.passed,
          lastFailureReason: v.reason,
          lastRunAt: probe.executedAt,
          lastLatencyMs: probe.latencyMs,
          nextRunAt: new Date(probe.executedAt.getTime() + freq * 60_000),
        },
      );
      return ids;
    });
  }
}
