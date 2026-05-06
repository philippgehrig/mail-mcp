import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMessageTools } from "../../../src/tools/messages.js";
import { ImapClient } from "../../../src/imap.js";

function getRegisteredTools(server: McpServer): Record<string, unknown> {
  return (server as any)._registeredTools;
}

describe("registerMessageTools", () => {
  const expectedTools = [
    "list_messages",
    "search_messages",
    "get_message",
    "get_attachment",
  ];

  it("registers all message tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;

    registerMessageTools(server, mockImapClient);

    const tools = getRegisteredTools(server);
    for (const toolName of expectedTools) {
      expect(tools).toHaveProperty(toolName);
    }
  });

  it("registers only message tools (no extras)", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;

    registerMessageTools(server, mockImapClient);

    const tools = getRegisteredTools(server);
    expect(Object.keys(tools).sort()).toEqual(expectedTools.sort());
  });

  it.each(expectedTools)("%s tool has a handler function", (toolName) => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;

    registerMessageTools(server, mockImapClient);

    const tools = getRegisteredTools(server);
    const tool = tools[toolName] as { handler: unknown };
    expect(typeof tool.handler).toBe("function");
  });
});
