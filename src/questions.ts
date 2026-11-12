import {
  choices,
  choiceOverrides,
  contextQuestions,
  industryQuestions,
  directionQuestions,
  type RoutingQuestion,
} from "./question-options";
export const labels: Record<string, string> = {
  organization: "企业 / 团队称呼",
  industry: "所在行业",
  size: "团队规模",
  filledBy: "填写方式",
  contact: "方便后续沟通的联系方式（可选）",
  problem: "目前最想解决的问题",
  current: "现在是怎么处理的",
  idea: "已经有的想法",
  help: "希望我们提供什么帮助",
  outcome: "希望看到什么结果",
  types: "需求方向",
  workflow: "请描述一次完整的业务流程",
  people: "谁会使用，分别做什么",
  systems: "目前使用的软件或系统",
  data: "需要使用哪些数据，来自哪里",
  priority: "第一阶段最重要的事",
  timing: "期望时间及原因",
  budget: "预算状态",
  budgetDetail: "预算范围或考虑",
  decision: "谁参与决策，下一步怎样确定",
  maintenance: "上线后由谁维护",
  acceptance: "怎样判断第一阶段做得合适",
  websiteAudience: "网站主要给谁看，希望他们做什么",
  websiteContent: "已有内容、域名或网站情况",
  processBottleneck: "哪一步最费时间、最容易出错",
  dataPermission: "数据权限、质量和敏感性情况",
  aiTask: "希望AI帮助完成什么，哪些必须人工确认",
  aiBoundary: "错误时可以怎样处理，有什么不能交给AI",
  additional: "其他补充",
};
export const industries = [
  "制造与加工",
  "纺织与服装",
  "批发与零售",
  "电子商务",
  "餐饮与食品",
  "酒店与住宿",
  "旅游与文旅",
  "教育与培训",
  "医疗与健康",
  "美容与个人护理",
  "农业、林业与养殖",
  "建筑与装修",
  "房地产与物业",
  "物流与运输",
  "软件与信息技术",
  "广告与传媒",
  "专业服务（法律、咨询、会计等）",
  "金融与保险",
  "文化、体育与娱乐",
  "公益与社会服务",
];
export const fields = Object.keys(labels);
const text = (name: string, extra: Record<string, unknown> = {}) => ({
  type: "comment",
  name,
  title: labels[name],
  maxLength: 2000,
  rows: 3,
  ...extra,
});
const questionnaireBase = {
  locale: "zh-cn",
  showQuestionNumbers: "off",
  showProgressBar: "off",
  progressBarType: "pages",
  questionsOnPageMode: "standard",
  pageNextText: "下一步",
  pagePrevText: "上一步",
  clearInvisibleValues: "none",
  showCompleteButton: false,
  completedHtml: "",
  focusFirstQuestionAutomatic: false,
  autoFocusFirstError: false,
  pages: [
    {
      name: "basics",
      title: "先了解你们",
      description: "不需要专业术语。不确定的地方可以直接写“不确定”。",
      elements: [
        { type: "text", name: "mode", visible: false },
        {
          type: "text",
          name: "organization",
          title: labels.organization,
          isRequired: true,
          maxLength: 120,
        },
        {
          type: "dropdown",
          name: "industry",
          title: labels.industry,
          isRequired: true,
          description:
            "选择最接近主营业务的一项；找不到时可以选“其他行业”或“不确定”。",
          placeholder: "选择所在行业",
          choices: [...industries, "其他行业", "不确定"],
          searchEnabled: true,
        },
        {
          type: "radiogroup",
          name: "size",
          title: labels.size,
          choices: [
            "个人 / 1人",
            "2–10人",
            "11–50人",
            "51–200人",
            "200人以上",
            "不确定",
          ],
        },
        {
          type: "radiogroup",
          name: "filledBy",
          title: labels.filledBy,
          choices: ["客户本人填写", "代客户整理（自述，未认证）"],
          defaultValue: "客户本人填写",
        },
        {
          type: "text",
          name: "contact",
          title: labels.contact,
          maxLength: 200,
          description:
            "可留常用邮箱或电话，也可以跳过。请不要填写密码、密钥或客户个人资料。",
        },
      ],
    },
    {
      name: "situation",
      title: "从眼前的问题开始",
      elements: [
        text("problem", {
          isRequired: true,
          description:
            "例如：客户资料散在聊天里，常常漏跟进。请简要描述；还没想清楚可以写“不确定，想先聊聊”。",
        }),
        text("current"),
        text("idea"),
        {
          type: "checkbox",
          name: "help",
          title: labels.help,
          choices: [
            "一起梳理需求",
            "评估想法是否可行",
            "设计网站或系统",
            "改进现有流程",
            "数据整理与分析",
            "AI辅助工作",
            "不确定，想先聊聊",
          ],
        },
        text("outcome"),
      ],
    },
    {
      name: "direction",
      title: "选择要深入了解的方向",
      visibleIf: "{mode} = 'detailed'",
      elements: [
        {
          type: "checkbox",
          name: "types",
          title: labels.types,
          choices: [
            "网站与客户触达",
            "流程与业务工具",
            "数据与报表",
            "AI辅助",
            "还不确定",
          ],
        },
        text("workflow"),
        text("people"),
        text("systems"),
        text("data"),
      ],
    },
    {
      name: "branches",
      title: "围绕你的方向多问几句",
      visibleIf:
        "{mode} = 'detailed' and ({types} contains '网站与客户触达' or {types} contains '流程与业务工具' or {types} contains '数据与报表' or {types} contains 'AI辅助')",
      elements: [
        text("websiteAudience", {
          visibleIf: "{types} contains '网站与客户触达'",
        }),
        text("websiteContent", {
          visibleIf: "{types} contains '网站与客户触达'",
        }),
        text("processBottleneck", {
          visibleIf: "{types} contains '流程与业务工具'",
        }),
        text("dataPermission", {
          visibleIf:
            "{types} contains '数据与报表' or {types} contains 'AI辅助'",
          description: "仅描述类别和授权情况，请勿粘贴真实敏感数据。",
        }),
        text("aiTask", { visibleIf: "{types} contains 'AI辅助'" }),
        text("aiBoundary", { visibleIf: "{types} contains 'AI辅助'" }),
      ],
    },
    {
      name: "next",
      title: "一起确定下一步",
      visibleIf: "{mode} = 'detailed'",
      elements: [
        text("priority"),
        text("timing"),
        {
          type: "radiogroup",
          name: "budget",
          title: labels.budget,
          choices: ["已有大致范围", "需要先评估", "尚未确定", "暂不方便说明"],
        },
        text("budgetDetail", { visibleIf: "{budget} = '已有大致范围'" }),
        text("decision"),
        text("maintenance"),
        text("acceptance"),
      ],
    },
    {
      name: "finish",
      title: "最后，留一点补充空间",
      elements: [
        text("additional"),
        {
          type: "html",
          name: "reminder",
          html: "<p>提交后仍可补充。你的回答是访谈素材，不等于最终需求、报价或交付承诺。请确认未包含密码、密钥、合同或真实单据。</p>",
        },
      ],
    },
  ],
};
export type QuestionDefinition = Record<string, unknown> & {
  name: string;
  when?: RoutingQuestion["when"];
};
const originals: QuestionDefinition[] = [];
for (const page of questionnaireBase.pages) {
  for (const element of page.elements) {
    if (element.name === "mode" || element.type === "html") continue;
    const question: QuestionDefinition = { ...element };
    delete question.visibleIf;
    if (choiceOverrides[question.name]) {
      question.type = "dropdown";
      question.choices = choices(choiceOverrides[question.name]);
      question.description =
        "选最接近的一项；不确定可跳过，其他情况可在最后补充。";
      delete question.rows;
      delete question.maxLength;
    } else if (
      Array.isArray(question.choices) &&
      question.name !== "industry"
    ) {
      question.choices = choices(question.choices as string[]);
    }
    const branches: Record<string, string[]> = {
      workflow: ["流程与业务工具"],
      websiteAudience: ["网站与客户触达"],
      websiteContent: ["网站与客户触达"],
      processBottleneck: ["流程与业务工具"],
      data: ["数据与报表", "AI辅助"],
      dataPermission: ["数据与报表", "AI辅助"],
      aiTask: ["AI辅助"],
      aiBoundary: ["AI辅助"],
    };
    if ("visibleIf" in page) question.when = (a) => a.mode === "detailed";
    if (branches[question.name])
      question.when = (a) =>
        a.mode === "detailed" &&
        branches[question.name].some((value) => a.types?.includes(value));
    if (question.name === "budgetDetail")
      question.when = (a) =>
        a.mode === "detailed" && a.budget === "已有大致范围";
    originals.push(question);
  }
}
const addedQuestions = [
  ...contextQuestions,
  ...industryQuestions(industries),
  ...directionQuestions,
];
for (const q of addedQuestions) {
  labels[q.name] = q.title;
  fields.push(q.name);
}
const byName = (name: string) => originals.find((q) => q.name === name)!;
export const questionBank: QuestionDefinition[] = [
  ...originals.slice(0, 10),
  ...contextQuestions.slice(0, 2),
  byName("types"),
  ...contextQuestions.slice(2),
  ...industryQuestions(industries),
  ...originals.filter((q) =>
    [
      "workflow",
      "websiteAudience",
      "websiteContent",
      "processBottleneck",
      "data",
      "dataPermission",
      "aiTask",
      "aiBoundary",
    ].includes(q.name),
  ),
  ...directionQuestions,
  ...originals.filter((q) =>
    [
      "people",
      "systems",
      "priority",
      "timing",
      "budget",
      "budgetDetail",
      "decision",
      "maintenance",
      "acceptance",
      "additional",
    ].includes(q.name),
  ),
];
function groupQuestions(questions: QuestionDefinition[]) {
  const pages: { name: string; elements: Record<string, unknown>[] }[] = [];
  for (let i = 0; i < questions.length; i += 5)
    pages.push({
      name: `step${pages.length + 1}`,
      elements: questions.slice(i, i + 5).map(({ when: _, ...q }) => q),
    });
  return { ...questionnaireBase, pages };
}
export const requiredFields = ["organization", "industry", "problem"] as const;
export function createQuestionnaire(answers: Answers) {
  return groupQuestions(questionBank.filter((q) => !q.when || q.when(answers)));
}
// Full catalog for test navigation and editorial review; the UI uses the routed schema.
export const questionnaire = groupQuestions(questionBank);
export type Answers = Record<string, string | string[]>;
export const stages = [
  "待了解",
  "待访谈",
  "方案准备",
  "待客户反馈",
  "暂缓",
  "已结束",
];
