export interface User {
  id: string;
  phone_number: string;
  email_address: string;
  display_name: string | null;
}
export type Folder = "INBOX" | "SENT" | "DRAFTS" | "TRASH";
export interface Email {
  id: string;
  logical_id: string;
  folder: Folder;
  is_read: boolean;
  from: string;
  fromName: string | null;
  to: string;
  subject: string;
  body: string;
  received_at: string;
  created_at: string;
  message_id: string;
  external_message_id: string | null;
  thread_id: string;
  delivery?: "queued" | "delivered" | "draft";
}
export interface MailPage {
  messages: Email[];
  page: number;
  limit: number;
  total: number;
  unread: number;
}
export interface ComposeData {
  to: string;
  subject: string;
  body: string;
  draftId?: string;
}
