import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { testDatabase } from "./setup.js";
import { migrate } from "../src/db/migrations.js";
import { MailService } from "../src/emails/service.js";
import { InboundService } from "../src/webhooks/service.js";
import { deliverOutbox } from "../src/mail/outbox.js";
import { createApp } from "../src/app.js";
let env: Awaited<ReturnType<typeof testDatabase>>,
  mail: MailService,
  owner: string;
beforeAll(async () => {
  env = await testDatabase();
  mail = new MailService(env.db);
  owner = String(
    (
      await env.db.query(
        "INSERT INTO users(phone_number,email_address) VALUES('+915000000000','5000000000@phonemail.com') RETURNING id",
      )
    ).rows[0].id,
  );
}, 30000);
afterAll(async () => await env.close());
it("reruns numbered migrations without losing user data", async () => {
  await migrate(env.db);
  expect((await env.db.query("SELECT * FROM users")).rows).toHaveLength(1);
  expect(
    (await env.db.query("SELECT * FROM schema_migrations")).rows,
  ).toHaveLength(1);
});
it("keeps self-delivery copies and trash transitions consistent", async () => {
  const sent = await mail.send(owner, {
    to: "5000000000@phonemail.com",
    subject: "Note to self",
    body: "Keep this",
  });
  const inbox = (await mail.list(owner, "INBOX", 1, 20)).messages[0];
  await mail.remove(owner, sent.id);
  await mail.remove(owner, inbox.id);
  expect((await mail.list(owner, "TRASH", 1, 20)).total).toBe(1);
  await mail.remove(owner, inbox.id);
  expect((await mail.list(owner, "TRASH", 1, 20)).total).toBe(0);
});
it("keeps external failures durable and retryable rather than pretending they were sent", async () => {
  const sent = await mail.send(owner, {
    to: "fail@example.com",
    subject: "Retry me",
    body: "Persisted",
  });
  await deliverOutbox(env.db, {
    sendMail: async () => {
      throw new Error("secret SMTP details");
    },
  });
  const job = (
    await env.db.query("SELECT * FROM mail_outbox WHERE message_id=$1", [
      sent.logical_id,
    ])
  ).rows[0];
  expect(job.state).toBe("pending");
  expect(job.attempts).toBe(1);
  expect(job.last_error).not.toContain("secret");
  expect((await mail.get(owner, sent.id)).delivery_status).toBe("pending");
});
it("replies to inbound messages using the internet Message-ID", async () => {
  await new InboundService(env.db).ingest({
    from: "alice@example.com",
    to: "5000000000@phonemail.com",
    subject: "Internet thread",
    text: "Hi",
    messageId: "<original@external.example>",
  });
  const original = (await mail.list(owner, "INBOX", 1, 20)).messages[0];
  const reply = await mail.reply(owner, original.id, "Reply");
  expect(reply.in_reply_to).toBe("<original@external.example>");
  expect(reply.thread_id).toBe(original.thread_id);
});
it("does not leak private drafts in another mailbox", async () => {
  const other = String(
    (
      await env.db.query(
        "INSERT INTO users(phone_number,email_address) VALUES('+914000000000','4000000000@phonemail.com') RETURNING id",
      )
    ).rows[0].id,
  );
  const draft = await mail.draft(owner, {
    to: "",
    subject: "Private",
    body: "Only mine",
  });
  expect((await mail.list(other, "DRAFTS", 1, 20)).total).toBe(0);
  await expect(mail.get(other, draft.id)).rejects.toMatchObject({
    status: 404,
  });
});
it("rate limits OTP requests and rejects oversized or malformed JSON", async () => {
  let calls = 0;
  const app = createApp(env.db, {
    request: async () => {
      calls++;
    },
    verify: async () => false,
  });
  for (let i = 0; i < 5; i++)
    expect(
      (
        await request(app)
          .post("/auth/otp/request")
          .send({ phoneNumber: "9999999999" })
      ).status,
    ).toBe(200);
  const limited = await request(app)
    .post("/auth/otp/request")
    .send({ phoneNumber: "9999999999" });
  expect(limited.status).toBe(429);
  expect(limited.body.error).toBe("OTP_RATE_LIMITED");
  expect(calls).toBe(5);
  expect(
    (
      await request(app)
        .post("/auth/otp/verify")
        .set("Content-Type", "application/json")
        .send("{broken")
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post("/auth/otp/verify")
        .send({ x: "a".repeat(160000) })
    ).status,
  ).toBe(413);
});
