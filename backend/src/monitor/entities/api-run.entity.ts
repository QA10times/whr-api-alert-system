import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numeric } from '../../database/transformers';

@Entity('api_runs')
export class ApiRun {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string; // BIGSERIAL comes back as a string
  @Column({ name: 'api_id', type: 'int' }) apiId: number;
  @Column({ name: 'executed_at', type: 'timestamptz' }) executedAt: Date;
  @Column({ name: 'status_code', type: 'int', nullable: true }) statusCode: number | null;
  @Column({ name: 'latency_ms', type: 'int', nullable: true }) latencyMs: number | null;
  @Column({ name: 'is_success', type: 'boolean' }) isSuccess: boolean;
  @Column({ name: 'failure_reason', type: 'varchar', length: 300, nullable: true }) failureReason: string | null;
  @Column({ name: 'count_value', type: 'numeric', nullable: true, transformer: numeric }) countValue: number | null;
  @Column({ name: 'items_count', type: 'int', nullable: true }) itemsCount: number | null;
  @Column({ name: 'error_message', type: 'varchar', length: 1000, nullable: true }) errorMessage: string | null;
  @Column({ name: 'response_snippet', type: 'varchar', length: 2000, nullable: true }) responseSnippet: string | null;
}
