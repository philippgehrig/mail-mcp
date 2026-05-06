import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFolderTools } from "../../../src/tools/folders.js";
import { ImapClient } from "../../../src/imap.js";

function getRegisteredTools(server: McpServer): Record<string, unknown> {
  return (server as any)._registeredTools;
}

describe("registerFolderTools", () => {
  it("registers the list_folders tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;

    registerFolderTools(server, mockImapClient);

    const tools = getRegisteredTools(server);
    expect(tools).toHaveProperty("list_folders");
  });

  it("list_folders tool has a handler function", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;

    registerFolderTools(server, mockImapClient);

    const tools = getRegisteredTools(server);
    const tool = tools["list_folders"] as { handler: unknown };
    expect(typeof tool.handler).toBe("function");
  });
});
