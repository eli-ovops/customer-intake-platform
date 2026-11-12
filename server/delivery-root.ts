import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
  realpathSync,
  statSync,
  readdirSync,
  fsyncSync,
  chmodSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db.ts";
import { DeliveryError } from "./delivery-model.ts";
export const projectRoot = realpathSync(
  fileURLToPath(new URL("..", import.meta.url)),
);
export const producerApp = "eli-fde-delivery";
export type RootIdentity = {
  producerApp: string;
  rootId: string;
  schemaVersion: number;
  registeredPath: string;
  syntheticOnly: boolean;
  localPrivateAccess?: boolean;
  createdAt: string;
};
export function allowedRoot(path: string) {
  const p = resolve(path);
  if (
    ![
      join(projectRoot, "runtime") + "/",
      join(projectRoot, "tests", "runtime") + "/",
    ].some((prefix) => p.startsWith(prefix))
  )
    throw new DeliveryError(403, "交付模块仅允许项目内登记的数据根");
  if (existsSync(p) && realpathSync(p) !== p)
    throw new DeliveryError(403, "不允许符号链接数据根");
  return p;
}
export function createDeliverySchema(db: DatabaseSync) {
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
  CREATE TABLE delivery_schema(version INTEGER PRIMARY KEY); INSERT INTO delivery_schema VALUES(1);
  CREATE TABLE workspaces(id TEXT PRIMARY KEY,intake_id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL,state TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
  CREATE TABLE snapshots(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),kind TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,source_id TEXT,scope_id TEXT,sha256 TEXT NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(workspace_id,kind,version));
  CREATE TABLE actions(workspace_id TEXT NOT NULL REFERENCES workspaces(id),action TEXT NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,result TEXT NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(workspace_id,action,request_key));`);
}
export function initializeRoot(
  path: string,
  options: { syntheticOnly?: boolean; localPrivateAccess?: boolean } = {},
) {
  const root = allowedRoot(path);
  if (existsSync(root))
    throw new DeliveryError(409, "初始化目标已存在，不覆盖");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const identity: RootIdentity = {
    producerApp,
    rootId: randomUUID(),
    schemaVersion: 1,
    registeredPath: root,
    syntheticOnly: options.syntheticOnly ?? true,
    ...(options.localPrivateAccess ? { localPrivateAccess: true } : {}),
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    join(root, "identity.json"),
    JSON.stringify(identity, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  const db = openDatabase(root);
  db.close();
  const delivery = new DatabaseSync(join(root, "delivery.sqlite"));
  createDeliverySchema(delivery);
  delivery.close();
  chmodSync(join(root, "delivery.sqlite"), 0o600);
  return identity;
}
export function readIdentity(path: string): RootIdentity {
  const root = allowedRoot(path);
  if (!existsSync(join(root, "identity.json")))
    throw new DeliveryError(503, "数据根未登记，禁止自动初始化");
  const id = JSON.parse(readFileSync(join(root, "identity.json"), "utf8"));
  if (
    id.producerApp !== producerApp ||
    id.schemaVersion !== 1 ||
    id.registeredPath !== root ||
    typeof id.syntheticOnly !== "boolean" ||
    (id.localPrivateAccess !== undefined && id.localPrivateAccess !== true) ||
    typeof id.rootId !== "string"
  )
    throw new DeliveryError(503, "数据根身份或schema不匹配");
  return id;
}
export function requireFiles(root: string, checkDelivery = true) {
  for (const file of checkDelivery
    ? ["intake.sqlite", "delivery.sqlite"]
    : ["intake.sqlite"])
    if (!existsSync(join(root, file)))
      throw new DeliveryError(503, "数据库缺失，不重建空库");
}
export function directoryBytes(path: string): number {
  if (!existsSync(path)) return 0;
  let bytes = 0;
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (e.isSymbolicLink())
      throw new DeliveryError(503, "数据根存在不允许的符号链接");
    bytes += e.isDirectory() ? directoryBytes(p) : statSync(p).size;
  }
  return bytes;
}
export class RootLease {
  simulatedUsage?: (kind: "data" | "backup" | "export") => number;
  root: string;
  identity: RootIdentity;
  private inode: number;
  private fd: number;
  private leaseId = randomUUID();
  constructor(path: string) {
    this.root = allowedRoot(path);
    this.identity = readIdentity(this.root);
    requireFiles(this.root, false);
    this.inode = statSync(this.root).ino;
    const lock = join(this.root, "writer.lock");
    if (existsSync(lock)) {
      const prior = JSON.parse(readFileSync(lock, "utf8"));
      let alive = true;
      try {
        process.kill(prior.pid, 0);
      } catch (e: any) {
        if (e.code === "ESRCH") alive = false;
      }
      if (alive || prior.rootId !== this.identity.rootId)
        throw new DeliveryError(
          409,
          "已有或未能核实的写实例，请核对，不强删锁",
        );
      unlinkSync(lock);
    }
    this.fd = openSync(lock, "wx", 0o600);
    writeFileSync(
      this.fd,
      JSON.stringify({
        pid: process.pid,
        rootId: this.identity.rootId,
        leaseId: this.leaseId,
      }),
    );
    fsyncSync(this.fd);
  }
  assertRoot(checkDelivery = true) {
    try {
      const id = readIdentity(this.root);
      if (
        id.rootId !== this.identity.rootId ||
        statSync(this.root).ino !== this.inode
      )
        throw new Error();
      requireFiles(this.root, checkDelivery);
    } catch {
      throw new DeliveryError(503, "挂载/数据根变化，已停止写入");
    }
  }
  checkCapacity(
    kind: "data" | "backup" | "export",
    extra = 0,
    control = false,
    checkDelivery = true,
  ) {
    this.assertRoot(checkDelivery);
    const dirs = { backup: "backups", export: "exports" };
    const limit =
      kind === "data"
        ? (control ? 64 : 63) * 1024 ** 2
        : (kind === "backup" ? 128 : 64) * 1024 ** 2;
    const measured =
      kind === "data"
        ? readdirSync(this.root, { withFileTypes: true })
            .filter((e) => e.isFile())
            .reduce((n, e) => n + statSync(join(this.root, e.name)).size, 0) +
          directoryBytes(join(this.root, "auth"))
        : directoryBytes(join(this.root, dirs[kind]));
    const used = this.simulatedUsage?.(kind) ?? measured;
    if (
      used + extra > limit ||
      directoryBytes(this.root) + extra > 256 * 1024 ** 2
    )
      throw new DeliveryError(
        507,
        "容量达到上限，保留原数据；请下载未提交文本",
      );
  }
  close() {
    closeSync(this.fd);
    try {
      const lock = join(this.root, "writer.lock"),
        v = JSON.parse(readFileSync(lock, "utf8"));
      if (v.leaseId === this.leaseId) unlinkSync(lock);
    } catch {}
  }
}
export class WriteBarrier {
  paused = false;
  private inFlight = 0;
  private waiters: (() => void)[] = [];
  private resumeHandlers = new Set<() => void>();
  onResume(fn: () => void) {
    this.resumeHandlers.add(fn);
    return () => this.resumeHandlers.delete(fn);
  }
  persist<T>(fn: () => T): T {
    if (this.paused)
      throw new DeliveryError(503, "一致备份进行中，权限写入暂不可用");
    this.inFlight++;
    try {
      return fn();
    } finally {
      this.inFlight--;
      if (!this.inFlight) this.waiters.splice(0).forEach((fn) => fn());
    }
  }
  middleware = (req: any, res: any, next: any) => {
    const writes =
      !["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      req.deliveryPersistentWrite === true ||
      /\/api\/admin\/(export\.csv|intakes\/[^/]+\/export)/.test(req.path);
    if (!writes || req.path === "/api/admin/delivery-system/backup")
      return next();
    if (this.paused)
      return res
        .status(503)
        .json({ error: "一致备份进行中，写入暂不可用；未保存内容仍在页面" });
    this.inFlight++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.inFlight--;
      if (!this.inFlight) this.waiters.splice(0).forEach((fn) => fn());
    };
    res.once("finish", finish);
    res.once("close", () => {
      req.deliveryCancelled = true;
      finish();
    });
    next();
  };
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.paused) throw new DeliveryError(409, "备份已在进行");
    this.paused = true;
    try {
      if (this.inFlight) await new Promise<void>((r) => this.waiters.push(r));
      return await fn();
    } finally {
      this.paused = false;
      for (const fn of this.resumeHandlers) fn();
    }
  }
}
