import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
const output =
  process.env.QUESTIONNAIRE_UI_EVIDENCE ?? "evidence/questionnaire-ui-20261012";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [];
const errors = [];
const dimensions = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4180/");
    const organization = page
      .locator('.sd-question[data-name="organization"]')
      .getByRole("textbox");
    await expect(organization).toBeVisible();
    await organization.fill("虚构 · 界面检查");
    await page
      .locator('.sd-question[data-name="industry"]')
      .getByRole("button", { name: "选择", exact: true })
      .click();
    await page.getByRole("option").filter({ hasText: "批发与零售" }).click();
    for (const mode of ["simple", "detailed"]) {
      await page
        .getByRole("button", {
          name: mode === "simple" ? "简单模式" : "详细模式",
          exact: true,
        })
        .click();
      await expect(organization).toHaveValue("虚构 · 界面检查");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      const count = await page
        .locator(".sd-question[data-name]:visible")
        .count();
      assert.ok(count <= 5);
      await expect(page.locator(".questionnaire-progress")).toContainText(
        /1.*\d/,
      );
      const option = page
        .locator('.sd-question[data-name="size"] .sd-selectbase__label')
        .first();
      const optionBox = await option.boundingBox();
      assert.ok(optionBox && optionBox.height >= 44);
      const fields = await page
        .locator(
          '.sd-question[data-name="organization"] .sd-formbox, .sd-question[data-name="industry"] .sd-formbox',
        )
        .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
      assert.ok(
        fields.every((h) => h >= 44 && h <= 46),
        "single-line controls share 44px height",
      );
      const bottom = await page.locator(".form-actions").boundingBox();
      dimensions.push({
        width,
        mode,
        pageHeight: await page.evaluate(
          () => document.documentElement.scrollHeight,
        ),
        actionBarY: bottom.y,
        optionHeight: optionBox.height,
        questionCount: count,
      });
      await page.screenshot({
        path: output + "/" + mode + "-" + width + ".png",
        fullPage: true,
        animations: "disabled",
      });
      checks.push(
        mode +
          " " +
          width +
          "px: no overflow, at most five questions, 44px options, mode switch preserves answers",
      );
    }
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(page.locator(".questionnaire-progress")).toContainText("第 2");
    await expect(page.locator(".questionnaire-progress")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.locator('.sd-question[data-name="problem"]').getByRole("textbox"),
    ).toBeFocused();
    const progressBox = await page
      .locator(".questionnaire-progress")
      .boundingBox();
    assert.ok(
      progressBox && progressBox.y >= 0 && progressBox.y < 100,
      "step progress stays visible after navigation",
    );
    await page.screenshot({
      path: output + "/detailed-next-" + width + ".png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "上一步", exact: true }).click();
    await expect(organization).toHaveValue("虚构 · 界面检查");
    checks.push(width + "px: forward/back navigation retains answers");
    await context.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    output + "/visual-receipt.json",
    JSON.stringify(
      {
        status: "PASSED",
        completedAt: new Date().toISOString(),
        checks,
        dimensions,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks: checks.length, dimensions }));
} finally {
  await browser.close();
}
