import { Model } from "survey-core";
import { createQuestionnaire, type Answers } from "./questions";
export function configureSurvey(
  model: Model,
  data: Answers,
  preservePage = true,
) {
  const oldIndex = model.currentPageNo;
  const anchors = preservePage
    ? (model.currentPage?.questions.map((q: { name: string }) => q.name) ?? [])
    : [];
  const answers = structuredClone(data);
  model.fromJSON(createQuestionnaire(answers));
  model.questionsOnPageMode = "standard";
  model.requiredText = "*";
  model.showPageTitles = false;
  model.showCompleteButton = false;
  model.textUpdateMode = "onTyping";
  for (const q of model.getAllQuestions()) {
    if (!("choices" in q)) continue;
    const value = answers[q.name];
    const values = Array.isArray(value)
      ? value
      : typeof value === "string" && value
        ? [value]
        : [];
    for (const v of values)
      if (!q.choices.some((c: { value: string }) => c.value === v))
        q.choices = [
          ...q.choices,
          {
            value: v,
            text:
              v + (q.name === "industry" ? "（原已填行业）" : "（原已填答案）"),
          },
        ];
  }
  model.data = answers;
  if (preservePage) {
    const page = model.pages.find((p) =>
      p.questions.some((q) => anchors.includes(q.name)),
    );
    model.currentPage =
      page ??
      model.pages[Math.min(Math.max(oldIndex, 0), model.pages.length - 1)];
  }
}
