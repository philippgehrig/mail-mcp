import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Config } from "./config.js";
import {
  FolderInfo,
  MessageSummary,
  FullMessage,
  AttachmentContent,
  AttachmentInfo,
} from "./types.js";

export class ImapClient {
  private client: ImapFlow;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = this.createClient();
  }

  private createClient(): ImapFlow {
    const client = new ImapFlow({
      host: this.config.imap.host,
      port: this.config.imap.port,
      secure: this.config.imap.port === 993,
      auth: {
        user: this.config.auth.user,
        pass: this.config.auth.pass,
      },
      logger: false,
      disableCompression: true,
      tls: {
        rejectUnauthorized: this.config.tlsRejectUnauthorized,
      },
    });

    client.on("error", (err: Error) => {
      console.error(`IMAP connection error: ${err.message}`);
    });

    return client;
  }

  async connect(): Promise<void> {
    await this.connectWithRetry();
    console.error(`Connected to IMAP: ${this.config.imap.host}`);
  }

  async reconnect(): Promise<void> {
    try {
      this.client.close();
    } catch {
      // ignore close errors on dead connections
    }
    this.client = this.createClient();
    await this.connectWithRetry();
    console.error(`Reconnected to IMAP: ${this.config.imap.host}`);
  }

  private async connectWithRetry(): Promise<void> {
    const maxAttempts = 3;
    const baseDelay = 1000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.client.connect();
        return;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.error(`Connection attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        this.client = this.createClient();
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.client.logout();
  }

  private isConnectionError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const code = (err as { code?: string }).code;
    if (code === "ETIMEOUT" || code === "NoConnection" || code === "EConnectionClosed") {
      return true;
    }
    const msg = err.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("closed") ||
      msg.includes("disconnected") || msg.includes("not connected") ||
      msg.includes("not available");
  }

  private async withReconnect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (this.isConnectionError(err)) {
        console.error("Connection lost, reconnecting...");
        await this.reconnect();
        return await operation();
      }
      throw err;
    }
  }

  async listFolders(): Promise<FolderInfo[]> {
    return this.withReconnect(async () => {
      const list = await this.client.list({ statusQuery: { messages: true } });
      return list.map((folder) => ({
        name: folder.name,
        path: folder.path,
        delimiter: folder.delimiter || "/",
        count: folder.status?.messages ?? 0,
      }));
    });
  }

  async listMessages(
    folder: string,
    limit: number,
    offset: number,
  ): Promise<MessageSummary[]> {
    return this.withReconnect(async () => {
      const safeLimit = Math.max(1, limit);
      const safeOffset = Math.max(0, offset);

      const lock = await this.client.getMailboxLock(folder);
      try {
        const mailbox = this.client.mailbox;
        const total = mailbox ? mailbox.exists : 0;
        if (total === 0) return [];

        // Use UID-based pagination: search all UIDs, sort descending, slice
        const allUids = await this.client.search({ all: true }, { uid: true });
        if (!allUids || allUids.length === 0) return [];

        // Sort descending (newest first) and paginate
        allUids.sort((a, b) => b - a);
        const paged = allUids.slice(safeOffset, safeOffset + safeLimit);
        if (paged.length === 0) return [];

        const uidRange = paged.join(",");
        const messages: MessageSummary[] = [];

        for await (const msg of this.client.fetch(uidRange, {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
        }, { uid: true })) {
          const envelope = msg.envelope;
          const from = envelope?.from?.[0];
          const to = envelope?.to?.[0];
          messages.push({
            uid: msg.uid,
            subject: envelope?.subject || "",
            from: from ? (from.name ? `${from.name} <${from.address}>` : from.address || "") : "",
            to: to ? (to.name ? `${to.name} <${to.address}>` : to.address || "") : "",
            date: envelope?.date?.toISOString() || "",
            flags: Array.from(msg.flags || []),
            hasAttachments: this.hasAttachments(msg.bodyStructure),
          });
        }

        // Sort by UID descending (newest first)
        messages.sort((a, b) => b.uid - a.uid);
        return messages;
      } finally {
        lock.release();
      }
    });
  }

  async searchMessages(
    folder: string,
    query: Record<string, unknown>,
  ): Promise<MessageSummary[]> {
    return this.withReconnect(async () => {
      const lock = await this.client.getMailboxLock(folder);
      try {
        // Translate query fields to imapflow SearchObject
        const criteria: Record<string, unknown> = {};

        if (query.from) criteria.from = query.from as string;
        if (query.to) criteria.to = query.to as string;
        if (query.subject) criteria.subject = query.subject as string;
        if (query.body) criteria.body = query.body as string;
        if (query.since) criteria.since = new Date(query.since as string);
        if (query.before) criteria.before = new Date(query.before as string);
        if (query.flagged !== undefined) criteria.flagged = query.flagged as boolean;
        if (query.unseen !== undefined) criteria.seen = !(query.unseen as boolean);
        if (query.keyword) criteria.keyword = query.keyword as string;
        if (query.withoutKeyword) criteria.unkeyword = query.withoutKeyword as string;

        const uids = await this.client.search(criteria, { uid: true });
        if (!uids || uids.length === 0) return [];

        const uidRange = uids.join(",");
        const messages: MessageSummary[] = [];

        for await (const msg of this.client.fetch(uidRange, {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
        }, { uid: true })) {
          const envelope = msg.envelope;
          const from = envelope?.from?.[0];
          const to = envelope?.to?.[0];
          messages.push({
            uid: msg.uid,
            subject: envelope?.subject || "",
            from: from ? (from.name ? `${from.name} <${from.address}>` : from.address || "") : "",
            to: to ? (to.name ? `${to.name} <${to.address}>` : to.address || "") : "",
            date: envelope?.date?.toISOString() || "",
            flags: Array.from(msg.flags || []),
            hasAttachments: this.hasAttachments(msg.bodyStructure),
          });
        }

        // Return newest first
        messages.reverse();
        return messages;
      } finally {
        lock.release();
      }
    });
  }

  async getMessage(folder: string, uid: number): Promise<FullMessage> {
    return this.withReconnect(async () => {
    const lock = await this.client.getMailboxLock(folder);
    try {
      // Get flags and bodyStructure first
      let flags: string[] = [];
      let bodyStructure: unknown = null;
      for await (const msg of this.client.fetch(uid.toString(), {
        uid: true,
        flags: true,
        bodyStructure: true,
      }, { uid: true })) {
        flags = Array.from(msg.flags || []);
        bodyStructure = msg.bodyStructure;
      }

      // Download full message
      const { content } = await this.client.download(uid.toString(), undefined, { uid: true });

      // Collect stream into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawMessage = Buffer.concat(chunks);

      // Parse with simpleParser
      const parsed = await simpleParser(rawMessage);

      // Body: prefer plain text, fall back to HTML stripped of tags
      let body = "";
      if (parsed.text) {
        body = parsed.text;
      } else if (parsed.html) {
        body = parsed.html.replace(/<[^>]*>/g, "");
      }

      // Build from string
      const from = parsed.from?.value?.[0];
      const fromStr = from
        ? (from.name ? `${from.name} <${from.address}>` : from.address || "")
        : "";

      // Build to string
      const toAddrs = parsed.to;
      let toStr = "";
      if (toAddrs) {
        const toArray = Array.isArray(toAddrs) ? toAddrs : [toAddrs];
        toStr = toArray
          .flatMap((addr) => addr.value)
          .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address || ""))
          .join(", ");
      }

      // Build cc string
      const ccAddrs = parsed.cc;
      let ccStr = "";
      if (ccAddrs) {
        const ccArray = Array.isArray(ccAddrs) ? ccAddrs : [ccAddrs];
        ccStr = ccArray
          .flatMap((addr) => addr.value)
          .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address || ""))
          .join(", ");
      }

      // Build attachments list with MIME part IDs from bodyStructure
      const partIds = this.extractAttachmentPartIds(bodyStructure);
      const attachments: AttachmentInfo[] = (parsed.attachments || []).map((att, idx) => ({
        filename: att.filename || "unnamed",
        size: att.size,
        contentType: att.contentType || "application/octet-stream",
        partId: partIds[idx] || String(idx + 1),
      }));

      // References
      let references: string[] = [];
      if (parsed.references) {
        references = Array.isArray(parsed.references)
          ? parsed.references
          : [parsed.references];
      }

      return {
        uid,
        subject: parsed.subject || "",
        from: fromStr,
        to: toStr,
        cc: ccStr,
        date: parsed.date?.toISOString() || "",
        flags,
        body,
        attachments,
        messageId: parsed.messageId || "",
        inReplyTo: parsed.inReplyTo || null,
        references,
      };
    } finally {
      lock.release();
    }
    });
  }

  async getAttachment(
    folder: string,
    uid: number,
    partId: string,
  ): Promise<AttachmentContent> {
    return this.withReconnect(async () => {
      const lock = await this.client.getMailboxLock(folder);
      try {
        const { content, meta } = await this.client.download(uid.toString(), partId, { uid: true });

        // Collect stream into buffer
        const chunks: Buffer[] = [];
        for await (const chunk of content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const data = Buffer.concat(chunks);

        return {
          filename: meta.filename || "unnamed",
          contentType: meta.contentType || "application/octet-stream",
          content: data.toString("base64"),
        };
      } finally {
        lock.release();
      }
    });
  }

  async moveMessage(
    folder: string,
    uid: number,
    destination: string,
  ): Promise<void> {
    return this.withReconnect(async () => {
      await this.ensureFolderExists(destination);
      const lock = await this.client.getMailboxLock(folder);
      try {
        await this.client.messageMove(uid.toString(), destination, { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  async deleteMessage(folder: string, uid: number): Promise<void> {
    return this.withReconnect(async () => {
      const trashFolder = await this.getTrashFolder();
      const isInTrash = folder.toLowerCase() === trashFolder.toLowerCase() || folder === trashFolder;

      if (isInTrash) {
        const lock = await this.client.getMailboxLock(folder);
        try {
          await this.client.messageDelete(uid.toString(), { uid: true });
        } finally {
          lock.release();
        }
      } else {
        await this.ensureFolderExists(trashFolder);
        // Call moveMessage internals directly to avoid double-reconnect
        await this.ensureFolderExists(trashFolder);
        const lock = await this.client.getMailboxLock(folder);
        try {
          await this.client.messageMove(uid.toString(), trashFolder, { uid: true });
        } finally {
          lock.release();
        }
      }
    });
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    const folders = await this.client.list();
    const exists = folders.some((f) => f.path === folderPath);
    if (!exists) {
      await this.client.mailboxCreate(folderPath);
    }
  }

  async markMessage(
    folder: string,
    uid: number,
    flags: { seen?: boolean; flagged?: boolean },
  ): Promise<void> {
    return this.withReconnect(async () => {
      const lock = await this.client.getMailboxLock(folder);
      try {
        if (flags.seen === true) {
          await this.client.messageFlagsAdd(uid.toString(), ["\\Seen"], { uid: true });
        } else if (flags.seen === false) {
          await this.client.messageFlagsRemove(uid.toString(), ["\\Seen"], { uid: true });
        }

        if (flags.flagged === true) {
          await this.client.messageFlagsAdd(uid.toString(), ["\\Flagged"], { uid: true });
        } else if (flags.flagged === false) {
          await this.client.messageFlagsRemove(uid.toString(), ["\\Flagged"], { uid: true });
        }
      } finally {
        lock.release();
      }
    });
  }

  async addKeyword(folder: string, uid: number, keyword: string): Promise<void> {
    return this.withReconnect(async () => {
      const lock = await this.client.getMailboxLock(folder);
      try {
        await this.client.messageFlagsAdd(uid.toString(), [keyword], { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  async removeKeyword(folder: string, uid: number, keyword: string): Promise<void> {
    return this.withReconnect(async () => {
      const lock = await this.client.getMailboxLock(folder);
      try {
        await this.client.messageFlagsRemove(uid.toString(), [keyword], { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  async getTrashFolder(): Promise<string> {
    // 1. Check config first
    if (this.config.trashFolder) {
      return this.config.trashFolder;
    }

    // 2. Look for SPECIAL-USE \Trash
    const list = await this.client.list();
    for (const folder of list) {
      if (folder.specialUse === "\\Trash") {
        return folder.path;
      }
    }

    // 3. Check common names
    const commonNames = ["Trash", "Deleted", "Deleted Items", "Deleted Messages"];
    const paths = list.map((f) => f.path);
    for (const name of commonNames) {
      if (paths.includes(name)) {
        return name;
      }
    }

    // 4. Fallback
    return "Trash";
  }

  private extractAttachmentPartIds(structure: unknown, prefix = ""): string[] {
    const partIds: string[] = [];
    if (!structure || typeof structure !== "object") return partIds;

    const s = structure as Record<string, unknown>;

    if (s.disposition === "attachment") {
      partIds.push(s.part as string || prefix || "1");
    }

    if (Array.isArray(s.childNodes)) {
      for (let i = 0; i < s.childNodes.length; i++) {
        const childPrefix = prefix ? `${prefix}.${i + 1}` : String(i + 1);
        const child = s.childNodes[i] as Record<string, unknown>;
        const childPart = (child.part as string) || childPrefix;
        if (child.disposition === "attachment") {
          partIds.push(childPart);
        } else {
          partIds.push(...this.extractAttachmentPartIds(child, childPrefix));
        }
      }
    }

    return partIds;
  }

  private hasAttachments(structure: unknown): boolean {
    if (!structure || typeof structure !== "object") return false;

    const s = structure as Record<string, unknown>;

    // Check if this part is an attachment
    if (s.disposition === "attachment") return true;

    // Check child parts
    if (Array.isArray(s.childNodes)) {
      for (const child of s.childNodes) {
        if (this.hasAttachments(child)) return true;
      }
    }

    return false;
  }

  getClient(): ImapFlow {
    return this.client;
  }
}
