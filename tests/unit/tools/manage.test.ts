import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerManageTools } from "../../../src/tools/manage.js";
import { ImapClient } from "../../../src/imap.js";

function getRegisteredTools(server: McpServer): Record<string, unknown> {
  return (server as any)._registeredTools;
}

describe("registerManageTools", () => {
  const expectedTools = ["move_message", "delete_message", "mark_message"];

  it("registers all manage tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;

    registerManageTools(server, mockImapClient);

    const tools = getRegisteredTools(server);
    for (const toolName of expectedTools) {
      expect(tools).toHaveProperty(toolName);
    }
  });

  it("registers only manage tools (no extras)", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;

    registerManageTools(server, mockImapClient);

    const tools = getRegisteredTools(server);
    expect(Object.keys(tools).sort()).toEqual(expectedTools.sort());
  });

  it.each(expectedTools)("%s tool has a handler function", (toolName) => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;

    registerManageTools(server, mockImapClient);

    const tools = getRegisteredTools(server);
    const tool = tools[toolName] as { handler: unknown };
    expect(typeof tool.handler).toBe("function");
  });
});
