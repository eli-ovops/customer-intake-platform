import express from "express";
import { resolve, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { openDeliveryRuntime } from "../server/delivery-runtime.ts";
import { ownerApproval } from "../server/owner-approval.ts";
import { customerEntry } from "../server/customer-entry.ts";
import { projectRoot } from "../server/delivery-root.ts";
const root = resolve(process.argv[2] ?? "");
if (
  !root.startsWith(join(projectRoot, "tests", "runtime") + "/") ||
  !JSON.parse(readFileSync(join(root, "identity.json"), "utf8")).syntheticOnly
)
  throw new Error("Only registered isolated synthetic roots allowed");
const r = openDeliveryRuntime(root, { staticDir: join(projectRoot, "dist") });
const audit = (actor: string, action: string) => {
  r.lease.checkCapacity(
    "data",
    40960,
    action === "owner-session-revoked",
    false,
  );
  r.db
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
    .run(randomUUID(), actor, action, "auth-local", new Date().toISOString());
};
const approval = ownerApproval(
  r.authDb,
  r.cookieName,
  join(root, "auth"),
  () => r.lease.assertRoot(false),
  r.barrier,
  audit,
);
await once(approval.socket, "listening");
const app = express();
let release: (() => void) | undefined, job: Promise<void> | undefined;
app.post("/__test/pause", async (_q, s) => {
  let ready!: () => void;
  const entered = new Promise<void>((v) => (ready = v));
  job = r.barrier.exclusive(async () => {
    ready();
    await new Promise<void>((v) => (release = v));
  });
  await entered;
  s.json({ paused: true });
});
app.post("/__test/resume", async (_q, s) => {
  release?.();
  await job;
  s.json({ paused: r.barrier.paused });
});
app.get("/__test/status", (_q, s) =>
  s.json({
    paused: r.barrier.paused,
    sessions: r.authDb.prepare("SELECT count(*) AS n FROM sessions").get()!.n,
    audits: r.db
      .prepare(
        "SELECT actor,action,resource FROM audit WHERE resource='auth-local' ORDER BY rowid",
      )
      .all(),
  }),
);
app.use(approval.middleware);
app.get("/api/health", (_q, s) =>
  s.json({ status: "ok", ownerApproval: true }),
);
app.use(r.app);
const owner = app.listen(0, "127.0.0.1"),
  customer = customerEntry(r.app, approval.enterCustomer).listen(
    0,
    "127.0.0.1",
  );
await Promise.all([once(owner, "listening"), once(customer, "listening")]);
writeFileSync(
  join(root, "runtime.json"),
  JSON.stringify({
    producerApp: "eli-fde-delivery",
    pid: process.pid,
    rootId: r.lease.identity.rootId,
    ownerApprovalSocket: approval.socketPath,
    url: "http://127.0.0.1:" + (owner.address() as any).port,
    customerUrl: "http://127.0.0.1:" + (customer.address() as any).port,
  }),
  { mode: 0o600 },
);
console.log("READY");
process.on("SIGTERM", () => {
  release?.();
  owner.close(() =>
    customer.close(async () => {
      await approval.close();
      r.close();
      process.exit(0);
    }),
  );
});
