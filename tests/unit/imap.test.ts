import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImapClient } from "../../src/imap.js";
import { Config } from "../../src/config.js";

// Mock imapflow module
const mockClient = {
  connect: vi.fn(),
  logout: vi.fn(),
  list: vi.fn(),
  getMailboxLock: vi.fn(),
  messageMove: vi.fn(),
  messageDelete: vi.fn(),
  messageFlagsAdd: vi.fn(),
  messageFlagsRemove: vi.fn(),
  mailbox: { exists: 0 },
  fetch: vi.fn(),
  search: vi.fn(),
  download: vi.fn(),
};

vi.mock("imapflow", () => {
  return {
    ImapFlow: class {
      constructor() {
        return mockClient;
      }
    },
  };
});

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    imap: { host: "imap.example.com", port: 993 },
    smtp: { host: "smtp.example.com", port: 587 },
    auth: { user: "user@example.com", pass: "password" },
    mailFrom: "user@example.com",
    sentFolder: "Sent",
    trashFolder: null,
    attachmentsDir: null,
    allowUnrestrictedAttachments: false,
    ...overrides,
  };
}

describe("ImapClient", () => {
  let imapClient: ImapClient;
  let mockLock: { release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    mockLock = { release: vi.fn() };
    mockClient.getMailboxLock.mockResolvedValue(mockLock);
    imapClient = new ImapClient(createConfig());
  });

  describe("listFolders", () => {
    it("returns formatted folder list from client.list()", async () => {
      mockClient.list.mockResolvedValue([
        {
          name: "INBOX",
          path: "INBOX",
          delimiter: "/",
          status: { messages: 42 },
        },
        {
          name: "Sent",
          path: "Sent",
          delimiter: "/",
          status: { messages: 10 },
        },
        {
          name: "Drafts",
          path: "Drafts",
          delimiter: ".",
          status: { messages: 0 },
        },
      ]);

      const folders = await imapClient.listFolders();

      expect(mockClient.list).toHaveBeenCalledWith({
        statusQuery: { messages: true },
      });
      expect(folders).toEqual([
        { name: "INBOX", path: "INBOX", delimiter: "/", count: 42 },
        { name: "Sent", path: "Sent", delimiter: "/", count: 10 },
        { name: "Drafts", path: "Drafts", delimiter: ".", count: 0 },
      ]);
    });

    it("uses '/' as default delimiter when not provided", async () => {
      mockClient.list.mockResolvedValue([
        {
          name: "INBOX",
          path: "INBOX",
          delimiter: null,
          status: { messages: 5 },
        },
      ]);

      const folders = await imapClient.listFolders();

      expect(folders[0].delimiter).toBe("/");
    });

    it("uses 0 for count when status.messages is undefined", async () => {
      mockClient.list.mockResolvedValue([
        {
          name: "INBOX",
          path: "INBOX",
          delimiter: "/",
          status: undefined,
        },
      ]);

      const folders = await imapClient.listFolders();

      expect(folders[0].count).toBe(0);
    });
  });

  describe("getTrashFolder", () => {
    it("returns config trashFolder when set", async () => {
      const client = new ImapClient(createConfig({ trashFolder: "MyTrash" }));

      const result = await client.getTrashFolder();

      expect(result).toBe("MyTrash");
      expect(mockClient.list).not.toHaveBeenCalled();
    });

    it("detects trash via SPECIAL-USE \\Trash attribute", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", specialUse: "\\Inbox" },
        { name: "Papierkorb", path: "Papierkorb", specialUse: "\\Trash" },
        { name: "Sent", path: "Sent", specialUse: "\\Sent" },
      ]);

      const result = await imapClient.getTrashFolder();

      expect(result).toBe("Papierkorb");
    });

    it("falls back to common name 'Trash'", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX" },
        { name: "Trash", path: "Trash" },
        { name: "Sent", path: "Sent" },
      ]);

      const result = await imapClient.getTrashFolder();

      expect(result).toBe("Trash");
    });

    it("falls back to common name 'Deleted Items'", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX" },
        { name: "Deleted Items", path: "Deleted Items" },
        { name: "Sent", path: "Sent" },
      ]);

      const result = await imapClient.getTrashFolder();

      expect(result).toBe("Deleted Items");
    });

    it("returns 'Trash' as ultimate fallback when nothing matches", async () => {
      mockClient.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX" },
        { name: "Sent", path: "Sent" },
        { name: "Archive", path: "Archive" },
      ]);

      const result = await imapClient.getTrashFolder();

      expect(result).toBe("Trash");
    });
  });

  describe("markMessage", () => {
    it("adds \\Seen flag when seen is true", async () => {
      await imapClient.markMessage("INBOX", 123, { seen: true });

      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("INBOX");
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith(
        "123",
        ["\\Seen"],
        { uid: true },
      );
      expect(mockClient.messageFlagsRemove).not.toHaveBeenCalled();
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("removes \\Seen flag when seen is false", async () => {
      await imapClient.markMessage("INBOX", 123, { seen: false });

      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith(
        "123",
        ["\\Seen"],
        { uid: true },
      );
      expect(mockClient.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it("adds \\Flagged flag when flagged is true", async () => {
      await imapClient.markMessage("INBOX", 456, { flagged: true });

      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith(
        "456",
        ["\\Flagged"],
        { uid: true },
      );
    });

    it("removes \\Flagged flag when flagged is false", async () => {
      await imapClient.markMessage("INBOX", 456, { flagged: false });

      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith(
        "456",
        ["\\Flagged"],
        { uid: true },
      );
    });

    it("handles both seen and flagged together", async () => {
      await imapClient.markMessage("INBOX", 789, {
        seen: true,
        flagged: false,
      });

      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith(
        "789",
        ["\\Seen"],
        { uid: true },
      );
      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith(
        "789",
        ["\\Flagged"],
        { uid: true },
      );
    });

    it("does nothing when flags object is empty", async () => {
      await imapClient.markMessage("INBOX", 123, {});

      expect(mockClient.messageFlagsAdd).not.toHaveBeenCalled();
      expect(mockClient.messageFlagsRemove).not.toHaveBeenCalled();
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("releases lock even if an error is thrown", async () => {
      mockClient.messageFlagsAdd.mockRejectedValue(new Error("fail"));

      await expect(
        imapClient.markMessage("INBOX", 123, { seen: true }),
      ).rejects.toThrow("fail");

      expect(mockLock.release).toHaveBeenCalled();
    });
  });

  describe("deleteMessage", () => {
    it("moves message to trash when not in trash folder", async () => {
      mockClient.list.mockResolvedValue([
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);

      await imapClient.deleteMessage("INBOX", 100);

      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("INBOX");
      expect(mockClient.messageMove).toHaveBeenCalledWith("100", "Trash", {
        uid: true,
      });
      expect(mockClient.messageDelete).not.toHaveBeenCalled();
    });

    it("permanently deletes when already in trash folder", async () => {
      mockClient.list.mockResolvedValue([
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);

      await imapClient.deleteMessage("Trash", 200);

      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("Trash");
      expect(mockClient.messageDelete).toHaveBeenCalledWith("200", {
        uid: true,
      });
      expect(mockClient.messageMove).not.toHaveBeenCalled();
    });

    it("permanently deletes with case-insensitive trash folder comparison", async () => {
      mockClient.list.mockResolvedValue([
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);

      await imapClient.deleteMessage("trash", 300);

      expect(mockClient.messageDelete).toHaveBeenCalledWith("300", {
        uid: true,
      });
    });

    it("uses config trashFolder for trash detection", async () => {
      const client = new ImapClient(
        createConfig({ trashFolder: "CustomTrash" }),
      );

      await client.deleteMessage("CustomTrash", 400);

      expect(mockClient.messageDelete).toHaveBeenCalledWith("400", {
        uid: true,
      });
    });

    it("moves to config trashFolder when not in trash", async () => {
      const client = new ImapClient(
        createConfig({ trashFolder: "CustomTrash" }),
      );

      await client.deleteMessage("INBOX", 500);

      expect(mockClient.messageMove).toHaveBeenCalledWith(
        "500",
        "CustomTrash",
        { uid: true },
      );
    });
  });

  describe("moveMessage", () => {
    it("calls messageMove with correct arguments", async () => {
      await imapClient.moveMessage("INBOX", 123, "Archive");

      expect(mockClient.getMailboxLock).toHaveBeenCalledWith("INBOX");
      expect(mockClient.messageMove).toHaveBeenCalledWith("123", "Archive", {
        uid: true,
      });
      expect(mockLock.release).toHaveBeenCalled();
    });

    it("releases lock even if messageMove throws", async () => {
      mockClient.messageMove.mockRejectedValue(new Error("move failed"));

      await expect(
        imapClient.moveMessage("INBOX", 123, "Archive"),
      ).rejects.toThrow("move failed");

      expect(mockLock.release).toHaveBeenCalled();
    });

    it("uses uid as string for messageMove call", async () => {
      await imapClient.moveMessage("Sent", 999, "Trash");

      expect(mockClient.messageMove).toHaveBeenCalledWith("999", "Trash", {
        uid: true,
      });
    });
  });
});
