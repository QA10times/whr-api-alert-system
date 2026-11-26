import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AuditAction = 'COPY_CURL' | 'REVEAL_CREDENTIALS';
export type AuditTarget = 'API' | 'MODULE';

/** Who copied a curl or revealed credentials. Never stores secret values. */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string; // BIGSERIAL comes back as a string
  @Column({ name: 'actor_email', type: 'varchar', length: 254 }) actorEmail: string;
  @Column({ type: 'varchar', length: 30 }) action: AuditAction;
  @Column({ name: 'target_type', type: 'varchar', length: 10 }) targetType: AuditTarget;
  @Column({ name: 'target_id', type: 'int' }) targetId: number;
  @Column({ type: 'inet', nullable: true }) ip: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
