import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ImapClient } from "../imap.js";

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export function registerManageTools(
  server: McpServer,
  imapClient: ImapClient,
): void {
  server.registerTool(
    "move_message",
    {
      description: "Move a message to a different folder",
      inputSchema: {
        folder: z.string().describe("Source folder path"),
        uid: z.number().describe("Message UID"),
        destination: z.string().describe("Destination folder path"),
      },
    },
    async ({ folder, uid, destination }) => {
      try {
        await imapClient.moveMessage(folder, uid, destination);
        return {
          content: [
            { type: "text", text: `Message ${uid} moved to ${destination}` },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  server.registerTool(
    "delete_message",
    {
      description:
        "Delete a message (moves to Trash, or permanently deletes if already in Trash)",
      inputSchema: {
        folder: z.string().describe("Folder path"),
        uid: z.number().describe("Message UID"),
      },
    },
    async ({ folder, uid }) => {
      try {
        await imapClient.deleteMessage(folder, uid);
        return {
          content: [{ type: "text", text: `Message ${uid} deleted` }],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  server.registerTool(
    "mark_message",
    {
      description: "Set or unset message flags (seen, flagged)",
      inputSchema: {
        folder: z.string().describe("Folder path"),
        uid: z.number().describe("Message UID"),
        seen: z.boolean().optional().describe("Mark as read/unread"),
        flagged: z.boolean().optional().describe("Mark as flagged/unflagged"),
      },
    },
    async ({ folder, uid, seen, flagged }) => {
      try {
        await imapClient.markMessage(folder, uid, { seen, flagged });
        return {
          content: [{ type: "text", text: `Message ${uid} flags updated` }],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );
}
