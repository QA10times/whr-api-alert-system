import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EmailGroup } from './email-group.entity';

@Entity('email_group_members')
export class EmailGroupMember {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'group_id', type: 'int' }) groupId: number;
  @ManyToOne(() => EmailGroup, (g) => g.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: EmailGroup;
  @Column({ type: 'varchar', length: 254 }) email: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
