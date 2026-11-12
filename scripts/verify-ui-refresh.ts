import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { createFixture } from "../server/delivery-fixture.ts";
import { openDeliveryRuntime } from "../server/delivery-runtime.ts";
const output = resolve(".impeccable/review");
mkdirSync(output, { recursive: true });
const live = JSON.parse(
  readFileSync("runtime/delivery-demo-20261012/runtime.json", "utf8"),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const desktop = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await desktop.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const checks: string[] = [];
let runtime: ReturnType<typeof openDeliveryRuntime> | undefined;
let server: any;
try {
  await page.goto(live.url + "/admin/login");
  await expect(
    page.getByRole("heading", { name: "客户需求", exact: true }),
  ).toBeVisible();
  assert.ok(page.url().endsWith("/admin"));
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page.screenshot({
    path: join(output, "desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  checks.push(
    "fresh desktop session enters /admin from /admin/login without credentials",
  );
  await page.getByLabel("搜索需求", { exact: true }).fill("不存在的虚构客户");
  await expect(
    page.getByRole("heading", { name: "这里还没有匹配的需求" }),
  ).toBeVisible();
  await page.getByLabel("搜索需求", { exact: true }).fill("");
  await expect(
    page.getByRole("heading", { name: "虚构 · 青禾商贸" }),
  ).toBeVisible();
  checks.push("search and empty state remain usable");
  const csvPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出全部 CSV", exact: true }).click();
  const csv = await csvPending;
  assert.equal(csv.suggestedFilename(), "fde-intakes.csv");
  await csv.saveAs(join(output, "intakes.csv"));
  checks.push("CSV download remains available from the list heading");
  await page.goto(live.entry);
  await expect(
    page.getByRole("heading", { name: "交付资料", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "工作台导航" })
      .getByRole("link", { name: "客户需求", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("tab", { name: "需求与范围", exact: true }).click();
  await page.getByRole("tab", { name: "报价草案", exact: true }).click();
  await expect(
    page.getByText("总销售报价：待估", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "报价草案", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "变更与验收", exact: true }),
  ).toBeFocused();
  await page.getByRole("tab", { name: "需求与范围", exact: true }).click();
  await page.screenshot({
    path: join(output, "delivery-desktop.png"),
    fullPage: false,
    animations: "disabled",
  });
  checks.push("native keyboard tabs and quote state visible");
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobile = await mobileContext.newPage();
  await mobile.goto(live.url + "/admin");
  await expect(
    mobile.getByRole("heading", { name: "客户需求", exact: true }),
  ).toBeVisible();
  await expect(
    mobile.getByRole("heading", { name: "虚构 · 青禾商贸", exact: true }),
  ).toBeVisible();
  const firstRecord = await mobile
    .locator(".record-item")
    .first()
    .boundingBox();
  assert.ok(
    firstRecord && firstRecord.y + firstRecord.height <= 844,
    "first customer fits within mobile viewport",
  );
  checks.push(
    "first customer record fits fully within the 390x844 viewport; y=" +
      firstRecord!.y.toFixed(0),
  );
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await mobile.screenshot({
    path: join(output, "mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await mobile.goto(live.entry);
  await expect(
    mobile.getByRole("tab", { name: "需求与范围", exact: true }),
  ).toBeVisible();
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await mobile.screenshot({
    path: join(output, "delivery-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
  await mobile.emulateMedia({ reducedMotion: "reduce" });
  await mobile.getByRole("tab", { name: "报价草案", exact: true }).click();
  assert.equal(
    await mobile
      .locator(".tab-indicator")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  await mobileContext.close();
  checks.push(
    "fresh 390px session, no horizontal overflow, reduced-motion supported",
  );
  const root = resolve("tests/runtime/ui-refresh-" + Date.now());
  const fixture = await createFixture(root, true, true);
  runtime = openDeliveryRuntime(root, { passwordlessDemo: true });
  server = runtime.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  await page.goto(base + "/admin/intakes/" + fixture.intakeId + "/delivery");
  await expect(
    page.getByRole("heading", { name: "交付资料", exact: true }),
  ).toBeVisible();
  const original = await page
    .getByRole("textbox", { name: "本阶段目标", exact: true })
    .inputValue();
  await page
    .getByRole("textbox", { name: "本阶段目标", exact: true })
    .fill(original + " · 界面验证");
  await page.getByRole("tab", { name: "报价草案", exact: true }).click();
  await page.getByRole("tab", { name: "需求与范围", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "本阶段目标", exact: true }),
  ).toHaveValue(original + " · 界面验证");
  await page.getByRole("button", { name: "保存所有修改", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("所有修改已保存");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "本阶段目标", exact: true }),
  ).toHaveValue(original + " · 界面验证");
  checks.push(
    "unsaved edits survive tab switches; saved edits survive reload in separate synthetic fixture",
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    join(output, "receipt.json"),
    JSON.stringify(
      {
        status: "PASSED",
        completedAt: new Date().toISOString(),
        checks,
        pageErrors: errors,
        root,
      },
      null,
      2,
    ),
  );
  console.log("UI refresh: " + checks.length + " checks passed");
} finally {
  await desktop.close();
  await browser.close();
  if (server) await new Promise<void>((r) => server.close(() => r()));
  runtime?.close();
}
