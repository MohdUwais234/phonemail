import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { twilioVerifyService, twilioError } from "./twilio-client.js";
import { config } from "../config.js";
import type { Database } from "../db/index.js";
import { AppError } from "../errors.js";
export interface OtpProvider {
  readonly expiresInSeconds?: number;
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
  readonly expiresInSeconds = 600;
  async request(phone: string) {
    try {
      const result = await twilioVerifyService().verifications.create({
        to: phone,
        channel: "sms",
      });
      if (result.status !== "pending")
        throw new AppError(
          503,
          "OTP_UNAVAILABLE",
          "The SMS provider did not start verification. Please try again.",
        );
    } catch (e: unknown) {
      throw twilioError(e);
    }
  }
  async verify(phone: string, code: string) {
    try {
      return (
        (
          await twilioVerifyService().verificationChecks.create({
            to: phone,
            code,
          })
        ).status === "approved"
      );
    } catch (e: unknown) {
      const providerError = e as { status?: number; code?: number } | null;
      // Verify deletes expired/used challenges; other provider failures aren't bad OTPs.
      if (
        !(e instanceof AppError) &&
        (providerError?.status === 404 || providerError?.code === 60202)
      )
        return false;
      throw twilioError(e);
    }
  }
}
