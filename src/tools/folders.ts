import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ImapClient } from "../imap.js";

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
      const folders = await imapClient.listFolders();
      return {
        content: [{ type: "text", text: JSON.stringify(folders, null, 2) }],
      };
    },
  );
}
