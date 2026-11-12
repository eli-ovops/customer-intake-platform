import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteTotals, DeliveryError } from "../server/delivery-model.ts";
import { sampleStages } from "../server/delivery-fixture.ts";
test("delivery G1/G2/G3: CNY stage rounding, fixed sale and internal costs are distinct", () => {
  const g1 = quoteTotals([sampleStages[0]]);
  assert.equal(g1.estimateTotalFen, 15000);
  assert.equal(g1.saleTotalFen, 12000);
  assert.equal(g1.costTotalFen, 2000);
  const g2 = quoteTotals([{ ...sampleStages[0], minutes: 1, rateFen: 100 }]);
  assert.equal(g2.estimateTotalFen, 2);
  const g3 = quoteTotals([
    { ...sampleStages[0], minutes: 1, rateFen: 30 },
    { ...sampleStages[0], id: "Q03", minutes: 1, rateFen: 30 },
  ]);
  assert.equal(g3.estimateTotalFen, 2);
});
test("delivery unknown is not zero; explicit zero needs reason; integer and amount bounds reject", () => {
  const unknown = quoteTotals(sampleStages);
  assert.equal(unknown.saleTotalFen, null);
  assert.equal(unknown.saleSubtotalFen, 12000);
  assert.equal(unknown.costTotalFen, null);
  assert.throws(
    () => quoteTotals([{ ...sampleStages[0], saleFen: 0 }]),
    DeliveryError,
  );
  assert.equal(
    quoteTotals([
      {
        ...sampleStages[0],
        saleFen: 0,
        zeroReason: "合成免费例",
        costState: "na",
        costFen: null,
      },
    ]).saleTotalFen,
    0,
  );
  for (const value of [-1, 1.5, 100000001, Number.MAX_SAFE_INTEGER])
    assert.throws(() => quoteTotals([{ ...sampleStages[0], saleFen: value }]));
  assert.throws(
    () =>
      quoteTotals([{ ...sampleStages[0], minutes: 60000, rateFen: 1000000 }]),
    DeliveryError,
  );
});
