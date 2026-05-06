import { describe, it, expect, vi, beforeEach } from "vitest";
import { SmtpClient } from "../../src/smtp.js";
import type { Config } from "../../src/config.js";
import type { FullMessage } from "../../src/types.js";

// Mock nodemailer
const mockSendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

// Mock nodemailer/lib/mail-composer/index.js
vi.mock("nodemailer/lib/mail-composer/index.js", () => {
  return {
    default: class MockMailComposer {
      compile() {
        return {
          build: () => Promise.resolve(Buffer.from("raw email")),
        };
      }
    },
  };
});

// Mock fs
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
  },
}));

import fs from "fs";

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    imap: { host: "imap.test.com", port: 993 },
    smtp: { host: "smtp.test.com", port: 587 },
    auth: { user: "user@test.com", pass: "secret" },
    mailFrom: "user@test.com",
    sentFolder: "Sent",
    trashFolder: null,
    attachmentsDir: null,
    allowUnrestrictedAttachments: false,
    ...overrides,
  };
}

function createMockImapClient() {
  const mockClient = {
    list: vi.fn().mockResolvedValue([{ path: "Sent", name: "Sent" }]),
    append: vi.fn().mockResolvedValue(undefined),
    mailboxCreate: vi.fn().mockResolvedValue(undefined),
  };

  return {
    getMessage: vi.fn(),
    getAttachment: vi.fn(),
    getClient: vi.fn(() => mockClient),
    _mockClient: mockClient,
  };
}

describe("SmtpClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({
      messageId: "<test@test.com>",
      envelope: { from: "user@test.com", to: ["recipient@test.com"] },
    });
  });

  describe("attachment validation", () => {
    it("rejects attachments when ATTACHMENTS_DIR is not set", async () => {
      const config = createConfig({
        attachmentsDir: null,
        allowUnrestrictedAttachments: false,
      });
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();

      await expect(
        smtp.sendMessage(
          "to@test.com",
          "Subject",
          "Body",
          { attachments: ["/some/file.txt"] },
          imapClient as any,
        ),
      ).rejects.toThrow(
        "Attachments are not allowed: ATTACHMENTS_DIR is not configured and ALLOW_UNRESTRICTED_ATTACHMENTS is not enabled",
      );
    });

    it("rejects attachment paths outside the allowed directory", async () => {
      const config = createConfig({
        attachmentsDir: "/allowed/dir",
        allowUnrestrictedAttachments: false,
      });
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();

      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(
        smtp.sendMessage(
          "to@test.com",
          "Subject",
          "Body",
          { attachments: ["/other/dir/file.txt"] },
          imapClient as any,
        ),
      ).rejects.toThrow('is outside the allowed directory');
    });

    it("rejects path traversal attempts", async () => {
      const config = createConfig({
        attachmentsDir: "/allowed/dir",
        allowUnrestrictedAttachments: false,
      });
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();

      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(
        smtp.sendMessage(
          "to@test.com",
          "Subject",
          "Body",
          { attachments: ["/allowed/dir/../../../etc/passwd"] },
          imapClient as any,
        ),
      ).rejects.toThrow('is outside the allowed directory');
    });

    it("allows unrestricted attachments when opt-in is enabled", async () => {
      const config = createConfig({
        attachmentsDir: null,
        allowUnrestrictedAttachments: true,
      });
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await smtp.sendMessage(
        "to@test.com",
        "Subject",
        "Body",
        { attachments: ["/any/path/file.txt"] },
        imapClient as any,
      );

      expect(result).toBe("<test@test.com>");
      expect(mockSendMail).toHaveBeenCalled();
    });

    it("rejects when attachment file does not exist", async () => {
      const config = createConfig({
        attachmentsDir: "/allowed/dir",
        allowUnrestrictedAttachments: false,
      });
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        smtp.sendMessage(
          "to@test.com",
          "Subject",
          "Body",
          { attachments: ["/allowed/dir/missing.txt"] },
          imapClient as any,
        ),
      ).rejects.toThrow("Attachment file not found");
    });
  });

  describe("sendMessage", () => {
    it("sends email and returns message ID", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();

      const result = await smtp.sendMessage(
        "recipient@test.com",
        "Test Subject",
        "Hello World",
        {},
        imapClient as any,
      );

      expect(result).toBe("<test@test.com>");
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "user@test.com",
          to: "recipient@test.com",
          subject: "Test Subject",
          text: "Hello World",
        }),
      );
    });

    it("includes cc and bcc when provided", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();

      await smtp.sendMessage(
        "to@test.com",
        "Subject",
        "Body",
        { cc: "cc@test.com", bcc: "bcc@test.com" },
        imapClient as any,
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: "cc@test.com",
          bcc: "bcc@test.com",
        }),
      );
    });

    it("appends message to sent folder", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();

      await smtp.sendMessage(
        "to@test.com",
        "Subject",
        "Body",
        {},
        imapClient as any,
      );

      expect(imapClient._mockClient.append).toHaveBeenCalledWith(
        "Sent",
        expect.any(Buffer),
        ["\\Seen"],
      );
    });
  });

  describe("replyMessage", () => {
    const originalMessage: FullMessage = {
      uid: 1,
      subject: "Original Subject",
      from: "sender@test.com",
      to: "user@test.com",
      cc: "",
      date: "2024-01-01T00:00:00Z",
      flags: [],
      body: "Original body",
      attachments: [],
      messageId: "<original@test.com>",
      inReplyTo: null,
      references: [],
    };

    it("fetches original and sets In-Reply-To and References", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();
      imapClient.getMessage.mockResolvedValue(originalMessage);

      await smtp.replyMessage(
        "INBOX",
        1,
        "Reply body",
        {},
        imapClient as any,
      );

      expect(imapClient.getMessage).toHaveBeenCalledWith("INBOX", 1);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: "<original@test.com>",
          references: "<original@test.com>",
          to: "sender@test.com",
          subject: "Re: Original Subject",
        }),
      );
    });

    it("preserves existing Re: prefix in subject", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();
      imapClient.getMessage.mockResolvedValue({
        ...originalMessage,
        subject: "Re: Already replied",
      });

      await smtp.replyMessage(
        "INBOX",
        1,
        "Reply body",
        {},
        imapClient as any,
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Re: Already replied",
        }),
      );
    });

    it("builds references chain from original references", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();
      imapClient.getMessage.mockResolvedValue({
        ...originalMessage,
        references: ["<first@test.com>", "<second@test.com>"],
        messageId: "<original@test.com>",
      });

      await smtp.replyMessage(
        "INBOX",
        1,
        "Reply body",
        {},
        imapClient as any,
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          references: "<first@test.com> <second@test.com> <original@test.com>",
        }),
      );
    });

    it("reply-all includes original recipients excluding self", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();
      imapClient.getMessage.mockResolvedValue({
        ...originalMessage,
        from: "sender@test.com",
        to: "user@test.com, other@test.com",
        cc: "cc@test.com",
      });

      await smtp.replyMessage(
        "INBOX",
        1,
        "Reply body",
        { replyAll: true },
        imapClient as any,
      );

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toContain("sender@test.com");
      expect(callArgs.to).toContain("other@test.com");
      expect(callArgs.to).toContain("cc@test.com");
      expect(callArgs.to).not.toContain("user@test.com");
    });
  });

  describe("forwardMessage", () => {
    const originalMessage: FullMessage = {
      uid: 1,
      subject: "Original Subject",
      from: "sender@test.com",
      to: "user@test.com",
      cc: "",
      date: "2024-01-01T00:00:00Z",
      flags: [],
      body: "Original body",
      attachments: [],
      messageId: "<original@test.com>",
      inReplyTo: null,
      references: [],
    };

    it("prepends Fwd: to subject", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();
      imapClient.getMessage.mockResolvedValue(originalMessage);

      await smtp.forwardMessage(
        "INBOX",
        1,
        "forward@test.com",
        {},
        imapClient as any,
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Fwd: Original Subject",
          to: "forward@test.com",
        }),
      );
    });

    it("preserves existing Fwd: prefix in subject", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();
      imapClient.getMessage.mockResolvedValue({
        ...originalMessage,
        subject: "Fwd: Already forwarded",
      });

      await smtp.forwardMessage(
        "INBOX",
        1,
        "forward@test.com",
        {},
        imapClient as any,
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Fwd: Already forwarded",
        }),
      );
    });

    it("includes forwarded message header in body", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();
      imapClient.getMessage.mockResolvedValue(originalMessage);

      await smtp.forwardMessage(
        "INBOX",
        1,
        "forward@test.com",
        { body: "See below" },
        imapClient as any,
      );

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.text).toContain("See below");
      expect(callArgs.text).toContain("---------- Forwarded message ----------");
      expect(callArgs.text).toContain("From: sender@test.com");
      expect(callArgs.text).toContain("Original body");
    });

    it("forwards attachments from original message", async () => {
      const config = createConfig();
      const smtp = new SmtpClient(config);
      const imapClient = createMockImapClient();
      imapClient.getMessage.mockResolvedValue({
        ...originalMessage,
        attachments: [
          {
            filename: "doc.pdf",
            size: 1024,
            contentType: "application/pdf",
            partId: "2",
          },
        ],
      });
      imapClient.getAttachment.mockResolvedValue({
        filename: "doc.pdf",
        contentType: "application/pdf",
        content: Buffer.from("pdf content").toString("base64"),
      });

      await smtp.forwardMessage(
        "INBOX",
        1,
        "forward@test.com",
        {},
        imapClient as any,
      );

      expect(imapClient.getAttachment).toHaveBeenCalledWith("INBOX", 1, "2");
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.attachments).toHaveLength(1);
      expect(callArgs.attachments[0].filename).toBe("doc.pdf");
    });
  });
});
