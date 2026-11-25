import { Module } from '@nestjs/common';
import { PlatformsController } from './platforms.controller';
import { PlatformsService } from './platforms.service';
import { SummaryService } from './summary.service';

@Module({ controllers: [PlatformsController], providers: [PlatformsService, SummaryService], exports: [PlatformsService] })
export class PlatformsModule {}
