import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  const requiredEnv = {
    IMAP_HOST: "imap.example.com",
    SMTP_HOST: "smtp.example.com",
    MAIL_USER: "user@example.com",
    MAIL_PASSWORD: "secret",
  };

  beforeEach(() => {
    // Clear all relevant env vars before each test
    vi.unstubAllEnvs();
    for (const key of [
      "IMAP_HOST",
      "SMTP_HOST",
      "MAIL_USER",
      "MAIL_PASSWORD",
      "IMAP_PORT",
      "SMTP_PORT",
      "MAIL_FROM",
      "SENT_FOLDER",
      "TRASH_FOLDER",
      "ATTACHMENTS_DIR",
      "ALLOW_UNRESTRICTED_ATTACHMENTS",
    ]) {
      vi.stubEnv(key, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubRequired() {
    for (const [key, value] of Object.entries(requiredEnv)) {
      vi.stubEnv(key, value);
    }
  }

  it("loads required env vars correctly", () => {
    stubRequired();
    const config = loadConfig();

    expect(config.imap.host).toBe("imap.example.com");
    expect(config.smtp.host).toBe("smtp.example.com");
    expect(config.auth.user).toBe("user@example.com");
    expect(config.auth.pass).toBe("secret");
  });

  it("uses default ports (993 for IMAP, 587 for SMTP)", () => {
    stubRequired();
    const config = loadConfig();

    expect(config.imap.port).toBe(993);
    expect(config.smtp.port).toBe(587);
  });

  it("uses custom ports when set", () => {
    stubRequired();
    vi.stubEnv("IMAP_PORT", "1143");
    vi.stubEnv("SMTP_PORT", "2525");

    const config = loadConfig();

    expect(config.imap.port).toBe(1143);
    expect(config.smtp.port).toBe(2525);
  });

  it("defaults MAIL_FROM to MAIL_USER", () => {
    stubRequired();
    const config = loadConfig();

    expect(config.mailFrom).toBe("user@example.com");
  });

  it("uses custom MAIL_FROM when set", () => {
    stubRequired();
    vi.stubEnv("MAIL_FROM", "custom@example.com");

    const config = loadConfig();

    expect(config.mailFrom).toBe("custom@example.com");
  });

  it("defaults sentFolder to 'send-via-mcp'", () => {
    stubRequired();
    const config = loadConfig();

    expect(config.sentFolder).toBe("send-via-mcp");
  });

  it("defaults allowUnrestrictedAttachments to false", () => {
    stubRequired();
    const config = loadConfig();

    expect(config.allowUnrestrictedAttachments).toBe(false);
  });

  it("parses ALLOW_UNRESTRICTED_ATTACHMENTS=true correctly", () => {
    stubRequired();
    vi.stubEnv("ALLOW_UNRESTRICTED_ATTACHMENTS", "true");

    const config = loadConfig();

    expect(config.allowUnrestrictedAttachments).toBe(true);
  });

  it("exits process on missing required var", () => {
    stubRequired();
    vi.stubEnv("IMAP_HOST", "");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => loadConfig()).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Missing required environment variable: IMAP_HOST"
    );

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
