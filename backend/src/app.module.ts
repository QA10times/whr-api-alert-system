import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/config.module';

@Module({
  imports: [AppConfigModule, CommonModule],
})
export class AppModule {}
