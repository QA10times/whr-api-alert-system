import { Module } from '@nestjs/common';
import { EmailGroupsController } from './email-groups.controller';
import { EmailGroupsService } from './email-groups.service';

@Module({ controllers: [EmailGroupsController], providers: [EmailGroupsService], exports: [EmailGroupsService] })
export class EmailGroupsModule {}
