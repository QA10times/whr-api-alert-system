import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ConflictFieldException } from '../common/errors';
import { AddMembersDto, CreateEmailGroupDto, RenameEmailGroupDto } from './dto/email-group.dto';
import { EmailGroupMember } from './entities/email-group-member.entity';
import { EmailGroup } from './entities/email-group.entity';

export interface EmailGroupView {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  members: { id: number; email: string }[];
  usedBy: { id: number; name: string; environment: string }[];
}

@Injectable()
export class EmailGroupsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(): Promise<EmailGroupView[]> {
    const groups = await this.ds.getRepository(EmailGroup).find({ order: { name: 'ASC' } });
    return this.view(this.ds.manager, groups);
  }

  async get(id: number, m: EntityManager = this.ds.manager): Promise<EmailGroupView> {
    const g = await m.getRepository(EmailGroup).findOne({ where: { id } });
    if (!g) throw new NotFoundException('That email group no longer exists.');
    return (await this.view(m, [g]))[0];
  }

  async create(dto: CreateEmailGroupDto): Promise<EmailGroupView> {
    return this.ds.transaction(async (m) => {
      await this.assertNameFree(m, dto.name);
      const g = await m.getRepository(EmailGroup).save({ name: dto.name, description: dto.description ?? null });
      if (dto.emails?.length) await this.insertMembers(m, g.id, dto.emails);
      return this.get(g.id, m);
    });
  }

  async rename(id: number, dto: RenameEmailGroupDto): Promise<EmailGroupView> {
    return this.ds.transaction(async (m) => {
      const g = await m.getRepository(EmailGroup).findOne({ where: { id } });
      if (!g) throw new NotFoundException('That email group no longer exists.');
      await this.assertNameFree(m, dto.name, id);
      g.name = dto.name;
      if (dto.description !== undefined) g.description = dto.description || null;
      await m.getRepository(EmailGroup).save(g);
      return this.get(id, m);
    });
  }

  /** Returns the group plus which addresses were added and which already existed. */
  async addMembers(id: number, dto: AddMembersDto): Promise<EmailGroupView & { added: string[]; existing: string[] }> {
    return this.ds.transaction(async (m) => {
      await this.get(id, m);
      const { added, existing } = await this.insertMembers(m, id, dto.emails);
      return { ...(await this.get(id, m)), added, existing };
    });
  }

  async removeMember(id: number, memberId: number): Promise<void> {
    const r = await this.ds.getRepository(EmailGroupMember).delete({ id: memberId, groupId: id });
    if (!r.affected) throw new NotFoundException('That address is not in this group.');
  }

  /** Modules using the group are left with no group (FK ON DELETE SET NULL). */
  async remove(id: number): Promise<void> {
    const r = await this.ds.getRepository(EmailGroup).delete({ id });
    if (!r.affected) throw new NotFoundException('That email group no longer exists.');
  }

  private async assertNameFree(m: EntityManager, name: string, exceptId?: number) {
    const rows = await m.query(`SELECT id FROM email_groups WHERE lower(name) = lower($1) AND id <> $2`, [name, exceptId ?? 0]);
    if (rows.length) throw new ConflictFieldException(`A group named “${name}” already exists.`);
  }

  private async insertMembers(m: EntityManager, groupId: number, emails: string[]) {
    const inserted: { email: string }[] = await m.query(
      `INSERT INTO email_group_members (group_id, email)
       SELECT $1, e FROM unnest($2::text[]) AS e
       ON CONFLICT (group_id, lower(email)) DO NOTHING
       RETURNING email`,
      [groupId, emails],
    );
    const added = inserted.map((r) => r.email);
    const addedSet = new Set(added);
    await m.query(`UPDATE email_groups SET updated_at = now() WHERE id = $1`, [groupId]);
    return { added, existing: emails.filter((e) => !addedSet.has(e)) };
  }

  private async view(m: EntityManager, groups: EmailGroup[]): Promise<EmailGroupView[]> {
    if (!groups.length) return [];
    const ids = groups.map((g) => g.id);
    const members: { id: number; group_id: number; email: string }[] = await m.query(
      `SELECT id, group_id, email FROM email_group_members WHERE group_id = ANY($1) ORDER BY email`,
      [ids],
    );
    const used: { id: number; name: string; email_group_id: number; environment: string }[] = await m.query(
      `SELECT mo.id, mo.name, mo.email_group_id, e.key AS environment
         FROM modules mo JOIN platform_environments e ON e.id = mo.environment_id
        WHERE mo.email_group_id = ANY($1) ORDER BY e.id, mo.name`,
      [ids],
    );
    return groups.map((g) => {
      const mem = members.filter((x) => x.group_id === g.id).map((x) => ({ id: x.id, email: x.email }));
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        memberCount: mem.length,
        members: mem,
        usedBy: used.filter((u) => u.email_group_id === g.id).map((u) => ({ id: u.id, name: u.name, environment: u.environment })),
      };
    });
  }
}
