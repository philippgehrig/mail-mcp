import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerManageTools } from "../../../src/tools/manage.js";

vi.mock("imapflow", () => ({
  ImapFlow: class {},
}));

vi.mock("mailparser", () => ({
  simpleParser: vi.fn(),
}));

describe("Manage tools registration", () => {
  it("registers move_message tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;

    registerManageTools(server, mockImapClient);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty("move_message");
    expect(typeof tools.move_message.handler).toBe("function");
  });

  it("registers delete_message tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;

    registerManageTools(server, mockImapClient);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty("delete_message");
    expect(typeof tools.delete_message.handler).toBe("function");
  });

  it("registers mark_message tool", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;

    registerManageTools(server, mockImapClient);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty("mark_message");
    expect(typeof tools.mark_message.handler).toBe("function");
  });
});
