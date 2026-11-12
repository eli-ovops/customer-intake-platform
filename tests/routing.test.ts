import { test } from "node:test";
import assert from "node:assert/strict";
import { Model } from "survey-core";
import {
  createQuestionnaire,
  questionBank,
  industries,
  fields,
  type Answers,
} from "../src/questions.ts";
import { industryTopics } from "../src/question-options.ts";
import { configureSurvey } from "../src/survey-routing.ts";
import { summarize } from "../server/summary.ts";
const names = (a: Answers) =>
  createQuestionnaire(a).pages.flatMap((p) => p.elements.map((q) => q.name));
test("20 industries, six sizes and all direction combinations route uniquely and pack five actual questions", () => {
  assert.equal(new Set(fields).size, fields.length);
  assert.equal(questionBank.length, fields.length);
  assert.equal(industryTopics.length, industries.length);
  const sizes = [
    "个人 / 1人",
    "2–10人",
    "11–50人",
    "51–200人",
    "200人以上",
    "不确定",
  ];
  const directions = [
    "网站与客户触达",
    "流程与业务工具",
    "数据与报表",
    "AI辅助",
  ];
  for (let i = 0; i < industries.length; i++)
    for (const size of sizes)
      for (let mask = 0; mask < 16; mask++) {
        const a = {
          mode: "detailed",
          industry: industries[i],
          size,
          types: directions.filter((_, n) => mask & (1 << n)),
        };
        const schema = createQuestionnaire(a),
          keys = names(a);
        assert.equal(new Set(keys).size, keys.length);
        assert.ok(keys.includes(industryTopics[i][0] + "Focus"));
        assert.equal(
          keys.filter((k) => industryTopics.some((t) => k === t[0] + "Focus"))
            .length,
          1,
        );
        assert.equal(keys.includes("soloCapacity"), size === "个人 / 1人");
        assert.equal(keys.includes("smallCollaboration"), size === "2–10人");
        assert.equal(keys.includes("mediumOwnership"), size === "11–50人");
        assert.equal(
          keys.includes("largeGovernance"),
          ["51–200人", "200人以上"].includes(size),
        );
        assert.equal(
          keys.includes("websiteActions"),
          a.types.includes(directions[0]),
        );
        assert.equal(
          keys.includes("processAutomation"),
          a.types.includes(directions[1]),
        );
        assert.equal(
          keys.includes("reportGoal"),
          a.types.includes(directions[2]),
        );
        assert.equal(
          keys.includes("aiReview"),
          a.types.includes(directions[3]),
        );
        assert.equal(
          keys.filter((k) => k === "dataPermission").length,
          mask & 12 ? 1 : 0,
        );
        for (const page of schema.pages.slice(0, -1))
          assert.equal(page.elements.length, 5);
        assert.ok(schema.pages.at(-1)!.elements.length <= 5);
        const choiceCount = schema.pages
          .flatMap((p) => p.elements)
          .filter((q) =>
            ["dropdown", "checkbox", "radiogroup"].includes(String(q.type)),
          ).length;
        assert.ok(choiceCount / keys.length > 0.75);
      }
});
test("customer type and project stage add relevant questions; unknowns use common questions", () => {
  for (const [field, cases] of Object.entries({
    customerType: {
      "个人 / 自由职业者": "individualWork",
      "企业 / 商户": "businessScope",
      企业内部部门: "departmentBoundary",
      "机构 / 公益组织": "institutionUsers",
    },
    projectStage: {
      "从零开始，还没有工具": "newProjectStart",
      "已有工具，需要改进": "existingProjectIssue",
      多个工具之间需要整合: "integrationGoal",
      "先验证想法，再决定是否建设": "pilotScope",
    },
  }))
    for (const [value, key] of Object.entries(cases))
      assert.ok(names({ mode: "detailed", [field]: value }).includes(key));
  const unknown = names({
    mode: "detailed",
    industry: "旧特殊行业",
    size: "不确定",
    customerType: "不确定",
    projectStage: "不确定",
    types: ["还不确定"],
  });
  assert.ok(unknown.includes("priority"));
  assert.ok(!unknown.includes("manufacturingFocus"));
  assert.ok(!unknown.includes("aiTask"));
  assert.equal(
    names({ mode: "simple", industry: industries[0], types: ["AI辅助"] })
      .length,
    11,
  );
});
test("reconfiguration preserves inactive answers, legacy values, current page and required validation", () => {
  const m = new Model();
  const a = {
    mode: "detailed",
    organization: "虚构",
    industry: industries[0],
    problem: "虚构问题",
    size: "2–10人",
    types: ["流程与业务工具"],
    workflow: "原自由文本流程",
    manufacturingFocus: ["物料与库存"],
  };
  configureSurvey(m, a, false);
  const q = m.getQuestionByName("workflow");
  assert.equal(q.value, a.workflow);
  assert.ok(q.choices.some((c: { value: string }) => c.value === a.workflow));
  m.currentPage = m.pages.find((p) =>
    p.questions.some((q: { name: string }) => q.name === "types"),
  )!;
  configureSurvey(m, {
    ...m.data,
    size: "200人以上",
    industry: industries[2],
    types: ["网站与客户触达"],
  });
  assert.ok(
    m.currentPage.questions.some((q: { name: string }) => q.name === "types"),
  );
  assert.equal(m.getQuestionByName("manufacturingFocus"), null);
  assert.deepEqual(m.data.manufacturingFocus, a.manufacturingFocus);
  assert.equal(m.data.workflow, a.workflow);
  assert.ok(m.getQuestionByName("retailFocus"));
  assert.ok(m.getQuestionByName("largeGovernance"));
  const summary = summarize(m.data);
  assert.ok(
    summary.items
      .find((i) => i.value === a.workflow)
      ?.label.includes("当前分支未启用"),
  );
  configureSurvey(m, {
    ...m.data,
    industry: industries[0],
    types: ["流程与业务工具"],
  });
  assert.deepEqual(
    [...m.getQuestionByName("manufacturingFocus").value],
    a.manufacturingFocus,
  );
  assert.equal(m.getQuestionByName("workflow").value, a.workflow);
  assert.equal(m.validate(), true);
  m.setValue("problem", "");
  assert.equal(m.validate(), false);
});
