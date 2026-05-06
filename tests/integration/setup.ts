process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { Config } from "../../src/config.js";

export const TEST_CONFIG: Config = {
  imap: {
    host: "localhost",
    port: 3993,
  },
  smtp: {
    host: "localhost",
    port: 3025,
  },
  auth: {
    user: "test@test.com",
    pass: "password",
  },
  mailFrom: "test@test.com",
  sentFolder: "Sent",
  trashFolder: null,
  attachmentsDir: null,
  allowUnrestrictedAttachments: false,
};

export function createImapClient(): ImapFlow {
  return new ImapFlow({
    host: TEST_CONFIG.imap.host,
    port: TEST_CONFIG.imap.port,
    secure: true,
    auth: {
      user: TEST_CONFIG.auth.user,
      pass: TEST_CONFIG.auth.pass,
    },
    tls: { rejectUnauthorized: false },
    logger: false,
  });
}

export async function sendTestEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: TEST_CONFIG.smtp.host,
    port: TEST_CONFIG.smtp.port,
    secure: false,
    auth: {
      user: TEST_CONFIG.auth.user,
      pass: TEST_CONFIG.auth.pass,
    },
  });

  await transporter.sendMail({
    from: TEST_CONFIG.mailFrom,
    to,
    subject,
    text: body,
  });

  transporter.close();
}

export async function waitForMessage(
  client: ImapFlow,
  folder: string,
  timeout: number = 10000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const lock = await client.getMailboxLock(folder);
    try {
      const mailbox = client.mailbox;
      if (mailbox && mailbox.exists > 0) {
        return;
      }
    } finally {
      lock.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for message in ${folder} after ${timeout}ms`);
}
