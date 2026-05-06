import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSendTools } from "../../../src/tools/send.js";
import { ImapClient } from "../../../src/imap.js";
import { SmtpClient } from "../../../src/smtp.js";

function getRegisteredTools(server: McpServer): Record<string, unknown> {
  return (server as any)._registeredTools;
}

describe("registerSendTools", () => {
  const expectedTools = ["send_message", "reply_message", "forward_message"];

  it("registers all send tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;
    const mockSmtpClient = {} as SmtpClient;

    registerSendTools(server, mockImapClient, mockSmtpClient);

    const tools = getRegisteredTools(server);
    for (const toolName of expectedTools) {
      expect(tools).toHaveProperty(toolName);
    }
  });

  it("registers only send tools (no extras)", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;
    const mockSmtpClient = {} as SmtpClient;

    registerSendTools(server, mockImapClient, mockSmtpClient);

    const tools = getRegisteredTools(server);
    expect(Object.keys(tools).sort()).toEqual(expectedTools.sort());
  });

  it.each(expectedTools)("%s tool has a handler function", (toolName) => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as ImapClient;
    const mockSmtpClient = {} as SmtpClient;

    registerSendTools(server, mockImapClient, mockSmtpClient);

    const tools = getRegisteredTools(server);
    const tool = tools[toolName] as { handler: unknown };
    expect(typeof tool.handler).toBe("function");
  });
});
