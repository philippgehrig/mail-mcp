import nodemailer, { Transporter } from "nodemailer";
import { Config } from "./config.js";
import { ImapClient } from "./imap.js";

export class SmtpClient {
  private transporter: Transporter | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        pool: true,
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.port === 465,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
      });
      console.error(`SMTP transport created: ${this.config.smtp.host}`);
    }
    return this.transporter;
  }

  async sendMessage(
    _to: string,
    _subject: string,
    _body: string,
    _options: { cc?: string; bcc?: string; attachments?: string[] },
    _imapClient: ImapClient,
  ): Promise<string> {
    throw new Error("Not implemented");
  }

  async replyMessage(
    _folder: string,
    _uid: number,
    _body: string,
    _options: { cc?: string; bcc?: string; replyAll?: boolean },
    _imapClient: ImapClient,
  ): Promise<string> {
    throw new Error("Not implemented");
  }

  async forwardMessage(
    _folder: string,
    _uid: number,
    _to: string,
    _options: { body?: string },
    _imapClient: ImapClient,
  ): Promise<string> {
    throw new Error("Not implemented");
  }

  getConfig(): Config {
    return this.config;
  }
}
