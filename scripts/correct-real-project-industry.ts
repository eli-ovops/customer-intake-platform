import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { openDeliveryRuntime } from "../server/delivery-runtime.ts";
import { transaction } from "../server/db.ts";
const root = resolve("runtime/real-projects-20261012");
const runtime = openDeliveryRuntime(root);
try {
  const db = runtime.db,
    actor = "PMO资料补正",
    now = new Date().toISOString();
  const rows = db.prepare("SELECT * FROM intakes ORDER BY id").all() as any[];
  const row = rows.find(
    (r) => JSON.parse(r.answers).organization === "淼瀚洁具库存系统",
  );
  assert(row && row.source === "project");
  const originalVersions = db
    .prepare("SELECT * FROM submissions WHERE intake_id=? ORDER BY version")
    .all(row.id) as any[];
  assert.equal(originalVersions.length, 1, "Correction must not run twice");
  const w = runtime.store.get(row.id),
    originalSnapshots = JSON.stringify(w.snapshots);
  const answers = JSON.parse(row.answers);
  assert.equal(answers.industry, "批发与零售");
  const correction =
    "资料v1的行业标签为整理时推断，原件没有确认；资料v2更正为空缺（行业待确认），不代表客户新增回答。";
  answers.industry = "";
  answers.additional += "\n补正说明：" + correction;
  const submissionId = randomUUID();
  transaction(db, () => {
    db.prepare(
      "UPDATE intakes SET answers=?,revision=revision+1,updated=? WHERE id=?",
    ).run(JSON.stringify(answers), now, row.id);
    db.prepare("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)").run(
      submissionId,
      row.id,
      2,
      randomUUID(),
      JSON.stringify(answers),
      row.mode,
      actor,
      now,
    );
    db.prepare("INSERT INTO notes VALUES(?,?,?,?,?)").run(
      randomUUID(),
      row.id,
      correction,
      actor,
      now,
    );
  });
  const updated = runtime.store.action(
    row.id,
    w.id,
    {
      revision: w.revision,
      requestKey: randomUUID(),
      op: "switchSource",
      args: { submissionId },
    },
    actor,
  );
  assert(updated.sourceValid);
  assert.equal(
    updated.snapshots.find(
      (s: { id: string; payload: any }) => s.id === updated.state.source,
    )!.payload.answers.industry,
    "",
  );
  assert.equal(
    JSON.stringify(updated.snapshots.slice(0, w.snapshots.length)),
    originalSnapshots,
  );
  assert.deepEqual(
    db
      .prepare("SELECT * FROM submissions WHERE intake_id=? AND version=1")
      .all(row.id),
    originalVersions,
  );
  for (const other of rows.filter((r) => r.id !== row.id))
    assert.deepEqual(
      db.prepare("SELECT * FROM intakes WHERE id=?").get(other.id),
      other,
    );
  assert.equal(db.prepare("SELECT count(*) AS n FROM intakes").get()!.n, 4);
  const p = join(root, "import-receipt.json"),
    receipt = JSON.parse(readFileSync(p, "utf8"));
  receipt.corrections = [
    {
      at: now,
      intakeId: row.id,
      field: "industry",
      currentValue: "",
      status: "unknown",
      documentVersion: 2,
      previousVersionPreserved: true,
      reason: correction,
    },
  ];
  writeFileSync(p, JSON.stringify(receipt, null, 2));
  writeFileSync(
    resolve("evidence/real-projects-20261012/industry-correction-receipt.json"),
    JSON.stringify(
      {
        status: "PASSED",
        at: now,
        intakeId: row.id,
        field: "industry",
        value: "",
        documentVersion: 2,
        sourceValid: true,
        oldVersionsAndSnapshotsRetained: true,
        otherRecordsUnchanged: true,
        count: 4,
        scopeQuotePlan: [
          updated.state.scope,
          updated.state.quote,
          updated.state.plan,
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Industry corrected to unknown; new source v2 saved; original version and other records retained",
  );
} finally {
  runtime.close();
}
