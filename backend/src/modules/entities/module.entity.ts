import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Api } from '../../apis/entities/api.entity';
import type { AuthMethod } from '../../common/types';
import { EmailGroup } from '../../email-groups/entities/email-group.entity';
import { PlatformEnvironment } from '../../platforms/entities/platform-environment.entity';

@Entity('modules')
export class MonitorModule {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'environment_id', type: 'int' }) environmentId: number;
  @ManyToOne(() => PlatformEnvironment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'environment_id' })
  environment: PlatformEnvironment;
  @Column({ type: 'varchar', length: 150 }) name: string;
  @Column({ name: 'base_url', type: 'varchar', length: 500 }) baseUrl: string;
  @Column({ name: 'auth_method', type: 'enum', enumName: 'auth_method', enum: ['NONE', 'BEARER', 'BASIC', 'API_KEY', 'COOKIE', 'INHERIT'], default: 'NONE' })
  authMethod: AuthMethod;
  @Column({ name: 'auth_config_enc', type: 'text', nullable: true }) authConfigEnc: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) headers: Record<string, string>;
  @Column({ name: 'frequency_minutes', type: 'int', default: 5 }) frequencyMinutes: number;
  @Column({ name: 'failure_threshold', type: 'int', default: 5 }) failureThreshold: number;
  @Column({ name: 'email_group_id', type: 'int', nullable: true }) emailGroupId: number | null;
  @ManyToOne(() => EmailGroup, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'email_group_id' })
  emailGroup: EmailGroup | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
  @OneToMany(() => Api, (a) => a.module) apis: Api[];
}
