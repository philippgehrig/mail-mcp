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
