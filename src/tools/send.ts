import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ImapClient } from "../imap.js";
import { SmtpClient } from "../smtp.js";

export function registerSendTools(
  server: McpServer,
  imapClient: ImapClient,
  smtpClient: SmtpClient,
): void {
  server.registerTool(
    "send_message",
    {
      description: "Compose and send a new email",
      inputSchema: {
        to: z
          .string()
          .describe("Recipient email address(es), comma-separated"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (plain text)"),
        cc: z.string().optional().describe("CC recipients, comma-separated"),
        bcc: z.string().optional().describe("BCC recipients, comma-separated"),
        attachments: z
          .array(z.string())
          .optional()
          .describe("File paths to attach"),
      },
    },
    async ({ to, subject, body, cc, bcc, attachments }) => {
      const messageId = await smtpClient.sendMessage(
        to,
        subject,
        body,
        { cc, bcc, attachments },
        imapClient,
      );
      return {
        content: [
          {
            type: "text",
            text: `Email sent to ${to} (Message-ID: ${messageId})`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "reply_message",
    {
      description: "Reply to an existing email",
      inputSchema: {
        folder: z.string().describe("Folder containing the original message"),
        uid: z.number().describe("UID of the message to reply to"),
        body: z.string().describe("Reply body (plain text)"),
        cc: z.string().optional().describe("Additional CC recipients"),
        bcc: z.string().optional().describe("BCC recipients"),
        replyAll: z
          .boolean()
          .default(false)
          .describe("Reply to all recipients"),
      },
    },
    async ({ folder, uid, body, cc, bcc, replyAll }) => {
      const messageId = await smtpClient.replyMessage(
        folder,
        uid,
        body,
        { cc, bcc, replyAll },
        imapClient,
      );
      return {
        content: [
          { type: "text", text: `Reply sent (Message-ID: ${messageId})` },
        ],
      };
    },
  );

  server.registerTool(
    "forward_message",
    {
      description: "Forward an email to another recipient",
      inputSchema: {
        folder: z
          .string()
          .describe("Folder containing the message to forward"),
        uid: z.number().describe("UID of the message to forward"),
        to: z.string().describe("Recipient to forward to"),
        body: z.string().optional().describe("Optional message to prepend"),
      },
    },
    async ({ folder, uid, to, body }) => {
      const messageId = await smtpClient.forwardMessage(
        folder,
        uid,
        to,
        { body },
        imapClient,
      );
      return {
        content: [
          {
            type: "text",
            text: `Message forwarded to ${to} (Message-ID: ${messageId})`,
          },
        ],
      };
    },
  );
}
