import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { createFixture } from "../server/delivery-fixture.ts";
import { openDeliveryRuntime } from "../server/delivery-runtime.ts";
const root = resolve("tests/runtime/submission-feedback-" + Date.now());
await createFixture(root, false, false);
const runtime = openDeliveryRuntime(root, { passwordlessDemo: true });
const server = runtime.app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = "http://127.0.0.1:" + (server.address() as any).port;
const output = resolve("evidence/submission-feedback-20261012");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks: string[] = [];
const errors: string[] = [];
try {
  for (const width of [1440, 390])
    for (const mode of ["simple", "detailed"]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/");
      await page
        .getByRole("button", {
          name: mode === "simple" ? "简单模式" : "详细模式",
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: "提交需求", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("目前最想解决的问题");
      await page
        .getByRole("button", { name: "检查必填项", exact: true })
        .click();
      const organization = page
        .locator('.sd-question[data-name="organization"]')
        .getByRole("textbox");
      await expect(organization).toBeFocused();
      const name = "虚构 · 回执验证 " + width + " " + mode;
      await organization.fill(name);
      const industry = page.locator('.sd-question[data-name="industry"]');
      await industry.scrollIntoViewIfNeeded();
      await industry.getByRole("button", { name: "选择", exact: true }).click();
      await page.getByRole("option").filter({ hasText: "批发与零售" }).click();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      await page.route("**/api/intakes", async (route) => {
        await gate;
        await route.continue();
      });
      await page.getByRole("button", { name: "保存草稿", exact: true }).click();
      await expect(page.locator(".survey-edit-region")).toHaveAttribute(
        "inert",
        "",
      );
      await expect(
        page.getByRole("button", { name: "简单模式", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "详细模式", exact: true }),
      ).toBeDisabled();
      assert.equal(await page.locator(".submission-receipt").count(), 0);
      release();
      await expect(
        page.getByRole("status", { name: "草稿保存结果", exact: true }),
      ).toContainText("仅保存草稿，不新增提交版本");
      await expect(page.locator(".submission-receipt")).toBeFocused();
      await page.screenshot({
        path: join(output, `draft-${width}-${mode}.png`),
        fullPage: false,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "继续填写", exact: true }).click();
      await expect(page.locator(".questionnaire-progress")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(organization).toBeFocused();
      await page.unroute("**/api/intakes");
      const row = runtime.db
        .prepare(
          "SELECT id,status FROM intakes WHERE json_extract(answers,'$.organization')=?",
        )
        .get(name) as any;
      assert.equal(row.status, "draft");
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      const problem = page
        .locator('.sd-question[data-name="problem"]')
        .getByRole("textbox");
      await problem.fill("虚构：整理需求，验证明确的提交回执。");
      await expect(page.locator(".submission-receipt")).toHaveCount(0);
      await page.getByRole("button", { name: "提交需求", exact: true }).click();
      await expect(
        page.getByRole("status", { name: "提交结果", exact: true }),
      ).toContainText("第 1 版");
      await expect(
        page.getByRole("heading", { name: "需求已提交", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".submission-receipt")).toBeFocused();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: join(output, `submitted-${width}-${mode}.png`),
        fullPage: false,
        animations: "disabled",
      });
      const versions = () =>
        (
          runtime.db
            .prepare("SELECT count(*) n FROM submissions WHERE intake_id=?")
            .get(row.id) as any
        ).n;
      assert.equal(versions(), 1);
      const replayResponse = page.waitForResponse(
        (r) => r.url().endsWith("/submit") && r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "提交补充版本", exact: true })
        .click();
      await expect(
        page.getByRole("status", { name: "提交结果", exact: true }),
      ).toContainText("第 1 版");
      await replayResponse;
      await expect(
        page.getByRole("button", { name: "提交补充版本", exact: true }),
      ).toBeEnabled();
      assert.equal(versions(), 1);
      await page.getByRole("button", { name: "继续补充", exact: true }).click();
      await expect(page.locator(".questionnaire-progress")).toBeFocused();
      await problem.fill("虚构：第二次补充，保留第一版。");
      await page
        .getByRole("button", { name: "提交补充版本", exact: true })
        .click();
      await expect(
        page.getByRole("status", { name: "提交结果", exact: true }),
      ).toContainText("第 2 版");
      assert.equal(versions(), 2);
      await problem.fill("虚构：保存失败时仍保留的修改");
      await page.route("**/api/intakes/**", (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: "合成保存失败，请稍后重试" }),
            })
          : route.continue(),
      );
      await page.getByRole("button", { name: "保存草稿", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("合成保存失败");
      await expect(page.locator(".form-error-feedback")).toBeFocused();
      await expect(page.locator(".submission-receipt")).toHaveCount(0);
      await expect(problem).toHaveValue("虚构：保存失败时仍保留的修改");
      assert.equal(versions(), 2);
      await expect(
        page.getByRole("button", { name: "保存草稿", exact: true }),
      ).toBeEnabled();
      await page.screenshot({
        path: join(output, `failed-${width}-${mode}.png`),
        fullPage: false,
        animations: "disabled",
      });
      await page.unroute("**/api/intakes/**");
      await page.getByRole("button", { name: "保存草稿", exact: true }).click();
      await expect(
        page.getByRole("status", { name: "草稿保存结果", exact: true }),
      ).toContainText("提交补充版本");
      assert.equal(versions(), 2);
      await expect(page.getByRole("alert")).toHaveCount(0);
      checks.push(
        `${width}px ${mode}: required-field recovery, pending edit lock, draft/server receipt, real submission/supplement versions, idempotent repeat, failure retains edits and removes success`,
      );
      await context.close();
    }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    join(output, "browser-receipt.json"),
    JSON.stringify(
      {
        status: "PASSED",
        completedAt: new Date().toISOString(),
        root,
        checks,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Submission feedback: four desktop/mobile simple/detailed scenarios passed",
  );
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
  runtime.close();
}
