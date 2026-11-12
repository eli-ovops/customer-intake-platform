import { writeFileSync } from "node:fs";
import {
  createQuestionnaire,
  questionBank,
  industries,
  type Answers,
} from "../src/questions.ts";
const profiles: { name: string; answers: Answers }[] = [
  { name: "简单模式", answers: { mode: "simple" } },
  { name: "详细模式，类型与方向尚未确定", answers: { mode: "detailed" } },
  {
    name: "小型制造企业，新建流程工具",
    answers: {
      mode: "detailed",
      customerType: "企业 / 商户",
      industry: industries[0],
      size: "2–10人",
      projectStage: "从零开始，还没有工具",
      types: ["流程与业务工具"],
    },
  },
  {
    name: "大型零售部门，改进网站",
    answers: {
      mode: "detailed",
      customerType: "企业内部部门",
      industry: industries[2],
      size: "200人以上",
      projectStage: "已有工具，需要改进",
      types: ["网站与客户触达"],
    },
  },
  {
    name: "个人专业服务，验证AI想法",
    answers: {
      mode: "detailed",
      customerType: "个人 / 自由职业者",
      industry: industries[16],
      size: "个人 / 1人",
      projectStage: "先验证想法，再决定是否建设",
      types: ["AI辅助"],
    },
  },
  {
    name: "大型制造企业，多方向整合",
    answers: {
      mode: "detailed",
      customerType: "企业 / 商户",
      industry: industries[0],
      size: "200人以上",
      projectStage: "多个工具之间需要整合",
      types: ["网站与客户触达", "流程与业务工具", "数据与报表", "AI辅助"],
      budget: "已有大致范围",
    },
  },
];
const results = profiles.map(({ name, answers }) => {
  const pages = createQuestionnaire(answers).pages;
  const questions = pages.flatMap((p) => p.elements);
  return {
    name,
    answers,
    count: questions.length,
    steps: pages.length,
    choiceCount: questions.filter((q) =>
      ["dropdown", "radiogroup", "checkbox"].includes(String(q.type)),
    ).length,
    fields: questions.map((q) => q.name),
  };
});
writeFileSync(
  "evidence/adaptive-route-examples.json",
  JSON.stringify(results, null, 2),
);
let doc =
  "# 客户问卷题库\n\n2026-10-06 用户授权的本机问卷调整。以下为当前实际题库；选项与规则由 src/questions.ts 和 src/question-options.ts 维护。题目不是最终项目范围或交付承诺。\n\n";
doc +=
  "必填：企业 / 团队称呼、所在行业、目前最想解决的问题。其他均可跳过，草稿允许不完整。每步最多5道实际相关题，最后一步可少于5道。\n\n详细模式先选择客户类型、项目阶段和需求方向；客户类型与阶段各追加1题；个人、小团队、中型团队各追加1题，大团队追加2题；20个行业各有2题；不确定或旧行业采用通用题，不猜测行业。网站追加3题、流程追加3题、数据追加4题、AI追加5题，数据来源与权限在多选方向时只问一次。预算有范围时才显示可选简答。改变选择或模式保留旧答案，摘要将未启用分支的旧答案标明。\n\n";
doc +=
  "## 组合示例\n\n| 客户与项目 | 题数（含选填） | 步数 | 选择题 |\n|---|---:|---:|---:|\n";
for (const r of results)
  doc += `| ${r.name} | ${r.count} | ${r.steps} | ${r.choiceCount} |\n`;
doc +=
  "\n## 全部题目与选项\n\n题库中的条件题不会同时全部展示；仅按当前答案组合。短文本包括称呼、联系方式、当前问题、期望结果、预算补充和其他补充。\n\n";
for (const q of questionBank) {
  doc += `### ${q.title}${q.isRequired ? " *" : ""}\n\n字段：${q.name}；${q.type === "checkbox" ? "多选" : q.type === "dropdown" || q.type === "radiogroup" ? "单选" : "短文本"}；${q.when ? "条件题" : "通用题"}。\n\n`;
  if (Array.isArray(q.choices))
    for (const c of q.choices)
      doc += `- ${typeof c === "string" ? c : c.text}\n`;
  doc += "\n";
}
writeFileSync("docs/QUESTION_BANK.md", doc);
console.log(
  JSON.stringify(
    results.map(({ name, count, steps, choiceCount }) => ({
      name,
      count,
      steps,
      choiceCount,
    })),
  ),
);
