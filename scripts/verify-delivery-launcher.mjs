import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve("runtime/delivery-demo-20261012"),
  identity = JSON.parse(readFileSync(join(root, "identity.json"), "utf8")),
  runtime = JSON.parse(readFileSync(join(root, "runtime.json"), "utf8"));
assert.equal(identity.syntheticOnly, true);
assert.equal(new URL(runtime.url).hostname, "127.0.0.1");
const health = await (await fetch(runtime.url + "/api/health")).json();
assert.equal(health.rootId, identity.rootId);
assert.equal(health.producerApp, "eli-fde-delivery");
const credential = JSON.parse(
  readFileSync(join(root, "auth", "credential.json"), "utf8"),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = resolve("evidence/delivery-rev2/D05");
mkdirSync(output, { recursive: true });
try {
  await page.goto(runtime.url + "/admin/login");
  if (!(await (await fetch(runtime.url + "/api/auth/me")).json()).localDemo) {
    await page
      .getByRole("textbox", { name: "账号", exact: true })
      .fill("owner");
    await page
      .getByRole("textbox", { name: "密码", exact: true })
      .fill(credential.password);
    await page.getByRole("button", { name: "登录工作台", exact: true }).click();
    await page
      .getByRole("heading", { name: /先设置自己的密码|客户需求/ })
      .waitFor();
    if (await page.getByRole("heading", { name: "先设置自己的密码" }).count()) {
      const next = credential.password + "-changed";
      await page
        .getByRole("textbox", { name: "当前密码", exact: true })
        .fill(credential.password);
      await page
        .getByRole("textbox", { name: "新密码", exact: true })
        .fill(next);
      await page
        .getByRole("textbox", { name: "再次输入新密码", exact: true })
        .fill(next);
      await page
        .getByRole("button", { name: "保存新密码", exact: true })
        .click();
      writeFileSync(
        join(root, "auth", "credential.json"),
        JSON.stringify({ ...credential, password: next }),
        { mode: 0o600 },
      );
    }
  }
  await page.getByRole("heading", { name: "客户需求" }).waitFor();
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page.goto(runtime.entry);
  await page.getByRole("heading", { name: "交付资料", exact: true }).waitFor();
  await page.getByRole("tab", { name: "报价草案", exact: true }).click();
  await expect(
    page.getByText("总销售报价：待估", { exact: false }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "资料与备份", exact: true }).click();
  await page
    .getByRole("button", { name: "核准当前对客草案", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "核对新修订", exact: true }),
  ).toBeEnabled();
  for (const mode of ["内部资料", "对客沟通"]) {
    await page
      .getByRole("button", { name: "生成" + mode + "包", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("资料包已完成");
  }
  for (const name of ["internal.json", "internal.md", "customer-draft.md"]) {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "下载 " + name, exact: true })
      .first()
      .click();
    const d = await pending;
    await d.saveAs(join(output, "launcher-" + name));
  }
  await page.screenshot({
    path: join(output, "launcher-desktop.png"),
    fullPage: false,
  });
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 900 });
  await mobile.goto(runtime.entry);
  await mobile.getByRole("heading", { name: "交付资料" }).waitFor();
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.equal(await mobile.locator("header.topbar").count(), 1);
  await mobile.screenshot({
    path: join(output, "launcher-390px.png"),
    fullPage: false,
  });
  await mobile.close();
  assert.deepEqual(errors, []);
  writeFileSync(
    join(output, "launcher-receipt.json"),
    JSON.stringify(
      {
        scenario: "D05",
        status: "LAUNCHER_PASSED",
        completedAt: new Date().toISOString(),
        launchFile: resolve("Start-Delivery.command"),
        runtime,
        rootId: identity.rootId,
        firstLoginChangeHandled: true,
        downloads: [
          "launcher-internal.json",
          "launcher-internal.md",
          "launcher-customer-draft.md",
        ],
        pageErrors: errors,
        deviations: [],
        limitations: [
          "only synthetic local tool; customer business acceptance not inferred",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Actual launcher UI and three actual downloads verified on registered synthetic root.",
  );
} finally {
  await context.close();
  await browser.close();
}
