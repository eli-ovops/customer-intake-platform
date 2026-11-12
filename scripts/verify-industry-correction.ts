import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const base = "http://127.0.0.1:4181",
  evidence = "evidence/real-projects-20261012";
const r = await fetch(base + "/api/auth/local-session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: "{}",
});
assert.equal(r.status, 200);
const cookie = r.headers.get("set-cookie")!.split(";")[0];
const list = (await (
  await fetch(base + "/api/admin/intakes", { headers: { Cookie: cookie } })
).json()) as any;
const miao = list.records.find(
  (v: any) => v.organization === "淼瀚洁具库存系统",
);
assert.equal(miao.industry, "");
assert.equal(list.records.length, 4);
const detail = (await (
  await fetch(base + "/api/admin/intakes/" + miao.id, {
    headers: { Cookie: cookie },
  })
).json()) as any;
assert.equal(detail.answers.industry, "");
assert.equal(detail.submissions.length, 2);
assert.equal(
  detail.submissions.find((s: any) => s.version === 2).answers.industry,
  "",
);
assert.equal(
  detail.submissions.find((s: any) => s.version === 1).answers.industry,
  "批发与零售",
);
const workspace = (await (
  await fetch(base + "/api/admin/intakes/" + miao.id + "/delivery", {
    headers: { Cookie: cookie },
  })
).json()) as any;
const source = workspace.snapshots.find(
  (s: any) => s.id === workspace.state.source,
);
assert.equal(source.payload.version, 2);
assert.equal(source.payload.answers.industry, "");
assert(workspace.sourceValid);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage();
    await page.goto(base + "/admin");
    const row = page
      .locator(".record-item")
      .filter({ hasText: "淼瀚洁具库存系统" });
    await expect(row).toContainText("行业待了解");
    await expect(row).not.toContainText("批发与零售");
    await page.screenshot({
      path: `${evidence}/industry-list-${width}.png`,
      fullPage: true,
    });
    await row.click();
    await expect(
      page.getByRole("heading", { name: "项目资料原文整理", exact: true }),
    ).toBeVisible();
    const answers = page
      .locator("section.panel")
      .filter({
        has: page.getByRole("heading", {
          name: "项目资料原文整理",
          exact: true,
        }),
      })
      .locator(".answers");
    await expect(answers).toContainText("资料v2更正为空缺");
    await page.screenshot({
      path: `${evidence}/industry-detail-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "交付资料", exact: true }).click();
    await expect(
      page.getByText("采用的项目资料版本", { exact: false }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText("原文版本 2");
    await page.screenshot({
      path: `${evidence}/industry-delivery-${width}.png`,
      fullPage: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(
  `${evidence}/industry-targeted-receipt.json`,
  JSON.stringify(
    {
      status: "PASSED",
      intakeId: miao.id,
      currentIndustry: "",
      sourceVersion: 2,
      sourceValid: true,
      oldVersionPreserved: true,
      count: 4,
      reopenedHttpVerified: true,
      viewports: [1440, 390],
      screenshots: [
        "industry-list-1440.png",
        "industry-list-390.png",
        "industry-detail-1440.png",
        "industry-detail-390.png",
        "industry-delivery-1440.png",
        "industry-delivery-390.png",
      ],
      at: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "Industry unknown saved/reopened; list/detail/source v2 verified at 1440/390; old source retained",
);
