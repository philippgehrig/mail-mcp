import { ImapFlow } from "imapflow";
import { Config } from "./config.js";
import {
  FolderInfo,
  MessageSummary,
  FullMessage,
  AttachmentContent,
} from "./types.js";

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

  async listMessages(
    _folder: string,
    _limit: number,
    _offset: number,
  ): Promise<MessageSummary[]> {
    throw new Error("Not implemented");
  }

  async searchMessages(
    _folder: string,
    _query: Record<string, unknown>,
  ): Promise<MessageSummary[]> {
    throw new Error("Not implemented");
  }

  async getMessage(_folder: string, _uid: number): Promise<FullMessage> {
    throw new Error("Not implemented");
  }

  async getAttachment(
    _folder: string,
    _uid: number,
    _partId: string,
  ): Promise<AttachmentContent> {
    throw new Error("Not implemented");
  }

  async moveMessage(
    _folder: string,
    _uid: number,
    _destination: string,
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async deleteMessage(_folder: string, _uid: number): Promise<void> {
    throw new Error("Not implemented");
  }

  async markMessage(
    _folder: string,
    _uid: number,
    _flags: { seen?: boolean; flagged?: boolean },
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async getTrashFolder(): Promise<string> {
    throw new Error("Not implemented");
  }

  getClient(): ImapFlow {
    return this.client;
  }
}
