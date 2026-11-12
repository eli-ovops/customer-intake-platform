import { labels, createQuestionnaire, type Answers } from "../src/questions.ts";
export const ruleVersion = "fde-intake-rules-2";
export function summarize(answers: Answers) {
  const active = new Set(
    createQuestionnaire({ ...answers, mode: "detailed" }).pages.flatMap((p) =>
      p.elements.map((q) => q.name),
    ),
  );
  const questions: string[] = [];
  if (!answers.problem)
    questions.push("能否举一个最近发生的具体问题？当时怎样处理？");
  if (!answers.workflow)
    questions.push("请带我们走一遍最近一次完整流程，指出交接和等待的位置。");
  if (!answers.priority)
    questions.push("如果第一阶段只改善一件事，你会选择哪一件？");
  if (!answers.acceptance)
    questions.push("用哪一个真实场景或指标判断结果有帮助？");
  if (!answers.decision) questions.push("谁需要参与下一次访谈和方案决定？");
  if (!answers.dataPermission && answers.types?.includes("AI辅助"))
    questions.push("这些数据是否获准使用？哪些必须脱敏或留在本地？");
  if (!answers.budget || answers.budget === "尚未确定")
    questions.push("怎样确定一个可接受的阶段预算和维护成本？");
  questions.push("哪些设想还需要验证，哪些是当前已经确定的限制？");
  return {
    ruleVersion,
    statement: "以下按已填内容整理，仅供访谈准备；未确认事项不视为最终需求。",
    items: Object.entries(answers)
      .filter(
        ([k, v]) =>
          labels[k] && (Array.isArray(v) ? v.length : String(v).trim()),
      )
      .map(([key, value]) => ({
        label:
          labels[key] + (active.has(key) ? "" : "（之前填写，当前分支未启用）"),
        value: Array.isArray(value) ? value.join("、") : value,
      })),
    questions,
  };
}
export function csvCell(value: unknown) {
  let v = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(v) || /^[\t\r\n]/.test(v)) v = "'" + v;
  return '"' + v.replaceAll('"', '""') + '"';
}
