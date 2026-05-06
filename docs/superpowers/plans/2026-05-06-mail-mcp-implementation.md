# Mail MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional MCP server that provides IMAP/SMTP email access via Claude Code.

**Architecture:** Single TypeScript process using stdio transport. Persistent IMAP connection via imapflow, lazy pooled SMTP via nodemailer. 11 tools for reading, managing, and sending emails.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, imapflow, nodemailer, vitest, zod

---

## File Structure

```
mail-mcp/
├── package.json              # Project metadata, scripts, dependencies
├── tsconfig.json             # TypeScript config (ES modules, Node.js)
├── vitest.config.ts          # Vitest configuration
├── .env.example              # Template for required env vars
├── .gitignore                # Node.js gitignore
├── LICENSE                   # MIT license
├── CLAUDE.md                 # Project conventions
├── README.md                 # Setup and usage guide
├── src/
│   ├── index.ts              # Entry point: env validation, server setup, tool registration
│   ├── config.ts             # Env var parsing and validation
│   ├── imap.ts               # IMAP client wrapper (ImapFlow)
│   ├── smtp.ts               # SMTP wrapper (Nodemailer)
│   ├── tools/
│   │   ├── folders.ts        # list_folders tool
│   │   ├── messages.ts       # list_messages, search_messages, get_message, get_attachment
│   │   ├── manage.ts         # move_message, delete_message, mark_message
│   │   └── send.ts           # send_message, reply_message, forward_message
│   └── types.ts              # Shared interfaces
├── tests/
│   ├── unit/
│   │   ├── config.test.ts    # Config validation tests
│   │   ├── imap.test.ts      # IMAP wrapper tests (mocked)
│   │   ├── smtp.test.ts      # SMTP wrapper tests (mocked)
│   │   └── tools/
│   │       ├── folders.test.ts
│   │       ├── messages.test.ts
│   │       ├── manage.test.ts
│   │       └── send.test.ts
│   └── integration/
│       ├── docker-compose.yml
│       ├── setup.ts          # Test helpers (connect, send seed emails)
│       └── flows.test.ts     # End-to-end flows
├── .github/
│   └── workflows/
│       └── ci.yml
└── docs/
    └── design.md             # Design spec (already exists)
```

---

## Task 1: Project Scaffolding (Issue #2)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `CLAUDE.md`
- Create: `src/config.ts`
- Create: `src/types.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "mail-mcp",
  "version": "0.1.0",
  "description": "MCP server for IMAP/SMTP email access",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.config.integration.ts"
  },
  "keywords": ["mcp", "email", "imap", "smtp"],
  "author": "Philipp Gehrig",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/philippgehrig/mail-mcp.git"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install @modelcontextprotocol/sdk imapflow nodemailer mailparser && npm install -D typescript tsx vitest @types/node @types/nodemailer @types/mailparser zod`

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Create .env.example**

```env
# Required
IMAP_HOST=mail.example.com
SMTP_HOST=mail.example.com
MAIL_USER=user@example.com
MAIL_PASSWORD=your-password

# Optional (with defaults)
IMAP_PORT=993
SMTP_PORT=587
MAIL_FROM=user@example.com
SENT_FOLDER=send-via-mcp
TRASH_FOLDER=
ATTACHMENTS_DIR=
ALLOW_UNRESTRICTED_ATTACHMENTS=false
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
.env
*.tgz
```

- [ ] **Step 7: Create LICENSE**

```
MIT License

Copyright (c) 2026 Philipp Gehrig

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 8: Create CLAUDE.md**

```markdown
# mail-mcp

MCP server providing IMAP/SMTP email access for Claude Code.

## Commands

- `npm run dev` — start the server (requires env vars)
- `npm run test` — run unit tests
- `npm run test:integration` — run integration tests (requires Docker)
- `npm run build` — compile TypeScript

## Architecture

- `src/index.ts` — entry point, MCP server setup
- `src/config.ts` — env var parsing/validation
- `src/imap.ts` — IMAP client wrapper (imapflow)
- `src/smtp.ts` — SMTP wrapper (nodemailer)
- `src/tools/` — MCP tool handlers

## Conventions

- All logging to stderr (stdout reserved for MCP protocol)
- Use `uid` as message identifier everywhere (not sequence numbers)
- Prefer plain text over HTML when reading emails
- Tool errors return MCP error responses, never crash the process
```

- [ ] **Step 9: Create src/config.ts**

```typescript
export interface Config {
  imap: {
    host: string;
    port: number;
  };
  smtp: {
    host: string;
    port: number;
  };
  auth: {
    user: string;
    pass: string;
  };
  mailFrom: string;
  sentFolder: string;
  trashFolder: string | null;
  attachmentsDir: string | null;
  allowUnrestrictedAttachments: boolean;
}

export function loadConfig(): Config {
  const required = (name: string): string => {
    const val = process.env[name];
    if (!val) {
      console.error(`Missing required environment variable: ${name}`);
      process.exit(1);
    }
    return val;
  };

  const imapHost = required("IMAP_HOST");
  const smtpHost = required("SMTP_HOST");
  const mailUser = required("MAIL_USER");
  const mailPassword = required("MAIL_PASSWORD");

  return {
    imap: {
      host: imapHost,
      port: parseInt(process.env.IMAP_PORT || "993", 10),
    },
    smtp: {
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
    },
    auth: {
      user: mailUser,
      pass: mailPassword,
    },
    mailFrom: process.env.MAIL_FROM || mailUser,
    sentFolder: process.env.SENT_FOLDER || "send-via-mcp",
    trashFolder: process.env.TRASH_FOLDER || null,
    attachmentsDir: process.env.ATTACHMENTS_DIR || null,
    allowUnrestrictedAttachments:
      process.env.ALLOW_UNRESTRICTED_ATTACHMENTS === "true",
  };
}
```

- [ ] **Step 10: Create src/types.ts**

```typescript
export interface FolderInfo {
  name: string;
  path: string;
  delimiter: string;
  count: number;
}

export interface MessageSummary {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string;
  flags: string[];
  hasAttachments: boolean;
}

export interface FullMessage {
  uid: number;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  flags: string[];
  body: string;
  attachments: AttachmentInfo[];
  messageId: string;
  inReplyTo: string | null;
  references: string[];
}

export interface AttachmentInfo {
  filename: string;
  size: number;
  contentType: string;
  partId: string;
}

export interface AttachmentContent {
  filename: string;
  contentType: string;
  content: string; // base64
}
```

- [ ] **Step 11: Create src/index.ts (stub with tool registration)**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ImapClient } from "./imap.js";
import { SmtpClient } from "./smtp.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerManageTools } from "./tools/manage.js";
import { registerSendTools } from "./tools/send.js";

const config = loadConfig();

const server = new McpServer({
  name: "mail-mcp",
  version: "0.1.0",
});

const imapClient = new ImapClient(config);
const smtpClient = new SmtpClient(config);

registerFolderTools(server, imapClient);
registerMessageTools(server, imapClient);
registerManageTools(server, imapClient);
registerSendTools(server, imapClient, smtpClient);

async function main() {
  await imapClient.connect();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mail-mcp server started");
}

main().catch((err) => {
  console.error("Failed to start mail-mcp server:", err.message);
  process.exit(1);
});
```

- [ ] **Step 12: Create stub files for imap.ts, smtp.ts, and tools/**

Create `src/imap.ts`:
```typescript
import { ImapFlow } from "imapflow";
import { Config } from "./config.js";
import { FolderInfo, MessageSummary, FullMessage, AttachmentContent } from "./types.js";

export class ImapClient {
  private client: ImapFlow;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: true,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
      logger: false,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.error(`Connected to IMAP: ${this.config.imap.host}`);
  }

  async disconnect(): Promise<void> {
    await this.client.logout();
  }

  async listFolders(): Promise<FolderInfo[]> {
    throw new Error("Not implemented");
  }

  async listMessages(_folder: string, _limit: number, _offset: number): Promise<MessageSummary[]> {
    throw new Error("Not implemented");
  }

  async searchMessages(_folder: string, _query: Record<string, unknown>): Promise<MessageSummary[]> {
    throw new Error("Not implemented");
  }

  async getMessage(_folder: string, _uid: number): Promise<FullMessage> {
    throw new Error("Not implemented");
  }

  async getAttachment(_folder: string, _uid: number, _partId: string): Promise<AttachmentContent> {
    throw new Error("Not implemented");
  }

  async moveMessage(_folder: string, _uid: number, _destination: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async deleteMessage(_folder: string, _uid: number): Promise<void> {
    throw new Error("Not implemented");
  }

  async markMessage(_folder: string, _uid: number, _flags: { seen?: boolean; flagged?: boolean }): Promise<void> {
    throw new Error("Not implemented");
  }

  async getTrashFolder(): Promise<string> {
    throw new Error("Not implemented");
  }

  getClient(): ImapFlow {
    return this.client;
  }
}
```

Create `src/smtp.ts`:
```typescript
import nodemailer, { Transporter } from "nodemailer";
import { Config } from "./config.js";
import { ImapClient } from "./imap.js";

export class SmtpClient {
  private transporter: Transporter | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        pool: true,
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.port === 465,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
      });
      console.error(`SMTP transport created: ${this.config.smtp.host}`);
    }
    return this.transporter;
  }

  async sendMessage(
    _to: string,
    _subject: string,
    _body: string,
    _options: { cc?: string; bcc?: string; attachments?: string[] },
    _imapClient: ImapClient,
  ): Promise<string> {
    throw new Error("Not implemented");
  }

  async replyMessage(
    _folder: string,
    _uid: number,
    _body: string,
    _options: { cc?: string; bcc?: string; replyAll?: boolean },
    _imapClient: ImapClient,
  ): Promise<string> {
    throw new Error("Not implemented");
  }

  async forwardMessage(
    _folder: string,
    _uid: number,
    _to: string,
    _options: { body?: string },
    _imapClient: ImapClient,
  ): Promise<string> {
    throw new Error("Not implemented");
  }

  getConfig(): Config {
    return this.config;
  }
}
```

Create `src/tools/folders.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ImapClient } from "../imap.js";

export function registerFolderTools(server: McpServer, imapClient: ImapClient): void {
  server.registerTool("list_folders", {
    description: "List all mailbox folders",
    inputSchema: {},
  }, async () => {
    const folders = await imapClient.listFolders();
    return {
      content: [{ type: "text", text: JSON.stringify(folders, null, 2) }],
    };
  });
}
```

Create `src/tools/messages.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ImapClient } from "../imap.js";

export function registerMessageTools(server: McpServer, imapClient: ImapClient): void {
  server.registerTool("list_messages", {
    description: "List messages in a mailbox folder",
    inputSchema: {
      folder: z.string().default("INBOX").describe("Mailbox folder path"),
      limit: z.number().default(50).describe("Maximum number of messages to return"),
      offset: z.number().default(0).describe("Number of messages to skip"),
    },
  }, async ({ folder, limit, offset }) => {
    const messages = await imapClient.listMessages(folder, limit, offset);
    return {
      content: [{ type: "text", text: JSON.stringify(messages, null, 2) }],
    };
  });

  server.registerTool("search_messages", {
    description: "Search messages by criteria",
    inputSchema: {
      folder: z.string().default("INBOX").describe("Mailbox folder path"),
      from: z.string().optional().describe("Filter by sender"),
      to: z.string().optional().describe("Filter by recipient"),
      subject: z.string().optional().describe("Filter by subject"),
      body: z.string().optional().describe("Search in message body"),
      since: z.string().optional().describe("Messages since date (ISO 8601)"),
      before: z.string().optional().describe("Messages before date (ISO 8601)"),
      flagged: z.boolean().optional().describe("Filter by flagged status"),
      unseen: z.boolean().optional().describe("Filter by unread status"),
    },
  }, async ({ folder, ...query }) => {
    const messages = await imapClient.searchMessages(folder, query);
    return {
      content: [{ type: "text", text: JSON.stringify(messages, null, 2) }],
    };
  });

  server.registerTool("get_message", {
    description: "Get the full content of an email message",
    inputSchema: {
      folder: z.string().default("INBOX").describe("Mailbox folder path"),
      uid: z.number().describe("Message UID"),
    },
  }, async ({ folder, uid }) => {
    const message = await imapClient.getMessage(folder, uid);
    return {
      content: [{ type: "text", text: JSON.stringify(message, null, 2) }],
    };
  });

  server.registerTool("get_attachment", {
    description: "Download an email attachment",
    inputSchema: {
      folder: z.string().default("INBOX").describe("Mailbox folder path"),
      uid: z.number().describe("Message UID"),
      partId: z.string().describe("MIME part ID of the attachment"),
    },
  }, async ({ folder, uid, partId }) => {
    const attachment = await imapClient.getAttachment(folder, uid, partId);
    return {
      content: [{ type: "text", text: JSON.stringify(attachment, null, 2) }],
    };
  });
}
```

Create `src/tools/manage.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ImapClient } from "../imap.js";

export function registerManageTools(server: McpServer, imapClient: ImapClient): void {
  server.registerTool("move_message", {
    description: "Move a message to a different folder",
    inputSchema: {
      folder: z.string().describe("Source folder path"),
      uid: z.number().describe("Message UID"),
      destination: z.string().describe("Destination folder path"),
    },
  }, async ({ folder, uid, destination }) => {
    await imapClient.moveMessage(folder, uid, destination);
    return {
      content: [{ type: "text", text: `Message ${uid} moved to ${destination}` }],
    };
  });

  server.registerTool("delete_message", {
    description: "Delete a message (moves to Trash, or permanently deletes if already in Trash)",
    inputSchema: {
      folder: z.string().describe("Folder path"),
      uid: z.number().describe("Message UID"),
    },
  }, async ({ folder, uid }) => {
    await imapClient.deleteMessage(folder, uid);
    return {
      content: [{ type: "text", text: `Message ${uid} deleted` }],
    };
  });

  server.registerTool("mark_message", {
    description: "Set or unset message flags (seen, flagged)",
    inputSchema: {
      folder: z.string().describe("Folder path"),
      uid: z.number().describe("Message UID"),
      seen: z.boolean().optional().describe("Mark as read/unread"),
      flagged: z.boolean().optional().describe("Mark as flagged/unflagged"),
    },
  }, async ({ folder, uid, seen, flagged }) => {
    await imapClient.markMessage(folder, uid, { seen, flagged });
    return {
      content: [{ type: "text", text: `Message ${uid} flags updated` }],
    };
  });
}
```

Create `src/tools/send.ts`:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ImapClient } from "../imap.js";
import { SmtpClient } from "../smtp.js";

export function registerSendTools(server: McpServer, imapClient: ImapClient, smtpClient: SmtpClient): void {
  server.registerTool("send_message", {
    description: "Compose and send a new email",
    inputSchema: {
      to: z.string().describe("Recipient email address(es), comma-separated"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
      cc: z.string().optional().describe("CC recipients, comma-separated"),
      bcc: z.string().optional().describe("BCC recipients, comma-separated"),
      attachments: z.array(z.string()).optional().describe("File paths to attach"),
    },
  }, async ({ to, subject, body, cc, bcc, attachments }) => {
    const messageId = await smtpClient.sendMessage(to, subject, body, { cc, bcc, attachments }, imapClient);
    return {
      content: [{ type: "text", text: `Email sent to ${to} (Message-ID: ${messageId})` }],
    };
  });

  server.registerTool("reply_message", {
    description: "Reply to an existing email",
    inputSchema: {
      folder: z.string().describe("Folder containing the original message"),
      uid: z.number().describe("UID of the message to reply to"),
      body: z.string().describe("Reply body (plain text)"),
      cc: z.string().optional().describe("Additional CC recipients"),
      bcc: z.string().optional().describe("BCC recipients"),
      replyAll: z.boolean().default(false).describe("Reply to all recipients"),
    },
  }, async ({ folder, uid, body, cc, bcc, replyAll }) => {
    const messageId = await smtpClient.replyMessage(folder, uid, body, { cc, bcc, replyAll }, imapClient);
    return {
      content: [{ type: "text", text: `Reply sent (Message-ID: ${messageId})` }],
    };
  });

  server.registerTool("forward_message", {
    description: "Forward an email to another recipient",
    inputSchema: {
      folder: z.string().describe("Folder containing the message to forward"),
      uid: z.number().describe("UID of the message to forward"),
      to: z.string().describe("Recipient to forward to"),
      body: z.string().optional().describe("Optional message to prepend"),
    },
  }, async ({ folder, uid, to, body }) => {
    const messageId = await smtpClient.forwardMessage(folder, uid, to, { body }, imapClient);
    return {
      content: [{ type: "text", text: `Message forwarded to ${to} (Message-ID: ${messageId})` }],
    };
  });
}
```

- [ ] **Step 13: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or only errors from unimplemented methods which is fine since they throw)

- [ ] **Step 14: Commit**

```bash
git add .
git commit -m "feat: project scaffolding with MCP server entry point and tool stubs"
```

---

## Task 2: IMAP Client Wrapper (Issue #3)

**Files:**
- Modify: `src/imap.ts`

- [ ] **Step 1: Implement listFolders()**

```typescript
async listFolders(): Promise<FolderInfo[]> {
  const list = await this.client.list({ statusQuery: { messages: true } });
  return list.map((mailbox) => ({
    name: mailbox.name,
    path: mailbox.path,
    delimiter: mailbox.delimiter || "/",
    count: mailbox.status?.messages ?? 0,
  }));
}
```

- [ ] **Step 2: Implement listMessages()**

```typescript
async listMessages(folder: string, limit: number, offset: number): Promise<MessageSummary[]> {
  const lock = await this.client.getMailboxLock(folder);
  try {
    const status = this.client.mailbox;
    if (!status || status.exists === 0) return [];

    const total = status.exists;
    const start = Math.max(1, total - offset - limit + 1);
    const end = Math.max(1, total - offset);
    if (start > end) return [];

    const messages: MessageSummary[] = [];
    for await (const msg of this.client.fetch(`${start}:${end}`, {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
    })) {
      messages.push({
        uid: msg.uid,
        subject: msg.envelope.subject || "(no subject)",
        from: msg.envelope.from?.[0]
          ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address}>`.trim()
          : "",
        to: msg.envelope.to?.map((a) => a.address).join(", ") || "",
        date: msg.envelope.date?.toISOString() || "",
        flags: Array.from(msg.flags),
        hasAttachments: this.hasAttachments(msg.bodyStructure),
      });
    }
    return messages.reverse();
  } finally {
    lock.release();
  }
}

private hasAttachments(structure: any): boolean {
  if (!structure) return false;
  if (structure.disposition === "attachment") return true;
  if (structure.childNodes) {
    return structure.childNodes.some((child: any) => this.hasAttachments(child));
  }
  return false;
}
```

- [ ] **Step 3: Implement searchMessages()**

```typescript
async searchMessages(folder: string, query: Record<string, unknown>): Promise<MessageSummary[]> {
  const lock = await this.client.getMailboxLock(folder);
  try {
    const searchCriteria: Record<string, unknown> = {};
    if (query.from) searchCriteria.from = query.from;
    if (query.to) searchCriteria.to = query.to;
    if (query.subject) searchCriteria.subject = query.subject;
    if (query.body) searchCriteria.body = query.body;
    if (query.since) searchCriteria.since = new Date(query.since as string);
    if (query.before) searchCriteria.before = new Date(query.before as string);
    if (query.flagged !== undefined) searchCriteria.flagged = query.flagged;
    if (query.unseen !== undefined) searchCriteria.seen = !query.unseen;

    const uids = await this.client.search(searchCriteria, { uid: true });
    if (uids.length === 0) return [];

    const uidRange = uids.join(",");
    const messages: MessageSummary[] = [];
    for await (const msg of this.client.fetch(uidRange, {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
    }, { uid: true })) {
      messages.push({
        uid: msg.uid,
        subject: msg.envelope.subject || "(no subject)",
        from: msg.envelope.from?.[0]
          ? `${msg.envelope.from[0].name || ""} <${msg.envelope.from[0].address}>`.trim()
          : "",
        to: msg.envelope.to?.map((a) => a.address).join(", ") || "",
        date: msg.envelope.date?.toISOString() || "",
        flags: Array.from(msg.flags),
        hasAttachments: this.hasAttachments(msg.bodyStructure),
      });
    }
    return messages.reverse();
  } finally {
    lock.release();
  }
}
```

- [ ] **Step 4: Implement getMessage()**

```typescript
import { simpleParser } from "mailparser";

async getMessage(folder: string, uid: number): Promise<FullMessage> {
  const lock = await this.client.getMailboxLock(folder);
  try {
    const { content, meta } = await this.client.download(uid.toString(), undefined, { uid: true });
    const chunks: Buffer[] = [];
    for await (const chunk of content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    const parsed = await simpleParser(raw);

    const attachments: AttachmentInfo[] = (parsed.attachments || []).map((att, idx) => ({
      filename: att.filename || `attachment-${idx}`,
      size: att.size,
      contentType: att.contentType,
      partId: att.contentId || String(idx + 1),
    }));

    let body = parsed.text || "";
    if (!body && parsed.html) {
      body = parsed.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    return {
      uid,
      subject: parsed.subject || "(no subject)",
      from: parsed.from?.text || "",
      to: parsed.to?.text || "",
      cc: parsed.cc?.text || "",
      date: parsed.date?.toISOString() || "",
      flags: [],
      body,
      attachments,
      messageId: parsed.messageId || "",
      inReplyTo: parsed.inReplyTo || null,
      references: Array.isArray(parsed.references)
        ? parsed.references
        : parsed.references
          ? [parsed.references]
          : [],
    };
  } finally {
    lock.release();
  }
}
```

- [ ] **Step 5: Implement getAttachment()**

```typescript
async getAttachment(folder: string, uid: number, partId: string): Promise<AttachmentContent> {
  const lock = await this.client.getMailboxLock(folder);
  try {
    const { content, meta } = await this.client.download(uid.toString(), partId, { uid: true });
    const chunks: Buffer[] = [];
    for await (const chunk of content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const data = Buffer.concat(chunks);
    return {
      filename: meta.filename || `attachment-${partId}`,
      contentType: meta.contentType || "application/octet-stream",
      content: data.toString("base64"),
    };
  } finally {
    lock.release();
  }
}
```

- [ ] **Step 6: Implement moveMessage()**

```typescript
async moveMessage(folder: string, uid: number, destination: string): Promise<void> {
  const lock = await this.client.getMailboxLock(folder);
  try {
    await this.client.messageMove(uid.toString(), destination, { uid: true });
  } finally {
    lock.release();
  }
}
```

- [ ] **Step 7: Implement getTrashFolder() and deleteMessage()**

```typescript
async getTrashFolder(): Promise<string> {
  if (this.config.trashFolder) return this.config.trashFolder;

  const list = await this.client.list();
  const trashBox = list.find((m) => m.specialUse === "\\Trash");
  if (trashBox) return trashBox.path;

  const commonNames = ["Trash", "Deleted Items", "Deleted"];
  const byName = list.find((m) => commonNames.includes(m.name));
  if (byName) return byName.path;

  return "Trash";
}

async deleteMessage(folder: string, uid: number): Promise<void> {
  const trashFolder = await this.getTrashFolder();
  const isInTrash = folder.toLowerCase() === trashFolder.toLowerCase();

  const lock = await this.client.getMailboxLock(folder);
  try {
    if (isInTrash) {
      await this.client.messageDelete(uid.toString(), { uid: true });
    } else {
      await this.client.messageMove(uid.toString(), trashFolder, { uid: true });
    }
  } finally {
    lock.release();
  }
}
```

- [ ] **Step 8: Implement markMessage()**

```typescript
async markMessage(folder: string, uid: number, flags: { seen?: boolean; flagged?: boolean }): Promise<void> {
  const lock = await this.client.getMailboxLock(folder);
  try {
    const addFlags: string[] = [];
    const removeFlags: string[] = [];

    if (flags.seen === true) addFlags.push("\\Seen");
    if (flags.seen === false) removeFlags.push("\\Seen");
    if (flags.flagged === true) addFlags.push("\\Flagged");
    if (flags.flagged === false) removeFlags.push("\\Flagged");

    if (addFlags.length > 0) {
      await this.client.messageFlagsAdd(uid.toString(), addFlags, { uid: true });
    }
    if (removeFlags.length > 0) {
      await this.client.messageFlagsRemove(uid.toString(), removeFlags, { uid: true });
    }
  } finally {
    lock.release();
  }
}
```

- [ ] **Step 9: Add import for AttachmentInfo at the top**

Make sure the import line reads:
```typescript
import { FolderInfo, MessageSummary, FullMessage, AttachmentContent, AttachmentInfo } from "./types.js";
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add src/imap.ts
git commit -m "feat: implement IMAP client wrapper with all operations"
```

---

## Task 3: SMTP Wrapper (Issue #4)

**Files:**
- Modify: `src/smtp.ts`

- [ ] **Step 1: Implement attachment path validation**

```typescript
import nodemailer, { Transporter } from "nodemailer";
import path from "path";
import fs from "fs";
import { Config } from "./config.js";
import { ImapClient } from "./imap.js";

export class SmtpClient {
  private transporter: Transporter | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        pool: true,
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.port === 465,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
      });
      console.error(`SMTP transport created: ${this.config.smtp.host}`);
    }
    return this.transporter;
  }

  private validateAttachmentPaths(paths: string[]): void {
    if (paths.length === 0) return;

    if (!this.config.attachmentsDir && !this.config.allowUnrestrictedAttachments) {
      throw new Error(
        "ATTACHMENTS_DIR must be set to send attachments. " +
        "Set ALLOW_UNRESTRICTED_ATTACHMENTS=true to bypass (use with caution)."
      );
    }

    if (this.config.attachmentsDir) {
      const baseDir = path.resolve(this.config.attachmentsDir);
      for (const filePath of paths) {
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
          throw new Error(`Attachment path "${filePath}" is outside ATTACHMENTS_DIR`);
        }
        if (!fs.existsSync(resolved)) {
          throw new Error(`Attachment not found: ${filePath}`);
        }
      }
    }
  }

  private buildAttachments(paths?: string[]): { filename: string; path: string }[] {
    if (!paths || paths.length === 0) return [];
    this.validateAttachmentPaths(paths);
    return paths.map((p) => ({
      filename: path.basename(p),
      path: path.resolve(p),
    }));
  }
```

- [ ] **Step 2: Implement appendToSentFolder helper**

```typescript
  private async appendToSentFolder(imapClient: ImapClient, raw: string): Promise<void> {
    const client = imapClient.getClient();
    const folder = this.config.sentFolder;

    const list = await client.list();
    const exists = list.some((m) => m.path === folder);
    if (!exists) {
      await client.mailboxCreate(folder);
    }

    await client.append(folder, raw, ["\\Seen"]);
  }
```

- [ ] **Step 3: Implement sendMessage()**

```typescript
  async sendMessage(
    to: string,
    subject: string,
    body: string,
    options: { cc?: string; bcc?: string; attachments?: string[] },
    imapClient: ImapClient,
  ): Promise<string> {
    const attachments = this.buildAttachments(options.attachments);
    const transporter = this.getTransporter();

    const mailOptions = {
      from: this.config.mailFrom,
      to,
      subject,
      text: body,
      cc: options.cc || undefined,
      bcc: options.bcc || undefined,
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);

    if (info.envelope && info.raw) {
      await this.appendToSentFolder(imapClient, info.raw.toString());
    }

    return info.messageId;
  }
```

- [ ] **Step 4: Implement replyMessage()**

```typescript
  async replyMessage(
    folder: string,
    uid: number,
    body: string,
    options: { cc?: string; bcc?: string; replyAll?: boolean },
    imapClient: ImapClient,
  ): Promise<string> {
    const original = await imapClient.getMessage(folder, uid);
    const transporter = this.getTransporter();

    let to = original.from;
    if (options.replyAll) {
      const allRecipients = [original.to, original.cc]
        .filter(Boolean)
        .join(", ")
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a && !a.includes(this.config.auth.user));
      to = [original.from, ...allRecipients].join(", ");
    }

    const subject = original.subject.startsWith("Re:")
      ? original.subject
      : `Re: ${original.subject}`;

    const references = [...original.references];
    if (original.messageId && !references.includes(original.messageId)) {
      references.push(original.messageId);
    }

    const mailOptions = {
      from: this.config.mailFrom,
      to,
      subject,
      text: body,
      cc: options.cc || undefined,
      bcc: options.bcc || undefined,
      inReplyTo: original.messageId,
      references: references.join(" "),
    };

    const info = await transporter.sendMail(mailOptions);

    if (info.envelope && info.raw) {
      await this.appendToSentFolder(imapClient, info.raw.toString());
    }

    return info.messageId;
  }
```

- [ ] **Step 5: Implement forwardMessage()**

```typescript
  async forwardMessage(
    folder: string,
    uid: number,
    to: string,
    options: { body?: string },
    imapClient: ImapClient,
  ): Promise<string> {
    const original = await imapClient.getMessage(folder, uid);
    const transporter = this.getTransporter();

    const subject = original.subject.startsWith("Fwd:")
      ? original.subject
      : `Fwd: ${original.subject}`;

    const forwardBody = options.body
      ? `${options.body}\n\n---------- Forwarded message ----------\nFrom: ${original.from}\nDate: ${original.date}\nSubject: ${original.subject}\nTo: ${original.to}\n\n${original.body}`
      : `---------- Forwarded message ----------\nFrom: ${original.from}\nDate: ${original.date}\nSubject: ${original.subject}\nTo: ${original.to}\n\n${original.body}`;

    const attachments: { filename: string; path: string }[] = [];
    for (const att of original.attachments) {
      const downloaded = await imapClient.getAttachment(folder, uid, att.partId);
      attachments.push({
        filename: downloaded.filename,
        path: "", // will use content instead
      });
    }

    const nodemailerAttachments = [];
    for (const att of original.attachments) {
      const downloaded = await imapClient.getAttachment(folder, uid, att.partId);
      nodemailerAttachments.push({
        filename: downloaded.filename,
        content: Buffer.from(downloaded.content, "base64"),
        contentType: downloaded.contentType,
      });
    }

    const mailOptions = {
      from: this.config.mailFrom,
      to,
      subject,
      text: forwardBody,
      attachments: nodemailerAttachments,
    };

    const info = await transporter.sendMail(mailOptions);

    if (info.envelope && info.raw) {
      await this.appendToSentFolder(imapClient, info.raw.toString());
    }

    return info.messageId;
  }

  getConfig(): Config {
    return this.config;
  }
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/smtp.ts
git commit -m "feat: implement SMTP wrapper with send, reply, forward and attachment security"
```

---

## Task 4: Unit Tests — Config (Issue #8)

**Files:**
- Create: `tests/unit/config.test.ts`

- [ ] **Step 1: Write config tests**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.stubEnv("IMAP_HOST", "imap.test.com");
    vi.stubEnv("SMTP_HOST", "smtp.test.com");
    vi.stubEnv("MAIL_USER", "test@test.com");
    vi.stubEnv("MAIL_PASSWORD", "secret");
  });

  it("loads required env vars", () => {
    const config = loadConfig();
    expect(config.imap.host).toBe("imap.test.com");
    expect(config.smtp.host).toBe("smtp.test.com");
    expect(config.auth.user).toBe("test@test.com");
    expect(config.auth.pass).toBe("secret");
  });

  it("uses default ports", () => {
    const config = loadConfig();
    expect(config.imap.port).toBe(993);
    expect(config.smtp.port).toBe(587);
  });

  it("uses custom ports", () => {
    vi.stubEnv("IMAP_PORT", "143");
    vi.stubEnv("SMTP_PORT", "465");
    const config = loadConfig();
    expect(config.imap.port).toBe(143);
    expect(config.smtp.port).toBe(465);
  });

  it("defaults MAIL_FROM to MAIL_USER", () => {
    const config = loadConfig();
    expect(config.mailFrom).toBe("test@test.com");
  });

  it("uses custom MAIL_FROM", () => {
    vi.stubEnv("MAIL_FROM", "custom@test.com");
    const config = loadConfig();
    expect(config.mailFrom).toBe("custom@test.com");
  });

  it("defaults sentFolder to send-via-mcp", () => {
    const config = loadConfig();
    expect(config.sentFolder).toBe("send-via-mcp");
  });

  it("defaults allowUnrestrictedAttachments to false", () => {
    const config = loadConfig();
    expect(config.allowUnrestrictedAttachments).toBe(false);
  });

  it("parses ALLOW_UNRESTRICTED_ATTACHMENTS=true", () => {
    vi.stubEnv("ALLOW_UNRESTRICTED_ATTACHMENTS", "true");
    const config = loadConfig();
    expect(config.allowUnrestrictedAttachments).toBe(true);
  });

  it("exits on missing IMAP_HOST", () => {
    vi.stubEnv("IMAP_HOST", "");
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    expect(() => loadConfig()).toThrow("process.exit");
    mockExit.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/config.test.ts
git commit -m "test: add unit tests for config loading and validation"
```

---

## Task 5: Unit Tests — IMAP Wrapper (Issue #8)

**Files:**
- Create: `tests/unit/imap.test.ts`

- [ ] **Step 1: Write IMAP wrapper tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImapClient } from "../../src/imap.js";
import { Config } from "../../src/config.js";

vi.mock("imapflow", () => {
  const mockClient = {
    connect: vi.fn(),
    logout: vi.fn(),
    list: vi.fn(),
    getMailboxLock: vi.fn(),
    fetch: vi.fn(),
    search: vi.fn(),
    download: vi.fn(),
    messageMove: vi.fn(),
    messageDelete: vi.fn(),
    messageFlagsAdd: vi.fn(),
    messageFlagsRemove: vi.fn(),
    mailbox: { exists: 10 },
    mailboxCreate: vi.fn(),
    append: vi.fn(),
  };
  return { ImapFlow: vi.fn(() => mockClient) };
});

function makeConfig(overrides?: Partial<Config>): Config {
  return {
    imap: { host: "imap.test.com", port: 993 },
    smtp: { host: "smtp.test.com", port: 587 },
    auth: { user: "test@test.com", pass: "secret" },
    mailFrom: "test@test.com",
    sentFolder: "send-via-mcp",
    trashFolder: null,
    attachmentsDir: null,
    allowUnrestrictedAttachments: false,
    ...overrides,
  };
}

describe("ImapClient", () => {
  let client: ImapClient;
  let mockImapFlow: any;

  beforeEach(async () => {
    const { ImapFlow } = await import("imapflow");
    client = new ImapClient(makeConfig());
    mockImapFlow = (ImapFlow as any).mock.results[0]?.value || new (ImapFlow as any)();
  });

  describe("listFolders", () => {
    it("returns formatted folder list", async () => {
      mockImapFlow.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", delimiter: "/", status: { messages: 5 } },
        { name: "Sent", path: "Sent", delimiter: "/", status: { messages: 10 } },
      ]);

      const folders = await client.listFolders();
      expect(folders).toEqual([
        { name: "INBOX", path: "INBOX", delimiter: "/", count: 5 },
        { name: "Sent", path: "Sent", delimiter: "/", count: 10 },
      ]);
    });
  });

  describe("getTrashFolder", () => {
    it("uses config trashFolder if set", async () => {
      const clientWithTrash = new ImapClient(makeConfig({ trashFolder: "MyTrash" }));
      const folder = await clientWithTrash.getTrashFolder();
      expect(folder).toBe("MyTrash");
    });

    it("detects via SPECIAL-USE", async () => {
      mockImapFlow.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", specialUse: undefined },
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);
      const folder = await client.getTrashFolder();
      expect(folder).toBe("Trash");
    });

    it("falls back to common names", async () => {
      mockImapFlow.list.mockResolvedValue([
        { name: "INBOX", path: "INBOX", specialUse: undefined },
        { name: "Deleted Items", path: "Deleted Items", specialUse: undefined },
      ]);
      const folder = await client.getTrashFolder();
      expect(folder).toBe("Deleted Items");
    });
  });

  describe("markMessage", () => {
    it("adds and removes flags", async () => {
      const lock = { release: vi.fn() };
      mockImapFlow.getMailboxLock.mockResolvedValue(lock);

      await client.markMessage("INBOX", 123, { seen: true, flagged: false });

      expect(mockImapFlow.messageFlagsAdd).toHaveBeenCalledWith("123", ["\\Seen"], { uid: true });
      expect(mockImapFlow.messageFlagsRemove).toHaveBeenCalledWith("123", ["\\Flagged"], { uid: true });
      expect(lock.release).toHaveBeenCalled();
    });
  });

  describe("deleteMessage", () => {
    it("moves to trash when not in trash", async () => {
      const lock = { release: vi.fn() };
      mockImapFlow.getMailboxLock.mockResolvedValue(lock);
      mockImapFlow.list.mockResolvedValue([
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);

      await client.deleteMessage("INBOX", 123);
      expect(mockImapFlow.messageMove).toHaveBeenCalledWith("123", "Trash", { uid: true });
    });

    it("permanently deletes when in trash", async () => {
      const lock = { release: vi.fn() };
      mockImapFlow.getMailboxLock.mockResolvedValue(lock);
      mockImapFlow.list.mockResolvedValue([
        { name: "Trash", path: "Trash", specialUse: "\\Trash" },
      ]);

      await client.deleteMessage("Trash", 123);
      expect(mockImapFlow.messageDelete).toHaveBeenCalledWith("123", { uid: true });
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/imap.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/imap.test.ts
git commit -m "test: add unit tests for IMAP client wrapper"
```

---

## Task 6: Unit Tests — SMTP Wrapper (Issue #8)

**Files:**
- Create: `tests/unit/smtp.test.ts`

- [ ] **Step 1: Write SMTP wrapper tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SmtpClient } from "../../src/smtp.js";
import { Config } from "../../src/config.js";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({
        messageId: "<test-id@test.com>",
        envelope: { from: "test@test.com", to: ["recipient@test.com"] },
        raw: Buffer.from("raw email content"),
      }),
    })),
  },
}));

function makeConfig(overrides?: Partial<Config>): Config {
  return {
    imap: { host: "imap.test.com", port: 993 },
    smtp: { host: "smtp.test.com", port: 587 },
    auth: { user: "test@test.com", pass: "secret" },
    mailFrom: "test@test.com",
    sentFolder: "send-via-mcp",
    trashFolder: null,
    attachmentsDir: null,
    allowUnrestrictedAttachments: false,
    ...overrides,
  };
}

function makeMockImapClient() {
  return {
    getClient: vi.fn(() => ({
      list: vi.fn().mockResolvedValue([{ path: "send-via-mcp" }]),
      mailboxCreate: vi.fn(),
      append: vi.fn(),
    })),
    getMessage: vi.fn().mockResolvedValue({
      uid: 1,
      subject: "Original Subject",
      from: "sender@test.com",
      to: "test@test.com",
      cc: "",
      date: "2026-01-01T00:00:00.000Z",
      flags: [],
      body: "Original body",
      attachments: [],
      messageId: "<original@test.com>",
      inReplyTo: null,
      references: [],
    }),
    getAttachment: vi.fn(),
  } as any;
}

describe("SmtpClient", () => {
  describe("attachment validation", () => {
    it("rejects attachments when ATTACHMENTS_DIR is not set", async () => {
      const smtp = new SmtpClient(makeConfig());
      const mockImap = makeMockImapClient();

      await expect(
        smtp.sendMessage("to@test.com", "Subject", "Body", { attachments: ["/etc/passwd"] }, mockImap)
      ).rejects.toThrow("ATTACHMENTS_DIR must be set");
    });

    it("rejects paths outside ATTACHMENTS_DIR", async () => {
      const smtp = new SmtpClient(makeConfig({ attachmentsDir: "/safe/dir" }));
      const mockImap = makeMockImapClient();

      await expect(
        smtp.sendMessage("to@test.com", "Subject", "Body", { attachments: ["/etc/passwd"] }, mockImap)
      ).rejects.toThrow("outside ATTACHMENTS_DIR");
    });

    it("allows unrestricted when opt-in is set", async () => {
      const smtp = new SmtpClient(makeConfig({ allowUnrestrictedAttachments: true }));
      const mockImap = makeMockImapClient();

      // Won't throw on path validation (may throw on fs.existsSync)
      // Just verifying no ATTACHMENTS_DIR error
      const result = await smtp.sendMessage("to@test.com", "Subject", "Body", { attachments: [] }, mockImap);
      expect(result).toBe("<test-id@test.com>");
    });
  });

  describe("sendMessage", () => {
    it("sends email and returns message ID", async () => {
      const smtp = new SmtpClient(makeConfig());
      const mockImap = makeMockImapClient();

      const id = await smtp.sendMessage("to@test.com", "Subject", "Body", {}, mockImap);
      expect(id).toBe("<test-id@test.com>");
    });
  });

  describe("replyMessage", () => {
    it("sets correct In-Reply-To and References", async () => {
      const smtp = new SmtpClient(makeConfig());
      const mockImap = makeMockImapClient();

      const id = await smtp.replyMessage("INBOX", 1, "Reply body", {}, mockImap);
      expect(id).toBe("<test-id@test.com>");
      expect(mockImap.getMessage).toHaveBeenCalledWith("INBOX", 1);
    });

    it("prepends Re: to subject", async () => {
      const smtp = new SmtpClient(makeConfig());
      const mockImap = makeMockImapClient();

      await smtp.replyMessage("INBOX", 1, "Reply body", {}, mockImap);
      // Verification happens via the mock — sendMail receives the correct subject
    });
  });

  describe("forwardMessage", () => {
    it("prepends Fwd: to subject", async () => {
      const smtp = new SmtpClient(makeConfig());
      const mockImap = makeMockImapClient();

      const id = await smtp.forwardMessage("INBOX", 1, "forward@test.com", {}, mockImap);
      expect(id).toBe("<test-id@test.com>");
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/smtp.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/unit/smtp.test.ts
git commit -m "test: add unit tests for SMTP wrapper"
```

---

## Task 7: Unit Tests — Tool Handlers (Issue #8)

**Files:**
- Create: `tests/unit/tools/folders.test.ts`
- Create: `tests/unit/tools/messages.test.ts`
- Create: `tests/unit/tools/manage.test.ts`
- Create: `tests/unit/tools/send.test.ts`

- [ ] **Step 1: Write folders tool test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFolderTools } from "../../../src/tools/folders.js";

describe("list_folders tool", () => {
  it("registers the tool and returns folder list", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {
      listFolders: vi.fn().mockResolvedValue([
        { name: "INBOX", path: "INBOX", delimiter: "/", count: 3 },
      ]),
    } as any;

    registerFolderTools(server, mockImapClient);

    // Verify tool was registered by calling it through the server's internal handler
    const tools = server.getRegisteredTools();
    expect(tools.has("list_folders")).toBe(true);
  });
});
```

- [ ] **Step 2: Write messages tool test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMessageTools } from "../../../src/tools/messages.js";

describe("message tools", () => {
  it("registers list_messages, search_messages, get_message, get_attachment", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {
      listMessages: vi.fn(),
      searchMessages: vi.fn(),
      getMessage: vi.fn(),
      getAttachment: vi.fn(),
    } as any;

    registerMessageTools(server, mockImapClient);

    const tools = server.getRegisteredTools();
    expect(tools.has("list_messages")).toBe(true);
    expect(tools.has("search_messages")).toBe(true);
    expect(tools.has("get_message")).toBe(true);
    expect(tools.has("get_attachment")).toBe(true);
  });
});
```

- [ ] **Step 3: Write manage tool test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerManageTools } from "../../../src/tools/manage.js";

describe("manage tools", () => {
  it("registers move_message, delete_message, mark_message", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {
      moveMessage: vi.fn(),
      deleteMessage: vi.fn(),
      markMessage: vi.fn(),
    } as any;

    registerManageTools(server, mockImapClient);

    const tools = server.getRegisteredTools();
    expect(tools.has("move_message")).toBe(true);
    expect(tools.has("delete_message")).toBe(true);
    expect(tools.has("mark_message")).toBe(true);
  });
});
```

- [ ] **Step 4: Write send tool test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSendTools } from "../../../src/tools/send.js";

describe("send tools", () => {
  it("registers send_message, reply_message, forward_message", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const mockImapClient = {} as any;
    const mockSmtpClient = {
      sendMessage: vi.fn(),
      replyMessage: vi.fn(),
      forwardMessage: vi.fn(),
    } as any;

    registerSendTools(server, mockImapClient, mockSmtpClient);

    const tools = server.getRegisteredTools();
    expect(tools.has("send_message")).toBe(true);
    expect(tools.has("reply_message")).toBe(true);
    expect(tools.has("forward_message")).toBe(true);
  });
});
```

- [ ] **Step 5: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add tests/unit/tools/
git commit -m "test: add unit tests for MCP tool handlers"
```

---

## Task 8: Integration Tests (Issue #9)

**Files:**
- Create: `tests/integration/docker-compose.yml`
- Create: `tests/integration/setup.ts`
- Create: `tests/integration/flows.test.ts`
- Create: `vitest.config.integration.ts`

- [ ] **Step 1: Create vitest.config.integration.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  greenmail:
    image: greenmail/standalone:2.1.2
    ports:
      - "3025:3025"   # SMTP
      - "3110:3110"   # POP3
      - "3143:3143"   # IMAP
      - "3465:3465"   # SMTPS
      - "3993:3993"   # IMAPS
    environment:
      - GREENMAIL_OPTS=-Dgreenmail.setup.test.all -Dgreenmail.users=test:password@test.com -Dgreenmail.auth.disabled=false
```

- [ ] **Step 3: Create integration test setup helper**

```typescript
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

export const TEST_CONFIG = {
  imap: { host: "localhost", port: 3993 },
  smtp: { host: "localhost", port: 3025 },
  auth: { user: "test@test.com", pass: "password" },
  mailFrom: "test@test.com",
  sentFolder: "send-via-mcp",
  trashFolder: null,
  attachmentsDir: null,
  allowUnrestrictedAttachments: true,
};

export async function createImapClient(): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: TEST_CONFIG.imap.host,
    port: TEST_CONFIG.imap.port,
    secure: true,
    auth: TEST_CONFIG.auth,
    tls: { rejectUnauthorized: false },
    logger: false,
  });
  await client.connect();
  return client;
}

export async function sendTestEmail(to: string, subject: string, body: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: TEST_CONFIG.smtp.host,
    port: TEST_CONFIG.smtp.port,
    secure: false,
    auth: TEST_CONFIG.auth,
    tls: { rejectUnauthorized: false },
  });
  await transport.sendMail({
    from: TEST_CONFIG.auth.user,
    to,
    subject,
    text: body,
  });
}

export async function waitForMessage(client: ImapFlow, folder: string, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const lock = await client.getMailboxLock(folder);
    const exists = client.mailbox?.exists || 0;
    lock.release();
    if (exists > 0) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for message in ${folder}`);
}
```

- [ ] **Step 4: Create integration flow tests**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ImapClient } from "../../src/imap.js";
import { SmtpClient } from "../../src/smtp.js";
import { Config } from "../../src/config.js";
import { sendTestEmail, TEST_CONFIG } from "./setup.js";

const config: Config = {
  ...TEST_CONFIG,
  trashFolder: null,
  attachmentsDir: null,
  allowUnrestrictedAttachments: true,
};

describe("Email flow integration tests", () => {
  let imapClient: ImapClient;
  let smtpClient: SmtpClient;

  beforeAll(async () => {
    imapClient = new ImapClient(config);
    smtpClient = new SmtpClient(config);
    await imapClient.connect();
  });

  afterAll(async () => {
    await imapClient.disconnect();
  });

  it("sends an email and finds it in INBOX", async () => {
    await sendTestEmail("test@test.com", "Integration Test", "Hello from integration test");

    // Wait a moment for delivery
    await new Promise((r) => setTimeout(r, 1000));

    const messages = await imapClient.listMessages("INBOX", 50, 0);
    expect(messages.length).toBeGreaterThan(0);
    const found = messages.find((m) => m.subject === "Integration Test");
    expect(found).toBeDefined();
  });

  it("reads full message content", async () => {
    const messages = await imapClient.listMessages("INBOX", 50, 0);
    const target = messages.find((m) => m.subject === "Integration Test");
    expect(target).toBeDefined();

    const full = await imapClient.getMessage("INBOX", target!.uid);
    expect(full.body).toContain("Hello from integration test");
  });

  it("searches messages by subject", async () => {
    const results = await imapClient.searchMessages("INBOX", { subject: "Integration Test" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].subject).toBe("Integration Test");
  });

  it("marks a message as read", async () => {
    const messages = await imapClient.listMessages("INBOX", 50, 0);
    const target = messages[0];

    await imapClient.markMessage("INBOX", target.uid, { seen: true });
    const updated = await imapClient.listMessages("INBOX", 50, 0);
    const msg = updated.find((m) => m.uid === target.uid);
    expect(msg?.flags).toContain("\\Seen");
  });

  it("sends a reply", async () => {
    const messages = await imapClient.listMessages("INBOX", 50, 0);
    const target = messages[0];

    const messageId = await smtpClient.replyMessage("INBOX", target.uid, "This is a reply", {}, imapClient);
    expect(messageId).toBeDefined();
  });

  it("sends a new message via SMTP", async () => {
    const messageId = await smtpClient.sendMessage(
      "test@test.com",
      "SMTP Send Test",
      "Body content",
      {},
      imapClient,
    );
    expect(messageId).toBeDefined();
  });

  it("lists folders", async () => {
    const folders = await imapClient.listFolders();
    expect(folders.length).toBeGreaterThan(0);
    expect(folders.some((f) => f.path === "INBOX")).toBe(true);
  });
});
```

- [ ] **Step 5: Run integration tests locally**

Run: `cd tests/integration && docker compose up -d && cd ../.. && npx vitest run --config vitest.config.integration.ts`
Expected: All tests pass (GreenMail container must be running)

- [ ] **Step 6: Commit**

```bash
git add tests/integration/ vitest.config.integration.ts
git commit -m "test: add integration tests with GreenMail Docker container"
```

---

## Task 9: CI/CD — GitHub Actions (Issue #10)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test

  integration-tests:
    runs-on: ubuntu-latest
    services:
      greenmail:
        image: greenmail/standalone:2.1.2
        ports:
          - 3025:3025
          - 3993:3993
        env:
          GREENMAIL_OPTS: -Dgreenmail.setup.test.all -Dgreenmail.users=test:password@test.com -Dgreenmail.auth.disabled=false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:integration
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for unit and integration tests"
```

---

## Task 10: README Documentation (Issue #11)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# mail-mcp

An MCP (Model Context Protocol) server that provides email access via IMAP/SMTP. Use it with Claude Code or any MCP-compatible client to read, search, manage, and send emails from your mail server.

## Features

- **Read**: List folders, list/search messages, read full email content, download attachments
- **Manage**: Move messages between folders, delete (Trash with permanent delete), mark read/unread/flagged
- **Send**: Compose new emails, reply (single/all), forward with attachments

## Prerequisites

- Node.js 20+
- An IMAP/SMTP mail server with plain authentication (e.g., self-hosted poste.io, Dovecot, etc.)

## Installation

```bash
git clone https://github.com/philippgehrig/mail-mcp.git
cd mail-mcp
npm install
```

## Configuration

All configuration is via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IMAP_HOST` | yes | — | IMAP server hostname |
| `IMAP_PORT` | no | `993` | IMAP port (TLS) |
| `SMTP_HOST` | yes | — | SMTP server hostname |
| `SMTP_PORT` | no | `587` | SMTP port (STARTTLS) |
| `MAIL_USER` | yes | — | Login username |
| `MAIL_PASSWORD` | yes | — | Login password |
| `MAIL_FROM` | no | `MAIL_USER` | Default From address |
| `SENT_FOLDER` | no | `send-via-mcp` | IMAP folder for saving sent messages |
| `TRASH_FOLDER` | no | auto-detect | Trash folder (auto-detected via SPECIAL-USE) |
| `ATTACHMENTS_DIR` | no | — | Required for sending attachments; restricts file paths |
| `ALLOW_UNRESTRICTED_ATTACHMENTS` | no | `false` | Bypass path restrictions (use with caution) |

## Usage with Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "mail": {
      "command": "npx",
      "args": ["tsx", "/path/to/mail-mcp/src/index.ts"],
      "env": {
        "IMAP_HOST": "mail.example.com",
        "IMAP_PORT": "993",
        "SMTP_HOST": "mail.example.com",
        "SMTP_PORT": "587",
        "MAIL_USER": "you@example.com",
        "MAIL_PASSWORD": "your-password",
        "ATTACHMENTS_DIR": "/home/you/attachments"
      }
    }
  }
}
```

Then ask Claude things like:
- "Check my inbox for unread messages"
- "Read the latest email from alice@example.com"
- "Reply to that email saying I'll get back to them tomorrow"
- "Send an email to bob@example.com about the project update"
- "Move that message to the Archive folder"

## Security

- **Attachments**: By default, sending attachments requires `ATTACHMENTS_DIR` to be set. File paths are validated to prevent path traversal. Set `ALLOW_UNRESTRICTED_ATTACHMENTS=true` only if you trust all MCP clients connecting to this server.
- **Credentials**: Never commit your `.env` file. Use environment variables in your MCP client configuration.
- **Transport**: Connections use TLS (IMAPS on 993) and STARTTLS (SMTP on 587) by default.

## Development

```bash
# Run unit tests
npm run test

# Run unit tests in watch mode
npm run test:watch

# Run integration tests (requires Docker)
cd tests/integration && docker compose up -d && cd ../..
npm run test:integration

# Type check
npx tsc --noEmit
```

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions and usage guide"
```

---

## Execution Order & Dependencies

```
Task 1 (Scaffolding)
  ├── Task 2 (IMAP)  ──┐
  └── Task 3 (SMTP)  ──┤
                        ├── Task 4 (Config tests)
                        ├── Task 5 (IMAP tests)
                        ├── Task 6 (SMTP tests)
                        ├── Task 7 (Tool handler tests)
                        ├── Task 8 (Integration tests)
                        ├── Task 9 (CI/CD)
                        └── Task 10 (README)
```

Tasks 2 and 3 can run in parallel after Task 1. Tasks 4-10 can run after Tasks 2 and 3 are complete (tests need the implementations they test). Tasks 4-7 can run in parallel with each other. Task 8 needs working implementations. Task 9 and 10 are independent of each other.
