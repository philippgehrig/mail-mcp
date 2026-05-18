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

describe("ImapClient", () => {
  let client: ImapClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLock.release.mockClear();
    client = new ImapClient({ ...baseConfig });
  });

  describe("listFolders", () => {
    it("returns formatted folder list", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", delimiter: "/", status: { messages: 10 } },
        { name: "Sent", path: "Sent", delimiter: "/", status: { messages: 5 } },
      ]);

      const folders = await client.listFolders();
      expect(folders).toEqual([
        { name: "INBOX", path: "INBOX", delimiter: "/", count: 10 },
        { name: "Sent", path: "Sent", delimiter: "/", count: 5 },
      ]);
    });

    it("handles null delimiter", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", delimiter: null, status: { messages: 3 } },
      ]);

      const folders = await client.listFolders();
      expect(folders[0].delimiter).toBe("/");
    });

    it("handles undefined status", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", delimiter: "/", status: undefined },
      ]);

      const folders = await client.listFolders();
      expect(folders[0].count).toBe(0);
    });
  });

  describe("getTrashFolder", () => {
    it("returns config value when trashFolder is set", async () => {
      const configWithTrash = { ...baseConfig, trashFolder: "MyTrash" };
      const clientWithTrash = new ImapClient(configWithTrash);
      const result = await clientWithTrash.getTrashFolder();
      expect(result).toBe("MyTrash");
    });

    it("detects SPECIAL-USE \\Trash", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", specialUse: undefined },
        { name: "Deleted Items", path: "Deleted Items", specialUse: "\\Trash" },
      ]);

      const result = await client.getTrashFolder();
      expect(result).toBe("Deleted Items");
    });

    it("falls back to common names", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", specialUse: undefined },
        { name: "Deleted", path: "Deleted", specialUse: undefined },
      ]);

      const result = await client.getTrashFolder();
      expect(result).toBe("Deleted");
    });

    it("ultimate fallback is 'Trash'", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", specialUse: undefined },
        { name: "Sent", path: "Sent", specialUse: undefined },
      ]);

      const result = await client.getTrashFolder();
      expect(result).toBe("Trash");
    });
  });

  describe("markMessage", () => {
    it("adds seen flag when seen=true", async () => {
      await client.markMessage("INBOX", 123, { seen: true });
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith("123", ["\\Seen"], { uid: true });
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("removes seen flag when seen=false", async () => {
      await client.markMessage("INBOX", 123, { seen: false });
      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith("123", ["\\Seen"], { uid: true });
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("adds flagged flag when flagged=true", async () => {
      await client.markMessage("INBOX", 123, { flagged: true });
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith("123", ["\\Flagged"], { uid: true });
    });

    it("removes flagged flag when flagged=false", async () => {
      await client.markMessage("INBOX", 123, { flagged: false });
      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith("123", ["\\Flagged"], { uid: true });
    });

    it("handles both flags together", async () => {
      await client.markMessage("INBOX", 123, { seen: true, flagged: false });
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith("123", ["\\Seen"], { uid: true });
      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith("123", ["\\Flagged"], { uid: true });
    });

    it("does nothing on empty flags", async () => {
      await client.markMessage("INBOX", 123, {});
      expect(mockClient.messageFlagsAdd).not.toHaveBeenCalled();
      expect(mockClient.messageFlagsRemove).not.toHaveBeenCalled();
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("releases lock on error", async () => {
      mockClient.messageFlagsAdd.mockRejectedValueOnce(new Error("fail"));
      await expect(client.markMessage("INBOX", 123, { seen: true })).rejects.toThrow("fail");
      expect(mockLock.release).toHaveBeenCalled();
    });
  });

  describe("deleteMessage", () => {
    it("moves to trash when not in trash", async () => {
      mockClient.list.mockResolvedValue([
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);

      await client.deleteMessage("INBOX", 42);
      expect(mockClient.messageMove).toHaveBeenCalledWith("42", "Trash", { uid: true });
    });

    it("permanently deletes when in trash", async () => {
      mockClient.list.mockResolvedValue([
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);

      await client.deleteMessage("Trash", 42);
      expect(mockClient.messageDelete).toHaveBeenCalledWith("42", { uid: true });
    });

    it("case-insensitive comparison for trash folder", async () => {
      mockClient.list.mockResolvedValue([
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);

      await client.deleteMessage("trash", 42);
      expect(mockClient.messageDelete).toHaveBeenCalledWith("42", { uid: true });
    });

    it("uses config trashFolder", async () => {
      const configWithTrash = { ...baseConfig, trashFolder: "CustomTrash" };
      const clientWithTrash = new ImapClient(configWithTrash);

      mockClient.list.mockResolvedValue([
        { name: "CustomTrash", path: "CustomTrash" },
      ]);

      await clientWithTrash.deleteMessage("INBOX", 42);
      expect(mockClient.messageMove).toHaveBeenCalledWith("42", "CustomTrash", { uid: true });
    });
  });

  describe("moveMessage", () => {
    it("calls messageMove with correct args", async () => {
      await client.moveMessage("INBOX", 99, "Archive");
      expect(mockClient.messageMove).toHaveBeenCalledWith("99", "Archive", { uid: true });
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("releases lock on error", async () => {
      mockClient.messageMove.mockRejectedValueOnce(new Error("move failed"));
      await expect(client.moveMessage("INBOX", 99, "Archive")).rejects.toThrow("move failed");
      expect(mockLock.release).toHaveBeenCalled();
    });
  });

  describe("listMessages", () => {
    it("handles UID-based pagination", async () => {
      mockClient.mailbox = { exists: 5 };
      mockClient.search.mockResolvedValue([1, 2, 3, 4, 5]);

      const mockMessages = [
        { uid: 5, flags: new Set(["\\Seen"]), envelope: { subject: "msg5", from: [{ name: "A", address: "a@x.com" }], to: [{ name: "B", address: "b@x.com" }], date: new Date("2024-01-05") }, bodyStructure: {} },
        { uid: 4, flags: new Set([]), envelope: { subject: "msg4", from: [{ address: "c@x.com" }], to: [{ address: "d@x.com" }], date: new Date("2024-01-04") }, bodyStructure: {} },
      ];

      mockClient.fetch.mockImplementation(function* () {
        for (const msg of mockMessages) {
          yield msg;
        }
      });

      const messages = await client.listMessages("INBOX", 2, 0);
      expect(messages).toHaveLength(2);
      expect(messages[0].uid).toBe(5);
      expect(messages[1].uid).toBe(4);
      expect(mockClient.search).toHaveBeenCalledWith({ all: true }, { uid: true });
    });

    it("returns empty array for 0 messages in mailbox", async () => {
      mockClient.mailbox = { exists: 0 };

      const messages = await client.listMessages("INBOX", 10, 0);
      expect(messages).toEqual([]);
    });

    it("respects offset", async () => {
      mockClient.mailbox = { exists: 5 };
      mockClient.search.mockResolvedValue([1, 2, 3, 4, 5]);

      const mockMessages = [
        { uid: 3, flags: new Set([]), envelope: { subject: "msg3", from: [{ address: "a@x.com" }], to: [{ address: "b@x.com" }], date: new Date("2024-01-03") }, bodyStructure: {} },
      ];

      mockClient.fetch.mockImplementation(function* () {
        for (const msg of mockMessages) {
          yield msg;
        }
      });

      const messages = await client.listMessages("INBOX", 1, 2);
      // UIDs sorted desc: [5,4,3,2,1], offset=2 gives [3], limit=1 gives [3]
      expect(mockClient.fetch).toHaveBeenCalledWith("3", expect.any(Object), { uid: true });
    });

    it("returns empty when search returns no UIDs", async () => {
      mockClient.mailbox = { exists: 5 };
      mockClient.search.mockResolvedValue([]);

      const messages = await client.listMessages("INBOX", 10, 0);
      expect(messages).toEqual([]);
    });
  });
});
