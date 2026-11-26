import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { PlatformEnvironment } from './platform-environment.entity';

@Entity('platforms')
export class Platform {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 50 }) key: string;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @OneToMany(() => PlatformEnvironment, (e) => e.platform) environments: PlatformEnvironment[];
}
