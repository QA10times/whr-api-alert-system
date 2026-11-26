import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { AlertKind, AlertStatus, Hit } from '../../common/types';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string; // BIGSERIAL comes back as a string
  @Column({ name: 'api_id', type: 'int' }) apiId: number;
  @Column({ name: 'email_group_id', type: 'int', nullable: true }) emailGroupId: number | null;
  @Column({ type: 'varchar', length: 20, default: 'FAILURE' }) kind: AlertKind;
  @Column({ name: 'status_code', type: 'int', nullable: true }) statusCode: number | null;
  @Column({ name: 'failure_reason', type: 'varchar', length: 300, nullable: true }) failureReason: string | null;
  @Column({ name: 'observed_at', type: 'timestamptz' }) observedAt: Date;
  @Column({ name: 'first_failed_at', type: 'timestamptz' }) firstFailedAt: Date;
  @Column({ name: 'tag_key', type: 'varchar', length: 100, nullable: true }) tagKey: string | null;
  @Column({ name: 'tag_value', type: 'varchar', length: 200, nullable: true }) tagValue: string | null;
  @Column({ name: 'group_name', type: 'varchar', length: 100, nullable: true }) groupName: string | null;
  @Column({ type: 'text', array: true, default: () => "'{}'" }) recipients: string[];
  @Column({ name: 'last_results', type: 'jsonb', default: () => "'[]'" }) lastResults: Hit[];
  @Column({ type: 'varchar', length: 300 }) subject: string;
  @Column({ name: 'body_text', type: 'text' }) bodyText: string;
  @Column({ type: 'enum', enumName: 'alert_status', enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' }) status: AlertStatus;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ name: 'error_message', type: 'varchar', length: 1000, nullable: true }) errorMessage: string | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
