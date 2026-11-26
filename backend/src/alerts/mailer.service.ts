import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { ENV } from '../config/env.token';
import type { Env } from '../config/env.validation';

export interface OutgoingMail {
  to: string[];
  subject: string;
  text: string;
}

/** nodemailer over SMTP. Without SMTP_HOST (local dev only) mail is written to the log instead. */
@Injectable()
export class MailerService {
  private readonly log = new Logger('Mailer');
  private transport: Transporter;
  private logOnly: boolean;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.logOnly = !env.SMTP_HOST;
    this.transport = this.logOnly
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 30_000,
        });
    if (this.logOnly) this.log.warn('SMTP_HOST is not set: alert emails are logged, not delivered.');
  }

  /** Tests swap in a capturing transport. */
  useTransport(t: Transporter, logOnly = false) {
    this.transport = t;
    this.logOnly = logOnly;
  }

  async send(mail: OutgoingMail): Promise<{ note: string | null }> {
    await this.transport.sendMail({ from: this.env.MAIL_FROM, to: mail.to.join(', '), subject: mail.subject, text: mail.text });
    if (this.logOnly) {
      this.log.log(`[log-only] To: ${mail.to.join(', ')} | ${mail.subject}`);
      return { note: 'SMTP_HOST not set; written to the log only' };
    }
    return { note: null };
  }
}
