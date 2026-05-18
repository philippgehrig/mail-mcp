import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImapClient } from "../../src/imap.js";
import { Config } from "../../src/config.js";

const mockLock = { release: vi.fn() };

const mockClient = {
  connect: vi.fn(),
  logout: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
  list: vi.fn(),
  getMailboxLock: vi.fn().mockResolvedValue(mockLock),
  messageMove: vi.fn(),
  messageDelete: vi.fn(),
  messageFlagsAdd: vi.fn(),
  messageFlagsRemove: vi.fn(),
  mailbox: { exists: 0 },
  fetch: vi.fn(),
  search: vi.fn(),
  download: vi.fn(),
  mailboxCreate: vi.fn(),
};

vi.mock("imapflow", () => ({
  ImapFlow: class {
    constructor() {
      return mockClient;
    }
  },
}));

vi.mock("mailparser", () => ({
  simpleParser: vi.fn(),
}));

const baseConfig: Config = {
  imap: { host: "imap.example.com", port: 993 },
  smtp: { host: "smtp.example.com", port: 587 },
  auth: { user: "user@example.com", pass: "secret" },
  mailFrom: "user@example.com",
  sentFolder: "send-via-mcp",
  trashFolder: null,
  attachmentsDir: null,
  allowUnrestrictedAttachments: false,
};

describe("ImapClient keyword methods", () => {
  let client: ImapClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLock.release.mockClear();
    client = new ImapClient({ ...baseConfig });
  });

  describe("addKeyword", () => {
    it("adds a keyword to a message", async () => {
      await client.addKeyword("INBOX", 42, "$processed");
      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("INBOX");
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith("42", ["$processed"], { uid: true });
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("releases lock on error", async () => {
      mockClient.messageFlagsAdd.mockRejectedValueOnce(new Error("flag error"));
      await expect(client.addKeyword("INBOX", 42, "$processed")).rejects.toThrow("flag error");
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("uses the correct folder", async () => {
      await client.addKeyword("Archive", 100, "$important");
      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("Archive");
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith("100", ["$important"], { uid: true });
    });
  });

  describe("removeKeyword", () => {
    it("removes a keyword from a message", async () => {
      await client.removeKeyword("INBOX", 42, "$processed");
      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("INBOX");
      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith("42", ["$processed"], { uid: true });
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("releases lock on error", async () => {
      mockClient.messageFlagsRemove.mockRejectedValueOnce(new Error("remove error"));
      await expect(client.removeKeyword("INBOX", 42, "$processed")).rejects.toThrow("remove error");
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("uses the correct folder", async () => {
      await client.removeKeyword("Sent", 77, "$forwarded");
      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("Sent");
      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith("77", ["$forwarded"], { uid: true });
    });
  });

  describe("searchMessages with keyword filters", () => {
    it("passes keyword to search criteria", async () => {
      mockClient.search.mockResolvedValue([]);

      await client.searchMessages("INBOX", { keyword: "$processed" });
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: "$processed" }),
        { uid: true },
      );
    });

    it("passes unkeyword to search criteria", async () => {
      mockClient.search.mockResolvedValue([]);

      await client.searchMessages("INBOX", { withoutKeyword: "$processed" });
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ unkeyword: "$processed" }),
        { uid: true },
      );
    });

    it("combines keyword with other criteria", async () => {
      mockClient.search.mockResolvedValue([]);

      await client.searchMessages("INBOX", { from: "test@example.com", keyword: "$important" });
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ from: "test@example.com", keyword: "$important" }),
        { uid: true },
      );
    });
  });
});
