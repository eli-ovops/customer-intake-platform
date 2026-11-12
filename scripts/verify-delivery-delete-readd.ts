import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createFixture } from "../server/delivery-fixture.ts";
import { openDeliveryRuntime } from "../server/delivery-runtime.ts";
const output = resolve("evidence/delivery-rev2/D02");
const root = resolve(
  "tests/runtime/delivery-rev2/D02-delete-readd-" + Date.now(),
);
mkdirSync(output, { recursive: true });
const fixture = await createFixture(root, true, false);
let runtime = openDeliveryRuntime(root);
const steps: any[] = [];
let w = runtime.store.get(fixture.intakeId);
const act = (op: string, args: any = {}) => {
  w = runtime.store.action(
    fixture.intakeId,
    w.id,
    { revision: w.revision, requestKey: randomUUID(), op, args },
    "合成D02补测Owner",
  );
  steps.push({
    op,
    revision: w.revision,
    scopeId: w.state.scope,
    planId: w.state.plan,
    requirementIds: w.state.requirements.map((x) => x.id),
  });
  return w;
};
const plan = () => runtime.store.snapshot(w.id, w.state.plan, "plan");
try {
  const requirement = structuredClone(
    w.state.requirements.find((x) => x.id === "R01")!,
  );
  assert.ok(requirement);
  const initialScope = structuredClone(
    runtime.store.snapshot(w.id, w.state.scope, "scope"),
  );
  const initialItem = plan().payload.items.find(
    (x: any) => x.requirementId === requirement.id,
  );
  assert.ok(initialItem);
  act("recordResult", {
    id: initialItem.id,
    status: "passed",
    result: "虚构：删除前的实际验收记录",
    evidence: "fixture:D02-delete-readd:original-result",
    testedVersion: "virtual-before-delete",
  });
  const passedPlan = structuredClone(plan());
  const passedItem = structuredClone(
    passedPlan.payload.items.find(
      (x: any) => x.requirementId === requirement.id,
    ),
  );
  assert.equal(passedItem.status, "passed");
  assert.ok(passedItem.actor && passedItem.created);
  act("patch", {
    collection: "requirements",
    records: [],
    removeIds: [requirement.id],
  });
  assert.equal(
    w.state.requirements.some((x) => x.id === requirement.id),
    false,
  );
  act("freezeScope");
  const removedScopeId = w.state.scope;
  act("buildPlan");
  const removedPlan = structuredClone(plan());
  assert.equal(
    removedPlan.payload.items.some(
      (x: any) => x.requirementId === requirement.id,
    ),
    false,
  );
  assert.ok(
    removedPlan.payload.items.every((x: any) => x.status === "unmeasured"),
  );
  act("patch", { collection: "requirements", records: [requirement] });
  assert.deepEqual(
    w.state.requirements.find((x) => x.id === requirement.id),
    requirement,
  );
  act("freezeScope");
  assert.notEqual(w.state.scope, removedScopeId);
  act("buildPlan");
  const readdedPlan = structuredClone(plan());
  const readdedItem = readdedPlan.payload.items.find(
    (x: any) => x.requirementId === requirement.id,
  );
  assert.ok(readdedItem);
  assert.notEqual(readdedItem.id, passedItem.id);
  assert.equal(readdedItem.status, "unmeasured");
  for (const field of [
    "result",
    "evidence",
    "testedVersion",
    "actor",
    "created",
  ])
    assert.equal(readdedItem[field], "");
  assert.ok(
    readdedPlan.payload.items.every((x: any) => x.status === "unmeasured"),
  );
  assert.deepEqual(
    runtime.store.snapshot(w.id, passedPlan.id, "plan"),
    passedPlan,
  );
  assert.deepEqual(
    runtime.store.snapshot(w.id, initialScope.id, "scope"),
    initialScope,
  );
  assert.deepEqual(
    runtime.store.snapshot(w.id, removedPlan.id, "plan"),
    removedPlan,
  );
  assert.equal(w.alignment.plan, true);
  runtime.close();
  runtime = openDeliveryRuntime(root);
  w = runtime.store.get(fixture.intakeId);
  assert.equal(w.state.plan, readdedPlan.id);
  assert.equal(
    plan().payload.items.find((x: any) => x.requirementId === requirement.id)
      .status,
    "unmeasured",
  );
  assert.deepEqual(
    runtime.store.snapshot(w.id, passedPlan.id, "plan"),
    passedPlan,
  );
  assert.deepEqual(
    runtime.store.snapshot(w.id, initialScope.id, "scope"),
    initialScope,
  );
  assert.deepEqual(
    runtime.store.snapshot(w.id, removedPlan.id, "plan"),
    removedPlan,
  );
  const receipt = {
    scenario: "D02",
    subcase: "same-requirement-id-delete-readd",
    status: "PASSED",
    completedAt: new Date().toISOString(),
    root,
    method:
      "one isolated synthetic SQLite/store action chain plus close/reopen; no product/API/UI changes",
    requirementId: requirement.id,
    steps,
    actual: {
      oldResult: passedItem,
      newResult: readdedItem,
      oldPassedPlanId: passedPlan.id,
      removedPlanId: removedPlan.id,
      readdedPlanId: readdedPlan.id,
    },
    checks: [
      "recorded passed result with actual result/evidence/tested version/actor/time",
      "removeIds removed R01 from saved state and frozen rebuilt plan",
      "identical original R01 readded and saved/frozen/rebuilt",
      "new item identity and unmeasured status; all old result/evidence/version/actor/time fields empty",
      "old source scope, passed plan/result and removed plan remain byte-equivalent readable snapshots",
      "after database close/reopen current unmeasured plan and old passed history remain",
    ],
    deviations: [],
  };
  writeFileSync(
    join(output, "delete-readd-receipt.json"),
    JSON.stringify(receipt, null, 2),
  );
  console.log(
    "D02 delete/readd passed: old passed history retained; identical requirement ID readded as new unmeasured item after save/freeze/rebuild and reopen.",
  );
  console.log(
    JSON.stringify({
      root,
      steps: steps.length,
      oldStatus: passedItem.status,
      newStatus: readdedItem.status,
      historyRetained: true,
      deviations: [],
    }),
  );
} catch (e) {
  writeFileSync(
    join(output, "delete-readd-failure.json"),
    JSON.stringify(
      {
        status: "FAILED",
        root,
        steps,
        error: (e as Error).message,
        deviations: ["targeted D02 supplemental verification failed"],
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  runtime.close();
}
