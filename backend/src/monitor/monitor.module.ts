import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { ApisModule } from '../apis/apis.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { FailureTrackerService } from './failure-tracker.service';
import { HttpProber } from './http-prober.service';
import { ResponseValidator } from './response-validator.service';
import { RetentionService } from './retention.service';
import { RunQueueService } from './run-queue.service';
import { RunnerController } from './runner.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ApisModule, AlertsModule, PlatformsModule],
  controllers: [RunnerController],
  providers: [SchedulerService, RunQueueService, HttpProber, ResponseValidator, FailureTrackerService, RetentionService],
  exports: [SchedulerService, RunQueueService],
})
export class MonitorModule {}
