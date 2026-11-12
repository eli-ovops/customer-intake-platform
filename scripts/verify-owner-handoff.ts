import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createFixture } from "../server/delivery-fixture.ts";
import { openDeliveryRuntime } from "../server/delivery-runtime.ts";
import { ownerApproval } from "../server/owner-approval.ts";
import { customerEntry } from "../server/customer-entry.ts";
const root = resolve("tests/runtime/o" + Date.now().toString(36)),
  dir = resolve("evidence/portfolio-theme-20261013");
mkdirSync(dir, { recursive: true });
const f = await createFixture(root, true, false),
  runtime = openDeliveryRuntime(root, { staticDir: resolve("dist") });
const approval = ownerApproval(
  runtime.authDb,
  runtime.cookieName,
  join(root, "auth"),
  () => runtime.lease.assertRoot(false),
  runtime.barrier,
  (actor, action) => {
    runtime.lease.checkCapacity("data",40960,action==="owner-session-revoked",false);
    runtime.db
      .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
      .run(randomUUID(), actor, action, "auth-local", new Date().toISOString());
  },
);
await once(approval.socket, "listening");
assert.equal(statSync(approval.socketPath).mode & 0o777, 0o600);
writeFileSync(
  join(root, "runtime.json"),
  JSON.stringify({
    producerApp: "eli-fde-delivery",
    pid: process.pid,
    rootId: runtime.lease.identity.rootId,
    ownerApprovalSocket: approval.socketPath,
  }),
);
const ownerApp = express();
ownerApp.use(approval.middleware);
ownerApp.get("/api/health", (_q, r) => r.json({ ownerApproval: true }));
ownerApp.use(runtime.app);
const owner = ownerApp.listen(0, "127.0.0.1"),
  client = customerEntry(runtime.app, approval.enterCustomer).listen(
    0,
    "127.0.0.1",
  );
await Promise.all([once(owner, "listening"), once(client, "listening")]);
const ownerUrl = "http://127.0.0.1:" + (owner.address() as any).port,
  clientUrl = "http://127.0.0.1:" + (client.address() as any).port;
const localGrant = async (code: string) => {
  const child = spawn(
    process.execPath,
    [
      "--import",
      resolve("node_modules/tsx/dist/loader.mjs"),
      resolve("scripts/authorize-owner.ts"),
      code,
      root,
    ],
    { stdio: "ignore" },
  );
  const [exit] = await once(child, "exit");
  assert.equal(exit, 0, "Trusted local approval command succeeds");
};
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const ownerResponse = await page.goto(ownerUrl + "/admin");
  assert.equal(ownerResponse!.headers()["cache-control"], "no-store");
  await expect(
    page.getByRole("heading", { name: "本人工作台授权", exact: true }),
  ).toBeVisible();
  assert.equal(
    (
      await context.request.post(ownerUrl + "/api/auth/local-session", {
        data: {},
        headers: { Origin: ownerUrl },
      })
    ).status(),
    403,
  );
  await page.getByRole("button", { name: "申请本机授权", exact: true }).click();
  const code = await page.getByLabel("授权编号").innerText();
  await localGrant(code);
  await expect(
    page.getByRole("heading", { name: "客户需求", exact: true }),
  ).toBeVisible();
  const privateBefore = await context.request.get(
    ownerUrl + "/api/admin/intakes",
  );
  assert.equal(privateBefore.status(), 200);
  assert.equal(privateBefore.headers()["cache-control"], "no-store");
  const ownerCookie = (await context.cookies(ownerUrl)).find(
    (c) => c.name === runtime.cookieName,
  )!;
  assert(ownerCookie);
  await page.goto(clientUrl + "/");
  await expect(
    page.getByRole("heading", {
      name: "把 AI 变成企业的生产力。",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: /企业 \/ 团队称呼/ })
    .fill("虚构交接填写者");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "草稿已保存", exact: true }),
  ).toBeVisible();
  assert.equal(
    (await context.request.get(ownerUrl + "/api/admin/intakes")).status(),
    401,
  );
  assert.equal(
    (
      await context.request.get(ownerUrl + "/api/admin/intakes", {
        headers: { Cookie: ownerCookie.name + "=" + ownerCookie.value },
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await context.request.post(ownerUrl + "/api/auth/local-session", {
        data: {},
        headers: { Origin: ownerUrl },
      })
    ).status(),
    403,
  );
  const me = await (
    await context.request.get(ownerUrl + "/api/auth/me")
  ).json();
  assert.equal(me.user, null);
  assert.equal(me.localDemo, false);
  for (const path of [
    "/api/admin/intakes",
    "/api/admin/export.csv",
    "/api/admin/intakes/" + f.intakeId + "/delivery",
  ]) {
    assert.equal((await context.request.get(clientUrl + path)).status(), 403);
    assert.equal((await context.request.get(ownerUrl + path)).status(), 401);
  }
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "本人工作台授权", exact: true }),
  ).toBeVisible();
  assert(!(await page.locator("body").innerText()).includes("青禾"));
  await page.getByRole("button", { name: "申请本机授权", exact: true }).click();
  await localGrant(await page.getByLabel("授权编号").innerText());
  await expect(
    page.getByRole("heading", { name: "客户需求", exact: true }),
  ).toBeVisible();
  assert.equal(
    (await context.request.get(ownerUrl + "/api/admin/intakes")).status(),
    200,
  );
  const restoredSession = await (
    await context.request.get(ownerUrl + "/api/auth/me")
  ).json();
  const w = runtime.store.get(f.intakeId);
  const write = await context.request.post(
    ownerUrl + `/api/admin/intakes/${f.intakeId}/delivery/${w.id}/actions`,
    {
      headers: { Origin: ownerUrl, "X-CSRF-Token": restoredSession.csrf },
      data: {
        revision: w.revision,
        requestKey: randomUUID(),
        op: "scopeMeta",
        args: { goal: "g".repeat(900), excluded: "e".repeat(900) },
      },
    },
  );
  assert.equal(
    write.status(),
    200,
    "authorized body over 1 KiB keeps existing bounded-save support",
  );
  const anonymous = await browser.newContext(),
    anon = await anonymous.newPage();
  await anon.goto(ownerUrl + "/admin");
  await expect(
    anon.getByRole("heading", { name: "本人工作台授权", exact: true }),
  ).toBeVisible();
  assert.equal(
    (await anonymous.request.get(ownerUrl + "/api/admin/intakes")).status(),
    401,
  );
  await anonymous.close();
  const captures = [];
  for (const width of process.argv.includes("--security-only")
    ? []
    : [1440, 390, 1317]) {
    const c = await browser.newContext({ viewport: { width, height: 1000 } }),
      p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(clientUrl + "/");
    await expect(
      p.getByRole("heading", { name: "把 AI 变成企业的生产力。", exact: true }),
    ).toBeVisible();
    assert.equal(await p.locator('a[href*="/admin"]').count(), 0);
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    const tokens = await p.locator(".public-frame").evaluate((e) => {
      const c = getComputedStyle(e);
      return {
        background: c.backgroundColor,
        ink: c.color,
        accent: c.getPropertyValue("--green").trim(),
      };
    });
    assert.equal(tokens.background, "rgb(255, 255, 255)");
    assert.equal(tokens.accent, "#635de5");
    await p.screenshot({
      path: join(dir, `simple-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await p
      .locator(".sd-dropdown")
      .filter({ has: p.getByRole("combobox", { name: /所在行业/ }) })
      .click();
    await expect(
      p.getByRole("option", { name: "制造与加工", exact: true }),
    ).toBeVisible();
    await p.screenshot({
      path: join(dir, `dropdown-${width}.png`),
      animations: "disabled",
    });
    await p.getByRole("option", { name: "制造与加工", exact: true }).click();
    await p.getByRole("button", { name: "详细模式", exact: true }).click();
    await expect(
      p.getByRole("button", { name: "详细模式", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await p.screenshot({
      path: join(dir, `detailed-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    captures.push({
      width,
      tokens,
      modes: ["simple", "detailed"],
      dropdown: true,
    });
    await c.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    join(
      dir,
      process.argv.includes("--security-only")
        ? "owner-security-confirmed.json"
        : "receipt.json",
    ),
    JSON.stringify(
      {
        status: "PASSED",
        root,
        security: [
          "only local trusted approval can mint owner session",
          "owner read succeeds before customer handoff",
          "customer handoff revokes current owner cookie and pending approval",
          "own customer draft still saves",
          "direct internal navigation and anonymous local-session do not grant owner",
          "old cookie replay rejected; browser back shows authorization screen",
          "fresh anonymous browser cannot read history",
          "explicit local reapproval restores internal access",
        ],
        socketPermissions: "0600 in private auth root",
        captures,
        pageErrors: errors,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "Owner handoff, reapproval and anonymous isolation passed; portfolio theme modes/viewports/dropdowns captured",
  );
} finally {
  await context.close();
  await browser.close();
  await Promise.all([
    new Promise<void>((r) => owner.close(() => r())),
    new Promise<void>((r) => client.close(() => r())),
  ]);
  await approval.close();
  runtime.close();
}
