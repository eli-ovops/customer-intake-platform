import { z } from "zod";
import { createHash } from "node:crypto";
import type {
  DeliveryState,
  QuoteStage,
  QuoteTotals,
  Requirement,
} from "../src/delivery-types.ts";
export class DeliveryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function canonical(v: any): string {
  return JSON.stringify(normalize(v));
}
function normalize(v: any): any {
  if (Array.isArray(v)) return v.map(normalize);
  if (v !== null && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, normalize(v[k])]),
    );
  return v;
}
export const digest = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : canonical(v))
    .digest("hex");
const text = z.string().max(1000),
  id = z.string().min(1).max(80),
  money = z.number().int().min(0).max(100_000_000).nullable();
export const questionSchema = z
  .object({
    id,
    title: text.min(1),
    sourceField: text,
    blocking: z.boolean(),
    requirementIds: z.array(id).max(50),
    status: z.enum(["open", "answered", "deferred"]),
    answer: text,
  })
  .strict();
export const requirementSchema = z
  .object({
    id,
    title: text.min(1),
    sourceField: text,
    kind: z.enum(["build", "research"]),
    status: z.enum(["included", "later", "excluded"]),
    stage: text.min(1),
    deliverable: text,
    acceptance: text,
    condition: text,
    stop: text,
  })
  .strict();
export const quoteSchema = z
  .object({
    id,
    title: text.min(1),
    requirementIds: z.array(id).max(50),
    saleFen: money,
    minutes: z.number().int().min(0).max(60000).nullable(),
    rateFen: z.number().int().min(0).max(1_000_000).nullable(),
    costFen: money,
    costState: z.enum(["known", "na", "unknown"]),
    costPayer: z.enum(["eli", "customer", "unknown"]),
    zeroReason: text,
  })
  .strict();
export const changeSchema = z
  .object({
    id,
    title: text.min(1),
    reason: text,
    impact: text,
    baseScopeId: id,
    status: z.enum(["pending", "rejected", "later"]),
  })
  .strict();
export const actionSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    requestKey: z.string().min(16).max(80),
    op: z.enum([
      "patch",
      "scopeMeta",
      "switchSource",
      "freezeScope",
      "saveQuote",
      "buildPlan",
      "adoptChange",
      "recordResult",
      "approvePublic",
      "revokePublic",
    ]),
    args: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type Action = z.infer<typeof actionSchema>;
export function emptyState(): DeliveryState {
  return {
    source: null,
    scope: null,
    quote: null,
    plan: null,
    questions: [],
    requirements: [],
    quoteStages: [],
    changes: [],
    scopeMeta: { goal: "", excluded: "" },
    publicPermission: "unknown",
    permissionRevision: 0,
    approval: null,
  };
}
export function quoteTotals(stages: QuoteStage[]): QuoteTotals {
  if (!stages.length || stages.length > 10)
    throw new DeliveryError(400, "报价需要1—10个阶段");
  const mapped = stages.map((v) => {
    const s = quoteSchema.parse(v);
    if (
      [s.saleFen, s.minutes, s.rateFen, s.costFen].some((n) => n === 0) &&
      !s.zeroReason.trim()
    )
      throw new DeliveryError(400, "显式0需填写说明");
    if (s.costState === "known" && s.costFen === null)
      throw new DeliveryError(400, "已知成本需填金额");
    const estimateFen =
      s.minutes === null || s.rateFen === null
        ? null
        : Math.floor((s.minutes * s.rateFen + 30) / 60);
    if (estimateFen !== null && estimateFen > 100_000_000)
      throw new DeliveryError(400, "阶段估算超出安全界限");
    return { ...s, estimateFen };
  });
  const sum = (values: (number | null)[]) => {
    const subtotal = values.reduce<number>((a, b) => a + (b ?? 0), 0);
    if (subtotal > 1_000_000_000)
      throw new DeliveryError(400, "累计金额超出安全界限");
    return {
      subtotal,
      total: values.some((v) => v === null) ? null : subtotal,
    };
  };
  const sale = sum(mapped.map((s) => s.saleFen)),
    estimate = sum(mapped.map((s) => s.estimateFen)),
    cost = sum(
      mapped.map((s) =>
        s.costState === "na"
          ? 0
          : s.costState !== "known" || s.costPayer === "unknown"
            ? null
            : s.costFen,
      ),
    );
  return {
    stages: mapped,
    saleTotalFen: sale.total,
    saleSubtotalFen: sale.subtotal,
    estimateTotalFen: estimate.total,
    estimateSubtotalFen: estimate.subtotal,
    costTotalFen: cost.total,
    costSubtotalFen: cost.subtotal,
  };
}
export function validateScope(s: DeliveryState) {
  const included = s.requirements.filter((r) => r.status === "included");
  if (!s.scopeMeta.goal.trim() || !included.length)
    throw new DeliveryError(400, "请填写目标及至少一个包含项");
  for (const r of included) {
    requirementSchema.parse(r);
    if (!r.deliverable.trim() || !r.acceptance.trim())
      throw new DeliveryError(400, "包含项必须有交付物及验收动作");
    if (r.kind === "research" && (!r.condition.trim() || !r.stop.trim()))
      throw new DeliveryError(400, "调研阶段需前提与停止条件");
    if (
      r.kind === "build" &&
      s.questions.some(
        (q) =>
          q.blocking &&
          q.status !== "answered" &&
          (!q.requirementIds.length || q.requirementIds.includes(r.id)),
      )
    )
      throw new DeliveryError(
        400,
        "正式开发包含项还有阻断问题，请回答或改为有条件调研",
      );
  }
  return { meta: s.scopeMeta, requirements: s.requirements };
}
export function validateLinks(stages: QuoteStage[], reqs: Requirement[]) {
  const ids = new Set(
    reqs.filter((r) => r.status === "included").map((r) => r.id),
  );
  for (const s of stages)
    if (!s.requirementIds.length || s.requirementIds.some((id) => !ids.has(id)))
      throw new DeliveryError(400, "报价阶段必须引用当前包含项");
  if ([...ids].some((id) => !stages.some((s) => s.requirementIds.includes(id))))
    throw new DeliveryError(400, "每个包含项都需关联报价阶段（可待估）");
}
