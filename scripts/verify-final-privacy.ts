import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createFixture } from "../server/delivery-fixture.ts";
const root = resolve("tests/runtime/f" + Date.now().toString(36)),
  dir = resolve("evidence/portfolio-theme-20261013");
mkdirSync(dir, { recursive: true });
await createFixture(root, true, false);
let child: ChildProcess, info: any;
async function start() {
  child = spawn(
    process.execPath,
    [
      "--import",
      resolve("node_modules/tsx/dist/loader.mjs"),
      resolve("scripts/privacy-fixture-server.ts"),
      root,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let ready = false;
  child.stdout!.on("data", (b) => {
    if (b.toString().includes("READY")) ready = true;
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error("Owned fixture server exited before readiness");
    if (ready) {
      info = JSON.parse(readFileSync(join(root, "runtime.json"), "utf8"));
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Owned fixture readiness timeout");
}
async function stop(force = false) {
  if (child.exitCode === null) {
    child.kill(force ? "SIGKILL" : "SIGTERM");
    await once(child, "exit");
  }
}
async function cli(code: string) {
  const c = spawn(
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
  const [exit] = await once(c, "exit");
  assert.equal(exit, 0);
}
await start();
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  ctx = await browser.newContext(),
  page = await ctx.newPage();
try {
  // Request+trusted approval uses the actual helper process; no real root is involved.
  const grant = async () => {
    const p = await ctx.request.post(info.url + "/api/auth/owner-request", {
      data: {},
      headers: { Origin: info.url },
    });
    assert.equal(p.status(), 200);
    await cli((await p.json()).code);
    const exchange = await ctx.request.get(
      info.url + "/api/auth/owner-request/status",
    );
    assert.equal(exchange.status(), 200);
    assert.equal((await exchange.json()).state, "authorized");
  };
  const status = async () =>
    await (await ctx.request.get(info.url + "/__test/status")).json();
  await grant();
  assert.equal(
    (await ctx.request.get(info.url + "/api/admin/intakes")).status(),
    200,
  );
  let baseline = await status();
  assert(
    baseline.audits.some((a: any) => a.action === "owner-session-granted"),
  );
  assert.equal(
    (await ctx.request.post(info.url + "/__test/pause")).status(),
    200,
  );
  const pending = await ctx.request.post(info.url + "/api/auth/owner-request", {
    data: {},
    headers: { Origin: info.url },
  });
  await cli((await pending.json()).code);
  assert.equal(
    (
      await ctx.request.get(info.url + "/api/auth/owner-request/status")
    ).status(),
    503,
  );
  const cookie = (await ctx.cookies(info.url)).find(
    (c) => c.name.startsWith("fde_delivery_") && !c.name.endsWith("_approval"),
  )!;
  assert.equal(
    (await ctx.request.get(info.customerUrl + "/api/auth/me")).status(),
    503,
  );
  let paused = await status();
  assert.equal(paused.sessions, baseline.sessions);
  assert.deepEqual(paused.audits, baseline.audits);
  assert.equal(
    (
      await ctx.request.get(info.url + "/api/admin/intakes", {
        headers: { Cookie: cookie.name + "=" + cookie.value },
      })
    ).status(),
    401,
  );
  await ctx.request.post(info.url + "/__test/resume");
  const resumed = await status();
  assert.equal(resumed.sessions, baseline.sessions - 1);
  assert.equal(
    resumed.audits.filter((a: any) => a.action === "owner-session-revoked")
      .length,
    baseline.audits.filter((a: any) => a.action === "owner-session-revoked")
      .length + 1,
  );
  await grant();
  baseline = await status();
  const stale = (await ctx.cookies(info.url)).find(
    (c) => c.name.startsWith("fde_delivery_") && !c.name.endsWith("_approval"),
  )!;
  await ctx.request.post(info.url + "/__test/pause");
  await ctx.request.get(info.customerUrl + "/api/auth/me");
  assert.equal((await status()).sessions, baseline.sessions);
  await stop(true);
  await start(); // actual owned process crash, stale SQL row remains; epoch denies it.
  assert.equal(
    (
      await ctx.request.get(info.url + "/api/admin/intakes", {
        headers: { Cookie: stale.name + "=" + stale.value },
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await (
        await ctx.request.get(info.url + "/api/auth/me", {
          headers: { Cookie: stale.name + "=" + stale.value },
        })
      ).json()
    ).user,
    null,
  );
  const afterCrash = await status();
  assert(
    afterCrash.audits.filter((a: any) => a.action === "owner-epoch-start")
      .length >= 2,
  );
  // A's own save/reload remains supported; a new normal entry B is blank.
  await page.goto(info.customerUrl + "/");
  await page
    .getByRole("textbox", { name: /企业 \/ 团队称呼/ })
    .fill("虚构客户A特征");
  await page
    .getByRole("textbox", { name: /方便后续沟通/ })
    .fill("[REDACTED_EMAIL]");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "草稿已保存", exact: true }),
  ).toBeVisible();
  const a = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("fde-active-filling-v2")!),
  );
  assert(a.id && a.capability);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: /企业 \/ 团队称呼/ }),
  ).toHaveValue("虚构客户A特征");
  await page.evaluate(
    (v) => localStorage.setItem("fde-local-resume-v1", JSON.stringify(v)),
    a,
  );
  let oldRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/intakes/" + a.id)) oldRequests++;
  });
  await page.goto(info.customerUrl + "/");
  await expect(
    page.getByRole("textbox", { name: /企业 \/ 团队称呼/ }),
  ).toHaveValue("");
  await expect(page.getByRole("textbox", { name: /方便后续沟通/ })).toHaveValue(
    "",
  );
  assert.equal(oldRequests, 0);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: /企业 \/ 团队称呼/ }),
  ).toHaveValue("");
  assert.equal(oldRequests, 0);
  await page.screenshot({
    path: join(dir, "fresh-customer-entry.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(
    info.customerUrl + "/#record=" + a.id + "&key=" + a.capability,
  );
  await expect(
    page.getByRole("textbox", { name: /企业 \/ 团队称呼/ }),
  ).toHaveValue("虚构客户A特征");
  await expect(page.getByRole("textbox", { name: /方便后续沟通/ })).toHaveValue(
    "[REDACTED_EMAIL]",
  );
  assert.equal(page.url(), info.customerUrl + "/");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: /企业 \/ 团队称呼/ }),
  ).toHaveValue("虚构客户A特征");
  const own = await ctx.request.get(info.customerUrl + "/api/intakes/" + a.id, {
    headers: { Authorization: "Bearer " + a.capability },
  });
  assert.equal(own.status(), 200);
  writeFileSync(
    join(dir, "final-privacy-supplement.json"),
    JSON.stringify(
      {
        status: "PASSED",
        root,
        checks: [
          "grant and revoke audited without credentials",
          "paused grant denied, paused revoke immediately denies old cookie without SQL/audit write",
          "resume flushes deferred revoke and audit",
          "actual owned process crash during paused revoke; stale SQL session cannot revive in new epoch",
          "A saves and refreshes own current filling",
          "same-browser fresh normal B entry and B reload remain blank with zero requests for A even with legacy localStorage",
          "explicit A revisit and its subsequent reload recover A only; server data preserved",
        ],
        auditActions: afterCrash.audits.map((a: any) => a.action),
        fakeCustomerRecordId: a.id,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "Fresh-entry A/B, explicit revisit, write barrier, audit and actual crash/restart denial all passed",
  );
} finally {
  await ctx.close();
  await browser.close();
  await stop();
}
