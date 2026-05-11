import nodemailer, { Transporter } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type Mail from "nodemailer/lib/mailer/index.js";
import path from "path";
import fs from "fs";
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
        tls: {
          rejectUnauthorized: this.config.tlsRejectUnauthorized,
        },
      });
      console.error(`SMTP transport created: ${this.config.smtp.host}`);
    }
    return this.transporter;
  }

  private validateAttachmentPaths(paths: string[]): void {
    if (paths.length === 0) return;

    if (this.config.allowUnrestrictedAttachments) {
      return;
    }

    if (!this.config.attachmentsDir) {
      throw new Error(
        "Attachments are not allowed: ATTACHMENTS_DIR is not configured and ALLOW_UNRESTRICTED_ATTACHMENTS is not enabled",
      );
    }

    const resolvedDir = fs.realpathSync(path.resolve(this.config.attachmentsDir));

    for (const filePath of paths) {
      const resolvedPath = path.resolve(filePath);

      // Check file exists before resolving symlinks
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Attachment file not found: "${filePath}"`);
      }

      // Resolve symlinks to get real path
      const realPath = fs.realpathSync(resolvedPath);

      // Reject the directory itself
      if (realPath === resolvedDir) {
        throw new Error(`Attachment path "${filePath}" is a directory, not a file`);
      }

      // Prevent path traversal (check real path after symlink resolution)
      if (!realPath.startsWith(resolvedDir + path.sep)) {
        throw new Error(
          `Attachment path "${filePath}" resolves outside the allowed directory "${resolvedDir}"`,
        );
      }

      // Verify it's a regular file
      const stat = fs.statSync(realPath);
      if (!stat.isFile()) {
        throw new Error(`Attachment path "${filePath}" is not a regular file`);
      }
    }
  }

  private buildAttachments(paths: string[]): Mail.Attachment[] {
    this.validateAttachmentPaths(paths);

    return paths.map((filePath) => ({
      filename: path.basename(filePath),
      path: path.resolve(filePath),
    }));
  }

  private async appendToSentFolder(
    imapClient: ImapClient,
    raw: Buffer | string,
  ): Promise<string | null> {
    const folderName = this.config.sentFolder;
    const client = imapClient.getClient();

    try {
      // Check if folder exists
      const folders = await client.list();
      const exists = folders.some(
        (f) => f.path === folderName || f.name === folderName,
      );

      if (!exists) {
        console.error(`Creating sent folder: ${folderName}`);
        await client.mailboxCreate(folderName);
      }

      // Append message with \Seen flag
      await client.append(folderName, raw, ["\\Seen"]);
      console.error(`Message appended to ${folderName}`);
      return null;
    } catch (err) {
      const message = `Failed to append to sent folder: ${err instanceof Error ? err.message : String(err)}`;
      console.error(message);
      return message;
    }
  }

  async sendMessage(
    to: string,
    subject: string,
    body: string,
    options: { cc?: string; bcc?: string; attachments?: string[] },
    imapClient: ImapClient,
  ): Promise<string> {
    const mailOptions: Mail.Options = {
      from: this.config.mailFrom,
      to,
      subject,
      text: body,
    };

    if (options.cc) mailOptions.cc = options.cc;
    if (options.bcc) mailOptions.bcc = options.bcc;

    if (options.attachments && options.attachments.length > 0) {
      mailOptions.attachments = this.buildAttachments(options.attachments);
    }

    // Send the message
    const transporter = this.getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.error(`Message sent: ${info.messageId}`);

    // Build raw message for IMAP append
    try {
      const composer = new MailComposer(mailOptions);
      const rawMessage = await composer.compile().build();
      await this.appendToSentFolder(imapClient, rawMessage);
    } catch (err) {
      console.error(`Failed to build/append sent message: ${err}`);
    }

    return info.messageId;
  }

  async replyMessage(
    folder: string,
    uid: number,
    body: string,
    options: { cc?: string; bcc?: string; replyAll?: boolean },
    imapClient: ImapClient,
  ): Promise<string> {
    // Fetch the original message
    const original = await imapClient.getMessage(folder, uid);

    // Determine recipients
    let to: string;
    if (options.replyAll) {
      // Reply all: original from + all to/cc, excluding self
      const selfAddress = this.extractEmailAddress(this.config.mailFrom);
      const allRecipients = new Set<string>();

      if (original.from) {
        allRecipients.add(original.from);
      }
      if (original.to) {
        original.to.split(",").forEach((addr) => allRecipients.add(addr.trim()));
      }
      if (original.cc) {
        original.cc.split(",").forEach((addr) => allRecipients.add(addr.trim()));
      }

      // Remove self from recipients (compare extracted email addresses)
      const filtered = Array.from(allRecipients).filter(
        (addr) => this.extractEmailAddress(addr) !== selfAddress,
      );

      // Fall back to original sender if filtering removed everyone
      to = filtered.length > 0 ? filtered.join(", ") : original.from;
    } else {
      to = original.from;
    }

    // Build subject
    let subject = original.subject || "";
    if (!subject.toLowerCase().startsWith("re:")) {
      subject = `Re: ${subject}`;
    }

    // Build references
    const references: string[] = [...(original.references || [])];
    if (original.messageId) {
      references.push(original.messageId);
    }

    const mailOptions: Mail.Options = {
      from: this.config.mailFrom,
      to,
      subject,
      text: body,
      inReplyTo: original.messageId || undefined,
      references: references.length > 0 ? references.join(" ") : undefined,
    };

    if (options.cc) mailOptions.cc = options.cc;
    if (options.bcc) mailOptions.bcc = options.bcc;

    // Send the reply
    const transporter = this.getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.error(`Reply sent: ${info.messageId}`);

    // Append to sent folder
    try {
      const composer = new MailComposer(mailOptions);
      const rawMessage = await composer.compile().build();
      await this.appendToSentFolder(imapClient, rawMessage);
    } catch (err) {
      console.error(`Failed to build/append sent reply: ${err}`);
    }

    return info.messageId;
  }

  async forwardMessage(
    folder: string,
    uid: number,
    to: string,
    options: { body?: string },
    imapClient: ImapClient,
  ): Promise<string> {
    // Fetch the original message
    const original = await imapClient.getMessage(folder, uid);

    // Build subject
    let subject = original.subject || "";
    if (!subject.toLowerCase().startsWith("fwd:")) {
      subject = `Fwd: ${subject}`;
    }

    // Build forwarded body
    const forwardHeader = [
      "---------- Forwarded message ----------",
      `From: ${original.from}`,
      `Date: ${original.date}`,
      `Subject: ${original.subject || ""}`,
      `To: ${original.to}`,
      "",
    ].join("\n");

    const bodyParts: string[] = [];
    if (options.body) {
      bodyParts.push(options.body);
      bodyParts.push("");
    }
    bodyParts.push(forwardHeader);
    bodyParts.push(original.body || "");

    const fullBody = bodyParts.join("\n");

    // Fetch attachments from original
    const attachments: Mail.Attachment[] = [];
    if (original.attachments && original.attachments.length > 0) {
      for (const att of original.attachments) {
        try {
          const content = await imapClient.getAttachment(
            folder,
            uid,
            att.partId,
          );
          attachments.push({
            filename: content.filename || att.filename,
            content: Buffer.from(content.content, "base64"),
            contentType: content.contentType || att.contentType,
          });
        } catch (err) {
          console.error(
            `Failed to fetch attachment ${att.filename}: ${err}`,
          );
        }
      }
    }

    const mailOptions: Mail.Options = {
      from: this.config.mailFrom,
      to,
      subject,
      text: fullBody,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    // Send the forward
    const transporter = this.getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.error(`Forward sent: ${info.messageId}`);

    // Append to sent folder
    try {
      const composer = new MailComposer(mailOptions);
      const rawMessage = await composer.compile().build();
      await this.appendToSentFolder(imapClient, rawMessage);
    } catch (err) {
      console.error(`Failed to build/append sent forward: ${err}`);
    }

    return info.messageId;
  }

  private extractEmailAddress(addr: string): string {
    const match = addr.match(/<([^>]+)>/);
    return (match ? match[1] : addr).toLowerCase().trim();
  }

  close(): void {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }

  getConfig(): Config {
    return this.config;
  }
}
