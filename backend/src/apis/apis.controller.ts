import { Body, Controller, DefaultValuePipe, Delete, Get, Header, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ClientIp, CurrentUser } from '../common/current-user.decorator';
import { SecretAccessThrottle } from '../common/throttle';
import type { AuthUser } from '../common/types';
import { ApisService } from './apis.service';
import { ApiInputDto, ApiUpdateDto } from './dto/api.dto';

@Controller()
export class ApisController {
  constructor(private readonly svc: ApisService) {}

  @Post('modules/:id/apis')
  create(@Param('id', ParseIntPipe) moduleId: number, @Body() dto: ApiInputDto) {
    return this.svc.create(moduleId, dto);
  }

  @Get('apis/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.detail(id);
  }

  @Patch('apis/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ApiUpdateDto) {
    return this.svc.update(id, dto);
  }

  @Delete('apis/:id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  @Get('apis/:id/curl')
  @SecretAccessThrottle()
  @Header('Cache-Control', 'no-store')
  curl(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @ClientIp() ip: string | null) {
    return this.svc.curl(id, user, ip);
  }

  @Get('apis/:id/runs')
  runs(@Param('id', ParseIntPipe) id: number, @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.svc.runs(id, limit);
  }
}
