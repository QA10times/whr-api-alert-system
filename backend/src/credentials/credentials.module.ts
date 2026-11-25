import { Module } from '@nestjs/common';
import { ApisModule } from '../apis/apis.module';
import { ModulesModule } from '../modules/modules.module';
import { CredentialsController } from './credentials.controller';

@Module({ imports: [ModulesModule, ApisModule], controllers: [CredentialsController] })
export class CredentialsModule {}
