import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFolderTools } from "../../../src/tools/folders.js";

vi.mock("imapflow", () => ({
  ImapFlow: class {},
}));

vi.mock("mailparser", () => ({
  simpleParser: vi.fn(),
}));

describe("Folder tools registration", () => {
  it("registers list_folders tool with correct name and handler", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;

    registerFolderTools(server, mockImapClient);

    const tools = (server as any)._registeredTools;
    expect(tools).toHaveProperty("list_folders");
    expect(tools.list_folders).toBeDefined();
    expect(typeof tools.list_folders.handler).toBe("function");
  });
});
