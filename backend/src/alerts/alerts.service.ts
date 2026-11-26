import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { Api } from '../apis/entities/api.entity';
import type { AlertKind, Hit } from '../common/types';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';
import type { ProbeResult } from '../monitor/http-prober.service';
import { renderAlert } from './alert-render';
import { Alert } from './entities/alert.entity';
import { MailerService } from './mailer.service';

export const NO_RECIPIENTS = 'no recipients';
export const MAX_ATTEMPTS = 3;

export interface EnqueueInput {
  kind: AlertKind;
  api: Api;
  module: { name: string; emailGroupId: number | null };
  platformKey: string;
  envKey: string;
  method: string;
  url: string;
  probe: ProbeResult;
  reason: string | null;
  failures: number;
  firstFailedAt: Date;
}

export interface AlertRowView {
  id: number;
  apiId: number;
  apiName: string;
  moduleName: string;
  kind: AlertKind;
  statusCode: number | null;
  failureReason: string | null;
  observedAt: string;
  firstFailedAt: string;
  tag: { key: string; value: string } | null;
  groupName: string | null;
  recipients: string[];
  status: string;
  attempts: number;
  errorMessage: string | null;
  sentAt: string | null;
}

@Injectable()
export class AlertsService {
  private readonly log = new Logger('Alerts');

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly mailer: MailerService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Inside the runner's transaction: snapshot recipients, group name and the last 5 results,
   * render the email once and store it. Returns the id to send after commit, or null when there
   * is nobody to send to (stored as FAILED with reason "no recipients").
   */
  async enqueue(m: EntityManager, i: EnqueueInput): Promise<string | null> {
    const group: { name: string }[] = i.module.emailGroupId
      ? await m.query(`SELECT name FROM email_groups WHERE id = $1`, [i.module.emailGroupId])
      : [];
    const members: { email: string }[] = i.module.emailGroupId
      ? await m.query(`SELECT lower(email) AS email FROM email_group_members WHERE group_id = $1 ORDER BY email`, [i.module.emailGroupId])
      : [];
    const recipients = members.map((x) => x.email);
    const groupName = group[0]?.name ?? null;
    const last: { status_code: number | null; is_success: boolean; failure_reason: string | null }[] = await m.query(
      `SELECT status_code, is_success, failure_reason FROM api_runs WHERE api_id = $1 ORDER BY executed_at DESC, id DESC LIMIT 5`,
      [i.api.id],
    );
    const lastResults: Hit[] = last.reverse().map((r) => ({ code: r.status_code, passed: r.is_success, reason: r.failure_reason }));
    const tag = i.api.tagKey && i.api.tagValue ? { key: i.api.tagKey, value: i.api.tagValue } : null;

    const { subject, body } = renderAlert({
      kind: i.kind,
      platformKey: i.platformKey,
      envKey: i.envKey,
      moduleName: i.module.name,
      apiId: i.api.id,
      apiName: i.api.name,
      tag,
      method: i.method,
      url: i.url,
      statusCode: i.probe.statusCode,
      errorKind: i.probe.errorKind,
      reason: i.reason,
      failures: i.failures,
      observedAt: i.probe.executedAt,
      firstFailedAt: i.firstFailedAt,
      latencyMs: i.probe.latencyMs,
      snippet: i.probe.snippet,
      lastResults,
      passRule: { countKey: i.api.countKey, dataKey: i.api.dataKey },
      groupName,
      appBaseUrl: this.env.APP_BASE_URL,
      timeZone: this.env.ALERT_TIMEZONE,
    });

    const noRecipients = recipients.length === 0;
    if (noRecipients) this.log.warn(`Alert for API ${i.api.id} (${i.api.name}) has no recipients: module has no email group or the group is empty.`);
    const saved = await m.getRepository(Alert).save({
      apiId: i.api.id,
      emailGroupId: i.module.emailGroupId,
      kind: i.kind,
      statusCode: i.probe.statusCode,
      failureReason: i.reason,
      observedAt: i.probe.executedAt,
      firstFailedAt: i.firstFailedAt,
      tagKey: tag?.key ?? null,
      tagValue: tag?.value ?? null,
      groupName,
      recipients,
      lastResults,
      subject,
      bodyText: body,
      status: noRecipients ? 'FAILED' : 'PENDING',
      errorMessage: noRecipients ? NO_RECIPIENTS : null,
    });
    return noRecipients ? null : saved.id;
  }

  /** Claims one attempt, sends, and records SENT or FAILED. Safe to call twice: SENT rows are skipped. */
  async deliver(id: string): Promise<void> {
    // TypeORM returns [rows, rowCount] for UPDATE … RETURNING on Postgres
    const [claimed]: [{ id: string; recipients: string[]; subject: string; body_text: string }[], number] = await this.ds.query(
      `UPDATE alerts SET attempts = attempts + 1
        WHERE id = $1 AND status <> 'SENT' AND attempts < $2 AND COALESCE(error_message, '') <> $3
        RETURNING id, recipients, subject, body_text`,
      [id, MAX_ATTEMPTS, NO_RECIPIENTS],
    );
    const row = claimed[0];
    if (!row) return;
    try {
      const { note } = await this.mailer.send({ to: row.recipients, subject: row.subject, text: row.body_text });
      await this.ds.query(`UPDATE alerts SET status = 'SENT', sent_at = now(), error_message = $2 WHERE id = $1`, [id, note]);
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
      this.log.error(`Sending alert ${id} failed: ${msg}`);
      await this.ds.query(`UPDATE alerts SET status = 'FAILED', error_message = $2 WHERE id = $1`, [id, msg]);
    }
  }

  /** Every 2 minutes: retry unsent alerts with attempts < 3 (runner process only). */
  @Cron('0 */2 * * * *', { name: 'alert-retry' })
  async retryScheduled(): Promise<void> {
    if (!this.env.RUNNER_ENABLED) return;
    await this.retryPending();
  }

  async retryPending(): Promise<number> {
    const rows: { id: string }[] = await this.ds.query(
      `SELECT id FROM alerts
        WHERE status <> 'SENT' AND attempts < $1 AND COALESCE(error_message, '') <> $2
          AND (status = 'FAILED' OR created_at < now() - interval '1 minute')
        ORDER BY created_at LIMIT 50`,
      [MAX_ATTEMPTS, NO_RECIPIENTS],
    );
    for (const r of rows) await this.deliver(r.id);
    return rows.length;
  }

  async list(envKey: string | undefined, limit: number): Promise<AlertRowView[]> {
    const rows = await this.ds.query(
      `SELECT al.*, a.name AS api_name, mo.name AS module_name
         FROM alerts al
         JOIN apis a ON a.id = al.api_id
         JOIN modules mo ON mo.id = a.module_id
         JOIN platform_environments e ON e.id = mo.environment_id
        WHERE ($1::text IS NULL OR e.key = $1)
        ORDER BY al.observed_at DESC, al.id DESC
        LIMIT $2`,
      [envKey ?? null, Math.min(Math.max(limit, 1), 500)],
    );
    return rows.map(toRowView);
  }

  async get(id: number) {
    const rows = await this.ds.query(
      `SELECT al.*, a.name AS api_name, mo.name AS module_name
         FROM alerts al JOIN apis a ON a.id = al.api_id JOIN modules mo ON mo.id = a.module_id
        WHERE al.id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('That alert no longer exists.');
    const r = rows[0];
    return { ...toRowView(r), subject: r.subject, bodyText: r.body_text, lastResults: r.last_results as Hit[] };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRowView(r: any): AlertRowView {
  return {
    id: Number(r.id),
    apiId: r.api_id,
    apiName: r.api_name,
    moduleName: r.module_name,
    kind: r.kind,
    statusCode: r.status_code,
    failureReason: r.failure_reason,
    observedAt: new Date(r.observed_at).toISOString(),
    firstFailedAt: new Date(r.first_failed_at).toISOString(),
    tag: r.tag_key && r.tag_value ? { key: r.tag_key, value: r.tag_value } : null,
    groupName: r.group_name,
    recipients: r.recipients ?? [],
    status: r.status,
    attempts: r.attempts,
    errorMessage: r.error_message,
    sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
  };
}
