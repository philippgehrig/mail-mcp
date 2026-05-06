import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMessageTools } from "../../../src/tools/messages.js";

vi.mock("imapflow", () => ({
  ImapFlow: class {},
}));

vi.mock("mailparser", () => ({
  simpleParser: vi.fn(),
}));

describe("Message tools registration", () => {
  it("registers list_messages tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;

    registerMessageTools(server, mockImapClient);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty("list_messages");
    expect(typeof tools.list_messages.handler).toBe("function");
  });

  it("registers search_messages tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;

    registerMessageTools(server, mockImapClient);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty("search_messages");
    expect(typeof tools.search_messages.handler).toBe("function");
  });

  it("registers get_message tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;

    registerMessageTools(server, mockImapClient);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty("get_message");
    expect(typeof tools.get_message.handler).toBe("function");
  });

  it("registers get_attachment tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;

    registerMessageTools(server, mockImapClient);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty("get_attachment");
    expect(typeof tools.get_attachment.handler).toBe("function");
  });
});
