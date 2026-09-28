import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.phonemail.app",
  appName: "PhoneMail",
  webDir: "dist",
  android: {
    allowMixedContent: process.env.PHONEMAIL_ANDROID_LOCAL === "true",
  },
  server: { androidScheme: "https" },
};
export default config;
