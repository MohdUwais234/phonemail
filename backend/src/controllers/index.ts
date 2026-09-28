import type { Request, Response } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import type { MailService } from "../emails/service.js";
import {
  authenticateWebhook,
  type InboundService,
} from "../webhooks/service.js";
const phone = z.object({ phoneNumber: z.string().max(30) });
const id = (r: Request) =>
  z
    .string()
    .regex(/^[1-9]\d{0,17}$/)
    .parse(r.params.id);
const folder = z.enum(["INBOX", "SENT", "DRAFTS", "TRASH"]);
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const compose = z.object({
  to: email,
  subject: z.string().max(998).default(""),
  body: z.string().max(100000).default(""),
  draftId: z
    .string()
    .regex(/^[1-9]\d{0,17}$/)
    .optional(),
});
const draft = compose.extend({
  to: z.union([email, z.literal("")]).default(""),
});
export class AuthController {
  constructor(private service: AuthService) {}
  request = async (r: Request, s: Response) => {
    s.json(await this.service.request(phone.parse(r.body).phoneNumber));
  };
  verify = async (r: Request, s: Response) => {
    const b = phone.extend({ code: z.string().regex(/^\d{6}$/) }).parse(r.body);
    s.json(await this.service.verify(b.phoneNumber, b.code));
  };
  me = async (r: Request, s: Response) => {
    s.json(await this.service.me(r.userId));
  };
  update = async (r: Request, s: Response) => {
    s.json(
      await this.service.update(
        r.userId,
        z.object({ display_name: z.string().max(80) }).parse(r.body)
          .display_name,
      ),
    );
  };
}
export class MailController {
  constructor(private service: MailService) {}
  list = async (r: Request, s: Response) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(r.query);
    s.json(
      await this.service.list(
        r.userId,
        folder.parse(r.params.folder ?? r.query.folder ?? "INBOX"),
        q.page,
        q.limit,
      ),
    );
  };
  get = async (r: Request, s: Response) => {
    s.json(await this.service.get(r.userId, id(r)));
  };
  send = async (r: Request, s: Response) => {
    s.status(201).json(
      await this.service.send(r.userId, compose.parse(r.body)),
    );
  };
  draft = async (r: Request, s: Response) => {
    s.status(201).json(await this.service.draft(r.userId, draft.parse(r.body)));
  };
  reply = async (r: Request, s: Response) => {
    s.status(201).json(
      await this.service.reply(
        r.userId,
        id(r),
        z.object({ body: z.string().min(1).max(100000) }).parse(r.body).body,
      ),
    );
  };
  read = async (r: Request, s: Response) => {
    s.json(
      await this.service.read(
        r.userId,
        id(r),
        z.object({ isRead: z.boolean().default(true) }).parse(r.body).isRead,
      ),
    );
  };
  remove = async (r: Request, s: Response) => {
    s.json(await this.service.remove(r.userId, id(r)));
  };
}
export class InboundController {
  constructor(private service: InboundService) {}
  ingest = async (r: Request, s: Response) => {
    authenticateWebhook(r.get("X-Webhook-Secret"));
    const data = z
      .object({
        from: email,
        fromName: z.string().max(100).optional(),
        to: email,
        subject: z.string().max(998),
        text: z.string().max(100000),
        messageId: z.string().min(1).max(998),
        inReplyTo: z.string().max(998).optional(),
      })
      .parse(r.body);
    s.json(await this.service.ingest(data));
  };
}
