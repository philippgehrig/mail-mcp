export interface Config {
  imap: {
    host: string;
    port: number;
  };
  smtp: {
    host: string;
    port: number;
  };
  auth: {
    user: string;
    pass: string;
  };
  mailFrom: string;
  sentFolder: string;
  trashFolder: string | null;
  attachmentsDir: string | null;
  allowUnrestrictedAttachments: boolean;
  tlsRejectUnauthorized: boolean;
}

export function loadConfig(): Config {
  const required = (name: string): string => {
    const val = process.env[name];
    if (!val) {
      console.error(`Missing required environment variable: ${name}`);
      process.exit(1);
    }
    return val;
  };

  const parsePort = (name: string, defaultValue: number): number => {
    const raw = process.env[name];
    if (!raw) return defaultValue;
    const port = parseInt(raw, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      console.error(`Invalid port for ${name}: "${raw}" (must be 1-65535)`);
      process.exit(1);
    }
    return port;
  };

  const imapHost = required("IMAP_HOST");
  const smtpHost = required("SMTP_HOST");
  const mailUser = required("MAIL_USER");
  const mailPassword = required("MAIL_PASSWORD");

  return {
    imap: {
      host: imapHost,
      port: parsePort("IMAP_PORT", 993),
    },
    smtp: {
      host: smtpHost,
      port: parsePort("SMTP_PORT", 587),
    },
    auth: {
      user: mailUser,
      pass: mailPassword,
    },
    mailFrom: process.env.MAIL_FROM || mailUser,
    sentFolder: process.env.SENT_FOLDER || "send-via-mcp",
    trashFolder: process.env.TRASH_FOLDER || null,
    attachmentsDir: process.env.ATTACHMENTS_DIR || null,
    allowUnrestrictedAttachments:
      process.env.ALLOW_UNRESTRICTED_ATTACHMENTS === "true",
    tlsRejectUnauthorized:
      process.env.TLS_REJECT_UNAUTHORIZED !== "false",
  };
}
