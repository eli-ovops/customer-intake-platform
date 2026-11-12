import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { chromium, expect } from "@playwright/test";
import { createFixture } from "../server/delivery-fixture.ts";

const evidence = resolve("evidence/direct-workbench-20261013");
mkdirSync(evidence, { recursive: true });
const root = resolve("tests/runtime/direct-workbench-" + Date.now());
const fixture = await createFixture(root, true, true);
// Only this isolated fixture emulates the registered real-root access settings.
const identityPath = join(root, "identity.json");
const identity = JSON.parse(readFileSync(identityPath, "utf8"));
writeFileSync(identityPath, JSON.stringify({ ...identity, syntheticOnly: false, localPrivateAccess: true }), { mode: 0o600 });
async function freePort() {
  const s = createServer().listen(0, "127.0.0.1");
  await once(s, "listening");
  const port = (s.address() as any).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
const child = spawn(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), "scripts/delivery-start.ts", "normal", root], {
  env: { ...process.env, DELIVERY_PORT: String(await freePort()), CUSTOMER_PORT: String(await freePort()) },
  stdio: ["ignore", "pipe", "pipe"],
});
let ready = false;
child.stdout.on("data", (v) => { if (String(v).includes("本人工作台直接打开")) ready = true; });
let diagnostics = "";
child.stderr.on("data", (v) => diagnostics += String(v));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  for (let n = 0; n < 100 && !ready; n++) {
    assert.equal(child.exitCode, null, diagnostics);
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(ready, diagnostics);
  const state = JSON.parse(readFileSync(join(root, "runtime.json"), "utf8"));
  const owner = state.url, customer = state.customerUrl;
  assert.equal(state.ownerAccess, "direct-local");
  assert.equal(state.ownerApprovalSocket, undefined);
  const health = await (await fetch(owner + "/api/health")).json() as any;
  assert.equal(health.ownerApproval, false);
  for (const origin of [undefined, customer, "https://example.com"]) {
    assert.equal((await fetch(owner + "/api/auth/local-session", {
      method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: "{}",
    })).status, 403);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(owner + "/admin/login");
  await expect(page.getByRole("heading", { name: "客户需求", exact: true })).toBeVisible();
  assert(!await page.getByRole("heading", { name: "本人工作台授权" }).count());
  await page.screenshot({ path: join(evidence, "owner-direct.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "客户需求", exact: true })).toBeVisible();
  const profile = await (await page.request.get(owner + "/api/auth/me")).json();
  assert.equal(profile.user.name, "owner");
  assert.equal(profile.user.mustChange, false);
  assert.equal((await page.request.get(owner + "/api/admin/intakes")).status(), 200);
  // Real session cookies cross localhost ports; customer filtering must still win.
  for (const path of ["/admin", "/admin/intakes/new/edit", "/api/admin/intakes", "/api/admin/export.csv", "/api/admin/intakes/" + fixture.intakeId, "/api/admin/intakes/" + fixture.intakeId + "/delivery", "/api/admin/delivery-system/status", "/API/ADMIN/intakes", "/api%2fadmin/intakes", "/api/auth/local-session", "/api/auth/owner-request"]) {
    assert.equal((await page.request.get(customer + path)).status(), 403, path);
  }
  assert.equal((await page.request.post(customer + "/api/auth/local-session", { data: {} })).status(), 403);
  assert.equal((await (await page.request.get(customer + "/api/auth/me")).json()).user, null);
  assert.equal((await page.request.post(owner + "/api/admin/intakes/" + fixture.intakeId + "/notes", { data: { body: "must be denied without CSRF" } })).status(), 403);
  const createdResponse = await page.request.post(customer + "/api/intakes", {
    headers: { Origin: customer }, data: { createKey: randomBytes(32).toString("base64url") },
  });
  assert.equal(createdResponse.status(), 201);
  const created = await createdResponse.json();
  const auth = { Origin: customer, Authorization: "Bearer " + created.capability };
  assert.equal((await page.request.put(customer + "/api/intakes/" + created.record.id, {
    headers: auth, data: { revision: 0, mode: "simple", answers: { organization: "虚构·直接工作台隔离测试" } },
  })).status(), 200);
  assert.equal((await page.request.get(customer + "/api/intakes/" + created.record.id, { headers: auth })).status(), 200);
  assert.equal((await page.request.get(customer + "/api/intakes/" + fixture.intakeId, { headers: auth })).status(), 404);
  await page.goto(customer + "/");
  await expect(page.getByRole("heading", { name: "客户需求问卷", exact: true })).toBeVisible();
  for (const mode of ["简单模式", "详细模式"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    assert.equal(await page.locator('a[href*="/admin"]').count(), 0);
    const text = await page.locator("body").innerText();
    assert(!text.includes("青禾") && !text.includes("客户B"));
  }
  await page.screenshot({ path: join(evidence, "customer-questionnaire.png"), fullPage: true });
  // Visiting the customer questionnaire does not interrupt the personal workflow.
  await page.goto(owner + "/admin");
  await expect(page.getByRole("heading", { name: "客户需求", exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  writeFileSync(join(evidence, "receipt.json"), JSON.stringify({ status: "PASS", at: new Date().toISOString(), fixtureRoot: root, checks: ["login URL directly enters workbench and refresh works", "no authorization broker/socket", "customer routes blocked even with owner cookies", "customer can save/read own questionnaire but cannot read other client", "simple/detailed no internal links or client history", "cross-origin bootstrap and missing CSRF rejected", "returning from questionnaire enters workbench directly"], pageErrors: errors }, null, 2));
  console.log("PASS: direct workbench, isolated customer questionnaire, origin/CSRF guards");
} finally {
  await browser?.close();
  if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
}
