# mail-mcp

MCP server for IMAP/SMTP email access. Lets AI assistants read, manage, and send email through the [Model Context Protocol](https://modelcontextprotocol.io/).

## Features

**Read**
- List mailbox folders
- List and search messages
- Read full message content (text and HTML)
- Download attachments

**Manage**
- Move messages between folders
- Delete messages (trash or permanent)
- Mark messages as read/unread/flagged

**Send**
- Compose new emails
- Reply to and forward messages
- Attach files

## Prerequisites

- Node.js 20+
- An IMAP/SMTP mail server with plain (username/password) authentication

## Installation

```bash
git clone https://github.com/philippgehrig/mail-mcp.git
cd mail-mcp
npm install
```

## Configuration

All configuration is done via environment variables.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IMAP_HOST` | Yes | — | IMAP server hostname |
| `IMAP_PORT` | No | `993` | IMAP server port |
| `SMTP_HOST` | Yes | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `MAIL_USER` | Yes | — | Email account username |
| `MAIL_PASSWORD` | Yes | — | Email account password |
| `MAIL_FROM` | No | `MAIL_USER` | Sender address for outgoing mail |
| `SENT_FOLDER` | No | `send-via-mcp` | Folder to store sent messages |
| `TRASH_FOLDER` | No | Auto-detect | Trash folder name (auto-detected if not set) |
| `ATTACHMENTS_DIR` | No* | — | Directory for saving attachments (*required to use attachment features) |
| `ALLOW_UNRESTRICTED_ATTACHMENTS` | No | `false` | Allow attaching any file from the filesystem |

## Usage with Claude Code

Add the server to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "mail": {
      "command": "npx",
      "args": ["tsx", "/path/to/mail-mcp/src/index.ts"],
      "env": {
        "IMAP_HOST": "imap.example.com",
        "SMTP_HOST": "smtp.example.com",
        "MAIL_USER": "you@example.com",
        "MAIL_PASSWORD": "your-password",
        "ATTACHMENTS_DIR": "/tmp/mail-attachments"
      }
    }
  }
}
```

## Example Prompts

Once configured, you can ask Claude things like:

- "Check my inbox for unread messages"
- "Read the latest email from Alice"
- "Reply to that email and say I'll be there at 3pm"
- "Send an email to bob@example.com with subject 'Meeting notes' and attach ./notes.pdf"
- "Move all newsletters to the Archive folder"

## Security

- **Attachment policy** — By default, only files inside `ATTACHMENTS_DIR` can be attached to outgoing mail. Set `ALLOW_UNRESTRICTED_ATTACHMENTS=true` to allow attaching any readable file (use with caution).
- **Credentials** — Store `MAIL_PASSWORD` securely. Avoid committing credentials to version control.
- **TLS** — Connections use TLS by default (IMAPS on port 993, STARTTLS on port 587).

## Development

```bash
# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run integration tests (requires Docker)
npm run test:integration

# Type-check without emitting
npx tsc --noEmit
```

## License

MIT
