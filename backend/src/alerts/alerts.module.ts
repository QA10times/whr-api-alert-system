import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { MailerService } from './mailer.service';

@Module({ controllers: [AlertsController], providers: [AlertsService, MailerService], exports: [AlertsService, MailerService] })
export class AlertsModule {}
