import { describe, it, expect, vi, beforeEach } from "vitest";
import { SmtpClient } from "../../src/smtp.js";
import { Config } from "../../src/config.js";

const mockSendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

vi.mock("nodemailer/lib/mail-composer/index.js", () => ({
  default: class {
    compile() {
      return { build: () => Promise.resolve(Buffer.from("raw email")) };
    }
  },
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    realpathSync: vi.fn((p: string) => p),
    statSync: vi.fn(() => ({ isFile: () => true })),
  },
}));

const baseConfig: Config = {
  imap: { host: "imap.example.com", port: 993 },
  smtp: { host: "smtp.example.com", port: 587 },
  auth: { user: "user@example.com", pass: "secret" },
  mailFrom: "user@example.com",
  sentFolder: "send-via-mcp",
  trashFolder: null,
  attachmentsDir: "/allowed/dir",
  allowUnrestrictedAttachments: false,
};

function createMockImapClient() {
  return {
    getMessage: vi.fn(),
    getAttachment: vi.fn(),
    getClient: vi.fn(() => ({
      list: vi.fn().mockResolvedValue([]),
      mailboxCreate: vi.fn(),
      append: vi.fn(),
    })),
  } as any;
}

describe("SmtpClient", () => {
  let smtpClient: SmtpClient;
  let mockImapClient: ReturnType<typeof createMockImapClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    smtpClient = new SmtpClient({ ...baseConfig });
    mockImapClient = createMockImapClient();
    mockSendMail.mockResolvedValue({ messageId: "<test-id@example.com>" });
  });

  describe("validateAttachmentPaths", () => {
    it("rejects when ATTACHMENTS_DIR is not configured", async () => {
      const configNoDir = { ...baseConfig, attachmentsDir: null };
      const client = new SmtpClient(configNoDir);

      await expect(
        client.sendMessage("to@x.com", "subj", "body", { attachments: ["/some/file.txt"] }, mockImapClient),
      ).rejects.toThrow("ATTACHMENTS_DIR is not configured");
    });

    it("rejects paths outside allowed directory", async () => {
      const fs = await import("fs");
      // The base dir resolves to /allowed/dir
      // The file path resolves to /other/dir/file.txt which is outside
      vi.mocked(fs.default.realpathSync).mockImplementation((p: string) => {
        if (p === "/allowed/dir") return "/allowed/dir";
        return "/other/dir/file.txt";
      });

      await expect(
        smtpClient.sendMessage("to@x.com", "subj", "body", { attachments: ["/other/dir/file.txt"] }, mockImapClient),
      ).rejects.toThrow("resolves outside the allowed directory");
    });

    it("rejects path traversal attempts", async () => {
      const fs = await import("fs");
      vi.mocked(fs.default.realpathSync).mockImplementation((p: string) => {
        if (p === "/allowed/dir") return "/allowed/dir";
        return "/allowed/file.txt"; // After resolving, it's outside /allowed/dir/
      });

      await expect(
        smtpClient.sendMessage("to@x.com", "subj", "body", { attachments: ["/allowed/dir/../file.txt"] }, mockImapClient),
      ).rejects.toThrow("resolves outside the allowed directory");
    });

    it("allows unrestricted attachments when enabled", async () => {
      const configUnrestricted = { ...baseConfig, attachmentsDir: null, allowUnrestrictedAttachments: true };
      const client = new SmtpClient(configUnrestricted);

      const fs = await import("fs");
      vi.mocked(fs.default.realpathSync).mockImplementation((p: string) => p);

      const result = await client.sendMessage("to@x.com", "subj", "body", { attachments: ["/any/path/file.txt"] }, mockImapClient);
      expect(result).toBe("<test-id@example.com>");
    });

    it("rejects missing files", async () => {
      const fs = await import("fs");
      vi.mocked(fs.default.realpathSync).mockImplementation((p: string) => p);
      vi.mocked(fs.default.existsSync).mockReturnValue(false);

      await expect(
        smtpClient.sendMessage("to@x.com", "subj", "body", { attachments: ["/allowed/dir/missing.txt"] }, mockImapClient),
      ).rejects.toThrow("Attachment file not found");
    });
  });

  describe("sendMessage", () => {
    it("sends and returns message ID", async () => {
      const result = await smtpClient.sendMessage("to@x.com", "Hello", "Body text", {}, mockImapClient);
      expect(result).toBe("<test-id@example.com>");
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "user@example.com",
          to: "to@x.com",
          subject: "Hello",
          text: "Body text",
        }),
      );
    });

    it("includes cc and bcc", async () => {
      await smtpClient.sendMessage("to@x.com", "Hello", "Body", { cc: "cc@x.com", bcc: "bcc@x.com" }, mockImapClient);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: "cc@x.com",
          bcc: "bcc@x.com",
        }),
      );
    });

    it("appends to sent folder", async () => {
      const mockAppend = vi.fn();
      const mockList = vi.fn().mockResolvedValue([{ path: "send-via-mcp", name: "send-via-mcp" }]);
      mockImapClient.getClient.mockReturnValue({
        list: mockList,
        mailboxCreate: vi.fn(),
        append: mockAppend,
      });

      await smtpClient.sendMessage("to@x.com", "Hello", "Body", {}, mockImapClient);
      expect(mockAppend).toHaveBeenCalledWith("send-via-mcp", expect.any(Buffer), ["\\Seen"]);
    });
  });

  describe("replyMessage", () => {
    beforeEach(() => {
      mockImapClient.getMessage.mockResolvedValue({
        uid: 1,
        subject: "Original Subject",
        from: "sender@x.com",
        to: "user@example.com",
        cc: "",
        date: "2024-01-01T00:00:00.000Z",
        flags: [],
        body: "Original body",
        attachments: [],
        messageId: "<original-id@x.com>",
        inReplyTo: null,
        references: [],
      });
    });

    it("sets In-Reply-To and References", async () => {
      await smtpClient.replyMessage("INBOX", 1, "Reply body", {}, mockImapClient);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: "<original-id@x.com>",
          references: "<original-id@x.com>",
        }),
      );
    });

    it("preserves Re: prefix if already present", async () => {
      mockImapClient.getMessage.mockResolvedValue({
        uid: 1,
        subject: "Re: Already replied",
        from: "sender@x.com",
        to: "user@example.com",
        cc: "",
        date: "2024-01-01T00:00:00.000Z",
        flags: [],
        body: "body",
        attachments: [],
        messageId: "<id@x.com>",
        inReplyTo: null,
        references: [],
      });

      await smtpClient.replyMessage("INBOX", 1, "Reply", {}, mockImapClient);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Re: Already replied",
        }),
      );
    });

    it("builds references chain from existing references", async () => {
      mockImapClient.getMessage.mockResolvedValue({
        uid: 1,
        subject: "Subject",
        from: "sender@x.com",
        to: "user@example.com",
        cc: "",
        date: "2024-01-01T00:00:00.000Z",
        flags: [],
        body: "body",
        attachments: [],
        messageId: "<msg3@x.com>",
        inReplyTo: "<msg2@x.com>",
        references: ["<msg1@x.com>", "<msg2@x.com>"],
      });

      await smtpClient.replyMessage("INBOX", 1, "Reply", {}, mockImapClient);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          references: "<msg1@x.com> <msg2@x.com> <msg3@x.com>",
        }),
      );
    });

    it("reply-all excludes self", async () => {
      mockImapClient.getMessage.mockResolvedValue({
        uid: 1,
        subject: "Group thread",
        from: "sender@x.com",
        to: "user@example.com, other@x.com",
        cc: "cc@x.com",
        date: "2024-01-01T00:00:00.000Z",
        flags: [],
        body: "body",
        attachments: [],
        messageId: "<id@x.com>",
        inReplyTo: null,
        references: [],
      });

      await smtpClient.replyMessage("INBOX", 1, "Reply all", { replyAll: true }, mockImapClient);
      const sentOptions = mockSendMail.mock.calls[0][0];
      // Self (user@example.com) should not be in to
      expect(sentOptions.to).not.toContain("user@example.com");
      expect(sentOptions.to).toContain("sender@x.com");
      expect(sentOptions.to).toContain("other@x.com");
    });
  });

  describe("forwardMessage", () => {
    beforeEach(() => {
      mockImapClient.getMessage.mockResolvedValue({
        uid: 1,
        subject: "Original Subject",
        from: "sender@x.com",
        to: "user@example.com",
        cc: "",
        date: "2024-01-01T00:00:00.000Z",
        flags: [],
        body: "Original body",
        attachments: [],
        messageId: "<original-id@x.com>",
        inReplyTo: null,
        references: [],
      });
    });

    it("prepends Fwd: to subject", async () => {
      await smtpClient.forwardMessage("INBOX", 1, "fwd@x.com", {}, mockImapClient);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Fwd: Original Subject",
        }),
      );
    });

    it("preserves existing Fwd: prefix", async () => {
      mockImapClient.getMessage.mockResolvedValue({
        uid: 1,
        subject: "Fwd: Already forwarded",
        from: "sender@x.com",
        to: "user@example.com",
        cc: "",
        date: "2024-01-01T00:00:00.000Z",
        flags: [],
        body: "body",
        attachments: [],
        messageId: "<id@x.com>",
        inReplyTo: null,
        references: [],
      });

      await smtpClient.forwardMessage("INBOX", 1, "fwd@x.com", {}, mockImapClient);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Fwd: Already forwarded",
        }),
      );
    });

    it("includes forwarded header in body", async () => {
      await smtpClient.forwardMessage("INBOX", 1, "fwd@x.com", {}, mockImapClient);
      const sentOptions = mockSendMail.mock.calls[0][0];
      expect(sentOptions.text).toContain("---------- Forwarded message ----------");
      expect(sentOptions.text).toContain("From: sender@x.com");
      expect(sentOptions.text).toContain("Original body");
    });

    it("forwards attachments from original message", async () => {
      mockImapClient.getMessage.mockResolvedValue({
        uid: 1,
        subject: "With attachment",
        from: "sender@x.com",
        to: "user@example.com",
        cc: "",
        date: "2024-01-01T00:00:00.000Z",
        flags: [],
        body: "body",
        attachments: [{ filename: "doc.pdf", size: 1024, contentType: "application/pdf", partId: "2" }],
        messageId: "<id@x.com>",
        inReplyTo: null,
        references: [],
      });

      mockImapClient.getAttachment.mockResolvedValue({
        filename: "doc.pdf",
        contentType: "application/pdf",
        content: Buffer.from("pdf content").toString("base64"),
      });

      await smtpClient.forwardMessage("INBOX", 1, "fwd@x.com", {}, mockImapClient);
      const sentOptions = mockSendMail.mock.calls[0][0];
      expect(sentOptions.attachments).toHaveLength(1);
      expect(sentOptions.attachments[0].filename).toBe("doc.pdf");
    });
  });
});
