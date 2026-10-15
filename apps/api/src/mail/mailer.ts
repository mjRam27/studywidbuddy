import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { ENV, Env } from '../common/config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

/**
 * Development mailer: writes the message to the API log so verification and reset links
 * can be followed without an email provider. Selected when SMTP_URL is empty.
 */
@Injectable()
export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger('Mail');

  async send(m: MailMessage) {
    this.logger.log(`\n── email to ${m.to} ──\nSubject: ${m.subject}\n\n${m.text}\n──────────`);
  }
}

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly transport: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.transport = createTransport(env.SMTP_URL);
  }

  async send(m: MailMessage) {
    await this.transport.sendMail({ from: this.env.MAIL_FROM, to: m.to, subject: m.subject, text: m.text });
  }
}
