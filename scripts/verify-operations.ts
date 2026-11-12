import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const virtual = JSON.parse(
  readFileSync("tests/runtime/browser-credential.json", "utf8"),
).dir as string;
assert.ok(virtual.startsWith(resolve("tests/runtime") + "/browser-"));
const started = Date.now(),
  before = new Set(readdirSync("backups"));
execFileSync("npm", ["run", "backup"], {
  env: { ...process.env, DATA_DIR: virtual },
  stdio: "pipe",
});
const added = readdirSync("backups").filter((f) => !before.has(f));
assert.equal(added.length, 1);
const source = join("backups", added[0]),
  target = "data/restored-qa-" + Date.now();
execFileSync("npm", ["run", "restore", "--", source, target], {
  stdio: "pipe",
});
const a = new DatabaseSync(join(virtual, "intake.sqlite"), { readOnly: true }),
  b = new DatabaseSync(join(target, "intake.sqlite"), { readOnly: true });
const tables = [
  "intakes",
  "submissions",
  "notes",
  "summaries",
  "users",
  "sessions",
  "audit",
];
const counts: Record<string, number> = {};
for (const table of tables) {
  const originals = a.prepare("SELECT * FROM " + table + " ORDER BY 1").all();
  assert.deepEqual(
    b.prepare("SELECT * FROM " + table + " ORDER BY 1").all(),
    originals,
  );
  counts[table] = originals.length;
}
assert.equal(
  (b.prepare("PRAGMA integrity_check").get() as any).integrity_check,
  "ok",
);
a.close();
b.close();
const again = spawnSync("npm", ["run", "restore", "--", source, target], {
  stdio: "pipe",
});
assert.notEqual(again.status, 0);
const outside = spawnSync(
  "npm",
  ["run", "restore", "--", source, "../outside-restore"],
  { stdio: "pipe" },
);
assert.notEqual(outside.status, 0);
const result = {
  result: "pass",
  virtualSource: virtual,
  backup: resolve(source),
  independentRestore: resolve(target),
  tables: counts,
  elapsedMs: Date.now() - started,
  existingTargetRejected: true,
  outsideTargetRejected: true,
  originalLiveDataUntouched: true,
};
writeFileSync(
  "evidence/operations-restore.json",
  JSON.stringify(result, null, 2),
);
console.log(
  "Backup/restore CLI passed on independent virtual-data copy; existing and outside destinations rejected.",
);
