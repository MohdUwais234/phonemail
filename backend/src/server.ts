import { config } from "./config.js";
import { db, pool } from "./db/index.js";
import { migrate } from "./db/migrations.js";
import { DevOtpProvider, TwilioOtpProvider } from "./auth/otp.js";
import { createApp } from "./app.js";
import { deliverOutbox, smtpTransport } from "./mail/outbox.js";
await migrate(db);
const app = createApp(
  db,
  config.OTP_PROVIDER === "dev"
    ? new DevOtpProvider(db)
    : new TwilioOtpProvider(),
);
const server = app.listen(config.PORT, "0.0.0.0", () =>
  console.info(`PhoneMail API listening on ${config.PORT}`),
);
const transport = smtpTransport();
let working = false;
const timer = setInterval(async () => {
  if (working) return;
  working = true;
  try {
    await deliverOutbox(db, transport);
  } catch {
    console.error("Outbox worker unavailable");
  } finally {
    working = false;
  }
}, 2000);
function shutdown() {
  clearInterval(timer);
  server.close(async () => {
    transport.close();
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 20000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
