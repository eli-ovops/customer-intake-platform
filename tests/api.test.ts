import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { backup, DatabaseSync } from "node:sqlite";
import { createAdmin, createApp } from "../server/app.ts";
import { openDatabase } from "../server/db.ts";
import { csvCell } from "../server/summary.ts";
const root = resolve("tests/runtime/api-" + Date.now()),
  data = join(root, "data"),
  portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const testPort = (portProbe.address() as any).port;
await new Promise<void>((r) => portProbe.close(() => r()));
const base = "http://127.0.0.1:" + testPort;
const password = randomBytes(20).toString("base64url");
let child: ChildProcess;
let cookie = "",
  csrf = "";
let primary: any,
  cap = "";
const k = () => randomBytes(32).toString("base64url");
async function start() {
  child = spawn(resolve("node_modules/.bin/tsx"), ["server/index.ts"], {
    env: { ...process.env, DATA_DIR: data, PORT: String(testPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostic = "";
  let ready = false;
  child.stdout?.on("data", (c) => {
    if (String(c).includes(base)) ready = true;
  });
  child.stderr?.on("data", (c) => {
    diagnostic += String(c);
  });
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null)
      throw new Error("Owned test server exited: " + diagnostic);
    try {
      if (ready) {
        const r = await fetch(base + "/api/health");
        if (r.ok) return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Test server failed to start: " + diagnostic);
}
async function stop() {
  if (child?.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  opts: { cap?: string; admin?: boolean; csrf?: string; origin?: string } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.cap ? { Authorization: "Bearer " + opts.cap } : {}),
      ...(opts.admin
        ? { Cookie: cookie, "X-CSRF-Token": opts.csrf ?? csrf }
        : {}),
      ...(opts.origin ? { Origin: opts.origin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text, response: r };
}
before(async () => {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const db = openDatabase(data);
  await createAdmin(db, password, true);
  db.close();
  await start();
});
after(async () => {
  await stop();
});
test("unauthorized admin/detail/export denied; customer IDs alone insufficient", async () => {
  for (const p of [
    "/api/admin/intakes",
    "/api/admin/export.csv",
    "/api/admin/intakes/unknown/export",
    "/api/admin/audit",
  ])
    assert.equal((await request(p)).status, 401);
  assert.equal(
    (await request("/api/admin/intakes", "POST", { createKey: k() })).status,
    401,
  );
  assert.equal((await request("/api/intakes/unknown")).status, 401);
});
test("initial login forces change; csrf/origin/session policy enforced", async () => {
  const login = await request("/api/auth/login", "POST", {
    name: "owner",
    password,
  });
  assert.equal(login.status, 200);
  cookie = login.response.headers.get("set-cookie")!.split(";")[0];
  assert.match(login.response.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(login.response.headers.get("set-cookie")!, /SameSite=Strict/i);
  csrf = login.json.csrf;
  assert.equal(
    (await request("/api/admin/intakes", "GET", undefined, { admin: true }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/auth/password",
        "POST",
        { current: password, next: password + "updated" },
        { admin: true, csrf: "invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/auth/password",
        "POST",
        { current: password, next: password + "updated" },
        { admin: true, origin: "http://malicious.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/auth/password",
        "POST",
        { current: password, next: password + "updated" },
        { admin: true },
      )
    ).status,
    200,
  );
});
test("create retries are idempotent; fields cannot spoof staff identity", async () => {
  const createKey = k(),
    first = await request("/api/intakes", "POST", { createKey });
  assert.equal(first.status, 201);
  primary = first.json.record;
  cap = first.json.capability;
  const again = await request("/api/intakes", "POST", { createKey });
  assert.equal(again.json.record.id, primary.id);
  assert.equal(again.json.capability, cap);
  assert.equal(
    (await request("/api/intakes", "POST", { createKey: k(), actor: "staff" }))
      .status,
    400,
  );
  assert.equal(primary.source, "customer");
  assert.match(primary.actor, /自述/);
  assert.equal(
    (
      await request(
        "/api/intakes/" + primary.id,
        "PUT",
        {
          answers: { problem: "虚构问题" },
          mode: "simple",
          revision: 0,
          actor: "owner",
        },
        { cap },
      )
    ).status,
    400,
  );
});
test("draft preserves detailed answers across mode changes and denies horizontal access", async () => {
  let r = await request(
    "/api/intakes/" + primary.id,
    "PUT",
    {
      answers: {
        organization: "虚构织造团队",
        industry: "虚构制造",
        problem: "虚构需求：漏掉客户跟进",
        types: ["网站与客户触达", "AI辅助"],
        websiteAudience: "虚构经销商",
        aiTask: "整理访谈",
        filledBy: "工作人员（伪造）",
      },
      mode: "detailed",
      revision: 0,
    },
    { cap },
  );
  assert.equal(r.status, 200);
  primary = r.json;
  assert.match(primary.actor, /自述/);
  r = await request(
    "/api/intakes/" + primary.id,
    "PUT",
    { answers: primary.answers, mode: "simple", revision: primary.revision },
    { cap },
  );
  assert.equal(r.status, 200);
  primary = r.json;
  assert.equal(primary.answers.aiTask, "整理访谈");
  const other = await request("/api/intakes", "POST", { createKey: k() });
  assert.equal(
    (
      await request("/api/intakes/" + other.json.record.id, "GET", undefined, {
        cap,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/api/intakes/" + other.json.record.id,
        "PUT",
        { answers: { problem: "cross" }, mode: "simple", revision: 0 },
        { cap },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/api/intakes/" + primary.id, "GET", undefined, {
        cap: k(),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/api/intakes/" + other.json.record.id + "/submit",
        "POST",
        {
          answers: { problem: "unauthorized supplement" },
          mode: "simple",
          revision: 0,
          requestKey: k(),
        },
        { cap },
      )
    ).status,
    404,
  );
  assert.equal((await request("/api/intakes/" + primary.id)).status, 401);
});
test("submit retries generate one snapshot; supplement preserves first original; optimistic conflict rejected", async () => {
  const body = {
    answers: primary.answers,
    mode: "simple",
    revision: primary.revision,
    requestKey: k(),
  };
  const first = await request(
    "/api/intakes/" + primary.id + "/submit",
    "POST",
    body,
    { cap },
  );
  assert.equal(first.status, 200);
  primary = first.json;
  const repeated = await request(
    "/api/intakes/" + primary.id + "/submit",
    "POST",
    body,
    { cap },
  );
  assert.equal(repeated.status, 200);
  assert.equal(repeated.json.submissions.length, 1);
  assert.equal(
    (
      await request(
        "/api/intakes/" + primary.id,
        "PUT",
        { answers: primary.answers, mode: "simple", revision: 0 },
        { cap },
      )
    ).status,
    409,
  );
  const second = await request(
    "/api/intakes/" + primary.id + "/submit",
    "POST",
    {
      answers: { ...primary.answers, problem: "补充：虚构报价流程" },
      mode: "detailed",
      revision: primary.revision,
      requestKey: k(),
    },
    { cap },
  );
  assert.equal(second.status, 200);
  primary = second.json;
  assert.equal(primary.submissions.length, 2);
  assert.equal(
    primary.submissions[0].answers.problem,
    "虚构需求：漏掉客户跟进",
  );
  assert.equal(primary.submissions[1].answers.problem, "补充：虚构报价流程");
});
test("staff notes and stage separate from originals; summary questions and exports safe", async () => {
  const x = "<script>globalThis.__intake_xss=1</script>";
  let r = await request(
    "/api/admin/intakes/" + primary.id + "/notes",
    "POST",
    { body: x },
    { admin: true },
  );
  assert.equal(r.status, 201);
  assert.equal(r.json.notes[0].body, x);
  assert.match(r.json.notes[0].actor, /工作人员：owner/);
  assert.equal(r.json.submissions[0].answers.problem, "虚构需求：漏掉客户跟进");
  r = await request(
    "/api/admin/intakes/" + primary.id + "/stage",
    "PATCH",
    { stage: "待访谈" },
    { admin: true },
  );
  assert.equal(r.json.stage, "待访谈");
  assert.ok(r.json.summary.questions.length >= 3);
  assert.equal(
    (
      await request(
        "/api/admin/intakes/" + primary.id + "/stage",
        "PATCH",
        { stage: "未知阶段" },
        { admin: true },
      )
    ).status,
    400,
  );
  const md = await request(
    "/api/admin/intakes/" + primary.id + "/export",
    "GET",
    undefined,
    { admin: true },
  );
  assert.match(md.text, /提交原文版本/);
  assert.match(md.text, /虚构/);
  const json = await request(
    "/api/admin/intakes/" + primary.id + "/export?format=json",
    "GET",
    undefined,
    { admin: true },
  );
  assert.equal(json.json.submissions.length, 2);
  const search = await request(
    "/api/admin/intakes?q=" + encodeURIComponent("织造"),
    "GET",
    undefined,
    { admin: true },
  );
  assert.equal(search.json.records.length, 1);
  const csv = await request("/api/admin/export.csv", "GET", undefined, {
    admin: true,
  });
  assert.match(csv.text, /虚构织造团队/);
  for (const v of ["=SUM(1,1)", "  +cmd", "\t@x", "-2", "\n=x"])
    assert.ok(csvCell(v).startsWith("\"'"));
  assert.equal(csvCell("中文"), '"中文"');
});
test("staff creation authenticates actor; write/export require server session and csrf", async () => {
  assert.equal(
    (
      await request(
        "/api/admin/intakes",
        "POST",
        { createKey: k() },
        { admin: true, csrf: "wrong" },
      )
    ).status,
    403,
  );
  const staff = await request(
    "/api/admin/intakes",
    "POST",
    { createKey: k() },
    { admin: true },
  );
  assert.equal(staff.status, 201);
  assert.equal(staff.json.record.source, "staff");
  assert.equal(staff.json.capability, null);
  assert.equal(staff.json.record.actor, "工作人员：owner");
  const formula = await request(
    "/api/admin/intakes/" + staff.json.record.id,
    "PUT",
    {
      answers: {
        organization: "=SUM(1,1)",
        industry: "不确定",
        problem: "虚构公式防护",
      },
      mode: "simple",
      revision: 0,
    },
    { admin: true },
  );
  assert.equal(formula.status, 200);
  const protectedCsv = await request(
    "/api/admin/export.csv",
    "GET",
    undefined,
    { admin: true },
  );
  assert.ok(protectedCsv.text.includes('"\'=SUM(1,1)"'));

  assert.equal(
    (
      await request("/api/intakes/" + staff.json.record.id, "GET", undefined, {
        cap,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/api/admin/intakes/" + primary.id + "/notes",
        "POST",
        { body: "unauthorized" },
        { cap },
      )
    ).status,
    401,
  );
});
test("actual service process restart persists draft, snapshots, notes and sessions", async () => {
  const oldPid = child.pid;
  await stop();
  await start();
  assert.notEqual(child.pid, oldPid);
  const r = await request("/api/intakes/" + primary.id, "GET", undefined, {
    cap,
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.submissions.length, 2);
  assert.equal(r.json.answers.aiTask, "整理访谈");
  const admin = await request(
    "/api/admin/intakes/" + primary.id,
    "GET",
    undefined,
    { admin: true },
  );
  assert.equal(admin.status, 200);
  assert.equal(admin.json.notes.length, 1);
  assert.equal(admin.json.stage, "待访谈");
});
test("online backup restored into independent virtual-data copy; integrity and original contents match", async () => {
  const source = new DatabaseSync(join(data, "intake.sqlite"), {
    readOnly: true,
  });
  const restoreDir = join(root, "restore");
  mkdirSync(restoreDir, { recursive: true, mode: 0o700 });
  const destination = join(restoreDir, "intake.sqlite");
  await backup(source, destination);
  const restored = new DatabaseSync(destination, { readOnly: true });
  assert.equal(
    (restored.prepare("PRAGMA integrity_check").get() as any).integrity_check,
    "ok",
  );
  for (const table of [
    "intakes",
    "submissions",
    "notes",
    "summaries",
    "users",
    "sessions",
    "audit",
  ])
    assert.deepEqual(
      restored.prepare("SELECT * FROM " + table + " ORDER BY 1").all(),
      source.prepare("SELECT * FROM " + table + " ORDER BY 1").all(),
    );
  const restoredApp = createApp(restoreDir);
  const listener = restoredApp.app.listen(4183, "127.0.0.1");
  await once(listener, "listening");
  try {
    const r = await fetch("http://127.0.0.1:4183/api/intakes/" + primary.id, {
      headers: { Authorization: "Bearer " + cap },
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).submissions.length, 2);
  } finally {
    await new Promise<void>((r) => listener.close(() => r()));
    restoredApp.db.close();
    restored.close();
    source.close();
  }
});
test("database write failure returns error and performs zero partial writes", async () => {
  const dir = join(root, "failure");
  const f = createApp(dir);
  const listener = f.app.listen(4184, "127.0.0.1");
  await once(listener, "listening");
  try {
    const createKey = k();
    const c = await fetch("http://127.0.0.1:4184/api/intakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createKey }),
    });
    const { record, capability } = await c.json();
    f.db.exec("PRAGMA query_only=ON");
    const r = await fetch("http://127.0.0.1:4184/api/intakes/" + record.id, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + capability,
      },
      body: JSON.stringify({
        answers: {
          organization: "虚构",
          industry: "不确定",
          problem: "must not save",
        },
        mode: "simple",
        revision: 0,
      }),
    });
    assert.equal(r.status, 500);
    const read = await fetch("http://127.0.0.1:4184/api/intakes/" + record.id, {
      headers: { Authorization: "Bearer " + capability },
    });
    const got = await read.json();
    assert.equal(got.revision, 0);
    assert.deepEqual(got.answers, {});
  } finally {
    await new Promise<void>((r) => listener.close(() => r()));
    f.db.close();
  }
});
test("logout revokes session; expired session rejected; invalid methods and oversized bodies rejected", async () => {
  assert.equal(
    (await request("/api/intakes/" + primary.id, "DELETE", {}, { cap })).status,
    404,
  );
  const large = await request("/api/intakes", "POST", {
    createKey: k(),
    padding: "x".repeat(60000),
  });
  assert.equal(large.status, 413);
  const out = await request("/api/auth/logout", "POST", {}, { admin: true });
  assert.equal(out.status, 200);
  assert.equal(
    (await request("/api/admin/intakes", "GET", undefined, { admin: true }))
      .status,
    401,
  );
  const login = await request("/api/auth/login", "POST", {
    name: "owner",
    password: password + "updated",
  });
  cookie = login.response.headers.get("set-cookie")!.split(";")[0];
  const db = openDatabase(data);
  db.prepare("UPDATE sessions SET expires=0").run();
  db.close();
  assert.equal(
    (await request("/api/admin/intakes", "GET", undefined, { admin: true }))
      .status,
    401,
  );
});

test("required answers are enforced on submission while incomplete drafts remain valid", async () => {
  const created = await request("/api/intakes", "POST", { createKey: k() });
  const { record, capability } = created.json;
  const draft = await request(
    "/api/intakes/" + record.id,
    "PUT",
    { answers: {}, mode: "simple", revision: 0 },
    { cap: capability },
  );
  assert.equal(draft.status, 200);
  const full = {
    organization: "虚构验证",
    industry: "不确定",
    problem: "虚构问题",
  };
  for (const missing of ["organization", "industry", "problem"]) {
    const answers: Record<string, string> = { ...full, [missing]: "   " };
    const rejected = await request(
      "/api/intakes/" + record.id + "/submit",
      "POST",
      {
        answers,
        mode: "simple",
        revision: draft.json.revision,
        requestKey: k(),
      },
      { cap: capability },
    );
    assert.equal(rejected.status, 400);
  }
  const submitted = await request(
    "/api/intakes/" + record.id + "/submit",
    "POST",
    {
      answers: full,
      mode: "simple",
      revision: draft.json.revision,
      requestKey: k(),
    },
    { cap: capability },
  );
  assert.equal(submitted.status, 200);
  assert.equal(submitted.json.submissions.length, 1);
});

test("adaptive selections and inactive branch answers persist in draft and submission snapshots", async () => {
  const created = await request("/api/intakes", "POST", { createKey: k() });
  const { record, capability } = created.json;
  const answers = {
    organization: "虚构行业分支",
    industry: "批发与零售",
    problem: "虚构库存问题",
    size: "200人以上",
    customerType: "企业 / 商户",
    projectStage: "已有工具，需要改进",
    types: ["网站与客户触达", "数据与报表"],
    retailFocus: ["商品与库存"],
    retailConstraints: ["多门店"],
    largeGovernance: ["按角色或部门限制权限"],
    existingProjectIssue: ["数据不准确或分散"],
    reportGoal: ["库存、产能或资源使用"],
    manufacturingFocus: ["物料与库存"],
  };
  const draft = await request(
    "/api/intakes/" + record.id,
    "PUT",
    { answers, mode: "detailed", revision: 0 },
    { cap: capability },
  );
  assert.equal(draft.status, 200);
  const submission = await request(
    "/api/intakes/" + record.id + "/submit",
    "POST",
    {
      answers,
      mode: "detailed",
      revision: draft.json.revision,
      requestKey: k(),
    },
    { cap: capability },
  );
  assert.equal(submission.status, 200);
  const loaded = await request("/api/intakes/" + record.id, "GET", undefined, {
    cap: capability,
  });
  assert.deepEqual(loaded.json.answers, answers);
  assert.deepEqual(loaded.json.submissions[0].answers, answers);
  // Customer responses intentionally omit staff-only summaries.
  assert.equal(loaded.json.summary, undefined);
});
