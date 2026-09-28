import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Database } from "../db/index.js";
import type { OtpProvider } from "../auth/otp.js";
import { requireAuth } from "../middleware/auth.js";
import {
  AuthController,
  MailController,
  InboundController,
} from "../controllers/index.js";
import { AuthService } from "../auth/service.js";
import { MailService } from "../emails/service.js";
import { InboundService } from "../webhooks/service.js";
export function routes(db: Database, otp: OtpProvider, limits = true) {
  const r = Router();
  const a = new AuthController(new AuthService(db, otp));
  const m = new MailController(new MailService(db));
  const i = new InboundController(new InboundService(db));
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: () => !limits,
      message: {
        error: "OTP_RATE_LIMITED",
        message: "Too many attempts. Please try again in 15 minutes.",
      },
    });
  r.post("/auth/otp/request", limiter(5), a.request);
  r.post("/auth/otp/verify", limiter(20), a.verify);
  r.get("/auth/me", requireAuth, a.me);
  r.patch("/auth/me", requireAuth, a.update);
  r.use("/emails", requireAuth);
  r.get("/emails", m.list);
  r.get("/emails/folder/:folder", m.list);
  r.get("/emails/:id", m.get);
  r.post("/emails", m.send);
  r.post("/emails/draft", m.draft);
  r.post("/emails/:id/reply", m.reply);
  r.patch("/emails/:id/read", m.read);
  r.delete("/emails/:id", m.remove);
  r.post("/webhooks/inbound-email", i.ingest);
  return r;
}
