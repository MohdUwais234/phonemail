import type { Database } from "../db/index.js";
import type { OtpProvider } from "./otp.js";
import { normalizePhone, phoneEmail } from "../phone/normalize.js";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { signToken } from "./jwt.js";
export class AuthService {
  constructor(
    private db: Database,
    private otp: OtpProvider,
  ) {}
  async request(phone: string) {
    await this.otp.request(normalizePhone(phone));
    return {
      message: "Verification code sent.",
      retryAfter: 60,
      expiresIn: 300,
    };
  }
  async verify(phone: string, code: string) {
    const normalized = normalizePhone(phone);
    if (!(await this.otp.verify(normalized, code)))
      throw new AppError(
        400,
        "INVALID_OTP",
        "The verification code is invalid or expired.",
      );
    const user = (
      await this.db.query(
        `INSERT INTO users(phone_number,email_address) VALUES($1,$2) ON CONFLICT(phone_number) DO UPDATE SET updated_at=now() RETURNING *`,
        [normalized, phoneEmail(normalized, config.PHONEMAIL_DOMAIN)],
      )
    ).rows[0];
    return {
      message: "OTP verified successfully",
      token: signToken(user.id),
      user,
    };
  }
  async me(id: string) {
    const user = (await this.db.query("SELECT * FROM users WHERE id=$1", [id]))
      .rows[0];
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Account not found.");
    return user;
  }
  async update(id: string, name: string) {
    await this.db.query(
      "UPDATE users SET display_name=$2,updated_at=now() WHERE id=$1",
      [id, name.trim() || null],
    );
    return this.me(id);
  }
}
