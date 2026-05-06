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
