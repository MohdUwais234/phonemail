import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "../db/index.js";
import { config } from "../config.js";
import { AppError } from "../errors.js";
export interface Inbound {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
}
export function authenticateWebhook(secret: string | undefined) {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (
    !secret ||
    !timingSafeEqual(hash(secret), hash(config.INBOUND_WEBHOOK_SECRET))
  )
    throw new AppError(401, "UNAUTHORIZED", "Invalid webhook credentials.");
}
export class InboundService {
  constructor(private db: Database) {}
  async ingest(data: Inbound) {
    return this.db.transaction(async (tx) => {
      const recipient = data.to.toLowerCase().trim();
      const user = (
        await tx.query("SELECT id FROM users WHERE email_address=$1", [
          recipient,
        ])
      ).rows[0];
      if (!user)
        throw new AppError(404, "EMAIL_NOT_FOUND", "Recipient not found.");
      const receipt = await tx.query(
        "INSERT INTO inbound_receipts(external_message_id,recipient_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING recipient_user_id",
        [data.messageId, user.id],
      );
      if (!receipt.rows.length)
        return { message: "Already ingested.", duplicate: true };
      const id = randomUUID();
      // Trust thread references only if the recipient already owns the referenced message.
      const original = data.inReplyTo
        ? (
            await tx.query(
              `SELECT m.thread_id FROM messages m JOIN mailbox_entries e ON e.message_id=m.id WHERE (m.message_id=$1 OR m.external_message_id=$1) AND e.owner_user_id=$2 LIMIT 1`,
              [data.inReplyTo, user.id],
            )
          ).rows[0]
        : null;
      await tx.query(
        `INSERT INTO messages(id,sender_address,sender_name,subject,body_text,message_id,external_message_id,in_reply_to,thread_id,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
        [
          id,
          data.from,
          data.fromName ?? null,
          data.subject,
          data.text,
          `<${id}@${config.PHONEMAIL_DOMAIN}>`,
          data.messageId,
          data.inReplyTo ?? null,
          original?.thread_id ?? id,
        ],
      );
      await tx.query(
        "INSERT INTO message_recipients(message_id,address,recipient_user_id) VALUES($1,$2,$3)",
        [id, recipient, user.id],
      );
      await tx.query(
        "INSERT INTO mailbox_entries(message_id,owner_user_id,folder) VALUES($1,$2,'INBOX')",
        [id, user.id],
      );
      return { message: "Email received.", duplicate: false };
    });
  }
}
