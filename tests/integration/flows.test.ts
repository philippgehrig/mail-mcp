import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ImapClient } from "../../src/imap.js";
import { SmtpClient } from "../../src/smtp.js";
import { Config } from "../../src/config.js";

const RUN_ID = Date.now().toString(36);

const testConfig: Config = {
  imap: {
    host: process.env.IMAP_HOST || "localhost",
    port: parseInt(process.env.IMAP_PORT || "3143", 10),
  },
  smtp: {
    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT || "3025", 10),
  },
  auth: {
    user: process.env.MAIL_USER || "test@localhost.com",
    pass: process.env.MAIL_PASSWORD || "password123",
  },
  mailFrom: process.env.MAIL_USER || "test@localhost.com",
  sentFolder: "Sent",
  trashFolder: "Trash",
  attachmentsDir: null,
  allowUnrestrictedAttachments: false,
};

const SUBJECTS = {
  first: `Test Email ${RUN_ID}`,
  second: `Second Email ${RUN_ID}`,
  delete: `Delete Me ${RUN_ID}`,
};

async function pollForMessage(
  client: ImapClient,
  folder: string,
  predicate: (subject: string) => boolean,
  timeoutMs = 10000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await client.listMessages(folder, 50, 0);
    if (messages.some((m) => predicate(m.subject))) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Message not found in ${folder} within ${timeoutMs}ms`);
}

async function connectWithRetry(client: ImapClient, maxAttempts = 10): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.connect();
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

let imapClient: ImapClient;
let smtpClient: SmtpClient;
let connected = false;
let sentMessageUid: number;

describe("Email Integration Tests (GreenMail)", () => {
  beforeAll(async () => {
    imapClient = new ImapClient(testConfig);
    smtpClient = new SmtpClient(testConfig);
    await connectWithRetry(imapClient);
    connected = true;
  });

  afterAll(async () => {
    if (connected) {
      await imapClient.disconnect();
    }
    smtpClient.close();
  });

  describe("Sending emails", () => {
    it("should send an email via SMTP", async () => {
      const messageId = await smtpClient.sendMessage(
        testConfig.auth.user,
        SUBJECTS.first,
        "Hello from the integration test suite!",
        {},
        imapClient,
      );

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe("string");
    });

    it("should send a second email for later tests", async () => {
      const messageId = await smtpClient.sendMessage(
        testConfig.auth.user,
        SUBJECTS.second,
        "This is the second test message.",
        {},
        imapClient,
      );

      expect(messageId).toBeDefined();
    });

    it("should send a third email for delete tests", async () => {
      const messageId = await smtpClient.sendMessage(
        testConfig.auth.user,
        SUBJECTS.delete,
        "This message will be deleted.",
        {},
        imapClient,
      );

      expect(messageId).toBeDefined();
    });
  });

  describe("Listing messages", () => {
    it("should list messages in INBOX", async () => {
      await pollForMessage(imapClient, "INBOX", (s) => s === SUBJECTS.delete);

      const messages = await imapClient.listMessages("INBOX", 50, 0);

      expect(messages).toBeDefined();
      expect(messages.length).toBeGreaterThanOrEqual(3);

      const subjects = messages.map((m) => m.subject);
      expect(subjects).toContain(SUBJECTS.first);
      expect(subjects).toContain(SUBJECTS.second);
      expect(subjects).toContain(SUBJECTS.delete);

      const firstMsg = messages.find((m) => m.subject === SUBJECTS.first);
      expect(firstMsg).toBeDefined();
      sentMessageUid = firstMsg!.uid;
    });

    it("should respect pagination offset and limit", async () => {
      const allMessages = await imapClient.listMessages("INBOX", 50, 0);
      const paginated = await imapClient.listMessages("INBOX", 1, 1);

      expect(paginated.length).toBe(1);
      expect(paginated[0].uid).toBe(allMessages[1].uid);
    });
  });

  describe("Reading a message", () => {
    it("should read a full message by UID", async () => {
      const message = await imapClient.getMessage("INBOX", sentMessageUid);

      expect(message).toBeDefined();
      expect(message.uid).toBe(sentMessageUid);
      expect(message.subject).toBe(SUBJECTS.first);
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
        subject: SUBJECTS.second,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((m) => m.subject === SUBJECTS.second)).toBe(true);
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
      const messages = await imapClient.listMessages("INBOX", 50, 0);
      const secondMsg = messages.find((m) => m.subject === SUBJECTS.second);
      expect(secondMsg).toBeDefined();

      await imapClient.moveMessage("INBOX", secondMsg!.uid, "Sent");

      const inboxAfter = await imapClient.listMessages("INBOX", 50, 0);
      const stillInInbox = inboxAfter.find((m) => m.subject === SUBJECTS.second);
      expect(stillInInbox).toBeUndefined();

      const sentMessages = await imapClient.listMessages("Sent", 50, 0);
      const inSent = sentMessages.find((m) => m.subject === SUBJECTS.second);
      expect(inSent).toBeDefined();
    });
  });

  describe("Deleting messages", () => {
    it("should move a message to Trash when deleting from INBOX", async () => {
      const messages = await imapClient.listMessages("INBOX", 50, 0);
      const deleteMsg = messages.find((m) => m.subject === SUBJECTS.delete);
      expect(deleteMsg).toBeDefined();

      await imapClient.deleteMessage("INBOX", deleteMsg!.uid);

      const inboxAfter = await imapClient.listMessages("INBOX", 50, 0);
      const stillInInbox = inboxAfter.find((m) => m.subject === SUBJECTS.delete);
      expect(stillInInbox).toBeUndefined();

      const trashMessages = await imapClient.listMessages("Trash", 50, 0);
      const inTrash = trashMessages.find((m) => m.subject === SUBJECTS.delete);
      expect(inTrash).toBeDefined();
    });

    it("should permanently delete a message from Trash", async () => {
      const trashMessages = await imapClient.listMessages("Trash", 50, 0);
      const deleteMsg = trashMessages.find((m) => m.subject === SUBJECTS.delete);
      expect(deleteMsg).toBeDefined();

      await imapClient.deleteMessage("Trash", deleteMsg!.uid);

      const trashAfter = await imapClient.listMessages("Trash", 50, 0);
      const stillInTrash = trashAfter.find((m) => m.subject === SUBJECTS.delete);
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

      const expectedSubject = `Re: ${SUBJECTS.first}`;
      await pollForMessage(imapClient, "INBOX", (s) => s === expectedSubject);

      const messages = await imapClient.listMessages("INBOX", 50, 0);
      const reply = messages.find((m) => m.subject === expectedSubject);
      expect(reply).toBeDefined();

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
        testConfig.auth.user,
        { body: "FYI - forwarding this to you." },
        imapClient,
      );

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe("string");

      const expectedSubject = `Fwd: ${SUBJECTS.first}`;
      await pollForMessage(imapClient, "INBOX", (s) => s === expectedSubject);

      const messages = await imapClient.listMessages("INBOX", 50, 0);
      const forward = messages.find((m) => m.subject === expectedSubject);
      expect(forward).toBeDefined();

      const fullForward = await imapClient.getMessage("INBOX", forward!.uid);
      expect(fullForward.body).toContain("FYI - forwarding this to you.");
      expect(fullForward.body).toContain("Forwarded message");
      expect(fullForward.body).toContain(
        "Hello from the integration test suite!",
      );
    });
  });
});
