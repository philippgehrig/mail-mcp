import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ImapClient } from "../imap.js";

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export function registerFolderTools(
  server: McpServer,
  imapClient: ImapClient,
): void {
  server.registerTool(
    "list_folders",
    {
      description: "List all mailbox folders",
      inputSchema: {},
    },
    async () => {
      try {
        const folders = await imapClient.listFolders();
        return {
          content: [{ type: "text", text: JSON.stringify(folders, null, 2) }],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );
}
