import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ||
        "postgres://test:test@localhost:5432/phonemail_test",
      JWT_SECRET: "test-only-secret-with-at-least-32-characters",
      INBOUND_WEBHOOK_SECRET: "test-only-webhook-secret-at-least-32-characters",
      OTP_PROVIDER: "dev",
      DEV_OTP_LOG: "true",
    },
  },
});
