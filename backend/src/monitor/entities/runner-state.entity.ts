import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('runner_state')
export class RunnerState {
  @PrimaryColumn({ type: 'smallint', default: 1 }) id: number;
  @Column({ name: 'environment_id', type: 'int', nullable: true }) environmentId: number | null;
  @Column({ name: 'current_api_id', type: 'int', nullable: true }) currentApiId: number | null;
  @Column({ name: 'batch_total', type: 'int', default: 0 }) batchTotal: number;
  @Column({ name: 'batch_done', type: 'int', default: 0 }) batchDone: number;
  @Column({ name: 'heartbeat_at', type: 'timestamptz', nullable: true }) heartbeatAt: Date | null;
}
