import { randomUUID } from "node:crypto";
import type { Database, Queryable } from "../db/index.js";
import { config } from "../config.js";
import { AppError } from "../errors.js";
export type Folder = "INBOX" | "SENT" | "DRAFTS" | "TRASH";
export interface Compose {
  to: string;
  subject: string;
  body: string;
  draftId?: string;
}
const select = `SELECT e.id,e.folder,e.is_read,e.received_at,e.deleted_at,m.*,e.id::text AS id,
 (SELECT address FROM message_recipients r WHERE r.message_id=m.id ORDER BY r.id LIMIT 1) AS "to",
 m.id AS logical_id, m.body_text AS body, m.sender_address AS "from", m.sender_name AS "fromName",
 (SELECT state FROM mail_outbox o WHERE o.message_id=m.id LIMIT 1) AS delivery_status
 FROM mailbox_entries e JOIN messages m ON m.id=e.message_id`;
export class MailService {
  constructor(private db: Database) {}
  async list(owner: string, folder: Folder, page: number, limit: number) {
    const counts = (
      await this.db.query(
        `SELECT count(*) AS total, count(*) FILTER (WHERE NOT is_read) AS unread FROM mailbox_entries WHERE owner_user_id=$1 AND folder=$2`,
        [owner, folder],
      )
    ).rows[0];
    const rows = await this.db.query(
      `${select} WHERE e.owner_user_id=$1 AND e.folder=$2 ORDER BY e.received_at DESC,e.id DESC LIMIT $3 OFFSET $4`,
      [owner, folder, limit, (page - 1) * limit],
    );
    return {
      messages: rows.rows,
      page,
      limit,
      total: Number(counts.total),
      unread: Number(counts.unread),
    };
  }
  async get(owner: string, id: string, tx: Queryable = this.db) {
    const m = (
      await tx.query(`${select} WHERE e.id=$1 AND e.owner_user_id=$2`, [
        id,
        owner,
      ])
    ).rows[0];
    if (!m)
      throw new AppError(
        404,
        "MESSAGE_NOT_FOUND",
        "This message is not in your mailbox.",
      );
    return m;
  }
  private async lock(owner: string, id: string, tx: Queryable) {
    const r = await tx.query(
      "SELECT id FROM mailbox_entries WHERE id=$1 AND owner_user_id=$2 FOR UPDATE",
      [id, owner],
    );
    if (!r.rows.length)
      throw new AppError(
        404,
        "MESSAGE_NOT_FOUND",
        "This message is not in your mailbox.",
      );
    return this.get(owner, id, tx);
  }
  private async write(
    tx: Queryable,
    owner: string,
    input: Compose,
    draft: boolean,
    original?: any,
  ) {
    const user = (await tx.query("SELECT * FROM users WHERE id=$1", [owner]))
      .rows[0];
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Account not found.");
    const recipient = input.to.trim().toLowerCase();
    let target: any;
    if (!draft && recipient.split("@")[1] === config.PHONEMAIL_DOMAIN) {
      target = (
        await tx.query("SELECT id FROM users WHERE email_address=$1", [
          recipient,
        ])
      ).rows[0];
      if (!target)
        throw new AppError(
          404,
          "EMAIL_NOT_FOUND",
          "That PhoneMail address does not exist yet.",
        );
    }
    let previous: any;
    if (input.draftId) {
      previous = await this.lock(owner, input.draftId, tx);
      if (previous.folder !== "DRAFTS")
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Only drafts can be edited or sent.",
        );
    }
    const id = previous?.logical_id ?? randomUUID();
    const thread = previous?.thread_id ?? original?.thread_id ?? id;
    const replyTo =
      previous?.in_reply_to ??
      original?.external_message_id ??
      original?.message_id ??
      null;
    if (previous) {
      await tx.query(
        "UPDATE messages SET subject=$2,body_text=$3,sent_at=$4 WHERE id=$1",
        [id, input.subject, input.body, draft ? null : new Date()],
      );
      await tx.query("DELETE FROM message_recipients WHERE message_id=$1", [
        id,
      ]);
    } else {
      await tx.query(
        `INSERT INTO messages(id,sender_user_id,sender_address,sender_name,subject,body_text,message_id,in_reply_to,thread_id,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          owner,
          user.email_address,
          user.display_name,
          input.subject,
          input.body,
          `<${id}@${config.PHONEMAIL_DOMAIN}>`,
          replyTo,
          thread,
          draft ? null : new Date(),
        ],
      );
    }
    await tx.query(
      "INSERT INTO message_recipients(message_id,address,recipient_user_id) VALUES($1,$2,$3)",
      [id, recipient, target?.id ?? null],
    );
    let entryId = previous?.id;
    if (previous)
      await tx.query(
        "UPDATE mailbox_entries SET folder=$3,is_read=true,received_at=now() WHERE id=$1 AND owner_user_id=$2",
        [entryId, owner, draft ? "DRAFTS" : "SENT"],
      );
    else
      entryId = (
        await tx.query(
          "INSERT INTO mailbox_entries(message_id,owner_user_id,folder,is_read) VALUES($1,$2,$3,true) RETURNING id",
          [id, owner, draft ? "DRAFTS" : "SENT"],
        )
      ).rows[0].id;
    if (!draft && target)
      await tx.query(
        "INSERT INTO mailbox_entries(message_id,owner_user_id,folder) VALUES($1,$2,'INBOX')",
        [id, target.id],
      );
    if (!draft && !target)
      await tx.query(
        "INSERT INTO mail_outbox(message_id,recipient) VALUES($1,$2)",
        [id, recipient],
      );
    return {
      ...(await this.get(owner, String(entryId), tx)),
      delivery: draft ? "draft" : target ? "delivered" : "queued",
    };
  }
  async send(owner: string, input: Compose) {
    return this.db.transaction((tx) => this.write(tx, owner, input, false));
  }
  async draft(owner: string, input: Compose) {
    return this.db.transaction((tx) => this.write(tx, owner, input, true));
  }
  async reply(owner: string, id: string, body: string) {
    return this.db.transaction(async (tx) => {
      const original = await this.lock(owner, id, tx);
      if (original.folder === "DRAFTS")
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Send the draft before replying.",
        );
      const user = (
        await tx.query("SELECT email_address FROM users WHERE id=$1", [owner])
      ).rows[0];
      return this.write(
        tx,
        owner,
        {
          to:
            original.from === user.email_address ? original.to : original.from,
          subject: /^re:/i.test(original.subject)
            ? original.subject
            : `Re: ${original.subject}`,
          body,
        },
        false,
        original,
      );
    });
  }
  async read(owner: string, id: string, isRead: boolean) {
    const row = (
      await this.db.query(
        "UPDATE mailbox_entries SET is_read=$3 WHERE id=$1 AND owner_user_id=$2 RETURNING id",
        [id, owner, isRead],
      )
    ).rows[0];
    if (!row)
      throw new AppError(
        404,
        "MESSAGE_NOT_FOUND",
        "This message is not in your mailbox.",
      );
    return this.get(owner, id);
  }
  async remove(owner: string, id: string) {
    return this.db.transaction(async (tx) => {
      const m = await this.lock(owner, id, tx);
      if (m.folder === "TRASH") {
        await tx.query(
          "DELETE FROM mailbox_entries WHERE id=$1 AND owner_user_id=$2",
          [id, owner],
        );
        // Shared content is removed only when no mailbox or pending SMTP delivery still needs it.
        await tx.query(
          `DELETE FROM messages WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM mailbox_entries WHERE message_id=$1) AND NOT EXISTS(SELECT 1 FROM mail_outbox WHERE message_id=$1)`,
          [m.logical_id],
        );
      } else {
        // Self-addressed mail can have both SENT and INBOX copies; merge duplicate trash entries.
        await tx.query(
          "DELETE FROM mailbox_entries WHERE message_id=$1 AND owner_user_id=$2 AND folder='TRASH'",
          [m.logical_id, owner],
        );
        await tx.query(
          "UPDATE mailbox_entries SET folder='TRASH',deleted_at=now() WHERE id=$1 AND owner_user_id=$2",
          [id, owner],
        );
      }
      return {
        message:
          m.folder === "TRASH"
            ? "Message permanently removed from your mailbox."
            : "Message moved to trash.",
      };
    });
  }
}
