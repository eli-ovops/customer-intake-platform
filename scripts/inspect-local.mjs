import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  origins = new Set();
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => origins.add(new URL(r.url()).origin));
try {
  await page.goto("http://127.0.0.1:4180/");
  await page
    .getByRole("heading", { name: "把 AI 变成企业的生产力。" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "企业 / 团队称呼", exact: false })
      .inputValue(),
    "",
  );
  await page.screenshot({ path: "evidence/local-entry.png", fullPage: true });
  assert.equal(
    await page.locator(".sd-question[data-name]:visible").count(),
    5,
  );
  await page.getByRole("button", { name: "详细模式", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "详细模式", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  const adminPage = await context.newPage();
  await adminPage.goto("http://127.0.0.1:4180/admin");
  await adminPage.getByRole("button", { name: "登录工作台" }).waitFor();
  assert.equal(
    await adminPage
      .getByRole("textbox", { name: "密码", exact: true })
      .inputValue(),
    "",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual([...origins], ["http://127.0.0.1:4180"]);
  writeFileSync(
    "evidence/local-browser.json",
    JSON.stringify(
      {
        result: "pass",
        url: "http://127.0.0.1:4180/",
        adminRedirect: "http://127.0.0.1:4180/admin/login",
        blankCustomerRecord: true,
        firstStepQuestions: 5,
        detailedModeSwitch: true,
        pageErrors: errors,
        requestOrigins: [...origins],
        chromeVersion: browser.version(),
        viewport: { width: 1440, height: 1000 },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
