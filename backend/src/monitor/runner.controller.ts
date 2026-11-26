import { Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { RunQueueService } from './run-queue.service';

@Controller()
export class RunnerController {
  constructor(private readonly queue: RunQueueService) {}

  @Get('runner/status')
  status() {
    return this.queue.status();
  }

  @Post('apis/:id/run')
  @HttpCode(202)
  runApi(@Param('id', ParseIntPipe) id: number) {
    return this.queue.runApi(id);
  }

  @Post('platforms/:key/environments/:env/run')
  @HttpCode(202)
  runEnvironment(@Param('key') key: string, @Param('env') env: string) {
    return this.queue.runEnvironment(key, env);
  }
}
