import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
function logs() {
  return process.env.OTP_LOG_FILE
    ? readFileSync(process.env.OTP_LOG_FILE, "utf8")
    : execFileSync("docker", ["compose", "logs", "--no-color", "backend"], {
        encoding: "utf8",
      });
}
function codeFor(phone: string) {
  const matches = [
    ...logs().matchAll(new RegExp(`\\+91${phone}: (\\d{6})`, "g")),
  ];
  return matches.at(-1)?.[1] || "";
}
async function login(page: Page, phone: string) {
  await page.goto("/");
  await page.getByLabel("Enter your phone number").fill(phone);
  await page.getByRole("button", { name: "Continue with phone" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  await expect.poll(() => codeFor(phone)).toMatch(/^\d{6}$/);
  await page.getByLabel("Verification code").fill(codeFor(phone));
  await page.getByRole("button", { name: "Verify & open inbox" }).click();
  await expect(page.getByRole("heading", { name: "Inbox." })).toBeVisible();
}
test("real mobile authentication, internal delivery, draft, reply, trash, profile and expired session", async ({
  page,
  context,
  browser,
}) => {
  const stamp = String(Date.now()).slice(-9);
  const phoneA = `7${stamp}`,
    phoneB = `8${stamp}`;
  const second = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  const b = await second.newPage();
  await login(b, phoneB);
  await login(page, phoneA);
  await expect(page.getByText("Your next hello starts here.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Inbox." })).toBeVisible();
  await page
    .getByRole("button", { name: "Compose message", exact: true })
    .click();
  await page.getByLabel("To", { exact: true }).fill(`${phoneB}@phonemail.com`);
  await page.getByLabel("Subject").fill("A mobile conversation");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Written on PhoneMail.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Draft saved");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Drafts", exact: true })
    .click();
  await page
    .getByRole("button")
    .filter({ hasText: "A mobile conversation" })
    .click();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Written on PhoneMail.",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Message sent");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Sent", exact: true })
    .click();
  await expect(
    page.getByText("A mobile conversation", { exact: true }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Refresh", exact: true }).click();
  await b
    .getByRole("button")
    .filter({ hasText: "A mobile conversation" })
    .click();
  await expect(
    b.getByText("Written on PhoneMail.", { exact: true }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Reply", exact: true }).click();
  await b
    .getByLabel("Message", { exact: true })
    .fill("Replying from my inbox.");
  await b.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(b.locator(".toast")).toContainText("Message sent");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Inbox", exact: true })
    .click();
  await page
    .getByRole("button")
    .filter({ hasText: "Re: A mobile conversation" })
    .click();
  await expect(
    page.getByText("Replying from my inbox.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark unread", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete message", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Trash", exact: true })
    .click();
  await page
    .getByRole("button")
    .filter({ hasText: "Re: A mobile conversation" })
    .click();
  await page
    .getByRole("button", { name: "Delete message", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete forever", exact: true })
    .click();
  await expect(page.getByText("A clean slate.")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  await page.getByLabel("Display name").fill("Mobile Tester");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Mobile Tester" }),
  ).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem("phonemail.session", "expired.invalid.token"),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Continue with phone" }),
  ).toBeVisible();
  await b
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Profile", exact: true })
    .click();
  await b.getByRole("button", { name: "Log out of PhoneMail" }).click();
  await b.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    b.getByRole("button", { name: "Continue with phone" }),
  ).toBeVisible();
  await second.close();
});
test("responsive login has no horizontal overflow", async ({ page }) => {
  for (const width of [360, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Continue with phone" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
