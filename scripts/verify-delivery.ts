import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import {
  createFixture,
  sampleRequirements,
  sampleStages,
} from "../server/delivery-fixture.ts";
import {
  openDeliveryRuntime,
  initializeAuth,
} from "../server/delivery-runtime.ts";
import {
  restoreBatch,
  binaryDigest,
  verifyBatchReferences,
} from "../server/delivery-packages.ts";
import { digest, quoteTotals } from "../server/delivery-model.ts";
type Runtime = ReturnType<typeof openDeliveryRuntime>;
const requested = process.argv[process.argv.indexOf("--scenario") + 1];
const scenarios =
  requested && /^D0[1-5]$/.test(requested)
    ? [requested]
    : ["D01", "D02", "D03", "D04", "D05"];
if (process.argv.includes("--delete-readd-only")) {
  assert.equal(requested, "D02", "The targeted supplement belongs to D02 only");
  await import("./verify-delivery-delete-readd.ts");
  process.exit(0);
}
const stamp = Date.now();
function action(
  r: Runtime,
  f: any,
  op: string,
  args: any = {},
  requestKey = randomUUID(),
  revision?: number,
) {
  const w = r.store.get(f.intakeId);
  return r.store.action(
    f.intakeId,
    w.id,
    { revision: revision ?? w.revision, requestKey, op, args },
    "合成验证Owner",
  );
}
async function listen(r: Runtime) {
  const server = r.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  return {
    server,
    base: "http://127.0.0.1:" + port,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
async function login(base: string, root: string) {
  const c = JSON.parse(
    readFileSync(join(root, "auth", "credential.json"), "utf8"),
  );
  const r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(c.name ? { name: c.name, password: c.password } : c),
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  return {
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    csrf: data.csrf,
  };
}
async function req(
  base: string,
  path: string,
  opts: {
    method?: string;
    body?: any;
    cookie?: string;
    csrf?: string;
    origin?: string;
  } = {},
) {
  const r = await fetch(base + path, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.csrf ? { "X-CSRF-Token": opts.csrf } : {}),
      ...(opts.origin ? { Origin: opts.origin } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text };
}
for (const scenario of scenarios) {
  const evidence = resolve(
    process.env.DELIVERY_EVIDENCE_DIR ?? "evidence/delivery-rev2",
    scenario,
  );
  mkdirSync(evidence, { recursive: true });
  const root = resolve("tests/runtime/delivery-rev2", scenario + "-" + stamp),
    startedAt = new Date().toISOString();
  const checks: string[] = [];
  let runtime: Runtime | undefined;
  try {
    const fixture = await createFixture(root, true, false);
    runtime = openDeliveryRuntime(root);
    let w = runtime.store.get(fixture.intakeId);
    if (scenario === "D01") {
      assert.equal(w.sourceValid, true);
      assert.deepEqual(w.alignment, { scope: true, quote: true, plan: true });
      assert.equal(w.quoteTotals!.saleTotalFen, null);
      assert.equal(w.quoteTotals!.estimateSubtotalFen, 15000);
      const scope = w.snapshots.find((s) => s.id === w.state.scope)!;
      const plan = w.snapshots.find((s) => s.id === w.state.plan)!;
      for (const r of scope.payload.requirements)
        assert.ok(
          plan.payload.items.some((p: any) => p.requirementId === r.id),
        );
      checks.push(
        "source/scope/quote/plan references valid; repeated factual title input=0; unknown sale remains unknown",
      );
      const saved = JSON.stringify(w.state);
      runtime.close();
      runtime = openDeliveryRuntime(root);
      assert.equal(
        JSON.stringify(runtime.store.get(fixture.intakeId).state),
        saved,
      );
      checks.push("real databases closed/reopened and saved state identical");
      const g1 = quoteTotals([sampleStages[0]]);
      assert.equal(g1.estimateTotalFen, 15000);
      assert.equal(g1.saleTotalFen, 12000);
      assert.equal(
        quoteTotals([{ ...sampleStages[0], minutes: 1, rateFen: 100 }])
          .estimateTotalFen,
        2,
      );
      assert.equal(
        quoteTotals([
          { ...sampleStages[0], minutes: 1, rateFen: 30 },
          { ...sampleStages[0], id: "q2", minutes: 1, rateFen: 30 },
        ]).estimateTotalFen,
        2,
      );
      checks.push("G1-G3 exact; internal cost does not add to sale");
    }
    if (scenario === "D02") {
      const original = w,
        source = w.snapshots.find((s) => s.kind === "source")!,
        newId = randomUUID();
      runtime.db.prepare("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)").run(
        newId,
        fixture.intakeId,
        2,
        randomUUID(),
        JSON.stringify({
          ...source.payload.answers,
          problem: "虚构v2新增付款想法",
        }),
        "detailed",
        "合成v2",
        new Date().toISOString(),
      );
      w = action(runtime, fixture, "switchSource", { submissionId: newId });
      assert.equal(w.alignment.scope, false);
      assert.equal(w.snapshots.filter((s) => s.kind === "source").length, 2);
      assert.throws(() =>
        action(runtime!, fixture, "adoptChange", { changeId: "C01" }),
      );
      w = action(runtime, fixture, "freezeScope");
      assert.equal(w.alignment.quote, false);
      assert.equal(w.alignment.plan, false);
      const c = { ...w.state.changes[0], baseScopeId: w.state.scope! };
      w = action(runtime, fixture, "patch", {
        collection: "changes",
        records: [c],
      });
      const revision = w.revision,
        key = randomUUID(),
        adopted = action(
          runtime,
          fixture,
          "adoptChange",
          { changeId: "C01" },
          key,
          revision,
        );
      const repeated = action(
        runtime,
        fixture,
        "adoptChange",
        { changeId: "C01" },
        key,
        revision,
      );
      assert.equal(adopted.revision, repeated.revision);
      assert.throws(() =>
        action(
          runtime!,
          fixture,
          "adoptChange",
          { changeId: "other" },
          key,
          revision,
        ),
      );
      w = action(runtime, fixture, "saveQuote");
      w = action(runtime, fixture, "buildPlan");
      assert.deepEqual(w.alignment, { scope: true, quote: true, plan: true });
      assert.ok(
        w.snapshots
          .find((s) => s.id === w.state.plan)!
          .payload.items.every((i: any) => i.status === "unmeasured"),
      );
      assert.ok(w.snapshots.some((s) => s.id === original.state.scope));
      checks.push(
        "v1/v2 preserved; stale base rejects; rebased adoption commits once; key payload mismatch rejects; Q/P recover aligned",
      );
      let p = w.snapshots.find((s) => s.id === w.state.plan)!.payload.items[0];
      w = action(runtime, fixture, "recordResult", {
        id: p.id,
        status: "passed",
        result: "虚构已核",
        evidence: "fixture:D02",
        testedVersion: "virtual-v1",
      });
      w = action(runtime, fixture, "patch", {
        collection: "requirements",
        records: [{ ...sampleRequirements[0], acceptance: "同ID新验收动作" }],
      });
      w = action(runtime, fixture, "freezeScope");
      w = action(runtime, fixture, "buildPlan");
      assert.ok(
        w.snapshots
          .find((s) => s.id === w.state.plan)!
          .payload.items.every((i: any) => i.status === "unmeasured"),
      );
      checks.push("same ID changed action does not inherit old passed result");
      await import("./verify-delivery-delete-readd.ts");
      checks.push(
        "same requirement ID deletion/readdition does not inherit passed result; old snapshots retained and SQLite reopened (D02 supplement)",
      );
    }
    if (scenario === "D03") {
      const server = await listen(runtime);
      try {
        const auth = await login(server.base, root),
          path =
            "/api/admin/intakes/" +
            fixture.intakeId +
            "/delivery/" +
            w.id +
            "/actions",
          body = {
            revision: w.revision,
            requestKey: randomUUID(),
            op: "freezeScope",
            args: {},
          };
        assert.equal(
          (await req(server.base, path, { method: "POST", body })).status,
          401,
        );
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body,
              cookie: auth.cookie,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body,
              cookie: auth.cookie,
              csrf: auth.csrf,
              origin: "https://foreign.invalid",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body: { ...body, actor: "spoof" },
              ...auth,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body: { ...body, revision: 0 },
              ...auth,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body: { ...body, args: { data: "x".repeat(50000) } },
              ...auth,
            })
          ).status,
          413,
        );
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body: { ...body, args: { data: "x".repeat(41000) } },
              ...auth,
            })
          ).status,
          413,
        );
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body: {
                ...body,
                op: "patch",
                args: {
                  collection: "requirements",
                  records: Array.from({ length: 6 }, (_, i) => ({
                    ...sampleRequirements[0],
                    id: "batch-" + i,
                  })),
                },
              },
              ...auth,
            })
          ).status,
          400,
        );
        const keyUnknown = randomUUID(),
          beforeUnknown = runtime.store.get(fixture.intakeId).revision,
          unknownBody = {
            ...body,
            revision: beforeUnknown,
            requestKey: keyUnknown,
          };
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body: unknownBody,
              ...auth,
            })
          ).status,
          200,
        );
        const committed = await req(
          server.base,
          path + "/freezeScope/" + keyUnknown,
          auth,
        );
        assert.equal(committed.json.committed, true);
        assert.equal(
          (
            await req(server.base, path, {
              method: "POST",
              body: unknownBody,
              ...auth,
            })
          ).status,
          200,
        );
        assert.equal(
          runtime.store.get(fixture.intakeId).revision,
          beforeUnknown + 1,
        );
        body.revision = runtime.store.get(fixture.intakeId).revision;
        assert.equal(
          (
            await req(
              server.base,
              "/api/admin/intakes/" +
                fixture.otherId +
                "/delivery/" +
                w.id +
                "/actions",
              { method: "POST", body, ...auth },
            )
          ).status,
          404,
        );
        const before = runtime.store.get(fixture.intakeId).revision;
        runtime.store.db.exec("PRAGMA query_only=ON");
        assert.equal(
          (await req(server.base, path, { method: "POST", body, ...auth }))
            .status,
          500,
        );
        runtime.store.db.exec("PRAGMA query_only=OFF");
        assert.equal(runtime.store.get(fixture.intakeId).revision, before);
        checks.push(
          "401/403/400/409/413, cross-customer and failed write leave no partial state",
        );
        const otherRoot = resolve(
          "tests/runtime/delivery-rev2",
          "isolation-" + stamp,
        );
        await createFixture(otherRoot);
        const other = openDeliveryRuntime(otherRoot),
          otherServer = await listen(other);
        try {
          assert.equal(
            (
              await req(otherServer.base, "/api/admin/intakes", {
                cookie: auth.cookie,
              })
            ).status,
            401,
          );
          const otherAuth = await login(otherServer.base, otherRoot);
          const cookies = auth.cookie + "; " + otherAuth.cookie;
          assert.equal(
            (await req(server.base, "/api/admin/intakes", { cookie: cookies }))
              .status,
            200,
          );
          assert.equal(
            (
              await req(otherServer.base, "/api/admin/intakes", {
                cookie: cookies,
              })
            ).status,
            200,
          );
          await req(server.base, "/api/auth/logout", {
            method: "POST",
            body: {},
            cookie: cookies,
            csrf: auth.csrf,
          });
          assert.equal(
            (
              await req(otherServer.base, "/api/admin/intakes", {
                cookie: cookies,
              })
            ).status,
            200,
          );
          checks.push(
            "same browser-cookie jar: root A/B isolated, logout A preserves B",
          );
        } finally {
          await otherServer.stop();
          other.close();
        }
      } finally {
        await server.stop();
      }
      assert.throws(() => openDeliveryRuntime(root));
      const moved = root + "-temporarily-moved";
      renameSync(root, moved);
      try {
        assert.throws(() => action(runtime!, fixture, "freezeScope"));
      } finally {
        renameSync(moved, root);
      }
      checks.push(
        "second writer and lost root refuse; no empty root/database reconstructed",
      );
      action(runtime, fixture, "saveQuote");
      action(runtime, fixture, "buildPlan");
      w = runtime.store.get(fixture.intakeId);
      action(runtime, fixture, "approvePublic", {
        textHash: digest(w.publicPreview),
      });
      runtime.lease.simulatedUsage = (kind) =>
        kind === "data" ? 63 * 1024 ** 2 : 0;
      assert.throws(() => action(runtime!, fixture, "freezeScope"));
      action(runtime, fixture, "revokePublic");
      assert.equal(
        runtime.store.get(fixture.intakeId).publicApprovalValid,
        false,
      );
      runtime.lease.simulatedUsage = undefined;
      checks.push(
        "capacity adapter rejects growth but reserved metadata permits revocation",
      );
      runtime.close();
      renameSync(
        join(root, "delivery.sqlite"),
        join(root, "delivery.missing-fixture.sqlite"),
      );
      runtime = openDeliveryRuntime(root);
      const degraded = await listen(runtime);
      try {
        const auth = await login(degraded.base, root);
        assert.equal(
          (await req(degraded.base, "/api/admin/intakes", auth)).status,
          200,
        );
        assert.equal(
          (
            await req(
              degraded.base,
              "/api/admin/intakes/" + fixture.intakeId + "/delivery",
              auth,
            )
          ).status,
          503,
        );
        assert.equal(existsSync(join(root, "delivery.sqlite")), false);
        runtime.authDb.prepare("UPDATE sessions SET expires=0").run();
        assert.equal(
          (await req(degraded.base, "/api/admin/intakes", auth)).status,
          401,
        );
      } finally {
        await degraded.stop();
        runtime.close();
      }
      renameSync(
        join(root, "delivery.missing-fixture.sqlite"),
        join(root, "delivery.sqlite"),
      );
      runtime = openDeliveryRuntime(root);
      checks.push(
        "missing delivery degrades only its module; legacy/auth valid; expired sessions rejected; no empty delivery recreated",
      );
    }
    if (scenario === "D04") {
      w = action(runtime, fixture, "approvePublic", {
        textHash: digest(w.publicPreview),
      });
      const pub = runtime.packages.export(fixture.intakeId, w.id, "customer");
      assert.equal(pub.status, "COMPLETED");
      assert.deepEqual(
        pub.files.map((f) => f.relativePath),
        ["customer-draft.md"],
      );
      const text = runtime.packages
        .file(fixture.intakeId, w.id, pub.exportId, "customer-draft.md")
        .body.toString("utf8");
      for (const forbidden of [
        "rateFen",
        "costFen",
        "内部备注",
        "delivery.sqlite",
        root,
      ])
        assert.ok(!text.includes(forbidden));
      const internal = runtime.packages.export(
        fixture.intakeId,
        w.id,
        "internal",
      );
      assert.equal(internal.status, "COMPLETED");
      for (const f of internal.files)
        assert.ok(
          runtime.packages.file(
            fixture.intakeId,
            w.id,
            internal.exportId,
            f.relativePath,
          ).body.length,
        );
      action(runtime, fixture, "revokePublic");
      assert.throws(() =>
        runtime!.packages.file(
          fixture.intakeId,
          w.id,
          pub.exportId,
          "customer-draft.md",
        ),
      );
      w = runtime.store.get(fixture.intakeId);
      action(runtime, fixture, "approvePublic", {
        textHash: digest(w.publicPreview),
      });
      runtime.store.faults.beforePublicComplete = () => {
        action(runtime!, fixture, "revokePublic");
      };
      const revoked = runtime.packages.export(
        fixture.intakeId,
        w.id,
        "customer",
      );
      assert.equal(revoked.status, "PARTIAL");
      runtime.store.faults.beforePublicComplete = undefined;
      runtime.store.faults.beforeExportFile = (i) => {
        if (i === 1) throw new Error("injected second file failure");
      };
      const partial = runtime.packages.export(
        fixture.intakeId,
        w.id,
        "internal",
      );
      assert.equal(partial.status, "PARTIAL");
      runtime.store.faults.beforeExportFile = undefined;
      checks.push(
        "actual internal files and independent customer whitelist; revoke after lock and after complete blocks; partial files never complete",
      );
      // A revocation rejected by storage still blocks now; a restart cannot reuse historic approval.
      w = runtime.store.get(fixture.intakeId);
      action(runtime, fixture, "approvePublic", {
        textHash: digest(w.publicPreview),
      });
      runtime.store.faults.beforeWrite = (op) => {
        if (op === "revokePublic")
          throw new Error("injected revoke write failure");
      };
      assert.throws(() => action(runtime!, fixture, "revokePublic"));
      assert.throws(() =>
        runtime!.packages.export(fixture.intakeId, w.id, "customer"),
      );
      runtime.store.faults.beforeWrite = undefined;
      runtime.close();
      runtime = openDeliveryRuntime(root);
      assert.equal(
        runtime.store.get(fixture.intakeId).publicApprovalValid,
        false,
      );
      checks.push(
        "failed-to-persist revoke and restart do not revive public approval",
      );
      const served = await listen(runtime);
      const auth = await login(served.base, root);
      try {
        runtime.store.faults.afterBackupFirst = async () => {
          const r = await req(
            served.base,
            "/api/admin/intakes/" + fixture.intakeId + "/notes",
            { method: "POST", body: { body: "should be blocked" }, ...auth },
          );
          assert.equal(r.status, 503);
          const x = await req(
            served.base,
            "/api/admin/intakes/" +
              fixture.intakeId +
              "/delivery/" +
              w.id +
              "/actions",
            {
              method: "POST",
              body: {
                revision: runtime!.store.get(fixture.intakeId).revision,
                requestKey: randomUUID(),
                op: "freezeScope",
                args: {},
              },
              ...auth,
            },
          );
          assert.equal(x.status, 503);
        };
        const batch = await runtime.packages.batchBackup();
        assert.equal(batch.status, "COMPLETED");
        assert.equal(runtime.barrier.paused, false);
        runtime.store.faults.afterBackupFirst = undefined;
        const folder = join(root, "backups", batch.exportId),
          restoredRoot = resolve(
            "tests/runtime/delivery-rev2",
            "restored-" + stamp,
          ),
          restored = await restoreBatch(folder, restoredRoot);
        assert.equal(restored.status, "COMPLETED");
        await initializeAuth(restoredRoot, false);
        const copy = openDeliveryRuntime(restoredRoot),
          copyServer = await listen(copy);
        try {
          assert.equal(
            (
              await req(copyServer.base, "/api/admin/intakes", {
                cookie: auth.cookie,
              })
            ).status,
            401,
          );
          assert.equal(
            copy.store.get(fixture.intakeId).state.source,
            runtime.store.get(fixture.intakeId).state.source,
          );
          assert.equal(copy.store.verifyReferences().valid, true);
          assert.equal(
            (await req(copyServer.base, "/api/intakes/" + fixture.intakeId))
              .status,
            403,
          );
        } finally {
          await copyServer.stop();
          copy.close();
        }
        const original = readFileSync(join(folder, "delivery.sqlite"));
        const bad = new DatabaseSync(join(folder, "delivery.sqlite"));
        bad
          .prepare("UPDATE snapshots SET sha256='wrong' WHERE kind='source'")
          .run();
        bad.close();
        assert.equal(verifyBatchReferences(folder).valid, false);
        assert.throws(() => runtime!.packages.manifest("../../secret"));
        await assert.rejects(() =>
          restoreBatch(
            folder,
            resolve("tests/runtime/delivery-rev2", "bad-" + stamp),
          ),
        );
        writeFileSync(join(folder, "delivery.sqlite"), original);
        checks.push(
          "application write barrier covers legacy/delivery; two real backup databases restored with fresh auth; wrong hash and unsupported path refuse",
        );
      } finally {
        await served.stop();
      }
    }
    if (scenario === "D05") {
      const server = await listen(runtime);
      try {
        const auth = await login(server.base, root);
        assert.equal(
          (await req(server.base, "/api/admin/intakes", auth)).status,
          200,
        );
        assert.equal(
          (
            await req(
              server.base,
              "/api/admin/intakes/" + fixture.intakeId + "/delivery",
              auth,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await req(
              server.base,
              "/api/admin/intakes/" + fixture.intakeId + "/export?format=json",
              auth,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await req(
              server.base,
              "/api/admin/intakes/" + fixture.intakeId + "/notes",
              { method: "POST", body: { body: "虚构回归备注" }, ...auth },
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await req(
              server.base,
              "/api/admin/intakes/" + fixture.intakeId + "/stage",
              { method: "PATCH", body: { stage: "待访谈" }, ...auth },
            )
          ).status,
          200,
        );
        checks.push(
          "delivery route and affected legacy detail/export/notes/stage/auth APIs work on synthetic roots",
        );
      } finally {
        await server.stop();
      }
    }
    const receipt = {
      scenario,
      status: "CORE_PASSED",
      fixture:
        scenario === "D04"
          ? "two-db-batch/public-revoke"
          : scenario === "D03"
            ? "dirty-four-sections"
            : scenario === "D02"
              ? "qinghe-v2-change"
              : scenario === "D05"
                ? "legacy-intake-plus-delivery"
                : "qinghe-v1",
      startedAt,
      completedAt: new Date().toISOString(),
      owner: "01a10ed7-5d22-7401-8f0f-29bb53cf3cfd",
      root,
      checks,
      deviations: [],
      limitations: [
        "browser/cold-start evidence is collected separately; CORE_PASSED is not full scenario acceptance",
      ],
    };
    writeFileSync(
      join(evidence, "core-receipt.json"),
      JSON.stringify(receipt, null, 2),
    );
    console.log(scenario + " core passed: " + checks.length + " checks");
  } catch (e: any) {
    writeFileSync(
      join(evidence, "core-receipt.json"),
      JSON.stringify(
        {
          scenario,
          status: "FAILED",
          startedAt,
          completedAt: new Date().toISOString(),
          root,
          error: e.message,
          deviations: ["core scenario failed"],
          checks,
        },
        null,
        2,
      ),
    );
    throw e;
  } finally {
    runtime?.close();
  }
}

if (!process.argv.includes("--core"))
  await import("./verify-delivery-browser.ts");
