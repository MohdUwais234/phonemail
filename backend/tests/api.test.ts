import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { testDatabase } from "./setup.js";
import { createApp } from "../src/app.js";
import { DevOtpProvider } from "../src/auth/otp.js";
import { signToken } from "../src/auth/jwt.js";
import { config } from "../src/config.js";
import { deliverOutbox } from "../src/mail/outbox.js";
let env: Awaited<ReturnType<typeof testDatabase>>,
  app: ReturnType<typeof createApp>,
  logs: string[] = [],
  a: string,
  b: string,
  aid: string,
  bid: string;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => {
  env = await testDatabase();
  app = createApp(
    env.db,
    new DevOtpProvider(env.db, (s) => logs.push(s)),
    false,
  );
}, 30000);
afterAll(async () => {
  await env.close();
});
async function login(phone: string) {
  const r = await request(app)
    .post("/auth/otp/request")
    .send({ phoneNumber: phone });
  expect(r.status).toBe(200);
  expect(r.body).not.toHaveProperty("code");
  const code = logs.at(-1)!.match(/: (\d{6})/)![1];
  const stored = (
    await env.db.query("SELECT * FROM dev_otps WHERE phone_number=$1", [
      `+91${phone}`,
    ])
  ).rows[0];
  expect(stored.code_hash).not.toBe(code);
  expect(stored.code_hash.length).toBe(64);
  const v = await request(app)
    .post("/auth/otp/verify")
    .send({ phoneNumber: phone, code });
  expect(v.status).toBe(200);
  expect(
    (
      await request(app)
        .post("/auth/otp/verify")
        .send({ phoneNumber: phone, code })
    ).status,
  ).toBe(400);
  return v.body;
}
describe("authentication and mailbox integration", () => {
  it("health, authentication failures, invalid input", async () => {
    expect((await request(app).get("/health")).body.database).toBe("connected");
    expect((await request(app).get("/emails")).status).toBe(401);
    expect(
      (await request(app).get("/emails").set(auth("invalid"))).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/auth/otp/request")
          .send({ phoneNumber: "wrong" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/auth/otp/verify")
          .send({ phoneNumber: "1111111111", code: "000000" })
      ).body.error,
    ).toBe("INVALID_OTP");
  });
  it("creates users through hashed one-use OTPs and reads profiles", async () => {
    const one = await login("1111111111"),
      two = await login("2222222222");
    a = one.token;
    b = two.token;
    aid = one.user.id;
    bid = two.user.id;
    expect(one.user.email_address).toBe("1111111111@phonemail.com");
    expect((await request(app).get("/auth/me").set(auth(a))).body.id).toBe(aid);
    expect(
      (
        await request(app)
          .patch("/auth/me")
          .set(auth(a))
          .send({ display_name: "Alex" })
      ).body.display_name,
    ).toBe("Alex");
  });
  it("normalizes repeated signup without duplicate users", async () => {
    const r = await request(app)
      .post("/auth/otp/request")
      .send({ phoneNumber: "+911111111111" });
    expect(r.status).toBe(200);
    const code = logs.at(-1)!.match(/: (\d{6})/)![1];
    expect(
      (
        await request(app)
          .post("/auth/otp/verify")
          .send({ phoneNumber: "911111111111", code })
      ).body.user.id,
    ).toBe(aid);
  });
  it("rejects expired OTPs, enforces cooldown and attempt limits", async () => {
    await request(app)
      .post("/auth/otp/request")
      .send({ phoneNumber: "3333333333" });
    expect(
      (
        await request(app)
          .post("/auth/otp/request")
          .send({ phoneNumber: "3333333333" })
      ).status,
    ).toBe(429);
    const code = logs.at(-1)!.match(/: (\d{6})/)![1];
    await env.db.query(
      "UPDATE dev_otps SET expires_at=now()-interval '1 minute' WHERE phone_number=$1",
      ["+913333333333"],
    );
    expect(
      (
        await request(app)
          .post("/auth/otp/verify")
          .send({ phoneNumber: "3333333333", code })
      ).status,
    ).toBe(400);
    await request(app)
      .post("/auth/otp/request")
      .send({ phoneNumber: "4444444444" });
    const correct = logs.at(-1)!.match(/: (\d{6})/)![1];
    const wrong = correct === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      expect(
        (
          await request(app)
            .post("/auth/otp/verify")
            .send({ phoneNumber: "4444444444", code: wrong })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(app)
          .post("/auth/otp/verify")
          .send({ phoneNumber: "4444444444", code: correct })
      ).status,
    ).toBe(400);
  });
  let inbox: string, sent: string;
  it("delivers internally and ignores forged sender identity", async () => {
    const r = await request(app).post("/emails").set(auth(a)).send({
      to: "2222222222@phonemail.com",
      subject: "Hello",
      body: "A real message",
      from: "forged@example.com",
      userId: bid,
    });
    expect(r.status).toBe(201);
    expect(r.body.from).toBe("1111111111@phonemail.com");
    expect(r.body.delivery).toBe("delivered");
    sent = r.body.id;
    const list = (await request(app).get("/emails").set(auth(b))).body;
    expect(list.unread).toBe(1);
    inbox = list.messages[0].id;
    expect(list.messages[0].logical_id).toBe(r.body.logical_id);
    expect((await env.db.query("SELECT * FROM mail_outbox")).rows).toHaveLength(
      0,
    );
  });
  it("enforces ownership on every ID-based operation", async () => {
    expect(
      (await request(app).get(`/emails/${inbox}`).set(auth(a))).status,
    ).toBe(404);
    expect(
      (await request(app).delete(`/emails/${inbox}`).set(auth(a))).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/emails/${inbox}/read`)
          .set(auth(a))
          .send({ isRead: true })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/emails/${inbox}/reply`)
          .set(auth(a))
          .send({ body: "forged" })
      ).status,
    ).toBe(404);
  });
  it("marks read/unread and paginates with validated bounds", async () => {
    expect(
      (
        await request(app)
          .patch(`/emails/${inbox}/read`)
          .set(auth(b))
          .send({ isRead: true })
      ).body.is_read,
    ).toBe(true);
    expect((await request(app).get("/emails").set(auth(b))).body.unread).toBe(
      0,
    );
    expect(
      (
        await request(app)
          .patch(`/emails/${inbox}/read`)
          .set(auth(b))
          .send({ isRead: false })
      ).body.is_read,
    ).toBe(false);
    expect(
      (await request(app).get("/emails?page=2&limit=1").set(auth(b))).body
        .messages,
    ).toHaveLength(0);
    expect(
      (await request(app).get("/emails?limit=999").set(auth(b))).status,
    ).toBe(400);
    expect(
      (await request(app).get("/emails?folder=WRONG").set(auth(b))).status,
    ).toBe(400);
  });
  it("replies preserving the thread and reference", async () => {
    const original = (await request(app).get(`/emails/${inbox}`).set(auth(b)))
      .body;
    const r = await request(app)
      .post(`/emails/${inbox}/reply`)
      .set(auth(b))
      .send({ body: "Thanks!" });
    expect(r.status).toBe(201);
    expect(r.body.thread_id).toBe(original.thread_id);
    expect(r.body.in_reply_to).toBe(original.message_id);
  });
  it("creates, edits, protects, and sends drafts", async () => {
    const d = (
      await request(app)
        .post("/emails/draft")
        .set(auth(a))
        .send({ to: "", subject: "Work in progress", body: "" })
    ).body;
    expect(d.folder).toBe("DRAFTS");
    expect(
      (
        await request(app)
          .post("/emails/draft")
          .set(auth(b))
          .send({ draftId: d.id, to: "", body: "hack" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post("/emails")
          .set(auth(b))
          .send({ draftId: d.id, to: "1111111111@phonemail.com", body: "hack" })
      ).status,
    ).toBe(404);
    const updated = await request(app).post("/emails/draft").set(auth(a)).send({
      draftId: d.id,
      to: "2222222222@phonemail.com",
      subject: "Ready",
      body: "Saved",
    });
    expect(updated.body.id).toBe(d.id);
    expect(
      (
        await request(app).post("/emails").set(auth(a)).send({
          draftId: d.id,
          to: "2222222222@phonemail.com",
          subject: "Ready",
          body: "Saved",
        })
      ).body.folder,
    ).toBe("SENT");
    expect(
      (await request(app).get("/emails/folder/DRAFTS").set(auth(a))).body.total,
    ).toBe(0);
  });
  it("trashes then permanently removes only the owner copy", async () => {
    expect(
      (await request(app).delete(`/emails/${inbox}`).set(auth(b))).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/emails/${inbox}`).set(auth(b))).body.folder,
    ).toBe("TRASH");
    await request(app).delete(`/emails/${inbox}`).set(auth(b));
    expect(
      (await request(app).get(`/emails/${inbox}`).set(auth(b))).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/emails/${sent}`).set(auth(a))).status,
    ).toBe(200);
  });
  it("queues external mail durably and processes it through a transport", async () => {
    const r = await request(app)
      .post("/emails")
      .set(auth(a))
      .send({ to: "to@example.com", subject: "External", body: "SMTP test" });
    expect(r.body.delivery).toBe("queued");
    const mails: any[] = [];
    await deliverOutbox(env.db, { sendMail: async (m) => mails.push(m) });
    expect(mails[0].to).toBe("to@example.com");
    expect(mails[0].text).toBe("SMTP test");
    expect(
      (
        await env.db.query(
          "SELECT state FROM mail_outbox WHERE message_id=$1",
          [r.body.logical_id],
        )
      ).rows[0].state,
    ).toBe("sent");
  });
  it("authenticates and deduplicates inbound email", async () => {
    const data = {
      from: "alice@example.com",
      fromName: "Alice",
      to: "2222222222@phonemail.com",
      subject: "Inbound",
      text: "From the internet",
      messageId: "unique-inbound@example.com",
    };
    expect(
      (await request(app).post("/webhooks/inbound-email").send(data)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/webhooks/inbound-email")
          .set("X-Webhook-Secret", "wrong")
          .send(data)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/webhooks/inbound-email")
          .set("X-Webhook-Secret", config.INBOUND_WEBHOOK_SECRET)
          .send(data)
      ).body.duplicate,
    ).toBe(false);
    expect(
      (
        await request(app)
          .post("/webhooks/inbound-email")
          .set("X-Webhook-Secret", config.INBOUND_WEBHOOK_SECRET)
          .send(data)
      ).body.duplicate,
    ).toBe(true);
    expect(
      (await request(app).get("/emails").set(auth(b))).body.messages.some(
        (m: any) => m.external_message_id === data.messageId,
      ),
    ).toBe(true);
  });
  it("rejects nonexistent internal recipients and malformed mail", async () => {
    expect(
      (
        await request(app)
          .post("/emails")
          .set(auth(a))
          .send({ to: "9999999999@phonemail.com", body: "test" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post("/emails")
          .set(auth(a))
          .send({ to: "not-an-email" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get("/auth/me")
          .set(auth(signToken("999999")))
      ).status,
    ).toBe(401);
  });
});
