import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const evidence = resolve("evidence/real-projects-20261012");
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks: string[] = [],
  errors: string[] = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4181/admin");
    await expect(
      page.getByRole("heading", { name: "客户需求", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".record-item")).toHaveCount(4);
    const listText = await page.locator(".record-list").innerText();
    assert(!listText.includes("虚构"));
    assert(listText.includes("项目资料导入"));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: join(evidence, `list-${width}.png`),
      fullPage: true,
    });
    const links = await page
      .locator(".record-item")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLAnchorElement).href),
      );
    for (const link of links) {
      await page.goto(link);
      await expect(
        page.getByRole("heading", { name: "项目资料原文整理", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("真实项目资料 · 非客户问卷", { exact: true }),
      ).toBeVisible();
      const text = await page
        .locator("section.panel")
        .filter({
          has: page.getByRole("heading", {
            name: "项目资料原文整理",
            exact: true,
          }),
        })
        .locator(".answers")
        .innerText();
      assert(text.includes("非客户本人问卷"));
      assert(text.includes("SHA-256"));
      if (link === links[0])
        await page.screenshot({
          path: join(evidence, `detail-${width}.png`),
          fullPage: true,
        });
      await page.getByRole("link", { name: "交付资料", exact: true }).click();
      await expect(
        page.getByText("采用的项目资料版本", { exact: false }),
      ).toBeVisible();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
    }
    await page.screenshot({
      path: join(evidence, `delivery-${width}.png`),
      fullPage: true,
    });
    checks.push(
      `${width}px four real document records; source/date labels, delivery links, no synthetic content or overflow`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    join(evidence, "browser-receipt.json"),
    JSON.stringify(
      {
        status: "PASSED",
        checks,
        pageErrors: errors,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ status: "PASSED", checks, pageErrors: errors }));
} finally {
  await browser.close();
}
