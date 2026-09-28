import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import type { Database } from "./db/index.js";
import type { OtpProvider } from "./auth/otp.js";
import { twilioConfigurationIssues } from "./auth/twilio-client.js";
import { routes } from "./routes/index.js";
export function createApp(db: Database, otp: OtpProvider, limits = true) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS.split(",").map((s) => s.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "150kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: () => !limits,
      message: {
        error: "RATE_LIMITED",
        message: "Too many requests. Please wait a minute.",
      },
    }),
  );
  app.get("/health", async (_r, s) => {
    try {
      await db.query("SELECT 1");
      s.json({ status: "ok", database: "connected" });
    } catch {
      s.status(503).json({ status: "unavailable", database: "disconnected" });
    }
  });
  app.get("/health/integrations", (_r, s) => {
    s.json({
      otp: {
        provider: config.OTP_PROVIDER,
        configured:
          config.OTP_PROVIDER === "dev" ||
          twilioConfigurationIssues().length === 0,
      },
      smtp: { configured: Boolean(config.SMTP_HOST) },
      inbound: { configured: Boolean(config.INBOUND_WEBHOOK_SECRET) },
    });
  });
  app.use(routes(db, otp, limits));
  app.use((_r, _s, next) =>
    next(new AppError(404, "NOT_FOUND", "Endpoint not found.")),
  );
  const errorHandler: ErrorRequestHandler = (e, _r, s, _next) => {
    if (e instanceof ZodError) {
      s.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Check the request fields.",
        fields: e.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    if (e instanceof AppError) {
      s.status(e.status).json({ error: e.code, message: e.message });
      return;
    }
    if (e.type === "entity.too.large" || e.type === "entity.parse.failed") {
      s.status(e.type === "entity.too.large" ? 413 : 400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid or oversized JSON body.",
      });
      return;
    }
    console.error("Request failed", { name: e.name, code: e.code });
    s.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    });
  };
  app.use(errorHandler);
  return app;
}
