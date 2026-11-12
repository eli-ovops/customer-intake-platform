import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { restoreBatch } from "../server/delivery-packages.ts";
import {
  initializeAuth,
  openDeliveryRuntime,
} from "../server/delivery-runtime.ts";
import { readIdentity, initializeRoot } from "../server/delivery-root.ts";
const base = "http://127.0.0.1:4181",
  root = resolve("runtime/real-projects-20261012"),
  evidence = resolve("evidence/real-projects-20261012");
mkdirSync(evidence, { recursive: true });
const health = (await (await fetch(base + "/api/health")).json()) as any;
assert.equal(health.syntheticOnly, false);
assert.equal((await fetch(base + "/api/admin/intakes")).status, 401);
const boot = await fetch(base + "/api/auth/local-session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: "{}",
});
assert.equal(boot.status, 200);
const cookie = boot.headers.get("set-cookie")!.split(";")[0],
  session = (await boot.json()) as any;
const headers = {
  Cookie: cookie,
  "Content-Type": "application/json",
  Origin: base,
  "X-CSRF-Token": session.csrf,
};
const list = (await (
  await fetch(base + "/api/admin/intakes", { headers })
).json()) as any;
assert.equal(list.records.length, 4);
assert.throws(
  () => initializeRoot(root, { syntheticOnly: false }),
  /初始化目标已存在/,
);
assert(
  list.records.every(
    (r: any) => r.source === "project" && r.status === "draft",
  ),
);
assert(!JSON.stringify(list).includes("虚构"));
const imported = JSON.parse(
  readFileSync(join(root, "import-receipt.json"), "utf8"),
);
for (const p of imported.projects)
  for (const source of p.sources)
    assert.equal(
      createHash("sha256").update(readFileSync(source.path)).digest("hex"),
      source.sha256,
    );
for (const record of list.records) {
  const detail = (await (
    await fetch(base + "/api/admin/intakes/" + record.id, { headers })
  ).json()) as any;
  assert.equal(detail.actor, "PMO资料整理导入");
  assert(detail.answers.additional.includes("非客户本人问卷"));
  assert.equal(detail.answers.contact, undefined);
  assert.equal(detail.answers.budget, undefined);
  const url = base + "/api/admin/intakes/" + record.id + "/delivery";
  const w = (await (await fetch(url, { headers })).json()) as any;
  assert(w.sourceValid);
  assert.equal(w.state.scope, null);
  assert.equal(w.state.quote, null);
  assert.equal(w.state.plan, null);
  assert.equal(w.state.publicPermission, "unknown");
  assert(w.state.requirements.every((r: any) => r.status === "later"));
}
const first = list.records[0];
const url = base + "/api/admin/intakes/" + first.id + "/delivery";
const w = (await (await fetch(url, { headers })).json()) as any;
const body = JSON.stringify({
  revision: w.revision,
  requestKey: randomUUID(),
  op: "scopeMeta",
  args: w.state.scopeMeta,
});
const endpoint = url + "/" + w.id + "/actions";
assert.equal(
  (
    await fetch(endpoint, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Origin: base,
      },
      body,
    })
  ).status,
  403,
);
assert.equal(
  (
    await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, Origin: "https://example.com" },
      body,
    })
  ).status,
  403,
);
assert.equal(
  (await fetch(endpoint, { method: "POST", headers, body })).status,
  200,
);
const persisted = (await (await fetch(url, { headers })).json()) as any;
assert.equal(persisted.revision, w.revision + 1);
assert.deepEqual(persisted.state.scopeMeta, w.state.scopeMeta);
const backup = (await (
  await fetch(base + "/api/admin/delivery-system/backup", {
    method: "POST",
    headers,
    body: "{}",
  })
).json()) as any;
assert.equal(backup.status, "COMPLETED");
assert.equal(backup.syntheticOnly, false);
const restoredRoot = resolve(
  "tests/runtime/real-documents-restore-" + Date.now(),
);
await restoreBatch(join(root, "backups", backup.exportId), restoredRoot);
assert.equal(readIdentity(restoredRoot).syntheticOnly, false);
assert.equal(readIdentity(restoredRoot).localPrivateAccess, undefined);
await initializeAuth(restoredRoot, true);
const runtime = openDeliveryRuntime(restoredRoot, { localPrivateAccess: true });
const server = runtime.app.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const restoreUrl = "http://127.0.0.1:" + (server.address() as any).port;
  assert.equal(
    (
      await fetch(restoreUrl + "/api/auth/local-session", {
        method: "POST",
        headers: { Origin: restoreUrl, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(restoreUrl + "/api/admin/intakes", {
        headers: { Cookie: cookie },
      })
    ).status,
    401,
  );
  assert.equal(
    runtime.db
      .prepare("SELECT count(*) AS n FROM intakes WHERE source='project'")
      .get()!.n,
    4,
  );
  assert.deepEqual(runtime.store.get(first.id).state, persisted.state);
} finally {
  await new Promise<void>((r) => server.close(() => r()));
  runtime.close();
}
const receipt = {
  status: "PASSED",
  at: new Date().toISOString(),
  realDataRoot: root,
  syntheticOnly: false,
  count: 4,
  sourceHashesMatched: true,
  checks: [
    "private root identity and four document-derived records",
    "no fake client submission, price or contact",
    "default unauthorized denied; explicit local session only",
    "CSRF and Origin still enforced",
    "real save revision and reread",
    "real two-db backup and independent restore retain data nature",
    "restore gets fresh authentication and rejects old sessions/local auto entry",
  ],
  restoredRoot,
  backupId: backup.exportId,
};
writeFileSync(
  join(evidence, "api-restore-receipt.json"),
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt));
