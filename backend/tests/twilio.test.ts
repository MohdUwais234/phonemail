import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  check: vi.fn(),
  fetch: vi.fn(),
  services: vi.fn(),
  client: vi.fn(),
}));
vi.mock("twilio", () => ({ default: mocks.client }));
import { config } from "../src/config.js";
import { TwilioOtpProvider } from "../src/auth/otp.js";
import {
  twilioConfigurationIssues,
  twilioVerifyService,
} from "../src/auth/twilio-client.js";
import { AuthService } from "../src/auth/service.js";
import { createApp } from "../src/app.js";
import { testDatabase } from "./setup.js";
import { verifyToken } from "../src/auth/jwt.js";
const original = { ...config };
const settings = {
  OTP_PROVIDER: "twilio" as const,
  TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32),
  TWILIO_AUTH_TOKEN: "b".repeat(32),
  TWILIO_VERIFY_SERVICE_SID: "VA" + "c".repeat(32),
  TWILIO_API_KEY_SID: "",
  TWILIO_API_KEY_SECRET: "",
};
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(config, settings);
  mocks.services.mockReturnValue({
    verifications: { create: mocks.send },
    verificationChecks: { create: mocks.check },
    fetch: mocks.fetch,
  });
  mocks.client.mockReturnValue({
    verify: { v2: { services: mocks.services } },
  });
  mocks.send.mockResolvedValue({ status: "pending" });
  mocks.check.mockResolvedValue({ status: "approved" });
});
afterEach(() => Object.assign(config, original));
describe("Twilio Verify integration (SDK mocked; no real SMS)", () => {
  it("uses live account credentials with a timeout and no automatic SMS retries", async () => {
    await new TwilioOtpProvider().request("+919876543210");
    expect(mocks.client).toHaveBeenCalledWith(
      settings.TWILIO_ACCOUNT_SID,
      settings.TWILIO_AUTH_TOKEN,
      {
        accountSid: settings.TWILIO_ACCOUNT_SID,
        timeout: 15000,
        autoRetry: false,
      },
    );
    expect(mocks.services).toHaveBeenCalledWith(
      settings.TWILIO_VERIFY_SERVICE_SID,
    );
    expect(mocks.send).toHaveBeenCalledWith({
      to: "+919876543210",
      channel: "sms",
    });
  });
  it("supports API keys without treating an SK SID as an AC account SID", async () => {
    config.TWILIO_API_KEY_SID = "SK" + "d".repeat(32);
    config.TWILIO_API_KEY_SECRET = "key-secret-for-testing-only";
    config.TWILIO_AUTH_TOKEN = "";
    await new TwilioOtpProvider().request("+919876543210");
    expect(mocks.client).toHaveBeenCalledWith(
      config.TWILIO_API_KEY_SID,
      config.TWILIO_API_KEY_SECRET,
      expect.objectContaining({ accountSid: settings.TWILIO_ACCOUNT_SID }),
    );
  });
  it("refuses partial API key settings instead of silently falling back", async () => {
    config.TWILIO_API_KEY_SID = "SK" + "d".repeat(32);
    await expect(
      new TwilioOtpProvider().request("+919876543210"),
    ).rejects.toMatchObject({ status: 503, code: "OTP_UNAVAILABLE" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([
    "TWILIO_ACCOUNT_SID",
    "TWILIO_VERIFY_SERVICE_SID",
    "TWILIO_AUTH_TOKEN",
  ] as const)("refuses missing or invalid %s", async (key) => {
    config[key] = "not-a-real-credential";
    expect(twilioConfigurationIssues().length).toBeGreaterThan(0);
    await expect(
      new TwilioOtpProvider().request("+919876543210"),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("normalizes phone and reports the ten-minute Twilio default without returning an OTP", async () => {
    const db = { query: vi.fn(), transaction: vi.fn() };
    const result = await new AuthService(db, new TwilioOtpProvider()).request(
      "919876543210",
    );
    expect(mocks.send).toHaveBeenCalledWith({
      to: "+919876543210",
      channel: "sms",
    });
    expect(result.expiresIn).toBe(600);
    expect(result).not.toHaveProperty("code");
    expect(db.query).not.toHaveBeenCalled();
  });
  it("checks the code with Verify, rather than comparing any locally generated code", async () => {
    expect(
      await new TwilioOtpProvider().verify("+919876543210", "123456"),
    ).toBe(true);
    expect(mocks.check).toHaveBeenCalledWith({
      to: "+919876543210",
      code: "123456",
    });
  });
  it.each(["pending", "expired", "canceled", "failed", "max_attempts_reached"])(
    "does not approve status %s",
    async (status) => {
      mocks.check.mockResolvedValue({ status });
      expect(
        await new TwilioOtpProvider().verify("+919876543210", "123456"),
      ).toBe(false);
    },
  );
  it("handles missing, used and expired challenges without a server error", async () => {
    mocks.check.mockRejectedValue({ status: 404, code: 20404 });
    expect(
      await new TwilioOtpProvider().verify("+919876543210", "123456"),
    ).toBe(false);
    mocks.check.mockRejectedValue({ status: 429, code: 60202 });
    expect(
      await new TwilioOtpProvider().verify("+919876543210", "123456"),
    ).toBe(false);
  });
  it.each(["request", "verify"] as const)(
    "maps provider throttling in %s",
    async (method) => {
      mocks.send.mockRejectedValue({ status: 429 });
      mocks.check.mockRejectedValue({ status: 429 });
      await expect(
        new TwilioOtpProvider()[method]("+919876543210", "123456"),
      ).rejects.toMatchObject({ status: 429, code: "OTP_RATE_LIMITED" });
    },
  );
  it.each([
    [{ status: 403, code: 21608 }, 503, "verified recipient"],
    [{ status: 403, code: 21408 }, 503, "geographic permissions"],
    [{ status: 403, code: 60205 }, 400, "valid mobile"],
    [{ status: 401, code: 20003 }, 503, "authorize"],
    [{ status: 500 }, 503, "temporarily unavailable"],
  ])(
    "maps a provider error without leaking its message: %j",
    async (error, status, text) => {
      mocks.send.mockRejectedValue({
        ...(error as object),
        message: "raw-secret-must-not-leak",
      });
      await expect(
        new TwilioOtpProvider().request("+919876543210"),
      ).rejects.toMatchObject({
        status,
        message: expect.stringContaining(text as string),
      });
    },
  );
  it("does not mislabel a generic provider 400 as a wrong OTP", async () => {
    mocks.check.mockRejectedValue({ status: 400, code: 60200 });
    await expect(
      new TwilioOtpProvider().verify("+919876543210", "123456"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("can read service configuration without sending or checking a code", async () => {
    mocks.fetch.mockResolvedValue({ codeLength: 6 });
    await twilioVerifyService().fetch();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("keeps health configuration-only and never exposes credentials", async () => {
    const app = createApp(
      { query: vi.fn(), transaction: vi.fn() },
      new TwilioOtpProvider(),
      false,
    );
    const result = await request(app).get("/health/integrations");
    expect(result.body.otp).toEqual({ provider: "twilio", configured: true });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(result.text).not.toContain(settings.TWILIO_AUTH_TOKEN);
    config.TWILIO_API_KEY_SID = "partial";
    expect(
      (await request(app).get("/health/integrations")).body.otp.configured,
    ).toBe(false);
  });
  it("creates an account and valid JWT only after Twilio approval", async () => {
    const env = await testDatabase();
    try {
      const app = createApp(env.db, new TwilioOtpProvider(), false);
      mocks.check.mockResolvedValue({ status: "pending" });
      expect(
        (
          await request(app)
            .post("/auth/otp/verify")
            .send({ phoneNumber: "9876543210", code: "123456" })
        ).status,
      ).toBe(400);
      expect((await env.db.query("SELECT * FROM users")).rows).toHaveLength(0);
      mocks.check.mockResolvedValue({ status: "approved" });
      const response = await request(app)
        .post("/auth/otp/verify")
        .send({ phoneNumber: "9876543210", code: "123456" });
      expect(response.status).toBe(200);
      expect(response.body.user.email_address).toBe("9876543210@phonemail.com");
      expect(verifyToken(response.body.token)).toBe(
        String(response.body.user.id),
      );
      expect((await env.db.query("SELECT * FROM dev_otps")).rows).toHaveLength(
        0,
      );
    } finally {
      await env.close();
    }
  }, 30000);
});
