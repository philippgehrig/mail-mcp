import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ImapClient } from "../../src/imap.js";
import { SmtpClient } from "../../src/smtp.js";
import { Config } from "../../src/config.js";

/**
 * Integration tests using GreenMail Docker container.
 *
 * Prerequisites:
 *   docker compose -f tests/integration/docker-compose.yml up -d
 *
 * Run:
 *   npm run test:integration
 */

const testConfig: Config = {
  imap: {
    host: "localhost",
    port: 3143,
  },
  smtp: {
    host: "localhost",
    port: 3025,
  },
  auth: {
    user: "test@localhost.com",
    pass: "password123",
  },
  mailFrom: "test@localhost.com",
  sentFolder: "Sent",
  trashFolder: "Trash",
  attachmentsDir: null,
  allowUnrestrictedAttachments: false,
};

let imapClient: ImapClient;
let smtpClient: SmtpClient;

// Track UIDs for sequential test state
let sentMessageUid: number;

describe("Email Integration Tests (GreenMail)", () => {
  beforeAll(async () => {
    imapClient = new ImapClient(testConfig);
    smtpClient = new SmtpClient(testConfig);
    await imapClient.connect();
  });

  afterAll(async () => {
    await imapClient.disconnect();
  });

  describe("Sending emails", () => {
    it("should send an email via SMTP", async () => {
      const messageId = await smtpClient.sendMessage(
        "test@localhost.com",
        "Integration Test Email",
        "Hello from the integration test suite!",
        {},
        imapClient,
      );

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe("string");
    });

    it("should send a second email for later tests", async () => {
      const messageId = await smtpClient.sendMessage(
        "test@localhost.com",
        "Second Test Email",
        "This is the second test message.",
        {},
        imapClient,
      );

      expect(messageId).toBeDefined();
    });

    it("should send a third email for delete tests", async () => {
      const messageId = await smtpClient.sendMessage(
        "test@localhost.com",
        "Delete Me",
        "This message will be deleted.",
        {},
        imapClient,
      );

      expect(messageId).toBeDefined();
    });
  });

  describe("Listing messages", () => {
    it("should list messages in INBOX", async () => {
      // Brief delay to allow GreenMail to deliver messages
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const messages = await imapClient.listMessages("INBOX", 10, 0);

      expect(messages).toBeDefined();
      expect(messages.length).toBeGreaterThanOrEqual(3);

      // Messages should be sorted newest first
      const subjects = messages.map((m) => m.subject);
      expect(subjects).toContain("Integration Test Email");
      expect(subjects).toContain("Second Test Email");
      expect(subjects).toContain("Delete Me");

      // Save UID of first message for later tests
      const firstMsg = messages.find(
        (m) => m.subject === "Integration Test Email",
      );
      expect(firstMsg).toBeDefined();
      sentMessageUid = firstMsg!.uid;
    });

    it("should respect pagination offset and limit", async () => {
      const allMessages = await imapClient.listMessages("INBOX", 10, 0);
      const paginated = await imapClient.listMessages("INBOX", 1, 1);

      expect(paginated.length).toBe(1);
      // The paginated result should be the second message from the full list
      expect(paginated[0].uid).toBe(allMessages[1].uid);
    });
  });

  describe("Reading a message", () => {
    it("should read a full message by UID", async () => {
      const message = await imapClient.getMessage("INBOX", sentMessageUid);

      expect(message).toBeDefined();
      expect(message.uid).toBe(sentMessageUid);
      expect(message.subject).toBe("Integration Test Email");
      expect(message.from).toContain("test@localhost.com");
      expect(message.to).toContain("test@localhost.com");
      expect(message.body).toContain("Hello from the integration test suite!");
      expect(message.messageId).toBeDefined();
      expect(typeof message.date).toBe("string");
    });
  });

  describe("Searching messages", () => {
    it("should search by subject", async () => {
      const results = await imapClient.searchMessages("INBOX", {
        subject: "Second Test",
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((m) => m.subject === "Second Test Email")).toBe(true);
    });

    it("should search by from address", async () => {
      const results = await imapClient.searchMessages("INBOX", {
        from: "test@localhost.com",
      });

      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it("should return empty results for non-matching search", async () => {
      const results = await imapClient.searchMessages("INBOX", {
        subject: "Nonexistent Subject XYZ12345",
      });

      expect(results).toEqual([]);
    });
  });

  describe("Marking messages", () => {
    it("should mark a message as seen", async () => {
      await imapClient.markMessage("INBOX", sentMessageUid, { seen: true });

      const message = await imapClient.getMessage("INBOX", sentMessageUid);
      expect(message.flags).toContain("\\Seen");
    });

    it("should mark a message as flagged", async () => {
      await imapClient.markMessage("INBOX", sentMessageUid, { flagged: true });

      const message = await imapClient.getMessage("INBOX", sentMessageUid);
      expect(message.flags).toContain("\\Flagged");
    });

    it("should remove the seen flag", async () => {
      await imapClient.markMessage("INBOX", sentMessageUid, { seen: false });

      const message = await imapClient.getMessage("INBOX", sentMessageUid);
      expect(message.flags).not.toContain("\\Seen");
    });

    it("should remove the flagged flag", async () => {
      await imapClient.markMessage("INBOX", sentMessageUid, { flagged: false });

      const message = await imapClient.getMessage("INBOX", sentMessageUid);
      expect(message.flags).not.toContain("\\Flagged");
    });
  });

  describe("Moving messages", () => {
    it("should move a message to a different folder", async () => {
      // Get the second message UID
      const messages = await imapClient.listMessages("INBOX", 10, 0);
      const secondMsg = messages.find(
        (m) => m.subject === "Second Test Email",
      );
      expect(secondMsg).toBeDefined();

      // Move it to Sent folder (GreenMail will auto-create folders)
      await imapClient.moveMessage("INBOX", secondMsg!.uid, "Sent");

      // Verify it's no longer in INBOX
      const inboxAfter = await imapClient.listMessages("INBOX", 10, 0);
      const stillInInbox = inboxAfter.find(
        (m) => m.subject === "Second Test Email",
      );
      expect(stillInInbox).toBeUndefined();

      // Verify it's in the Sent folder
      const sentMessages = await imapClient.listMessages("Sent", 10, 0);
      const inSent = sentMessages.find(
        (m) => m.subject === "Second Test Email",
      );
      expect(inSent).toBeDefined();
    });
  });

  describe("Deleting messages", () => {
    it("should move a message to Trash when deleting from INBOX", async () => {
      const messages = await imapClient.listMessages("INBOX", 10, 0);
      const deleteMsg = messages.find((m) => m.subject === "Delete Me");
      expect(deleteMsg).toBeDefined();

      await imapClient.deleteMessage("INBOX", deleteMsg!.uid);

      // Verify it's no longer in INBOX
      const inboxAfter = await imapClient.listMessages("INBOX", 10, 0);
      const stillInInbox = inboxAfter.find((m) => m.subject === "Delete Me");
      expect(stillInInbox).toBeUndefined();

      // Verify it's in Trash
      const trashMessages = await imapClient.listMessages("Trash", 10, 0);
      const inTrash = trashMessages.find((m) => m.subject === "Delete Me");
      expect(inTrash).toBeDefined();
    });

    it("should permanently delete a message from Trash", async () => {
      const trashMessages = await imapClient.listMessages("Trash", 10, 0);
      const deleteMsg = trashMessages.find((m) => m.subject === "Delete Me");
      expect(deleteMsg).toBeDefined();

      await imapClient.deleteMessage("Trash", deleteMsg!.uid);

      // Verify it's gone from Trash
      const trashAfter = await imapClient.listMessages("Trash", 10, 0);
      const stillInTrash = trashAfter.find((m) => m.subject === "Delete Me");
      expect(stillInTrash).toBeUndefined();
    });
  });

  describe("Reply functionality", () => {
    it("should reply to a message", async () => {
      const messageId = await smtpClient.replyMessage(
        "INBOX",
        sentMessageUid,
        "This is a reply to the integration test email.",
        {},
        imapClient,
      );

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe("string");

      // Wait for delivery
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Find the reply in INBOX
      const messages = await imapClient.listMessages("INBOX", 10, 0);
      const reply = messages.find(
        (m) => m.subject === "Re: Integration Test Email",
      );
      expect(reply).toBeDefined();

      // Verify reply threading
      const fullReply = await imapClient.getMessage("INBOX", reply!.uid);
      expect(fullReply.inReplyTo).toBeDefined();
      expect(fullReply.body).toContain(
        "This is a reply to the integration test email.",
      );
    });
  });

  describe("Forward functionality", () => {
    it("should forward a message", async () => {
      const messageId = await smtpClient.forwardMessage(
        "INBOX",
        sentMessageUid,
        "test@localhost.com",
        { body: "FYI - forwarding this to you." },
        imapClient,
      );

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe("string");

      // Wait for delivery
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Find the forward in INBOX
      const messages = await imapClient.listMessages("INBOX", 10, 0);
      const forward = messages.find(
        (m) => m.subject === "Fwd: Integration Test Email",
      );
      expect(forward).toBeDefined();

      // Verify forward content
      const fullForward = await imapClient.getMessage("INBOX", forward!.uid);
      expect(fullForward.body).toContain("FYI - forwarding this to you.");
      expect(fullForward.body).toContain("Forwarded message");
      expect(fullForward.body).toContain(
        "Hello from the integration test suite!",
      );
    });
  });
});
