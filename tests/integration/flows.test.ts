import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ImapFlow } from "imapflow";
import {
  TEST_CONFIG,
  createImapClient,
  sendTestEmail,
  waitForMessage,
} from "./setup.js";
import { ImapClient } from "../../src/imap.js";
import { SmtpClient } from "../../src/smtp.js";

describe("Integration: GreenMail E2E flows", () => {
  let rawClient: ImapFlow;
  let imapClient: ImapClient;
  let smtpClient: SmtpClient;

  beforeAll(async () => {
    rawClient = createImapClient();
    await rawClient.connect();

    imapClient = new ImapClient(TEST_CONFIG);
    await imapClient.connect();

    smtpClient = new SmtpClient(TEST_CONFIG);
  });

  afterAll(async () => {
    await rawClient.logout();
    await imapClient.disconnect();
  });

  it("should send an email and find it in INBOX", async () => {
    const subject = `Test email ${Date.now()}`;
    await sendTestEmail("test@test.com", subject, "Hello from integration test");

    await waitForMessage(rawClient, "INBOX");

    const messages = await imapClient.listMessages("INBOX", 10, 0);
    const found = messages.find((m) => m.subject === subject);
    expect(found).toBeDefined();
    expect(found!.from).toContain("test@test.com");
  });

  it("should read full message content", async () => {
    const subject = `Full content test ${Date.now()}`;
    const body = "This is the full body content for reading.";
    await sendTestEmail("test@test.com", subject, body);

    // Wait for delivery
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const messages = await imapClient.listMessages("INBOX", 10, 0);
    const found = messages.find((m) => m.subject === subject);
    expect(found).toBeDefined();

    const fullMessage = await imapClient.getMessage("INBOX", found!.uid);
    expect(fullMessage.subject).toBe(subject);
    expect(fullMessage.body).toContain(body);
    expect(fullMessage.from).toContain("test@test.com");
  });

  it("should search messages by subject", async () => {
    const uniqueTag = `searchable-${Date.now()}`;
    const subject = `Subject ${uniqueTag}`;
    await sendTestEmail("test@test.com", subject, "Search test body");

    // Wait for delivery
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const results = await imapClient.searchMessages("INBOX", {
      subject: uniqueTag,
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].subject).toContain(uniqueTag);
  });

  it("should mark message as read", async () => {
    const subject = `Mark read test ${Date.now()}`;
    await sendTestEmail("test@test.com", subject, "Mark as read body");

    // Wait for delivery
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const messages = await imapClient.listMessages("INBOX", 10, 0);
    const found = messages.find((m) => m.subject === subject);
    expect(found).toBeDefined();

    // Mark as seen
    await imapClient.markMessage("INBOX", found!.uid, { seen: true });

    // Verify flag was set
    const updated = await imapClient.getMessage("INBOX", found!.uid);
    expect(updated.flags).toContain("\\Seen");
  });

  it("should send a reply", async () => {
    const subject = `Reply test ${Date.now()}`;
    await sendTestEmail("test@test.com", subject, "Original message for reply");

    // Wait for delivery
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const messages = await imapClient.listMessages("INBOX", 10, 0);
    const found = messages.find((m) => m.subject === subject);
    expect(found).toBeDefined();

    const replyId = await smtpClient.replyMessage(
      "INBOX",
      found!.uid,
      "This is the reply body",
      {},
      imapClient,
    );

    expect(replyId).toBeDefined();
    expect(typeof replyId).toBe("string");
  });

  it("should send a new message via SmtpClient", async () => {
    const subject = `SmtpClient send test ${Date.now()}`;

    const messageId = await smtpClient.sendMessage(
      "test@test.com",
      subject,
      "Sent via SmtpClient",
      {},
      imapClient,
    );

    expect(messageId).toBeDefined();
    expect(typeof messageId).toBe("string");

    // Wait for delivery
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const messages = await imapClient.listMessages("INBOX", 10, 0);
    const found = messages.find((m) => m.subject === subject);
    expect(found).toBeDefined();
  });

  it("should list folders", async () => {
    const folders = await imapClient.listFolders();
    expect(folders.length).toBeGreaterThan(0);

    const folderNames = folders.map((f) => f.name);
    expect(folderNames).toContain("INBOX");
  });
});
