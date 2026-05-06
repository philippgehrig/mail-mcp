import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.stubEnv("IMAP_HOST", "imap.example.com");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("MAIL_USER", "user@example.com");
    vi.stubEnv("MAIL_PASSWORD", "secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads required env vars correctly", () => {
    const config = loadConfig();
    expect(config.imap.host).toBe("imap.example.com");
    expect(config.smtp.host).toBe("smtp.example.com");
    expect(config.auth.user).toBe("user@example.com");
    expect(config.auth.pass).toBe("secret");
  });

  it("uses default ports (993 IMAP, 587 SMTP)", () => {
    const config = loadConfig();
    expect(config.imap.port).toBe(993);
    expect(config.smtp.port).toBe(587);
  });

  it("uses custom ports when set", () => {
    vi.stubEnv("IMAP_PORT", "143");
    vi.stubEnv("SMTP_PORT", "465");
    const config = loadConfig();
    expect(config.imap.port).toBe(143);
    expect(config.smtp.port).toBe(465);
  });

  it("defaults MAIL_FROM to MAIL_USER", () => {
    const config = loadConfig();
    expect(config.mailFrom).toBe("user@example.com");
  });

  it("uses custom MAIL_FROM when set", () => {
    vi.stubEnv("MAIL_FROM", "custom@example.com");
    const config = loadConfig();
    expect(config.mailFrom).toBe("custom@example.com");
  });

  it("defaults sentFolder to 'send-via-mcp'", () => {
    const config = loadConfig();
    expect(config.sentFolder).toBe("send-via-mcp");
  });

  it("defaults allowUnrestrictedAttachments to false", () => {
    const config = loadConfig();
    expect(config.allowUnrestrictedAttachments).toBe(false);
  });

  it("parses ALLOW_UNRESTRICTED_ATTACHMENTS=true correctly", () => {
    vi.stubEnv("ALLOW_UNRESTRICTED_ATTACHMENTS", "true");
    const config = loadConfig();
    expect(config.allowUnrestrictedAttachments).toBe(true);
  });

  it("exits process on missing required var", () => {
    vi.stubEnv("IMAP_HOST", "");
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => loadConfig()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it("validates port numbers - rejects 0", () => {
    vi.stubEnv("IMAP_PORT", "0");
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => loadConfig()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it("validates port numbers - rejects 70000", () => {
    vi.stubEnv("SMTP_PORT", "70000");
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => loadConfig()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it("validates port numbers - rejects 'abc'", () => {
    vi.stubEnv("IMAP_PORT", "abc");
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => loadConfig()).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockError.mockRestore();
  });
});
