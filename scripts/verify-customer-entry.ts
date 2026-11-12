import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createFixture } from "../server/delivery-fixture.ts";
import { openDeliveryRuntime } from "../server/delivery-runtime.ts";
import { customerEntry } from "../server/customer-entry.ts";
const dir = resolve("evidence/customer-isolation-20261013");
mkdirSync(dir, { recursive: true });
const root = resolve("tests/runtime/customer-isolation-" + Date.now()),
  fixture = await createFixture(root, true, false);
const runtime = openDeliveryRuntime(root, {
  passwordlessDemo: true,
  staticDir: resolve("dist"),
});
const owner = runtime.app.listen(0, "127.0.0.1"),
  customer = customerEntry(runtime.app).listen(0, "127.0.0.1");
await Promise.all([once(owner, "listening"), once(customer, "listening")]);
const ownerUrl = "http://127.0.0.1:" + (owner.address() as any).port,
  customerUrl = "http://127.0.0.1:" + (customer.address() as any).port;
const boot = await fetch(ownerUrl + "/api/auth/local-session", {
  method: "POST",
  headers: { Origin: ownerUrl, "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(boot.status, 200);
const cookie = boot.headers.get("set-cookie")!.split(";")[0],
  csrf = ((await boot.json()) as any).csrf;
const negative = [
  "/admin",
  "/admin/intakes/new/edit",
  "/api/admin/intakes",
  "/api/admin/intakes/" + fixture.intakeId,
  "/api/admin/export.csv",
  "/api/admin/intakes/" + fixture.intakeId + "/export?format=json",
  "/api/admin/intakes/" + fixture.intakeId + "/delivery",
  "/api/admin/delivery-system/status",
  "/API/ADMIN/intakes",
  "/api%2fadmin/intakes",
  "/api/auth/local-session",
  "/api/auth/login",
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const path of negative) {
    const r = await fetch(customerUrl + path, { headers: { Cookie: cookie } });
    assert.equal(r.status, 403, path);
    const body = await r.text();
    assert(!body.includes("青禾") && !body.includes("客户B"));
  }
  assert.equal(
    (
      await fetch(
        customerUrl + "/api/admin/intakes/" + fixture.intakeId + "/notes",
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: customerUrl,
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ body: "denied" }),
        },
      )
    ).status,
    403,
  );
  const profile = (await (
    await fetch(customerUrl + "/api/auth/me", { headers: { Cookie: cookie } })
  ).json()) as any;
  assert.equal(profile.user, null);
  assert.equal(profile.localDemo, false);
  const created = (await (
    await fetch(customerUrl + "/api/intakes", {
      method: "POST",
      headers: { Origin: customerUrl, "Content-Type": "application/json" },
      body: JSON.stringify({
        createKey: randomBytes(32).toString("base64url"),
      }),
    })
  ).json()) as any;
  const own = created.record.id,
    cap = created.capability;
  const saved = await fetch(customerUrl + "/api/intakes/" + own, {
    method: "PUT",
    headers: {
      Origin: customerUrl,
      "Content-Type": "application/json",
      Authorization: "Bearer " + cap,
    },
    body: JSON.stringify({
      revision: created.record.revision,
      mode: "simple",
      answers: { organization: "隔离测试的新填写者" },
    }),
  });
  assert.equal(saved.status, 200);
  const read = (await (
    await fetch(customerUrl + "/api/intakes/" + own, {
      headers: { Authorization: "Bearer " + cap },
    })
  ).json()) as any;
  assert.equal(read.answers.organization, "隔离测试的新填写者");
  assert.equal(read.notes, undefined);
  assert.equal(
    (
      await fetch(customerUrl + "/api/intakes/" + fixture.intakeId, {
        headers: { Cookie: cookie, Authorization: "Bearer " + cap },
      })
    ).status,
    404,
  );
  const ownerRows = (await (
    await fetch(ownerUrl + "/api/admin/intakes", {
      headers: { Cookie: cookie },
    })
  ).json()) as any;
  assert.equal(ownerRows.records.length, 3);
  runtime.db
    .prepare("UPDATE intakes SET source='test-isolated' WHERE id=?")
    .run(own);
  assert.equal(
    (
      await fetch(customerUrl + "/api/intakes/" + own, {
        headers: { Authorization: "Bearer " + cap },
      })
    ).status,
    404,
  );
  const afterQuarantine = (await (
    await fetch(ownerUrl + "/api/admin/intakes", {
      headers: { Cookie: cookie },
    })
  ).json()) as any;
  assert.equal(afterQuarantine.records.length, 2);
  const pageErrors: string[] = [];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const [name, value] = cookie.split("=");
    await context.addCookies([
      { name, value, url: customerUrl, httpOnly: true, sameSite: "Strict" },
    ]);
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(customerUrl + "/");
    await expect(
      page.getByRole("heading", {
        name: "把 AI 变成企业的生产力。",
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(await page.locator('a[href*="/admin"]').count(), 0);
    assert.equal(await page.locator(".workspace-rail").count(), 0);
    const text = await page.locator("body").innerText();
    assert(!text.includes("青禾") && !text.includes("客户B"));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: join(dir, `customer-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: /详细模式/ }).click();
    await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
    await page.screenshot({
      path: join(dir, `customer-detailed-${width}.png`),
      fullPage: true,
    });
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  writeFileSync(
    join(dir, "receipt.json"),
    JSON.stringify(
      {
        status: "PASSED",
        root,
        checks: [
          "all internal routes forbidden even with valid owner cookie",
          "anonymous auth profile; customer cannot create owner session",
          "own draft save/read allowed; other IDs/capabilities denied",
          "internal owner records remain usable",
          "simple/detailed at 1440/390 contain no admin links, side rail or historical clients",
        ],
        negative,
        pageErrors,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "Customer privacy isolation passed: internal routes blocked, own drafts valid, both modes and viewports clean",
  );
} finally {
  await browser.close();
  await Promise.all([
    new Promise<void>((r) => owner.close(() => r())),
    new Promise<void>((r) => customer.close(() => r())),
  ]);
  runtime.close();
}
