#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ImapClient } from "./imap.js";
import { SmtpClient } from "./smtp.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerManageTools } from "./tools/manage.js";
import { registerSendTools } from "./tools/send.js";

const config = loadConfig();

const server = new McpServer({
  name: "mail-mcp",
  version: "0.1.0",
});

const imapClient = new ImapClient(config);
const smtpClient = new SmtpClient(config);

registerFolderTools(server, imapClient);
registerMessageTools(server, imapClient);
registerManageTools(server, imapClient);
registerSendTools(server, imapClient, smtpClient);

async function main() {
  await imapClient.connect();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mail-mcp server started");
}

main().catch((err: unknown) => {
  console.error("Failed to start mail-mcp server:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
