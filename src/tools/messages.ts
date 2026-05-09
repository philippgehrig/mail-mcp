import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ImapClient } from "../imap.js";

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export function registerMessageTools(
  server: McpServer,
  imapClient: ImapClient,
): void {
  server.registerTool(
    "list_messages",
    {
      description: "List messages in a mailbox folder",
      inputSchema: {
        folder: z.string().default("INBOX").describe("Mailbox folder path"),
        limit: z
          .number()
          .default(50)
          .describe("Maximum number of messages to return"),
        offset: z.number().default(0).describe("Number of messages to skip"),
      },
    },
    async ({ folder, limit, offset }) => {
      try {
        const messages = await imapClient.listMessages(folder, limit, offset);
        return {
          content: [{ type: "text", text: JSON.stringify(messages, null, 2) }],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  server.registerTool(
    "search_messages",
    {
      description: "Search messages by criteria",
      inputSchema: {
        folder: z.string().default("INBOX").describe("Mailbox folder path"),
        from: z.string().optional().describe("Filter by sender"),
        to: z.string().optional().describe("Filter by recipient"),
        subject: z.string().optional().describe("Filter by subject"),
        body: z.string().optional().describe("Search in message body"),
        since: z
          .string()
          .optional()
          .describe("Messages since date (ISO 8601)"),
        before: z
          .string()
          .optional()
          .describe("Messages before date (ISO 8601)"),
        flagged: z.boolean().optional().describe("Filter by flagged status"),
        unseen: z.boolean().optional().describe("Filter by unread status"),
        keyword: z.string().optional().describe("Filter by IMAP keyword"),
        withoutKeyword: z.string().optional().describe("Exclude messages with this keyword"),
      },
    },
    async ({ folder, ...query }) => {
      try {
        const messages = await imapClient.searchMessages(folder, query);
        return {
          content: [{ type: "text", text: JSON.stringify(messages, null, 2) }],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  server.registerTool(
    "get_message",
    {
      description: "Get the full content of an email message",
      inputSchema: {
        folder: z.string().default("INBOX").describe("Mailbox folder path"),
        uid: z.number().describe("Message UID"),
      },
    },
    async ({ folder, uid }) => {
      try {
        const message = await imapClient.getMessage(folder, uid);
        return {
          content: [{ type: "text", text: JSON.stringify(message, null, 2) }],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  server.registerTool(
    "get_attachment",
    {
      description: "Download an email attachment",
      inputSchema: {
        folder: z.string().default("INBOX").describe("Mailbox folder path"),
        uid: z.number().describe("Message UID"),
        partId: z.string().describe("MIME part ID of the attachment"),
      },
    },
    async ({ folder, uid, partId }) => {
      try {
        const attachment = await imapClient.getAttachment(folder, uid, partId);
        return {
          content: [{ type: "text", text: JSON.stringify(attachment, null, 2) }],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );
}
