import { Controller, Get, Param } from '@nestjs/common';
import { PlatformsService } from './platforms.service';
import { SummaryService } from './summary.service';

@Controller('platforms')
export class PlatformsController {
  constructor(
    private readonly platforms: PlatformsService,
    private readonly summaries: SummaryService,
  ) {}

  @Get()
  list() {
    return this.platforms.list();
  }

  @Get(':key/environments/:env/summary')
  summary(@Param('key') key: string, @Param('env') env: string) {
    return this.summaries.summary(key, env);
  }
}
