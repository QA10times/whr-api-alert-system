import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { AlertState, ApiAuthMethod, HttpMethod } from '../../common/types';
import { MonitorModule } from '../../modules/entities/module.entity';

@Entity('apis')
export class Api {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'module_id', type: 'int' }) moduleId: number;
  @ManyToOne(() => MonitorModule, (m) => m.apis, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_id' })
  module: MonitorModule;
  @Column({ type: 'varchar', length: 150 }) name: string;
  @Column({ type: 'enum', enumName: 'http_method', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], default: 'GET' })
  method: HttpMethod;
  @Column({ type: 'varchar', length: 1000 }) endpoint: string;
  @Column({ name: 'base_url_override', type: 'varchar', length: 500, nullable: true }) baseUrlOverride: string | null;
  @Column({ name: 'auth_method', type: 'enum', enumName: 'auth_method', enum: ['NONE', 'BEARER', 'BASIC', 'API_KEY', 'COOKIE', 'INHERIT'], default: 'INHERIT' })
  authMethod: ApiAuthMethod;
  @Column({ name: 'auth_config_enc', type: 'text', nullable: true }) authConfigEnc: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) headers: Record<string, string>;
  @Column({ type: 'jsonb', nullable: true }) body: unknown | null;
  @Column({ name: 'tag_key', type: 'varchar', length: 100, nullable: true }) tagKey: string | null;
  @Column({ name: 'tag_value', type: 'varchar', length: 200, nullable: true }) tagValue: string | null;
  @Column({ name: 'count_key', type: 'varchar', length: 200, nullable: true }) countKey: string | null;
  @Column({ name: 'data_key', type: 'varchar', length: 200, nullable: true }) dataKey: string | null;
  @Column({ name: 'frequency_minutes', type: 'int', nullable: true }) frequencyMinutes: number | null;
  @Column({ name: 'timeout_ms', type: 'int', default: 15000 }) timeoutMs: number;
  @Column({ name: 'sort_order', type: 'int', default: 0 }) sortOrder: number;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;

  // live state, written by the runner
  @Column({ name: 'last_status_code', type: 'int', nullable: true }) lastStatusCode: number | null;
  @Column({ name: 'last_passed', type: 'boolean', nullable: true }) lastPassed: boolean | null;
  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true }) lastRunAt: Date | null;
  @Column({ name: 'last_latency_ms', type: 'int', nullable: true }) lastLatencyMs: number | null;
  @Column({ name: 'consecutive_failures', type: 'int', default: 0 }) consecutiveFailures: number;
  @Column({ name: 'first_failed_at', type: 'timestamptz', nullable: true }) firstFailedAt: Date | null;
  @Column({ name: 'last_failure_reason', type: 'varchar', length: 300, nullable: true }) lastFailureReason: string | null;
  @Column({ type: 'enum', enumName: 'alert_state', enum: ['OK', 'FAILING', 'ALERTED'], default: 'OK' }) state: AlertState;
  @Column({ name: 'next_run_at', type: 'timestamptz', default: () => 'now()' }) nextRunAt: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
