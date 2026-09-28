// Run inside Docker; connects to the actual Android WebView forwarded by adb.
import { _android as android, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const local = ["http://127.0.0.1:3000", "http://10.0.2.2:3000"].includes(
  process.env.VITE_API_URL,
);
let device, page;
try {
  [device] = await android.devices();
  if (!device)
    throw new Error("No Android emulator found through the host ADB server.");
  const webview = await device.webView({ pkg: "com.phonemail.app" });
  page = await webview.page();
  if (!local) {
    await expect(
      page.getByRole("button", { name: "Continue with phone" }),
    ).toBeVisible();
    console.log("Remote API APK launch verified; no real SMS requests issued.");
  } else if (process.argv[2] === "restored") {
    await expect(page.getByRole("heading", { name: "Inbox." })).toBeVisible({
      timeout: 15000,
    });
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Profile", exact: true })
      .click();
    await page.getByRole("button", { name: "Log out of PhoneMail" }).click();
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Continue with phone" }),
    ).toBeVisible();
    console.log("Native encrypted-session restore and logout passed.");
  } else {
    const codeFor = (phone) =>
      [
        ...readFileSync(process.env.OTP_LOG_FILE, "utf8").matchAll(
          new RegExp(`\\+91${phone}: (\\d{6})`, "g"),
        ),
      ].at(-1)?.[1] || "";
    const base = "http://127.0.0.1:3000";
    const api = async (path, body, token) => {
      const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));
      return data;
    };
    const phone = "7777777777",
      other = "8888888888";
    await api("/auth/otp/request", { phoneNumber: other });
    await expect.poll(() => codeFor(other)).toMatch(/^\d{6}$/);
    const recipient = await api("/auth/otp/verify", {
      phoneNumber: other,
      code: codeFor(other),
    });
    await page.getByLabel("Enter your phone number").fill(phone);
    await page.getByRole("button", { name: "Continue with phone" }).click();
    await expect(page.getByLabel("Verification code")).toBeVisible();
    await expect.poll(() => codeFor(phone)).toMatch(/^\d{6}$/);
    await page.getByLabel("Verification code").fill(codeFor(phone));
    await page.getByRole("button", { name: "Verify & open inbox" }).click();
    await expect(page.getByRole("heading", { name: "Inbox." })).toBeVisible();
    await page
      .getByRole("button", { name: "Compose message", exact: true })
      .click();
    await page.getByLabel("To", { exact: true }).fill(`${other}@phonemail.com`);
    await page.getByLabel("Subject").fill("Android native acceptance");
    await page
      .getByLabel("Message", { exact: true })
      .fill("Sent from the actual Android WebView.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.locator(".toast")).toContainText("Draft saved");
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Drafts", exact: true })
      .click();
    await page
      .getByRole("button")
      .filter({ hasText: "Android native acceptance" })
      .click();
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.locator(".toast")).toContainText("Message sent");
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Sent", exact: true })
      .click();
    await expect(
      page.getByText("Android native acceptance", { exact: true }),
    ).toBeVisible();
    const inbox = await api("/emails", undefined, recipient.token);
    expect(inbox.messages[0].body).toBe(
      "Sent from the actual Android WebView.",
    );
    await api(
      `/emails/${inbox.messages[0].id}/reply`,
      { body: "A reply to your Android app." },
      recipient.token,
    );
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Inbox", exact: true })
      .click();
    await page
      .getByRole("button")
      .filter({ hasText: "Re: Android native acceptance" })
      .click();
    await expect(
      page.getByText("A reply to your Android app.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to mailbox" }).click();
    writeFileSync(
      "native-test-diagnostic.txt",
      "Native OTP, encrypted login, draft, SMTP-independent internal delivery, Sent and reply passed.",
    );
  }
  if (device) await device.close();
} catch (e) {
  writeFileSync("native-test-diagnostic.txt", String(e.stack || e));
  if (page)
    await page.screenshot({ path: "android-launch.png" }).catch(() => {});
  console.error(e);
  process.exit(1);
}
