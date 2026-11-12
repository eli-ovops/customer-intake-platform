import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  Workspace,
  Snapshot,
  DeliveryState,
  PlanItem,
  Refs,
} from "../src/delivery-types.ts";
import { RootLease } from "./delivery-root.ts";
import { transaction } from "./db.ts";
import {
  actionSchema,
  questionSchema,
  requirementSchema,
  quoteSchema,
  changeSchema,
  emptyState,
  canonical,
  digest,
  quoteTotals,
  validateScope,
  validateLinks,
  DeliveryError,
  type Action,
} from "./delivery-model.ts";
import { summarize } from "./summary.ts";
import { z } from "zod";
import { existsSync } from "node:fs";
export type DeliveryFaults = {
  beforeWrite?: (op: string) => void;
  beforeExportFile?: (index: number) => void;
  beforePublicComplete?: () => void;
  afterBackupFirst?: () => Promise<void>;
};
export class DeliveryStore {
  db: DatabaseSync;
  epoch = randomUUID();
  revoked = new Set<string>();
  constructor(
    public lease: RootLease,
    public intake: DatabaseSync,
    public faults: DeliveryFaults = {},
    public clock = () => new Date().toISOString(),
  ) {
    if (!existsSync(join(lease.root, "delivery.sqlite")))
      throw new DeliveryError(503, "delivery库缺失，不自动重建");
    this.db = new DatabaseSync(join(lease.root, "delivery.sqlite"));
    try {
      if (
        (this.db.prepare("SELECT version FROM delivery_schema").get() as any)
          ?.version !== 1
      )
        throw new DeliveryError(503, "不支持的delivery schema");
      if (
        (this.db.prepare("PRAGMA integrity_check").get() as any)
          .integrity_check !== "ok"
      )
        throw new DeliveryError(503, "delivery库损坏");
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL");
    } catch (e) {
      this.db.close();
      throw e;
    }
  }
  row(intakeId: string, workspaceId?: string): any {
    this.lease.assertRoot();
    const r = this.db
      .prepare("SELECT * FROM workspaces WHERE intake_id=?")
      .get(intakeId) as any;
    if (!r || (workspaceId && workspaceId !== r.id))
      throw new DeliveryError(404, "工作台不存在或不属于该需求");
    return r;
  }
  snapshots(id: string): Snapshot[] {
    return (
      this.db
        .prepare("SELECT * FROM snapshots WHERE workspace_id=? ORDER BY rowid")
        .all(id) as any[]
    ).map((r) => ({
      id: r.id,
      kind: r.kind,
      version: r.version,
      payload: JSON.parse(r.payload),
      sourceId: r.source_id,
      scopeId: r.scope_id,
      sha256: r.sha256,
      actor: r.actor,
      created: r.created,
    }));
  }
  snapshot(workspaceId: string, id: string | null, kind?: string): Snapshot {
    const r = this.snapshots(workspaceId).find(
      (v) => v.id === id && (!kind || v.kind === kind),
    );
    if (!r) throw new DeliveryError(400, "需要当前已保存的版本");
    return r;
  }
  original(intakeId: string, submissionId: string) {
    const r = this.intake
      .prepare("SELECT * FROM submissions WHERE id=? AND intake_id=?")
      .get(submissionId, intakeId) as any;
    if (!r) throw new DeliveryError(404, "来源提交不存在");
    const value = {
      intakeId,
      submissionId: r.id,
      version: r.version,
      answers: JSON.parse(r.answers),
      mode: r.mode,
      actor: r.actor,
      created: r.created,
    };
    return { ...value, originalHash: digest(value) };
  }
  sourceValid(r: any, state: DeliveryState) {
    try {
      const all = this.snapshots(r.id);
      this.snapshot(r.id, state.source, "source");
      for (const snap of all) {
        if (digest(snap.payload) !== snap.sha256) return false;
        if (
          snap.kind === "source" &&
          this.original(r.intake_id, snap.payload.submissionId).originalHash !==
            snap.payload.originalHash
        )
          return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  refs(s: DeliveryState): Refs {
    return { source: s.source, scope: s.scope, quote: s.quote, plan: s.plan };
  }
  alignment(r: any, s: DeliveryState) {
    const match = (id: string | null, kind: string) => {
      try {
        const x = this.snapshot(r.id, id, kind);
        return (
          x.sourceId === s.source && (kind === "scope" || x.scopeId === s.scope)
        );
      } catch {
        return false;
      }
    };
    return {
      scope: match(s.scope, "scope"),
      quote: match(s.quote, "quote") && match(s.scope, "scope"),
      plan: match(s.plan, "plan") && match(s.scope, "scope"),
    };
  }
  publicText(r: any, s: DeliveryState) {
    const scope = this.snapshot(r.id, s.scope, "scope"),
      q = this.snapshot(r.id, s.quote, "quote"),
      plan = this.snapshot(r.id, s.plan, "plan");
    const text = [
      "# 项目沟通资料 · 待确认 / 报价草案",
      "冻结为内部整理，不代表客户确认。",
      `目标：${scope.payload.meta.goal}`,
      "## 交付范围",
      ...scope.payload.requirements
        .filter((v: any) => v.status === "included")
        .map(
          (v: any) =>
            `- ${v.title}：${v.deliverable}${v.kind === "research" ? `（调研验证，前提：${v.condition}；停止条件：${v.stop}）` : ""}`,
        ),
      `不包含：${scope.payload.meta.excluded || "待确认"}`,
      "## 待确认问题",
      ...s.questions
        .filter((v) => v.status !== "answered")
        .map((v) => `- ${v.title}`),
      "## CNY销售报价草案",
      ...q.payload.stages.map(
        (v: any) =>
          `- ${v.title}：${v.saleFen === null ? "待估" : (v.saleFen / 100).toFixed(2) + "元"}`,
      ),
      `总报价：${q.payload.totals.saleTotalFen === null ? "待估（已填写部分不是总价）" : (q.payload.totals.saleTotalFen / 100).toFixed(2) + "元"}`,
      "## 验收动作",
      ...plan.payload.items.map((v: any) => `- ${v.title}：${v.action}`),
      "本材料需人工核对，不构成合同或自动发送。",
    ];
    return text.join("\n\n");
  }
  approvalValid(r: any, s: DeliveryState, text?: string) {
    try {
      const a = s.approval,
        aligned = this.alignment(r, s);
      return (
        !!a &&
        s.publicPermission === "allowed" &&
        !this.revoked.has(r.id) &&
        a.epoch === this.epoch &&
        a.permissionRevision === s.permissionRevision &&
        canonical(a.refs) === canonical(this.refs(s)) &&
        aligned.scope &&
        aligned.quote &&
        aligned.plan &&
        this.sourceValid(r, s) &&
        a.textHash === digest(text ?? this.publicText(r, s))
      );
    } catch {
      return false;
    }
  }
  get(intakeId: string, workspaceId?: string): Workspace {
    const r = this.row(intakeId, workspaceId),
      s: DeliveryState = JSON.parse(r.state),
      alignment = this.alignment(r, s);
    let preview = "",
      totals = null;
    try {
      if (alignment.scope && alignment.quote && alignment.plan)
        preview = this.publicText(r, s);
      if (s.quote)
        totals = this.snapshot(r.id, s.quote, "quote").payload.totals;
    } catch {}
    const sourceValid = this.sourceValid(r, s);
    return {
      id: r.id,
      intakeId: r.intake_id,
      revision: r.revision,
      state: s,
      snapshots: this.snapshots(r.id),
      sourceValid,
      readOnlyReason: sourceValid
        ? null
        : "来源缺失或hash不一致，保留历史只读，不自动重绑",
      alignment,
      publicPreview: preview,
      publicApprovalValid: this.approvalValid(r, s, preview),
      quoteTotals: totals,
    };
  }
  addSnapshot(
    r: any,
    s: DeliveryState,
    kind: string,
    payload: any,
    actor: string,
  ) {
    const used = (
      this.db
        .prepare(
          "SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS n FROM snapshots",
        )
        .get() as any
    ).n;
    if (used + Buffer.byteLength(canonical(payload)) > 32 * 1024 ** 2)
      throw new DeliveryError(507, "历史达到32MiB限制，保留旧版本");
    const id = randomUUID(),
      version =
        (
          this.db
            .prepare(
              "SELECT COUNT(*) AS n FROM snapshots WHERE workspace_id=? AND kind=?",
            )
            .get(r.id, kind) as any
        ).n + 1;
    this.db
      .prepare("INSERT INTO snapshots VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        r.id,
        kind,
        version,
        canonical(payload),
        kind === "source" ? id : s.source,
        kind === "scope" ? id : s.scope,
        digest(payload),
        actor,
        this.clock(),
      );
    return id;
  }
  write(r: any, s: DeliveryState) {
    this.db
      .prepare(
        "UPDATE workspaces SET state=?,revision=revision+1,updated=? WHERE id=?",
      )
      .run(canonical(s), this.clock(), r.id);
  }
  create(intakeId: string, submissionId: string, actor: string) {
    this.lease.checkCapacity("data", 40960);
    const existing = this.db
      .prepare("SELECT id FROM workspaces WHERE intake_id=?")
      .get(intakeId);
    if (existing) return this.get(intakeId);
    const source = this.original(intakeId, submissionId),
      s = emptyState();
    s.scopeMeta.goal = String(
      source.answers.outcome ?? source.answers.problem ?? "",
    ).slice(0, 1000);
    s.questions = summarize(source.answers)
      .questions.slice(0, 5)
      .map((title, i) => ({
        id: `Q${i + 1}`,
        title,
        sourceField: "提交原文",
        blocking: false,
        requirementIds: [],
        status: "open",
        answer: "",
      }));
    transaction(this.db, () => {
      const r = { id: randomUUID(), intake_id: intakeId };
      this.db
        .prepare("INSERT INTO workspaces VALUES(?,?,?,?,?,?)")
        .run(r.id, intakeId, 0, canonical(s), this.clock(), this.clock());
      s.source = this.addSnapshot(r, s, "source", source, actor);
      this.write(r, s);
    });
    return this.get(intakeId);
  }
  action(intakeId: string, workspaceId: string, input: unknown, actor: string) {
    const body = actionSchema.parse(input);
    if (Buffer.byteLength(canonical(body)) > 40960)
      throw new DeliveryError(413, "提交块超过40KiB，请按记录拆小");
    const r = this.row(intakeId, workspaceId),
      payloadHash = digest(body),
      prior = this.db
        .prepare(
          "SELECT * FROM actions WHERE workspace_id=? AND action=? AND request_key=?",
        )
        .get(r.id, body.op, body.requestKey) as any;
    if (prior) {
      if (prior.payload_hash !== payloadHash)
        throw new DeliveryError(409, "同请求键内容不同，拒绝覆盖");
      return JSON.parse(prior.result);
    }
    if (body.op === "revokePublic") this.revoked.add(r.id);
    this.lease.checkCapacity("data", 40960, body.op === "revokePublic");
    if (r.revision !== body.revision)
      throw new DeliveryError(
        409,
        "内容已有更新，你的编辑仍保留；读取新版并重基后用新键提交",
      );
    const s: DeliveryState = JSON.parse(r.state);
    if (!this.sourceValid(r, s))
      throw new DeliveryError(409, "来源不一致，历史只读");
    this.faults.beforeWrite?.(body.op);
    const previouslyRevoked = this.revoked.has(r.id);
    try {
      return transaction(this.db, () => {
        this.apply(r, s, body, actor);
        this.write(r, s);
        const result = this.get(intakeId, r.id);
        this.db
          .prepare("INSERT INTO actions VALUES(?,?,?,?,?,?,?)")
          .run(
            r.id,
            body.op,
            body.requestKey,
            payloadHash,
            canonical(result),
            actor,
            this.clock(),
          );
        return result;
      });
    } catch (e) {
      if (body.op === "approvePublic" && previouslyRevoked)
        this.revoked.add(r.id);
      throw e;
    }
  }
  apply(r: any, s: DeliveryState, b: Action, actor: string) {
    const a = b.args;
    switch (b.op) {
      case "patch": {
        const input = z
          .object({
            collection: z.enum([
              "questions",
              "requirements",
              "quoteStages",
              "changes",
            ]),
            records: z.array(z.unknown()).max(5),
            removeIds: z.array(z.string()).max(5).default([]),
          })
          .strict()
          .parse(a);
        const schemas = {
          questions: questionSchema,
          requirements: requirementSchema,
          quoteStages: quoteSchema,
          changes: changeSchema,
        };
        const records = input.records.map((v) =>
            schemas[input.collection].parse(v),
          ),
          list = s[input.collection] as any[];
        for (const id of input.removeIds) {
          const i = list.findIndex((v) => v.id === id);
          if (
            i >= 0 &&
            input.collection === "changes" &&
            list[i].status === "accepted"
          )
            throw new DeliveryError(409, "已采纳变更不能移除");
          if (i >= 0) list.splice(i, 1);
        }
        for (const item of records) {
          const i = list.findIndex((v) => v.id === item.id);
          if (i >= 0) {
            if (input.collection === "changes" && list[i].status === "accepted")
              throw new DeliveryError(409, "已采纳变更不可修改");
            list[i] = item;
          } else list.push(item);
        }
        const limit = input.collection === "quoteStages" ? 10 : 50;
        if (list.length > limit)
          throw new DeliveryError(400, "记录数量超过首版限制");
        s.approval = null;
        break;
      }
      case "scopeMeta":
        s.scopeMeta = z
          .object({
            goal: z.string().min(1).max(1000),
            excluded: z.string().max(1000),
          })
          .strict()
          .parse(a);
        s.approval = null;
        break;
      case "switchSource": {
        const { submissionId } = z
          .object({ submissionId: z.string() })
          .strict()
          .parse(a);
        s.source = this.addSnapshot(
          r,
          s,
          "source",
          this.original(r.intake_id, submissionId),
          actor,
        );
        s.approval = null;
        break;
      }
      case "freezeScope": {
        z.object({}).strict().parse(a);
        s.scope = this.addSnapshot(r, s, "scope", validateScope(s), actor);
        s.approval = null;
        break;
      }
      case "saveQuote": {
        z.object({}).strict().parse(a);
        this.currentScope(r, s);
        const scope = this.snapshot(r.id, s.scope, "scope");
        validateLinks(s.quoteStages, scope.payload.requirements);
        const totals = quoteTotals(s.quoteStages);
        s.quote = this.addSnapshot(
          r,
          s,
          "quote",
          {
            currency: "CNY",
            stages: s.quoteStages,
            totals,
            calculationVersion: 1,
          },
          actor,
        );
        s.approval = null;
        break;
      }
      case "buildPlan": {
        z.object({}).strict().parse(a);
        this.currentScope(r, s);
        const scope = this.snapshot(r.id, s.scope, "scope");
        const items: PlanItem[] = scope.payload.requirements
          .filter((v: any) => v.status === "included")
          .map((v: any) => ({
            id: randomUUID(),
            requirementId: v.id,
            title: v.title,
            action: v.acceptance,
            status: "unmeasured",
            result: "",
            evidence: "",
            testedVersion: "",
            actor: "",
            created: "",
          }));
        s.plan = this.addSnapshot(r, s, "plan", { items }, actor);
        s.approval = null;
        break;
      }
      case "adoptChange": {
        const { changeId } = z
          .object({ changeId: z.string() })
          .strict()
          .parse(a);
        this.currentScope(r, s);
        const c = s.changes.find((v) => v.id === changeId);
        if (!c || c.status !== "pending" || c.baseScopeId !== s.scope)
          throw new DeliveryError(409, "变更基线已变，请保留提案并重基");
        if (!c.reason.trim() || !c.impact.trim())
          throw new DeliveryError(400, "变更需原因和影响");
        c.status = "accepted";
        const old = s.scope;
        s.scope = this.addSnapshot(r, s, "scope", validateScope(s), actor);
        this.addSnapshot(
          r,
          s,
          "change",
          { ...c, fromScope: old, toScope: s.scope },
          actor,
        );
        s.approval = null;
        break;
      }
      case "recordResult": {
        this.currentScope(r, s);
        if (!this.alignment(r, s).plan)
          throw new DeliveryError(409, "清单需核对新基线");
        const v = z
          .object({
            id: z.string(),
            status: z.enum(["unmeasured", "passed", "failed", "na"]),
            result: z.string().max(1000),
            evidence: z.string().max(1000),
            testedVersion: z.string().max(1000),
          })
          .strict()
          .parse(a);
        if (
          v.status === "passed" &&
          (!v.result.trim() || !v.evidence.trim() || !v.testedVersion.trim())
        )
          throw new DeliveryError(400, "通过需实际结果、证据、受测版本");
        if (["failed", "na"].includes(v.status) && !v.result.trim())
          throw new DeliveryError(400, "请填写问题或不适用原因");
        const payload = structuredClone(
            this.snapshot(r.id, s.plan, "plan").payload,
          ),
          item = payload.items.find((x: any) => x.id === v.id);
        if (!item) throw new DeliveryError(404, "验收项不存在");
        Object.assign(item, v, { actor, created: this.clock() });
        s.plan = this.addSnapshot(r, s, "plan", payload, actor);
        s.approval = null;
        break;
      }
      case "approvePublic": {
        const { textHash } = z
          .object({ textHash: z.string() })
          .strict()
          .parse(a);
        const aligned = this.alignment(r, s);
        if (!aligned.scope || !aligned.quote || !aligned.plan)
          throw new DeliveryError(409, "版本依赖需核对，不能核准对客材料");
        const preview = this.publicText(r, s);
        const frozenScope = this.snapshot(r.id, s.scope, "scope"),
          frozenQuote = this.snapshot(r.id, s.quote, "quote");
        if (
          canonical({ meta: s.scopeMeta, requirements: s.requirements }) !==
            canonical(frozenScope.payload) ||
          canonical(s.quoteStages) !== canonical(frozenQuote.payload.stages)
        )
          throw new DeliveryError(
            409,
            "存在已保存但未冻结的范围或报价修改，请先形成对应版本",
          );
        if (textHash !== digest(preview))
          throw new DeliveryError(409, "预览文本变化，请重新核对");
        s.publicPermission = "allowed";
        s.permissionRevision++;
        s.approval = {
          epoch: this.epoch,
          textHash,
          permissionRevision: s.permissionRevision,
          refs: this.refs(s),
        };
        this.revoked.delete(r.id);
        break;
      }
      case "revokePublic":
        z.object({}).strict().parse(a);
        s.publicPermission = "revoked";
        s.permissionRevision++;
        s.approval = null;
        break;
    }
  }
  currentScope(r: any, s: DeliveryState) {
    if (!this.alignment(r, s).scope)
      throw new DeliveryError(409, "原文或基线变化，请冻结当前范围后再继续");
  }
  actionResult(
    intakeId: string,
    workspaceId: string,
    action: string,
    key: string,
  ) {
    const r = this.row(intakeId, workspaceId),
      v = this.db
        .prepare(
          "SELECT result FROM actions WHERE workspace_id=? AND action=? AND request_key=?",
        )
        .get(r.id, action, key) as any;
    return v
      ? { committed: true, result: JSON.parse(v.result) }
      : { committed: false };
  }
  verifyReferences() {
    const errors: string[] = [];
    for (const r of this.db
      .prepare("SELECT * FROM workspaces")
      .all() as any[]) {
      for (const snap of this.snapshots(r.id)) {
        if (digest(snap.payload) !== snap.sha256)
          errors.push(`${r.id}:${snap.id}:snapshot-hash`);
        if (snap.kind === "source") {
          try {
            if (
              this.original(r.intake_id, snap.payload.submissionId)
                .originalHash !== snap.payload.originalHash
            )
              throw new Error();
          } catch {
            errors.push(`${r.id}:${snap.id}:source`);
          }
        } else {
          if (
            snap.sourceId &&
            !this.snapshots(r.id).some(
              (v) => v.id === snap.sourceId && v.kind === "source",
            )
          )
            errors.push(`${snap.id}:source-ref`);
          if (
            snap.scopeId &&
            !this.snapshots(r.id).some(
              (v) => v.id === snap.scopeId && v.kind === "scope",
            )
          )
            errors.push(`${snap.id}:scope-ref`);
        }
      }
      const s: DeliveryState = JSON.parse(r.state);
      for (const id of Object.values(this.refs(s)))
        if (id && !this.snapshots(r.id).some((v) => v.id === id))
          errors.push(`${r.id}:current-pointer`);
    }
    return { valid: errors.length === 0, errors };
  }
}
