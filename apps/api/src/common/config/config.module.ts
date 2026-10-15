import { Global, Module } from '@nestjs/common';
import { ENV, validateEnv } from './env';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => validateEnv(process.env) }],
  exports: [ENV],
})
export class AppConfigModule {}
