import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Platform } from './platform.entity';

@Entity('platform_environments')
export class PlatformEnvironment {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'platform_id', type: 'int' }) platformId: number;
  @ManyToOne(() => Platform, (p) => p.environments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;
  @Column({ type: 'varchar', length: 50 }) key: string;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ name: 'default_base_url', type: 'varchar', length: 500, nullable: true }) defaultBaseUrl: string | null;
  @Column({ name: 'is_default', type: 'boolean', default: false }) isDefault: boolean;
}
