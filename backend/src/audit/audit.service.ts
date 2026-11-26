import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isIP } from 'node:net';
import { Repository } from 'typeorm';
import { AuditAction, AuditLog, AuditTarget } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Records who accessed a secret; never the secret itself. */
  async record(actorEmail: string, action: AuditAction, targetType: AuditTarget, targetId: number, ip: string | null): Promise<void> {
    await this.repo.insert({ actorEmail, action, targetType, targetId, ip: ip && isIP(ip) ? ip : null });
  }
}
