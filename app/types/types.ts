// Type definitions for Gmail API responses

export interface GmailHeader {
    name: string;
    value: string;
  }
  
  export interface GmailAttachment {
    filename: string;
    mimeType: string;
    attachmentId: string;
    size: number;
    data?: string;
    dataUrl?: string;
  }
  
  export interface GmailMessagePartBody {
    attachmentId?: string;
    size?: number;
    data?: string;
  }
  
  export interface GmailMessagePart {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: GmailHeader[];
    body: GmailMessagePartBody;
    parts?: GmailMessagePart[];
  }
  
  export interface GmailMessage {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    historyId: string;
    internalDate: string;
    payload: GmailMessagePart;
    sizeEstimate: number;
    raw?: string;
  }