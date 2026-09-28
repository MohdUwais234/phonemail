import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  OTP_PROVIDER: z.enum(["twilio", "dev"]).default("twilio"),
  DEV_OTP_LOG: z.string().default("false"),
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_VERIFY_SERVICE_SID: z.string().default(""),
  SMTP_HOST: z.string().default("mailhog"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("PhoneMail <no-reply@phonemail.com>"),
  SMTP_SECURE: z.string().default("false"),
  INBOUND_WEBHOOK_SECRET: z.string().min(32),
  PHONEMAIL_DOMAIN: z.string().default("phonemail.com"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,https://localhost,http://localhost"),
});
export const config = schema.parse(process.env);
if (
  config.NODE_ENV === "production" &&
  (config.OTP_PROVIDER === "dev" ||
    config.JWT_SECRET.startsWith("replace-") ||
    config.INBOUND_WEBHOOK_SECRET.startsWith("replace-"))
)
  throw new Error("Unsafe production configuration");
