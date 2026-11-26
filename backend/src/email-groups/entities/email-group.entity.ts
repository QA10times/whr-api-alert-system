import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EmailGroupMember } from './email-group-member.entity';

@Entity('email_groups')
export class EmailGroup {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) description: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
  @OneToMany(() => EmailGroupMember, (m) => m.group) members: EmailGroupMember[];
}
