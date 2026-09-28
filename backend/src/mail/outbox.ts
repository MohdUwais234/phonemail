import nodemailer from "nodemailer";
import type { Database } from "../db/index.js";
import { config } from "../config.js";
export interface MailTransport {
  sendMail(options: any): Promise<any>;
}
export function smtpTransport() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === "true",
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
}
export async function deliverOutbox(db: Database, transport: MailTransport) {
  return db.transaction(async (tx) => {
    const job = (
      await tx.query(
        `SELECT o.*,m.sender_address,m.sender_name,m.subject,m.body_text,m.message_id AS rfc_message_id,m.in_reply_to FROM mail_outbox o JOIN messages m ON m.id=o.message_id WHERE o.state='pending' AND o.next_attempt_at<=now() ORDER BY o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED`,
      )
    ).rows[0];
    if (!job) return false;
    try {
      await transport.sendMail({
        from: {
          name: job.sender_name || "PhoneMail",
          address: job.sender_address,
        },
        envelope: {
          from: config.SMTP_FROM.match(/<([^>]+)>/)?.[1] || config.SMTP_FROM,
          to: job.recipient,
        },
        to: job.recipient,
        subject: job.subject,
        text: job.body_text,
        messageId: job.rfc_message_id,
        inReplyTo: job.in_reply_to || undefined,
      });
      await tx.query(
        "UPDATE mail_outbox SET state='sent',attempts=attempts+1,last_error=NULL WHERE id=$1",
        [job.id],
      );
    } catch {
      await tx.query(
        `UPDATE mail_outbox SET attempts=attempts+1,state=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,next_attempt_at=now()+interval '1 minute'*power(2,attempts),last_error='SMTP delivery failed' WHERE id=$1`,
        [job.id],
      );
    }
    return true;
  });
}
