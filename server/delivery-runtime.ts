import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { createApp, createAdmin } from "./app.ts";
import { RootLease, WriteBarrier, readIdentity } from "./delivery-root.ts";
import { DeliveryStore, type DeliveryFaults } from "./delivery-store.ts";
import { DeliveryPackages } from "./delivery-packages.ts";
import { DeliveryError, digest } from "./delivery-model.ts";
export async function initializeAuth(root: string, mustChange = true) {
  const identity = readIdentity(root);
  const dir = join(root, "auth"),
    file = join(dir, "auth.sqlite");
  if (existsSync(file)) throw new DeliveryError(409, "认证已存在，不覆盖");
  mkdirSync(dir, { mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,password TEXT NOT NULL,must_change INTEGER NOT NULL);CREATE TABLE sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL)",
  );
  chmodSync(file, 0o600);
  const password = randomBytes(24).toString("base64url");
  try {
    await createAdmin(db, password, mustChange);
    writeFileSync(
      join(dir, "credential.json"),
      JSON.stringify({
        name: "owner",
        password,
        syntheticOnly: identity.syntheticOnly,
      }),
      { mode: 0o600, flag: "wx" },
    );
  } finally {
    db.close();
  }
}
export function openDeliveryRuntime(
  root: string,
  options: {
    staticDir?: string;
    faults?: DeliveryFaults;
    clock?: () => string;
    passwordlessDemo?: boolean;
    localPrivateAccess?: boolean;
  } = {},
) {
  const lease = new RootLease(root),
    barrier = new WriteBarrier();
  let store: DeliveryStore | undefined,
    packages: DeliveryPackages | undefined,
    appDb: DatabaseSync | undefined;
  const authFile = join(root, "auth", "auth.sqlite");
  if (!existsSync(authFile)) {
    lease.close();
    throw new DeliveryError(503, "认证根缺失，需显式初始化，不复活备份账户");
  }
  const authDb = new DatabaseSync(authFile),
    cookieName = "fde_delivery_" + digest(lease.identity.rootId).slice(0, 16);
  try {
    const result = createApp(root, options.staticDir ?? resolve("dist"), {
      passwordlessDemo:
        !!options.passwordlessDemo && !existsSync(join(root, "restore.json")),
      localPrivateAccess:
        !!options.localPrivateAccess &&
        lease.identity.localPrivateAccess === true &&
        !lease.identity.syntheticOnly &&
        !existsSync(join(root, "restore.json")),
      appVersion: "0.2.0",
      healthDetails: {
        producerApp: "eli-fde-delivery",
        rootId: lease.identity.rootId,
        syntheticOnly: lease.identity.syntheticOnly,
      },
      authDb,
      cookieName,
      barrier,
      validateRoot: (req) => {
        if ((req as any).deliveryCancelled)
          throw new DeliveryError(503, "请求已断开，停止后续写入");
        lease.assertRoot(false);
        const writes =
          !["GET", "HEAD", "OPTIONS"].includes(req.method) ||
          /export/.test(req.path);
        if (writes && req.body?.op !== "revokePublic")
          lease.checkCapacity(
            "data",
            40960,
            req.body?.op === "revokePublic",
            false,
          );
      },
      disableCustomer: existsSync(join(root, "restore.json")),
      install: (app, db) => {
        appDb = db;
        try {
          store = new DeliveryStore(lease, db, options.faults, options.clock);
          packages = new DeliveryPackages(store, barrier);
        } catch {
          app.use("/api/admin/intakes/:id/delivery", (_req, res) =>
            res.status(503).json({
              error:
                "交付库缺失/损坏/不支持，保持不可用；旧问卷可继续，不自动重建",
            }),
          );
          app.use("/api/admin/delivery-system", (_req, res) =>
            res.status(503).json({ error: "交付模块不可用，不能备份或导出" }),
          );
          return;
        }
        const respond =
          (fn: (req: any, res: any) => any) =>
          (req: any, res: any, next: any) => {
            try {
              Promise.resolve(fn(req, res)).catch((e) => failure(e, res, next));
            } catch (e) {
              failure(e, res, next);
            }
          };
        const failure = (e: any, res: any, next: any) => {
          if (e instanceof DeliveryError)
            return res.status(e.status).json({ error: e.message });
          if (e instanceof z.ZodError)
            return res
              .status(400)
              .json({ error: "字段格式不正确或有不允许的字段" });
          next(e);
        };
        app.get(
          "/api/admin/intakes/:id/delivery",
          respond((req, res) => res.json(store!.get(req.params.id))),
        );
        app.post(
          "/api/admin/intakes/:id/delivery",
          respond((req, res) => {
            const b = z
              .object({ submissionId: z.string() })
              .strict()
              .parse(req.body);
            res.json(
              store!.create(
                req.params.id,
                b.submissionId,
                res.locals.session.name,
              ),
            );
          }),
        );
        app.post(
          "/api/admin/intakes/:id/delivery/:workspaceId/actions",
          respond((req, res) =>
            res.json(
              store!.action(
                req.params.id,
                req.params.workspaceId,
                req.body,
                res.locals.session.name,
              ),
            ),
          ),
        );
        app.get(
          "/api/admin/intakes/:id/delivery/:workspaceId/actions/:action/:key",
          respond((req, res) =>
            res.json(
              store!.actionResult(
                req.params.id,
                req.params.workspaceId,
                req.params.action,
                req.params.key,
              ),
            ),
          ),
        );
        app.post(
          "/api/admin/intakes/:id/delivery/:workspaceId/exports",
          respond((req, res) => {
            const b = z
              .object({
                mode: z.enum(["internal", "customer"]),
                revision: z.number().int().nonnegative(),
                exportId: z.string().uuid().optional(),
              })
              .strict()
              .parse(req.body);
            res.json(
              packages!.export(
                req.params.id,
                req.params.workspaceId,
                b.mode,
                b.exportId,
                b.revision,
              ),
            );
          }),
        );
        app.get(
          "/api/admin/intakes/:id/delivery/:workspaceId/exports/:exportId/status",
          respond((req, res) => {
            store!.row(req.params.id, req.params.workspaceId);
            const m = packages!.manifest(req.params.exportId);
            if (m.sourceRevisionRefs[0].workspaceId !== req.params.workspaceId)
              throw new DeliveryError(404, "包不属于该客户");
            res.json(m);
          }),
        );
        app.get(
          "/api/admin/intakes/:id/delivery/:workspaceId/exports/:exportId/:file",
          respond((req, res) => {
            const f = packages!.file(
              req.params.id,
              req.params.workspaceId,
              req.params.exportId,
              req.params.file,
            );
            res.type(f.type).attachment(req.params.file).send(f.body);
          }),
        );
        app.post(
          "/api/admin/delivery-system/backup",
          respond(async (req, res) => {
            const b = z
              .object({ batchId: z.string().uuid().optional() })
              .strict()
              .parse(req.body);
            res.json(await packages!.batchBackup(b.batchId));
          }),
        );
        app.get(
          "/api/admin/delivery-system/status",
          respond((_req, res) =>
            res.json({
              producerApp: "eli-fde-delivery",
              appVersion: "0.2.0",
              rootId: lease.identity.rootId,
              dataRoot: lease.root,
              authRoot: join(root, "auth"),
              cookieNamespace: cookieName,
              syntheticOnly: lease.identity.syntheticOnly,
              maintenance: barrier.paused,
            }),
          ),
        );
      },
    });
    return {
      app: result.app,
      db: result.db,
      authDb,
      store: store!,
      packages: packages!,
      lease,
      barrier,
      cookieName,
      close: () => {
        store?.db.close();
        result.db.close();
        authDb.close();
        lease.close();
      },
    };
  } catch (e) {
    store?.db.close();
    appDb?.close();
    authDb.close();
    lease.close();
    throw e;
  }
}
