import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { initializeRoot } from "./delivery-root.ts";
import { initializeAuth, openDeliveryRuntime } from "./delivery-runtime.ts";
import type { Requirement, QuoteStage } from "../src/delivery-types.ts";
export const sampleRequirements: Requirement[] = [
  {
    id: "R01",
    title: "产品展示与咨询",
    sourceField: "problem",
    kind: "build",
    status: "included",
    stage: "网站首版",
    deliverable: "20个虚构产品的展示及咨询入口",
    acceptance: "可查产品并提交咨询；中文界面",
    condition: "",
    stop: "",
  },
  {
    id: "R02",
    title: "AI文件处理可行性调研",
    sourceField: "aiTask",
    kind: "research",
    status: "included",
    stage: "文件处理调研",
    deliverable: "合成文件字段核对与可行性记录",
    acceptance: "记录字段、人工核对和异常；不声称AI已实现",
    condition: "仅虚构样例；真实授权和扫描类型待问",
    stop: "若资料授权或提取能力未验证，停止正式开发",
  },
];
export const sampleStages: QuoteStage[] = [
  {
    id: "Q01",
    title: "网站首版",
    requirementIds: ["R01"],
    saleFen: 12000,
    minutes: 90,
    rateFen: 10000,
    costFen: 2000,
    costState: "known",
    costPayer: "eli",
    zeroReason: "",
  },
  {
    id: "Q02",
    title: "文件处理调研",
    requirementIds: ["R02"],
    saleFen: null,
    minutes: null,
    rateFen: null,
    costFen: null,
    costState: "unknown",
    costPayer: "unknown",
    zeroReason: "",
  },
];
export async function createFixture(
  root: string,
  complete = true,
  mustChange = false,
) {
  initializeRoot(root);
  await initializeAuth(root, mustChange);
  const db = new DatabaseSync(join(root, "intake.sqlite")),
    intakeId = randomUUID(),
    submissionId = randomUUID(),
    otherId = randomUUID(),
    now = new Date().toISOString();
  const answers = {
    organization: "虚构 · 青禾商贸",
    industry: "批发与零售",
    size: "2–10人",
    customerType: "企业 / 商户",
    types: ["网站与客户触达", "AI辅助"],
    problem: "展示20个产品接咨询，整理供应商PDF字段",
    outcome: "减少重复录入；人工核对；边界待确认",
    aiTask: "整理、分类或总结资料",
    current: "主要靠Excel或表格",
  };
  db.prepare("INSERT INTO intakes VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
    intakeId,
    null,
    digestFixture(intakeId),
    "staff",
    "合成夹具",
    JSON.stringify(answers),
    "detailed",
    1,
    "submitted",
    "待了解",
    now,
    now,
  );
  db.prepare("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)").run(
    submissionId,
    intakeId,
    1,
    randomUUID(),
    JSON.stringify(answers),
    "detailed",
    "合成夹具",
    now,
  );
  db.prepare("INSERT INTO intakes VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
    otherId,
    null,
    digestFixture(otherId),
    "staff",
    "合成夹具",
    JSON.stringify({
      organization: "虚构 · 客户B",
      industry: "其他行业",
      problem: "其他客户",
    }),
    "simple",
    0,
    "draft",
    "待了解",
    now,
    now,
  );
  db.close();
  const runtime = openDeliveryRuntime(root);
  try {
    let w = runtime.store.create(intakeId, submissionId, "合成夹具");
    const act = (op: string, args: any = {}) => {
      w = runtime.store.action(
        intakeId,
        w.id,
        { revision: w.revision, requestKey: randomUUID(), op, args },
        "合成夹具",
      );
      return w;
    };
    if (complete) {
      act("scopeMeta", {
        goal: "让网站承接咨询，先验证文件整理能力",
        excluded: "支付、自动外发、真实PDF解析和正式AI开发",
      });
      act("patch", { collection: "requirements", records: sampleRequirements });
      act("freezeScope");
      act("patch", { collection: "quoteStages", records: sampleStages });
      act("saveQuote");
      act("buildPlan");
      act("patch", {
        collection: "changes",
        records: [
          {
            id: "C01",
            title: "增加付款（虚构提案）",
            reason: "后续想法",
            impact: "范围、费用与验收待评估",
            baseScopeId: w.state.scope!,
            status: "pending",
          },
        ],
      });
    }
    return { root, intakeId, submissionId, otherId, workspaceId: w.id };
  } finally {
    runtime.close();
  }
}
import { digest as digestFixture } from "./delivery-model.ts";
