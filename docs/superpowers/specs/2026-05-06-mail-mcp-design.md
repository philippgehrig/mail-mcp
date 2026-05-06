# Mail MCP Server — Design Spec

## Overview

An MCP (Model Context Protocol) server that provides Claude Code with access to a private IMAP/SMTP mail server. It enables reading, searching, managing, and sending emails through natural language interaction within Claude Code.

## Goals

- Full email access: read, search, manage (move/delete/flag), and send
- Persistent IMAP connection for responsive tool calls
- Simple env-var configuration for credentials
- Public open-source project with CI and documentation

## Architecture

Single TypeScript process using MCP stdio transport. Claude Code launches it as a child process and communicates over stdin/stdout.

```
Claude Code  ←stdio→  mail-mcp server
                          ├── ImapFlow (persistent connection to IMAP server)
                          └── Nodemailer (pooled SMTP transport)
```

### Connection Strategy

- **IMAP:** Persistent connection established at startup. Reconnects automatically via imapflow's built-in mechanism. Each tool operation acquires a mailbox lock, performs its work, and releases immediately.
- **SMTP:** Pooled Nodemailer transport, lazily created on first send. Reuses connections across multiple sends.

### Configuration

All configuration via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IMAP_HOST` | yes | — | IMAP server hostname |
| `IMAP_PORT` | no | `993` | IMAP port (TLS) |
| `SMTP_HOST` | yes | — | SMTP server hostname |
| `SMTP_PORT` | no | `587` | SMTP port (STARTTLS) |
| `MAIL_USER` | yes | — | Login username |
| `MAIL_PASSWORD` | yes | — | Login password |
| `MAIL_FROM` | no | `MAIL_USER` | Default From address |

Authentication: plain username + password (suitable for self-hosted servers like poste.io).

## Tools

### Reading

| Tool | Inputs | Returns |
|------|--------|---------|
| `list_folders` | — | Array of `{ name, path, delimiter, count }` |
| `list_messages` | `folder` (default: INBOX), `limit` (default: 50), `offset` | Array of `{ id, uid, subject, from, to, date, flags, hasAttachments }` |
| `search_messages` | `folder`, `query` (object with optional `from`, `to`, `subject`, `body`, `since`, `before`, `flagged`, `unseen`) | Same format as `list_messages` |
| `get_message` | `folder`, `uid` | Full message: headers, plain text body (HTML fallback stripped to text), list of attachments `{ filename, size, contentType, partId }` |
| `get_attachment` | `folder`, `uid`, `partId` | Base64-encoded file content + filename + contentType |

### Managing

| Tool | Inputs | Effect |
|------|--------|--------|
| `move_message` | `folder`, `uid`, `destination` | Moves message to destination folder |
| `delete_message` | `folder`, `uid` | Moves to Trash (permanent delete if already in Trash) |
| `mark_message` | `folder`, `uid`, `flags` (object: `{ seen?, flagged? }`) | Sets/unsets message flags |

### Sending

| Tool | Inputs | Effect |
|------|--------|--------|
| `send_message` | `to`, `subject`, `body`, optional `cc`, `bcc`, `attachments` (file paths) | Sends via SMTP, saves copy to `send-via-mcp` folder |
| `reply_message` | `folder`, `uid`, `body`, optional `cc`, `bcc`, `replyAll` (boolean) | Replies with correct In-Reply-To/References headers, saves copy to `send-via-mcp` |
| `forward_message` | `folder`, `uid`, `to`, optional `body` (prepended text) | Forwards with original attachments, saves copy to `send-via-mcp` |

### Sent Folder Behavior

All outgoing emails (send, reply, forward) are appended to a dedicated `send-via-mcp` IMAP folder. This folder is created automatically if it doesn't exist. This separates MCP-sent mail from manually-sent mail for auditability.

## Email Body Handling

When reading emails, prefer plain text when available. If only HTML exists, strip tags to produce readable plain text. This optimizes for LLM consumption and keeps response sizes manageable.

## Error Handling

- **IMAP/SMTP errors:** Caught and returned as MCP tool error responses (server does not crash)
- **Auth failures on startup:** Log a clear message and exit (Claude Code surfaces the error)
- **Network timeouts:** Return user-friendly error suggesting retry
- **Disconnection during tool call:** Return error indicating temporary disconnection

## Project Structure

```
mail-mcp/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts          # Entry point: MCP server setup, tool registration, stdio transport
│   ├── imap.ts           # IMAP client wrapper (connect, reconnect, folder ops, fetch, search)
│   ├── smtp.ts           # SMTP wrapper (send, reply, forward, sent-folder copy)
│   ├── tools/
│   │   ├── folders.ts    # list_folders handler
│   │   ├── messages.ts   # list_messages, search_messages, get_message, get_attachment
│   │   ├── manage.ts     # move_message, delete_message, mark_message
│   │   └── send.ts       # send_message, reply_message, forward_message
│   └── types.ts          # Shared TypeScript interfaces
├── tests/
│   ├── unit/
│   │   ├── tools/        # Tool handler logic (mocked IMAP/SMTP)
│   │   ├── imap.test.ts  # IMAP wrapper tests
│   │   └── smtp.test.ts  # SMTP wrapper tests
│   └── integration/
│       ├── docker-compose.yml  # Test mail server (GreenMail)
│       └── flows.test.ts       # End-to-end tool flows
├── .github/
│   └── workflows/
│       └── ci.yml        # Unit tests on push, integration tests with Docker
├── docs/
│   └── design.md         # This file
├── README.md
├── LICENSE               # MIT
├── CLAUDE.md
└── .gitignore
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `imapflow` | IMAP client (modern, Promise-based, auto-reconnect) |
| `nodemailer` | SMTP sending |
| `mailparser` | Email body/attachment parsing |
| `typescript` | Type checking |
| `tsx` | Dev runner (no build step for dev) |
| `vitest` | Test framework |

## Testing

### Unit Tests (vitest)

- Tool input validation and response formatting
- IMAP/SMTP wrapper logic with mocked connections
- Edge cases: missing folders, invalid UIDs, malformed emails, connection failures

### Integration Tests (Docker + vitest)

- GreenMail Docker container provides a real IMAP/SMTP server
- Full flows: send → find in folder → read → move → delete
- No external secrets required — test credentials hardcoded for the ephemeral container

### CI (GitHub Actions)

- Unit tests run on every push (no Docker needed)
- Integration tests run with Docker services (GreenMail container)
- No Docker Hub credentials required (public images)

## Claude Code MCP Configuration

```json
{
  "mcpServers": {
    "mail": {
      "command": "npx",
      "args": ["tsx", "<path-to>/mail-mcp/src/index.ts"],
      "env": {
        "IMAP_HOST": "mail.example.com",
        "IMAP_PORT": "993",
        "SMTP_HOST": "mail.example.com",
        "SMTP_PORT": "587",
        "MAIL_USER": "user@example.com",
        "MAIL_PASSWORD": "..."
      }
    }
  }
}
```

## Design Decisions

1. **imapflow over node-imap:** imapflow is actively maintained, Promise-based, handles reconnection natively, and has better TypeScript support.
2. **Persistent IMAP connection:** Avoids reconnect overhead per tool call. With light mailbox usage, a single connection is sufficient and responsive.
3. **Lazy SMTP transport:** No need to connect to SMTP until actually sending. Pooled for efficiency if multiple sends happen in sequence.
4. **Plain text preference:** LLMs work best with plain text. HTML stripping as fallback ensures readability regardless of email format.
5. **Dedicated `send-via-mcp` folder:** Clear audit trail separating automated sends from manual ones.
6. **Env var configuration:** Aligns with how Claude Code configures MCP servers. No config files to manage or accidentally commit.
