# mail-mcp

An MCP (Model Context Protocol) server that gives Claude access to your email via IMAP and SMTP. Read, search, send, reply, forward, and manage messages directly from Claude Code or any MCP-compatible client.

## Installation

### Claude Code Plugin (recommended)

First, add the marketplace source:

```
/plugin marketplace add philippgehrig/mail-mcp
```

Then install the plugin:

```
/plugin install mail@mail-mcp
```

You'll be prompted to configure your IMAP/SMTP credentials on first use.

### Manual Installation

Requires Node.js >= 20 and an email account with IMAP/SMTP access.

```bash
git clone https://github.com/philippgehrig/mail-mcp.git
cd mail-mcp
npm install
npm run build
```

Then register with Claude Code:

```bash
claude mcp add-json --scope user mail '{
  "command": "node",
  "args": ["/path/to/mail-mcp/dist/index.js"],
  "env": {
    "IMAP_HOST": "imap.example.com",
    "SMTP_HOST": "smtp.example.com",
    "MAIL_USER": "you@example.com",
    "MAIL_PASSWORD": "your-app-password",
    "MAIL_FROM": "you@example.com"
  }
}'
```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `IMAP_HOST` | Yes | — | IMAP server hostname |
| `IMAP_PORT` | No | `993` | IMAP server port |
| `SMTP_HOST` | Yes | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `MAIL_USER` | Yes | — | Email account username |
| `MAIL_PASSWORD` | Yes | — | Email account password |
| `MAIL_FROM` | No | `MAIL_USER` | From address for outgoing mail |
| `SENT_FOLDER` | No | `send-via-mcp` | Folder name to append sent messages to |
| `TRASH_FOLDER` | No | auto-detect | Trash folder name (auto-detects via SPECIAL-USE) |
| `ATTACHMENTS_DIR` | No | — | Directory to allow local file attachments from |
| `ALLOW_UNRESTRICTED_ATTACHMENTS` | No | `false` | Set `true` to allow local file attachments from any path |

## Available Tools

| Tool | Description |
|------|-------------|
| `list_folders` | List all mailbox folders with message counts |
| `list_messages` | List messages in a folder (paginated, newest first) |
| `search_messages` | Search by from, to, subject, body, date, flags |
| `get_message` | Read full message content (prefers plain text) |
| `get_attachment` | Download an attachment by MIME part ID |
| `send_message` | Compose and send a new email |
| `reply_message` | Reply to an email (supports reply-all) |
| `forward_message` | Forward an email with original attachments |
| `move_message` | Move a message to a different folder |
| `delete_message` | Move to Trash (or permanently delete if already in Trash) |
| `mark_message` | Set/unset read and flagged status |

## Usage Examples

Once configured, you can ask Claude things like:

- "Check my inbox for new emails"
- "Search for emails from alice@example.com about the project update"
- "Reply to that email saying I'll join the meeting"
- "Forward the latest report to bob@example.com"
- "Move all read emails older than a week to Archive"
- "Mark that email as unread"

## Security

**Local file attachments:** By default, attaching local files via `send_message` is disabled. To enable:

1. Set `ATTACHMENTS_DIR` to a specific directory — only files within that directory (after symlink resolution) can be attached
2. Or set `ALLOW_UNRESTRICTED_ATTACHMENTS=true` to attach files from any path

This restriction applies to local file paths passed to `send_message`. Forwarding emails (`forward_message`) re-attaches the original message's attachments from the mail server directly — no local file access is involved.

The server validates local attachment paths against directory traversal attacks by resolving symlinks and checking the real path is within the allowed directory.

**Credentials:** Use app-specific passwords where possible. Never commit credentials to version control — use environment variables or a secrets manager.

**Transport:** IMAP uses implicit TLS on port 993 (default) or plain connections on other ports. SMTP uses implicit TLS on port 465, or opportunistic STARTTLS on port 587 (default) — the server does not enforce TLS on 587, so ensure your provider supports STARTTLS.

## Development

```bash
# Start the server in development mode
npm run dev

# Run unit tests
npm test

# Run integration tests (requires Docker)
docker compose -f tests/integration/docker-compose.yml up -d
npm run test:integration
docker compose -f tests/integration/docker-compose.yml down

# Type check
npx tsc --noEmit
```

## Contributing

1. Fork the repository and create a feature branch
2. Make your changes and ensure tests pass (`npm test && npx tsc --noEmit`)
3. Add tests for new functionality
4. Submit a pull request targeting `main`

## License

MIT
