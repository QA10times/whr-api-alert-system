import { Module } from '@nestjs/common';
import { RequestBuilder } from '../monitor/request-builder.service';
import { ApisController } from './apis.controller';
import { ApisService } from './apis.service';
import { CurlService } from './curl.service';

@Module({
  controllers: [ApisController],
  providers: [ApisService, CurlService, RequestBuilder],
  exports: [ApisService, RequestBuilder],
})
export class ApisModule {}
