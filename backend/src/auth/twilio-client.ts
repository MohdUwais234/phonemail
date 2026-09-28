import twilio from "twilio";
import { config } from "../config.js";
import { AppError } from "../errors.js";

/** Return field names only: this result is safe to use in local setup diagnostics. */
export function twilioConfigurationIssues(): string[] {
  const issues: string[] = [];
  if (!/^AC[0-9a-fA-F]{32}$/.test(config.TWILIO_ACCOUNT_SID))
    issues.push("TWILIO_ACCOUNT_SID (AC + 32 hex characters)");
  if (!/^VA[0-9a-fA-F]{32}$/.test(config.TWILIO_VERIFY_SERVICE_SID))
    issues.push("TWILIO_VERIFY_SERVICE_SID (VA + 32 hex characters)");
  const usesKey = Boolean(
    config.TWILIO_API_KEY_SID || config.TWILIO_API_KEY_SECRET,
  );
  if (usesKey) {
    if (!/^SK[0-9a-fA-F]{32}$/.test(config.TWILIO_API_KEY_SID))
      issues.push("TWILIO_API_KEY_SID (SK + 32 hex characters)");
    if (config.TWILIO_API_KEY_SECRET.trim().length < 16)
      issues.push("TWILIO_API_KEY_SECRET");
  } else if (!/^[0-9a-fA-F]{32}$/.test(config.TWILIO_AUTH_TOKEN))
    issues.push("TWILIO_AUTH_TOKEN (live account Auth Token, not an API key)");
  return issues;
}

export function twilioVerifyService() {
  if (twilioConfigurationIssues().length)
    throw new AppError(
      503,
      "OTP_UNAVAILABLE",
      "Phone verification is not configured correctly. Please contact support.",
    );
  const usesKey = Boolean(config.TWILIO_API_KEY_SID);
  // Bound network time; never automatically retry billable SMS requests.
  const client = twilio(
    usesKey ? config.TWILIO_API_KEY_SID : config.TWILIO_ACCOUNT_SID,
    usesKey ? config.TWILIO_API_KEY_SECRET : config.TWILIO_AUTH_TOKEN,
    { accountSid: config.TWILIO_ACCOUNT_SID, timeout: 15000, autoRetry: false },
  );
  return client.verify.v2.services(config.TWILIO_VERIFY_SERVICE_SID);
}

export function twilioError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = error as { status?: number; code?: number } | null;
  if (e?.status === 429 || e?.code === 60203)
    return new AppError(
      429,
      "OTP_RATE_LIMITED",
      "Too many verification attempts. Please wait before trying again.",
    );
  if (e?.code === 21211 || e?.code === 21614 || e?.code === 60205)
    return new AppError(
      400,
      "VALIDATION_ERROR",
      "Enter a valid mobile number that can receive SMS.",
    );
  if (e?.code === 21608)
    return new AppError(
      503,
      "OTP_UNAVAILABLE",
      "This Twilio trial account can only send to verified recipient numbers. Ask the account administrator to verify your number.",
    );
  if (e?.code === 21408)
    return new AppError(
      503,
      "OTP_UNAVAILABLE",
      "SMS verification is not enabled for this destination. Ask the account administrator to check Verify geographic permissions.",
    );
  if (e?.status === 401 || e?.status === 403 || e?.code === 20003)
    return new AppError(
      503,
      "OTP_UNAVAILABLE",
      "The SMS provider could not authorize verification. Please contact support.",
    );
  return new AppError(
    503,
    "OTP_UNAVAILABLE",
    "Phone verification is temporarily unavailable. Please try again or contact support.",
  );
}
