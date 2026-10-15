import { Global, Module } from '@nestjs/common';
import { ENV, Env } from '../common/config/env';
import { ConsoleMailer, Mailer, SmtpMailer } from './mailer';

@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [ENV],
      useFactory: (env: Env) => (env.SMTP_URL ? new SmtpMailer(env) : new ConsoleMailer()),
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
