import { config } from "../config.js";
import {
  twilioConfigurationIssues,
  twilioVerifyService,
  twilioError,
} from "./twilio-client.js";

const issues = twilioConfigurationIssues();
if (config.OTP_PROVIDER !== "twilio")
  issues.unshift("OTP_PROVIDER must be twilio");
if (issues.length) {
  console.error("Twilio setup needs attention:\n- " + issues.join("\n- "));
  process.exitCode = 1;
} else {
  try {
    // Read-only fetch. No phone number, OTP request, or SMS is sent.
    const service = await twilioVerifyService().fetch();
    if (service.codeLength !== 6) {
      console.error(
        "Set your Twilio Verify service code length to 6, then run this check again.",
      );
      process.exitCode = 1;
    } else {
      console.info(
        "Twilio credentials and Verify service access confirmed. Six-digit codes configured. No SMS sent.",
      );
      console.info(
        "Next: restart the backend and request a code from PhoneMail using a permitted test phone.",
      );
    }
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    console.error(twilioError(e).message);
    if (typeof code === "number")
      console.error(
        `Twilio error code: ${code}. Check the Twilio console; do not share credentials or raw provider errors.`,
      );
    process.exitCode = 1;
  }
}
