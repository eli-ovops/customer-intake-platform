import { DatabaseSync, backup } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  chmodSync,
  realpathSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import type { DeliveryExport } from "../src/delivery-types.ts";
import { DeliveryStore } from "./delivery-store.ts";
import { canonical, digest, DeliveryError } from "./delivery-model.ts";
import {
  producerApp,
  allowedRoot,
  initializeRoot,
  readIdentity,
  WriteBarrier,
} from "./delivery-root.ts";
const appVersion = "0.2.0";
function durable(path: string, body: string) {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export class DeliveryPackages {
  constructor(
    public store: DeliveryStore,
    public barrier: WriteBarrier,
  ) {}
  export(
    intakeId: string,
    workspaceId: string,
    mode: "internal" | "customer",
    exportId: string = randomUUID(),
    requestedRevision?: number,
  ): DeliveryExport {
    const w = this.store.get(intakeId, workspaceId);
    if (!/^[\w-]{36}$/.test(exportId))
      throw new DeliveryError(400, "导出编号无效");
    const requestHash = digest({
      intakeId,
      workspaceId,
      mode,
      revision: requestedRevision ?? w.revision,
    });
    const folder = join(this.store.lease.root, "exports", exportId);
    if (existsSync(join(folder, "manifest.json"))) {
      const previous = this.manifest(exportId);
      if (previous.requestHash !== requestHash)
        throw new DeliveryError(409, "同导出编号载荷不同");
      return previous;
    }
    if (requestedRevision !== undefined && requestedRevision !== w.revision)
      throw new DeliveryError(409, "已保存revision变化，请核对后另开导出");
    if (!w.sourceValid)
      throw new DeliveryError(409, "来源不一致，只能历史查看");
    const row = this.store.row(intakeId, workspaceId),
      s = structuredClone(w.state),
      refs = this.store.refs(s),
      revision = w.revision;
    const customerText = w.publicPreview;
    if (mode === "customer" && !this.store.approvalValid(row, s, customerText))
      throw new DeliveryError(403, "对客许可/核准或依赖失效，请复核当前预览");
    this.store.lease.checkCapacity(
      "export",
      2 * Buffer.byteLength(canonical(w)) + 65536,
    );
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const manifest: any = {
      producerApp,
      appVersion,
      schemaName: "fde-delivery-materials",
      syntheticOnly: this.store.lease.identity.syntheticOnly,
      schemaVersion: 1,
      exportId,
      requestHash,
      createdAt: this.store.clock(),
      sourceRevisionRefs: [{ workspaceId, revision, ...refs }],
      files: [],
      verificationCoverage: ["saved-revision", "file-bytes"],
      limitations: [
        "资料包不是数据库备份",
        "内部冻结不是客户确认",
        "不自动发送",
      ],
      privacyMode: mode,
      status: "PARTIAL",
    };
    try {
      const files =
        mode === "customer"
          ? [{ name: "customer-draft.md", body: customerText }]
          : [
              {
                name: "internal.json",
                body: canonical({
                  producerApp,
                  schemaVersion: 1,
                  workspace: w,
                }),
              },
              {
                name: "internal.md",
                body: [
                  "# 内部交付资料",
                  `工作台：${w.id} / revision ${revision}`,
                  "仅内部，包含估算与成本。",
                  canonical(w.state),
                  "## 版本历史",
                  ...w.snapshots.map(
                    (v) =>
                      `${v.kind} v${v.version} / ${v.id}\n${canonical(v.payload)}`,
                  ),
                ].join("\n\n"),
              },
            ];
      files.forEach((file, index) => {
        this.store.faults.beforeExportFile?.(index);
        durable(join(folder, file.name), file.body);
        const bytes = readFileSync(join(folder, file.name));
        manifest.files.push({
          relativePath: file.name,
          sha256: digest(bytes.toString("utf8")),
          bytes: bytes.length,
        });
      });
      if (mode === "customer") {
        this.store.faults.beforePublicComplete?.();
        const current = this.store.get(intakeId, workspaceId);
        if (
          current.revision !== revision ||
          !this.store.approvalValid(
            this.store.row(intakeId, workspaceId),
            current.state,
            customerText,
          ) ||
          canonical(this.store.refs(current.state)) !== canonical(refs)
        )
          throw new DeliveryError(403, "锁定后许可或依赖已变化，对客包未完成");
      }
      for (const file of manifest.files) {
        const actual = readFileSync(join(folder, file.relativePath));
        if (
          actual.length !== file.bytes ||
          digest(actual.toString("utf8")) !== file.sha256
        )
          throw new Error("导出字节核对失败");
      }
      manifest.status = "COMPLETED";
    } catch (e: any) {
      manifest.error =
        e instanceof DeliveryError ? e.message : "导出写入失败，内部现场已保留";
    }
    durable(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  }
  manifest(id: string) {
    if (!/^[\w-]{36}$/.test(id)) throw new DeliveryError(400, "包编号无效");
    const p = join(this.store.lease.root, "exports", id, "manifest.json");
    if (!existsSync(p)) throw new DeliveryError(404, "导出包不存在");
    if (realpathSync(p) !== p)
      throw new DeliveryError(403, "Symlink package path denied");
    return JSON.parse(readFileSync(p, "utf8"));
  }
  file(intakeId: string, workspaceId: string, exportId: string, name: string) {
    this.store.row(intakeId, workspaceId);
    const m = this.manifest(exportId);
    if (
      m.status !== "COMPLETED" ||
      m.sourceRevisionRefs[0].workspaceId !== workspaceId
    )
      throw new DeliveryError(409, "未完成或不属于当前客户的包");
    if (m.privacyMode === "customer") {
      const w = this.store.get(intakeId, workspaceId);
      const { workspaceId: _, revision: __, ...refs } = m.sourceRevisionRefs[0];
      if (
        !this.store.approvalValid(
          this.store.row(intakeId, workspaceId),
          w.state,
        ) ||
        canonical(this.store.refs(w.state)) !== canonical(refs)
      )
        throw new DeliveryError(403, "对客许可或依赖失效，拒绝新下载");
    }
    if (name === "manifest.json")
      return {
        body: readFileSync(
          join(this.store.lease.root, "exports", exportId, name),
        ),
        type: "application/json",
      };
    const file = m.files.find((v: any) => v.relativePath === name);
    if (!file || basename(name) !== name)
      throw new DeliveryError(404, "包内文件不存在");
    const body = readFileSync(
      join(this.store.lease.root, "exports", exportId, name),
    );
    if (
      digest(body.toString("utf8")) !== file.sha256 ||
      body.length !== file.bytes
    )
      throw new DeliveryError(409, "文件hash不一致");
    return {
      body,
      type: name.endsWith(".json") ? "application/json" : "text/markdown",
    };
  }
  async batchBackup(batchId: string = randomUUID()) {
    if (!/^[\w-]{36}$/.test(batchId))
      throw new DeliveryError(400, "备份编号无效");
    const prior = join(
      this.store.lease.root,
      "backups",
      batchId,
      "manifest.json",
    );
    if (existsSync(prior)) return JSON.parse(readFileSync(prior, "utf8"));
    return this.barrier.exclusive(async () => {
      const store = this.store;
      store.lease.checkCapacity("backup", 4 * 1024 ** 2);
      const folder = join(store.lease.root, "backups", batchId);
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const manifest: any = {
        producerApp,
        appVersion,
        schemaName: "fde-delivery-two-db-backup",
        syntheticOnly: store.lease.identity.syntheticOnly,
        schemaVersion: 1,
        exportId: batchId,
        createdAt: store.clock(),
        sourceRevisionRefs: [],
        files: [],
        verificationCoverage: [],
        limitations: ["仅本机登记数据根；恢复需独立认证"],
        privacyMode: "sensitive-backup",
        status: "PARTIAL",
      };
      try {
        await backup(store.intake, join(folder, "intake.sqlite"));
        chmodSync(join(folder, "intake.sqlite"), 0o600);
        await store.faults.afterBackupFirst?.();
        await backup(store.db, join(folder, "delivery.sqlite"));
        chmodSync(join(folder, "delivery.sqlite"), 0o600);
        for (const name of ["intake.sqlite", "delivery.sqlite"]) {
          const db = new DatabaseSync(join(folder, name), { readOnly: true });
          try {
            if (
              (db.prepare("PRAGMA integrity_check").get() as any)
                .integrity_check !== "ok"
            )
              throw new Error();
          } finally {
            db.close();
          }
          const bytes = readFileSync(join(folder, name));
          manifest.files.push({
            relativePath: name,
            sha256: binaryDigest(bytes),
            bytes: bytes.length,
          });
        }
        const refs = verifyBatchReferences(folder);
        manifest.referenceCheck = refs;
        if (!refs.valid) throw new Error("跨库引用校验失败");
        manifest.verificationCoverage = [
          "write-barrier",
          "inflight-drained",
          "sqlite-integrity",
          "all-cross-db-refs",
        ];
        manifest.status = "COMPLETED";
      } catch {
        manifest.error = "双库批次未完成，不作为可恢复备份；现场保留";
      }
      durable(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2));
      return manifest;
    });
  }
}
import { createHash } from "node:crypto";
export const binaryDigest = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function verifyBatchReferences(folder: string) {
  const intake = new DatabaseSync(join(folder, "intake.sqlite"), {
      readOnly: true,
    }),
    delivery = new DatabaseSync(join(folder, "delivery.sqlite"), {
      readOnly: true,
    });
  const errors: string[] = [];
  try {
    if (
      (delivery.prepare("SELECT version FROM delivery_schema").get() as any)
        ?.version !== 1
    )
      errors.push("delivery-schema");
    const all = delivery.prepare("SELECT * FROM snapshots").all() as any[];
    for (const w of delivery
      .prepare("SELECT * FROM workspaces")
      .all() as any[]) {
      if (!intake.prepare("SELECT id FROM intakes WHERE id=?").get(w.intake_id))
        errors.push(w.id + ":intake");
      const own = all.filter((s) => s.workspace_id === w.id);
      for (const s of own) {
        const p = JSON.parse(s.payload);
        if (digest(p) !== s.sha256) errors.push(s.id + ":payload-hash");
        if (s.kind === "source") {
          const row = intake
            .prepare("SELECT * FROM submissions WHERE id=? AND intake_id=?")
            .get(p.submissionId, w.intake_id) as any;
          const expected = row
            ? {
                intakeId: w.intake_id,
                submissionId: row.id,
                version: row.version,
                answers: JSON.parse(row.answers),
                mode: row.mode,
                actor: row.actor,
                created: row.created,
              }
            : null;
          if (!expected || digest(expected) !== p.originalHash)
            errors.push(s.id + ":source-hash");
        } else {
          if (
            s.source_id &&
            !own.some((x) => x.id === s.source_id && x.kind === "source")
          )
            errors.push(s.id + ":source-ref");
          if (
            s.scope_id &&
            !own.some((x) => x.id === s.scope_id && x.kind === "scope")
          )
            errors.push(s.id + ":scope-ref");
        }
      }
      const state = JSON.parse(w.state);
      for (const kind of ["source", "scope", "quote", "plan"])
        if (
          state[kind] &&
          !own.some((x) => x.id === state[kind] && x.kind === kind)
        )
          errors.push(w.id + ":" + kind + "-pointer");
    }
    return {
      valid: !errors.length,
      errors,
      workspaces: (
        delivery.prepare("SELECT COUNT(*) AS n FROM workspaces").get() as any
      ).n,
      snapshots: all.length,
    };
  } finally {
    delivery.close();
    intake.close();
  }
}
export async function restoreBatch(source: string, target: string) {
  const folder = resolve(source),
    root = allowedRoot(target);
  if (
    !folder.startsWith(
      join(allowedRoot(resolve(source.split("/backups/")[0])), "backups") + "/",
    )
  )
    throw new DeliveryError(403, "只恢复本项目登记根的备份");
  if (existsSync(root))
    throw new DeliveryError(409, "恢复目标已存在，拒绝覆盖");
  if (realpathSync(folder) !== folder)
    throw new DeliveryError(403, "Symlink backup path denied");
  const manifest = JSON.parse(
    readFileSync(join(folder, "manifest.json"), "utf8"),
  );
  const sourceIdentity = readIdentity(resolve(source.split("/backups/")[0]));
  if ((manifest.syntheticOnly ?? true) !== sourceIdentity.syntheticOnly)
    throw new DeliveryError(409, "备份数据性质与登记源根不一致");
  if (
    manifest.producerApp !== producerApp ||
    manifest.schemaName !== "fde-delivery-two-db-backup" ||
    manifest.schemaVersion !== 1 ||
    manifest.status !== "COMPLETED"
  )
    throw new DeliveryError(409, "不是完整支持的双库备份");
  for (const name of ["intake.sqlite", "delivery.sqlite"]) {
    const f = manifest.files.find((v: any) => v.relativePath === name),
      p = join(folder, name);
    if (
      !f ||
      !existsSync(p) ||
      realpathSync(p) !== p ||
      f.bytes !== statSync(p).size ||
      f.sha256 !== binaryDigest(readFileSync(p))
    )
      throw new DeliveryError(409, "备份字节校验失败");
    const db = new DatabaseSync(p, { readOnly: true });
    try {
      if (
        (db.prepare("PRAGMA integrity_check").get() as any).integrity_check !==
        "ok"
      )
        throw new DeliveryError(409, "备份库损坏");
    } finally {
      db.close();
    }
  }
  const refs = verifyBatchReferences(folder);
  if (!refs.valid)
    throw new DeliveryError(409, "来源或引用缺失/不一致，恢复不完成");
  if (
    manifest.syntheticOnly !== undefined &&
    typeof manifest.syntheticOnly !== "boolean"
  )
    throw new DeliveryError(409, "备份数据性质无效");
  const identity = initializeRoot(root, {
    syntheticOnly: manifest.syntheticOnly ?? true,
  });
  for (const name of ["intake.sqlite", "delivery.sqlite"]) {
    const db = new DatabaseSync(join(folder, name), { readOnly: true });
    try {
      await backup(db, join(root, name));
      chmodSync(join(root, name), 0o600);
    } finally {
      db.close();
    }
  }
  const check = verifyBatchReferences(root);
  if (!check.valid)
    throw new DeliveryError(409, "恢复核对未通过，副本保留不切换");
  writeFileSync(
    join(root, "restore.json"),
    JSON.stringify(
      {
        status: "COMPLETED",
        batchId: manifest.exportId,
        identity,
        referenceCheck: check,
        requiresFreshAuth: true,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return {
    root,
    status: "COMPLETED",
    batchId: manifest.exportId,
    referenceCheck: check,
  };
}
