import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { smtpTransport, deliverOutbox } from "../src/mail/outbox.js";
import { MailService } from "../src/emails/service.js";
import { testDatabase } from "./setup.js";
it.skipIf(!process.env.SMTP_TEST_URL)(
  "delivers the transactional outbox over SMTP into MailHog",
  async () => {
    const env = await testDatabase(),
      transport = smtpTransport();
    try {
      const user = (
        await env.db.query(
          "INSERT INTO users(phone_number,email_address) VALUES('+916000000000','6000000000@phonemail.com') RETURNING id",
        )
      ).rows[0];
      const marker = `SMTP acceptance ${randomUUID()}`;
      const sent = await new MailService(env.db).send(String(user.id), {
        to: "to@example.com",
        subject: marker,
        body: "Delivered through the real SMTP protocol.",
      });
      expect(sent.delivery).toBe("queued");
      await deliverOutbox(env.db, transport);
      const jobs = (await env.db.query("SELECT state FROM mail_outbox")).rows;
      expect(jobs[0].state).toBe("sent");
      const result = await fetch(
        `${process.env.SMTP_TEST_URL}/api/v2/messages`,
      );
      const inbox = (await result.json()) as any;
      expect(
        inbox.items.some((m: any) =>
          m.Content.Headers.Subject.includes(marker),
        ),
      ).toBe(true);
    } finally {
      transport.close();
      await env.close();
    }
  },
  30000,
);
