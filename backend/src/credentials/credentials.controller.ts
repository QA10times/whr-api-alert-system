import { Controller, Get, Header, Param, ParseIntPipe } from '@nestjs/common';
import { ApisService } from '../apis/apis.service';
import { ClientIp, CurrentUser } from '../common/current-user.decorator';
import { SecretAccessThrottle } from '../common/throttle';
import type { AuthUser } from '../common/types';
import { ModulesService } from '../modules/modules.service';

/** Show credentials on the edit forms. Shares the copy-curl rate limit; every call is audited. */
@Controller()
@SecretAccessThrottle()
export class CredentialsController {
  constructor(
    private readonly modules: ModulesService,
    private readonly apis: ApisService,
  ) {}

  @Get('modules/:id/credentials')
  @Header('Cache-Control', 'no-store')
  module(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @ClientIp() ip: string | null) {
    return this.modules.credentials(id, user, ip);
  }

  @Get('apis/:id/credentials')
  @Header('Cache-Control', 'no-store')
  api(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @ClientIp() ip: string | null) {
    return this.apis.credentials(id, user, ip);
  }
}
