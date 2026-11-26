import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  /** Recent failure and recovery alerts for an environment, with delivery status. */
  @Get()
  list(@Query('env') env: string | undefined, @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.alerts.list(env || undefined, limit);
  }

  /** One alert with its stored subject, body, recipients and last 5 results (View email). */
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.alerts.get(id);
  }
}
