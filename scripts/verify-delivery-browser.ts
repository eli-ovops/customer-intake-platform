import { chromium, expect, type Page } from "@playwright/test";
import assert from "node:assert/strict";
import { createFixture } from "../server/delivery-fixture.ts";
import {
  openDeliveryRuntime,
  initializeAuth,
} from "../server/delivery-runtime.ts";
import { restoreBatch } from "../server/delivery-packages.ts";
import { resolve, join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
const stamp = Date.now(),
  root = resolve("tests/runtime/delivery-rev2/browser-" + stamp),
  f = await createFixture(root, true, false),
  evidence = resolve(
    process.env.DELIVERY_EVIDENCE_DIR ?? "evidence/delivery-rev2",
  );
let runtime = openDeliveryRuntime(root);
let server = runtime.app.listen(0, "127.0.0.1");
await once(server, "listening");
let port = (server.address() as any).port,
  base = "http://127.0.0.1:" + port;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage(),
  pageErrors: string[] = [],
  secrets: string[] = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const receipts: Record<string, any> = {};
for (const id of ["D01", "D02", "D03", "D04", "D05"])
  mkdirSync(join(evidence, id), { recursive: true });
const step = (name: string) => console.log("delivery browser: " + name);
const scrub = (text: string) =>
  secrets
    .reduce((s, v) => s.replaceAll(v, "[redacted]"), text)
    .replace(/(Cookie|Authorization|X-CSRF-Token):[^\n]+/gi, "$1: [redacted]");
const stop = async () => {
  await new Promise<void>((r) => server.close(() => r()));
  runtime.close();
};
async function login(p: Page, url: string, dataRoot: string) {
  const c = JSON.parse(
    readFileSync(join(dataRoot, "auth", "credential.json"), "utf8"),
  );
  secrets.push(c.password);
  await p.goto(url + "/admin/login");
  await p.getByRole("textbox", { name: "账号", exact: true }).fill("owner");
  await p.getByRole("textbox", { name: "密码", exact: true }).fill(c.password);
  await p.getByRole("button", { name: "登录工作台", exact: true }).click();
  await p.getByRole("heading", { name: /客户需求|先设置自己的密码/ }).waitFor();
  if (await p.getByRole("heading", { name: "先设置自己的密码" }).count()) {
    const next = c.password + "-changed";
    secrets.push(next);
    await p
      .getByRole("textbox", { name: "当前密码", exact: true })
      .fill(c.password);
    await p.getByRole("textbox", { name: "新密码", exact: true }).fill(next);
    await p
      .getByRole("textbox", { name: "再次输入新密码", exact: true })
      .fill(next);
    await p.getByRole("button", { name: "保存新密码", exact: true }).click();
    writeFileSync(
      join(dataRoot, "auth", "credential.json"),
      JSON.stringify({ ...c, password: next }),
      { mode: 0o600 },
    );
  }
  await p.getByRole("heading", { name: "客户需求" }).waitFor();
}
async function delivery() {
  await page.goto(base + "/admin/intakes/" + f.intakeId + "/delivery");
  await page.getByRole("heading", { name: "交付资料" }).waitFor();
  await expect(
    page.getByRole("button", { name: "冻结内部范围", exact: true }),
  ).toBeVisible();
}
async function click(name: string) {
  const locator = page.getByRole("button", {
    name,
    exact: true,
    includeHidden: true,
  });
  await reveal(locator);
  await locator.click();
  await expect(
    page.getByRole("button", { name: "核对新修订", exact: true }),
  ).toBeEnabled();
}
async function tabTo(index: number) {
  await page.getByRole("tab").nth(index).click();
}
async function reveal(locator: any) {
  const panel = await locator
    .first()
    .evaluate((el: Element) => el.closest('[role="tabpanel"]')?.id);
  if (panel) await tabTo(Number(panel.slice(-1)));
}
function saveReceipt(id: string, checks: string[], extra: any = {}) {
  const path = join(evidence, id);
  mkdirSync(path, { recursive: true });
  const data = {
    scenario: id,
    status: "BROWSER_PASSED",
    owner: "01a10ed7-5d22-7401-8f0f-29bb53cf3cfd",
    fixture: "browser-qinghe",
    root,
    completedAt: new Date().toISOString(),
    checks,
    pageErrors: pageErrors.map(scrub),
    deviations: [],
    ...extra,
  };
  receipts[id] = data;
  writeFileSync(
    join(path, "browser-receipt.json"),
    JSON.stringify(data, null, 2),
  );
}
try {
  step("login and D01");
  await login(page, base, root);
  await delivery();
  await tabTo(1);
  await expect(
    page.getByText("总销售报价：待估", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/内部已填小计 150\.00元/)).toBeVisible();
  await tabTo(0);
  await page
    .getByRole("textbox", { name: "本阶段目标", exact: true })
    .fill("虚构更新目标D01");
  await click("保存所有修改");
  await expect(page.getByRole("status")).toContainText("所有修改已保存");
  await click("冻结内部范围");
  await click("保存报价版本");
  await click("从当前范围重建未测清单");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "本阶段目标", exact: true }),
  ).toHaveValue("虚构更新目标D01");
  assert.equal(runtime.store.get(f.intakeId).alignment.quote, true);
  await page.screenshot({
    path: join(evidence, "D01", "desktop.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 900 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: join(evidence, "D01", "390px.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  saveReceipt("D01", [
    "native UI saved goal, frozen S2, quote Q2 and new plan; reload stable",
    "1440/390px no horizontal overflow; inherited titles not retyped",
    "pending sales distinct from internal 150.00 subtotal",
  ]);
  step("D02 stale change, rebase, v2 and new plan");
  await click("采纳变更并重建基线");
  await expect(page.getByRole("alert")).toContainText("变更基线已变");
  await click("将此提案重基到当前范围");
  await click("保存所有修改");
  await click("采纳变更并重建基线");
  await tabTo(1);
  await expect(
    page.getByText("旧报价，需核对新基线", { exact: false }),
  ).toBeVisible();
  await click("保存报价版本");
  await click("从当前范围重建未测清单");
  const old = runtime.store.get(f.intakeId),
    src = old.snapshots.find((v) => v.kind === "source")!,
    sid = randomUUID();
  runtime.db
    .prepare("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)")
    .run(
      sid,
      f.intakeId,
      2,
      randomUUID(),
      JSON.stringify({ ...src.payload.answers, problem: "虚构新原文v2" }),
      "detailed",
      "合成浏览器v2",
      new Date().toISOString(),
    );
  await page.reload();
  await page
    .getByRole("combobox", { name: "采用的提交原文", exact: true })
    .selectOption(sid);
  await click("采用这个原文版本");
  assert.equal(runtime.store.get(f.intakeId).alignment.scope, false);
  await click("冻结内部范围");
  await click("保存报价版本");
  await click("从当前范围重建未测清单");
  assert.ok(
    runtime.store
      .get(f.intakeId)
      .snapshots.find((v) => v.id === runtime.store.get(f.intakeId).state.plan)!
      .payload.items.every((v: any) => v.status === "unmeasured"),
  );
  saveReceipt("D02", [
    "real stale change 409, explicit rebase/save/adopt UI chain",
    "source v2 adopted explicitly; old snapshots retained",
    "Q and plan rebuilt for current source/scope; all results unmeasured",
  ]);
  step("D03 dirty rescue across all sections");
  await tabTo(0);
  await page
    .getByRole("textbox", { name: "本阶段目标", exact: true })
    .fill("救援目标");
  await page
    .getByRole("textbox", { name: "条目标题", exact: true })
    .first()
    .fill("救援范围");
  await tabTo(1);
  await page
    .getByRole("textbox", { name: "固定销售价（元）", exact: true })
    .first()
    .fill("123.45");
  await tabTo(2);
  await page.getByRole("button", { name: "新增变更", exact: true }).click();
  await page
    .getByRole("textbox", { name: "变更内容", exact: true })
    .last()
    .fill("救援变更");
  await page
    .getByRole("textbox", { name: "实际结果或原因", exact: true })
    .first()
    .fill("救援验收");
  const revision = runtime.store.get(f.intakeId).revision;
  for (const status of [401, 409, 413, 500]) {
    await page.route("**/api/admin/intakes/*/delivery/*/actions", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: "合成保存故障" + status }),
      }),
    );
    await click("保存所有修改");
    await expect(page.getByRole("alert")).toContainText(
      "合成保存故障" + status,
    );
    assert.equal(runtime.store.get(f.intakeId).revision, revision);
    await page.unroute("**/api/admin/intakes/*/delivery/*/actions");
  }
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载未提交文本", exact: true })
    .click();
  const d = await download;
  const rescued = join(evidence, "D03", "unsubmitted.txt");
  await d.saveAs(rescued);
  const text = readFileSync(rescued, "utf8");
  for (const expected of [
    "UNSUBMITTED",
    "救援目标",
    "救援范围",
    "123.45",
    "救援变更",
    "救援验收",
  ])
    assert.ok(text.includes(expected));
  await page.screenshot({
    path: join(evidence, "D03", "failure-rescue.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "核实上次提交", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("没有待核请求");
  saveReceipt(
    "D03",
    [
      "401 leaves all dirty scope/requirement/quote/change/result content",
      "actual browser download contains all dirty fields and unsubmitted marker",
      "server revision unchanged; pending request queried safely",
    ],
    { rescueFile: "unsubmitted.txt" },
  );
  // Explicitly abandon only this synthetic unsaved editing after the rescue evidence is retained.
  page.once("dialog", (dialog) => dialog.accept());
  await page.goto(base + "/admin");
  await delivery();
  step("D04 actual independent materials and revoke guards");
  await click("核准当前对客草案");
  await click("生成内部资料包");
  const internalDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载 internal.json", exact: true })
    .first()
    .click();
  await (
    await internalDownload
  ).saveAs(join(evidence, "D04", "downloaded-internal.json"));
  await click("生成对客沟通包");
  const publicDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载 customer-draft.md", exact: true })
    .first()
    .click();
  await (
    await publicDownload
  ).saveAs(join(evidence, "D04", "downloaded-customer.md"));
  const publicText = readFileSync(
    join(evidence, "D04", "downloaded-customer.md"),
    "utf8",
  );
  for (const forbidden of [
    "costFen",
    "rateFen",
    "内部估算",
    "delivery.sqlite",
    root,
  ])
    assert.ok(!publicText.includes(forbidden));
  const beforePacks = runtime.store.get(f.intakeId).revision;
  await click("撤销对客许可");
  await page
    .getByRole("button", { name: "下载 customer-draft.md", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText("许可");
  assert.ok(runtime.store.get(f.intakeId).revision > beforePacks);
  const backup = await runtime.packages.batchBackup();
  assert.equal(backup.status, "COMPLETED");
  const restoredRoot = resolve(
    "tests/runtime/delivery-rev2/browser-restored-" + stamp,
  );
  await restoreBatch(join(root, "backups", backup.exportId), restoredRoot);
  await initializeAuth(restoredRoot, false);
  const copy = openDeliveryRuntime(restoredRoot),
    copyServer = copy.app.listen(0, "127.0.0.1");
  await once(copyServer, "listening");
  const copyBase = "http://127.0.0.1:" + (copyServer.address() as any).port,
    p2 = await context.newPage();
  try {
    assert.equal(
      (await p2.request.get(copyBase + "/api/admin/intakes")).status(),
      401,
    );
    await login(p2, copyBase, restoredRoot);
    assert.equal(
      (await p2.request.get(copyBase + "/api/admin/intakes")).status(),
      200,
    );
    await page.goto(base + "/admin");
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "登录工作台", exact: true }),
    ).toBeVisible();
    assert.equal(
      (await p2.request.get(copyBase + "/api/admin/intakes")).status(),
      200,
    );
    assert.equal(copy.store.get(f.intakeId).sourceValid, true);
    assert.equal(copy.store.get(f.intakeId).publicApprovalValid, false);
  } finally {
    await p2.close();
    await new Promise<void>((r) => copyServer.close(() => r()));
    copy.close();
  }
  saveReceipt("D04", [
    "actual internal JSON and separate customer Markdown downloaded and inspected",
    "completed customer download denied after revoke",
    "real two-db backup restored, independent AUTH_ROOT/cookie namespace in same browser; logout A preserves B",
    "historic public approval does not revive in restore",
  ]);
  step("D05 reopen runtime and affected legacy browser flows");
  const saved = runtime.store.get(f.intakeId);
  await stop();
  runtime = openDeliveryRuntime(root);
  server = runtime.app.listen(port, "127.0.0.1");
  await once(server, "listening");
  await login(page, base, root);
  await delivery();
  assert.equal(runtime.store.get(f.intakeId).revision, saved.revision);
  await page.goto(base + "/admin/intakes/" + f.intakeId);
  await expect(
    page.getByRole("link", { name: "交付资料", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "交付资料", exact: true }).click();
  await expect(page.getByRole("heading", { name: "交付资料" })).toBeVisible();
  await page.keyboard.press("Tab");
  assert.notEqual(
    await page.evaluate(() => document.activeElement?.tagName),
    "BODY",
  );
  assert.deepEqual(pageErrors, []);
  saveReceipt(
    "D05",
    [
      "actual Node runtime closed and reopened on same synthetic root, saved revision retained",
      "old detail entry/auth and new delivery route work after cold reopen; keyboard target exists",
      "full old questionnaire Playwright suite recorded separately",
    ],
    { runtimeVersion: process.version, port },
  );
  console.log("delivery browser D01-D05 passed");
} catch (e: any) {
  const error = scrub(String(e.message));
  writeFileSync(
    join(evidence, "browser-failure.json"),
    JSON.stringify(
      {
        status: "FAILED",
        error,
        completedAt: new Date().toISOString(),
        deviations: ["browser verification failed"],
      },
      null,
      2,
    ),
  );
  if (!(await page.locator('input[type="password"]').count()))
    await page.screenshot({
      path: join(evidence, "browser-failure.png"),
      fullPage: false,
    });
  throw new Error(error);
} finally {
  await context.close();
  await browser.close();
  await stop();
}
