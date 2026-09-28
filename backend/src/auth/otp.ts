import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import twilio from "twilio";
import { config } from "../config.js";
import type { Database } from "../db/index.js";
import { AppError } from "../errors.js";
export interface OtpProvider {
  request(phone: string): Promise<void>;
  verify(phone: string, code: string): Promise<boolean>;
}
export class DevOtpProvider implements OtpProvider {
  constructor(
    private db: Database,
    private logger: (text: string) => void = console.info,
  ) {
    if (config.NODE_ENV === "production")
      throw new Error("Development OTP forbidden in production");
  }
  private hash(phone: string, code: string) {
    return createHmac("sha256", config.JWT_SECRET)
      .update(`${phone}:${code}`)
      .digest("hex");
  }
  async request(phone: string) {
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const r = await this.db.query(
      `INSERT INTO dev_otps(phone_number,code_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT(phone_number) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0, requested_at=now() WHERE dev_otps.requested_at < now()-interval '60 seconds' RETURNING phone_number`,
      [phone, this.hash(phone, code)],
    );
    if (!r.rows.length)
      throw new AppError(
        429,
        "OTP_RATE_LIMITED",
        "Wait 60 seconds before requesting another code.",
      );
    if (config.DEV_OTP_LOG === "true")
      this.logger(`[DEV OTP] ${phone}: ${code} (expires in 5 minutes)`);
  }
  async verify(phone: string, code: string) {
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "SELECT * FROM dev_otps WHERE phone_number=$1 FOR UPDATE",
          [phone],
        )
      ).rows[0];
      if (
        !row ||
        new Date(row.expires_at).getTime() <= Date.now() ||
        row.attempts >= 5
      )
        return false;
      await tx.query(
        "UPDATE dev_otps SET attempts=attempts+1 WHERE phone_number=$1",
        [phone],
      );
      if (
        !timingSafeEqual(
          Buffer.from(row.code_hash, "hex"),
          Buffer.from(this.hash(phone, code), "hex"),
        )
      )
        return false;
      await tx.query("DELETE FROM dev_otps WHERE phone_number=$1", [phone]);
      return true;
    });
  }
}
export class TwilioOtpProvider implements OtpProvider {
  private service() {
    if (
      !config.TWILIO_ACCOUNT_SID ||
      !config.TWILIO_AUTH_TOKEN ||
      !config.TWILIO_VERIFY_SERVICE_SID
    )
      throw new AppError(
        503,
        "OTP_UNAVAILABLE",
        "Phone verification is not configured. Please contact support.",
      );
    return twilio(
      config.TWILIO_ACCOUNT_SID,
      config.TWILIO_AUTH_TOKEN,
    ).verify.v2.services(config.TWILIO_VERIFY_SERVICE_SID);
  }
  async request(phone: string) {
    try {
      await this.service().verifications.create({ to: phone, channel: "sms" });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      throw new AppError(
        e.status === 429 ? 429 : 503,
        e.status === 429 ? "OTP_RATE_LIMITED" : "OTP_UNAVAILABLE",
        "SMS could not be sent. Check the number and account permissions; trial accounts require verified destinations.",
      );
    }
  }
  async verify(phone: string, code: string) {
    try {
      return (
        (await this.service().verificationChecks.create({ to: phone, code }))
          .status === "approved"
      );
    } catch (e: any) {
      if (e.status === 404 || e.status === 400) return false;
      if (e instanceof AppError) throw e;
      throw new AppError(
        503,
        "OTP_UNAVAILABLE",
        "Verification is temporarily unavailable. Please try again.",
      );
    }
  }
}
