import { questionnaire, labels, industries } from "../src/questions";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
async function login(page: Page) {
  const file = "tests/runtime/browser-credential.json";
  const credential = JSON.parse(readFileSync(file, "utf8"));
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "账号", exact: true }).fill("owner");
  await page
    .getByRole("textbox", { name: "密码", exact: true })
    .fill(credential.password);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(
    page.getByRole("heading", { name: /先设置自己的密码|客户需求/ }),
  ).toBeVisible();
  if (await page.getByRole("heading", { name: "先设置自己的密码" }).count()) {
    const next = credential.password + "-changed";
    await page
      .getByRole("textbox", { name: "当前密码", exact: true })
      .fill(credential.password);
    await page.getByRole("textbox", { name: "新密码", exact: true }).fill(next);
    await page
      .getByRole("textbox", { name: "再次输入新密码", exact: true })
      .fill(next);
    await page.getByRole("button", { name: "保存新密码" }).click();
    await expect(page.getByRole("heading", { name: "客户需求" })).toBeVisible();
    writeFileSync(file, JSON.stringify({ ...credential, password: next }), {
      mode: 0o600,
    });
  }
  await expect(page.getByRole("heading", { name: "客户需求" })).toBeVisible();
}
async function next(page: Page) {
  await page.getByRole("button", { name: "下一步", exact: true }).click();
}
async function question(
  page: Page,
  name: string,
  role: "textbox" | "combobox" | "checkbox" | "radio" = "textbox",
) {
  const definitions: {
    name: string;
    choices?: (string | { value: string })[];
  }[] = [];
  for (const p of questionnaire.pages)
    for (const q of p.elements)
      definitions.push(
        q as { name: string; choices?: (string | { value: string })[] },
      );
  const key =
    Object.entries(labels).find(([_, label]) => label === name)?.[0] ??
    definitions.find((q) =>
      q.choices?.some((c) => (typeof c === "string" ? c : c.value) === name),
    )?.name;
  const targetIndex = definitions.findIndex((q) => q.name === key);
  const target = key
    ? page.locator(`.sd-question[data-name="${key}"]`)
    : page.getByRole(role, { name, exact: false });
  for (let i = 0; i < 45; i++) {
    if (await target.isVisible()) return target;
    const visible = page.locator(".sd-question[data-name]:visible").first();
    const current = await visible.getAttribute("data-name");
    const index = definitions.findIndex((q) => q.name === current);
    const button = page.getByRole("button", {
      name: index > targetIndex ? "上一步" : "下一步",
      exact: true,
    });
    if (!(await button.isVisible())) throw new Error("未找到问卷题目：" + name);
    await button.click();
    await expect(visible).not.toHaveAttribute("data-name", current!);
  }
  throw new Error("问卷题目导航超出上限：" + name);
}
async function select(page: Page, key: string, value: string) {
  await question(page, labels[key], "combobox");
  await page
    .locator(`.sd-question[data-name="${key}"]`)
    .getByRole("button", { name: "选择", exact: true })
    .click();
  const option = page.getByRole("option").filter({ hasText: value });
  await option.click();
  await expect(option).toBeHidden();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
test("desktop: modes/branches/refresh/submit/supplement/admin/follow-up/export/XSS/logout", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [],
    network: any[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/api/"))
      network.push({
        method: r.request().method(),
        path: new URL(r.url()).pathname,
        status: r.status(),
      });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "把 AI 变成企业的生产力。" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "企业 / 团队称呼", exact: false })
    .fill("虚构 · 栖织工作室");
  await expect(page.locator(".sd-question[data-name]:visible")).toHaveCount(5);
  await question(page, "所在行业", "combobox");
  await page
    .locator('.sd-question[data-name="industry"]')
    .getByRole("button", { name: "选择", exact: true })
    .click();
  for (const choice of [...industries, "其他行业", "不确定"])
    await expect(
      page.getByRole("option", { name: choice, exact: true }),
    ).toBeAttached();
  await page.screenshot({
    path: "evidence/industry-options.png",
    fullPage: true,
  });
  await page.getByRole("option", { name: "制造与加工", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "制造与加工", exact: true }),
  ).toBeHidden();
  await page.screenshot({
    path: "evidence/desktop-questionnaire.png",
    fullPage: true,
  });
  await noOverflow(page);
  await question(page, "目前最想解决的问题");
  await page
    .getByRole("textbox", { name: "目前最想解决的问题", exact: false })
    .fill("虚构：客户资料散落，漏掉跟进");
  await question(page, "现在是怎么处理的");
  await select(page, "current", "主要靠人工、纸笔或聊天");
  await page.getByRole("button", { name: "详细模式", exact: true }).click();
  await question(page, "目前最想解决的问题");
  await expect(
    page.getByRole("textbox", { name: "目前最想解决的问题", exact: false }),
  ).toHaveValue("虚构：客户资料散落，漏掉跟进");
  await question(page, "网站与客户触达", "checkbox");
  await page.getByText("网站与客户触达", { exact: false }).click();
  await expect(
    page.getByRole("checkbox", { name: "网站与客户触达", exact: false }),
  ).toBeChecked();
  await page.getByText("流程与业务工具", { exact: false }).click();
  await expect(
    page.getByRole("checkbox", { name: "流程与业务工具", exact: false }),
  ).toBeChecked();
  await page.getByText("数据与报表", { exact: false }).click();
  await expect(
    page.getByRole("checkbox", { name: "数据与报表", exact: false }),
  ).toBeChecked();
  await page.getByText("AI辅助", { exact: false }).click();
  await expect(
    page.getByRole("checkbox", { name: "AI辅助", exact: false }),
  ).toBeChecked();
  await question(page, "请描述一次完整的业务流程");
  await select(page, "workflow", "咨询 → 报价 → 成交 → 交付");
  await question(page, "网站主要给谁看，希望他们做什么");
  await expect(
    page.getByRole("combobox", {
      name: "网站主要给谁看，希望他们做什么",
      exact: true,
    }),
  ).toBeVisible();
  await question(page, "哪一步最费时间、最容易出错");
  await expect(
    page.getByRole("combobox", {
      name: "哪一步最费时间、最容易出错",
      exact: true,
    }),
  ).toBeVisible();
  await question(page, "数据权限、质量和敏感性情况");
  await expect(
    page.getByRole("combobox", {
      name: "数据权限、质量和敏感性情况",
      exact: false,
    }),
  ).toBeVisible();
  await question(page, "希望AI帮助完成什么，哪些必须人工确认");
  await select(page, "aiTask", "整理、分类或总结资料");
  await page.getByRole("button", { name: "简单模式", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "企业 / 团队称呼", exact: false }),
  ).toHaveValue("虚构 · 栖织工作室");
  await page.getByRole("button", { name: "详细模式", exact: true }).click();
  await question(page, "希望AI帮助完成什么，哪些必须人工确认");
  await expect(page.locator('.sd-question[data-name="aiTask"]')).toContainText(
    "整理、分类或总结资料",
  );
  await page.screenshot({
    path: "evidence/desktop-branches.png",
    fullPage: true,
  });
  await question(page, "已有大致范围", "radio");
  await page.getByText("已有大致范围", { exact: false }).click();
  await expect(
    page.getByRole("radio", { name: "已有大致范围", exact: false }),
  ).toBeChecked();
  await question(page, "预算范围或考虑");
  await expect(
    page.getByRole("textbox", { name: "预算范围或考虑", exact: true }),
  ).toBeVisible();
  await question(page, "其他补充");
  await page
    .getByRole("textbox", { name: "其他补充", exact: true })
    .fill("<script>window.__intake_xss=1</script>");
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已提交");
  const repeatedSubmission = page.waitForResponse(
    (r) => r.url().endsWith("/submit") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "提交补充版本", exact: true }).click();
  await repeatedSubmission;
  await expect(
    page.getByRole("button", { name: "提交补充版本", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("已提交 1 个版本 · 可以继续补充")).toBeVisible();
  await question(page, "其他补充");
  await page
    .getByRole("textbox", { name: "其他补充", exact: true })
    .fill("第二次虚构补充");
  await page.getByRole("button", { name: "提交补充版本", exact: true }).click();
  await expect(page.getByText("已提交 2 个版本 · 可以继续补充")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__intake_xss),
  ).toBeUndefined();
  await login(page);
  await page
    .getByRole("textbox", { name: "搜索需求", exact: true })
    .fill("栖织");
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "虚构 · 栖织工作室" }) })
    .click();
  await expect(
    page.getByRole("heading", { name: "虚构 · 栖织工作室", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "跟进阶段", exact: true })
    .selectOption("待访谈");
  await expect(page.getByRole("status")).toContainText("已保存");
  await page
    .getByRole("textbox", { name: "访谈记录或下一步" })
    .fill('<img src=x onerror="window.__intake_xss=2"> 虚构：下次核对流程');
  await page.getByRole("button", { name: "添加备注" }).click();
  await expect(page.locator(".notes")).toContainText("虚构：下次核对流程");
  expect(
    await page.evaluate(() => (window as any).__intake_xss),
  ).toBeUndefined();
  await page
    .getByRole("combobox", { name: "查看版本", exact: true })
    .selectOption("0");
  await expect(page.locator(".answers").first()).toContainText(
    "<script>window.__intake_xss=1</script>",
  );
  await page.screenshot({
    path: "evidence/desktop-record.png",
    fullPage: true,
  });
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出摘要", exact: true }).click();
  const dl = await downloadEvent;
  await dl.saveAs("evidence/virtual-export.md");
  expect(readFileSync("evidence/virtual-export.md", "utf8")).toContain(
    "提交原文版本",
  );
  await page.getByRole("link", { name: "← 全部需求" }).click();
  await page.screenshot({
    path: "evidence/desktop-dashboard.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "登录工作台" })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "登录工作台" })).toBeVisible();
  expect(errors).toEqual([]);
  writeFileSync(
    "evidence/browser-network.json",
    JSON.stringify({ pageErrors: errors, requests: network }, null, 2),
  );
});
test("mobile size: simple submit; failure does not claim success; 404 and keyboard usability", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "企业 / 团队称呼", exact: false })
    .fill("虚构 · 手机尺寸团队");
  await page
    .locator('.sd-question[data-name="industry"]')
    .getByRole("button", { name: "选择", exact: true })
    .click();
  await page
    .getByRole("option", { name: "不确定", exact: true })
    .scrollIntoViewIfNeeded();
  await page.getByRole("option", { name: "不确定", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "不确定", exact: true }),
  ).toBeHidden();
  await noOverflow(page);
  await page.screenshot({
    path: "evidence/mobile-questionnaire.png",
    fullPage: true,
  });
  await question(page, "目前最想解决的问题");
  await page
    .getByRole("textbox", { name: "目前最想解决的问题", exact: false })
    .fill("虚构：容易漏掉下一步");
  await question(page, "希望看到什么结果");
  await page
    .getByRole("textbox", { name: "希望看到什么结果", exact: true })
    .fill("虚构：每条需求有下一步");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await question(page, "希望看到什么结果");
  await page
    .getByRole("textbox", { name: "希望看到什么结果", exact: true })
    .fill("虚构：更新结果");
  await page.route("**/api/intakes/*", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "虚构测试保存失败" }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("虚构测试保存失败");
  await expect(page.getByRole("status")).toHaveCount(0);
  await question(page, "希望看到什么结果");
  await expect(
    page.getByRole("textbox", { name: "希望看到什么结果", exact: true }),
  ).toHaveValue("虚构：更新结果");
  await page.screenshot({
    path: "evidence/mobile-save-failure.png",
    fullPage: true,
  });
  await page.unroute("**/api/intakes/*");
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已提交");
  await noOverflow(page);
  await page.reload();
  await question(page, "希望看到什么结果");
  await expect(
    page.getByRole("textbox", { name: "希望看到什么结果", exact: true }),
  ).toHaveValue("虚构：更新结果");
  await page.goto("/unknown");
  await expect(
    page.getByRole("heading", { name: "没有找到这个页面" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
});
test("mobile admin and authenticated staff filling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await noOverflow(page);
  await page.screenshot({
    path: "evidence/mobile-dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "新建需求", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "为客户整理需求", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "企业 / 团队称呼", exact: false })
    .fill("虚构 · 工作人员代填");
  // Scroll the field into view before opening its popup, matching a customer's
  // visible-field tap and avoiding a late click-scroll that dismisses the menu.
  await page
    .locator('.sd-question[data-name="industry"]')
    .scrollIntoViewIfNeeded();
  await page
    .locator('.sd-question[data-name="industry"]')
    .getByRole("button", { name: "选择", exact: true })
    .click();
  await page
    .getByRole("option", { name: "不确定", exact: true })
    .scrollIntoViewIfNeeded();
  await page.getByRole("option", { name: "不确定", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "不确定", exact: true }),
  ).toBeHidden();
  await question(page, "目前最想解决的问题");
  await page
    .getByRole("textbox", { name: "目前最想解决的问题", exact: false })
    .fill("虚构代填：减少重复整理");
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已提交");
  await page.getByRole("link", { name: "返回工作台", exact: true }).click();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "虚构 · 工作人员代填" }) })
    .click();
  await expect(
    page.getByText("工作人员：owner", { exact: false }).first(),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: "evidence/mobile-record.png", fullPage: true });
});

test("saved free-text industry survives the new picker", async ({ page }) => {
  const created = await page.request.post("/api/intakes", {
    data: {
      createKey: crypto.randomUUID().replaceAll("-", "") + "oldindustry",
    },
  });
  const { record, capability } = await created.json();
  const saved = await page.request.put("/api/intakes/" + record.id, {
    headers: { Authorization: "Bearer " + capability },
    data: {
      answers: {
        organization: "虚构旧记录",
        industry: "虚构特殊行业",
        problem: "旧答案保留",
      },
      mode: "simple",
      revision: 0,
    },
  });
  expect(saved.ok()).toBeTruthy();
  await page.goto("/");
  await page.evaluate(
    (r) => localStorage.setItem("fde-local-resume-v1", JSON.stringify(r)),
    { id: record.id, capability },
  );
  await page.reload();
  await question(page, "所在行业", "combobox");
  await page
    .locator('.sd-question[data-name="industry"]')
    .getByRole("button", { name: "选择", exact: true })
    .click();
  await expect(
    page.getByRole("option", {
      name: "虚构特殊行业（原已填行业）",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  const loaded = await page.request.get("/api/intakes/" + record.id, {
    headers: { Authorization: "Bearer " + capability },
  });
  expect((await loaded.json()).answers.industry).toBe("虚构特殊行业");
});

test("five-question steps enforce required fields and allow empty optional answers and drafts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".sd-question[data-name]:visible")).toHaveCount(5);
  const organization = page.getByRole("textbox", {
    name: "企业 / 团队称呼",
    exact: false,
  });
  await expect(organization).toHaveAttribute("aria-required", "true");
  await expect(
    page.locator('.sd-question[data-name="organization"]'),
  ).toContainText("*");
  await expect(
    page.locator('.sd-question[data-name="industry"]'),
  ).toContainText("*");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(organization).toBeVisible();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  await organization.fill("虚构必填验证");
  await page
    .locator('.sd-question[data-name="industry"]')
    .getByRole("button", { name: "选择", exact: true })
    .click();
  await page
    .getByRole("option", { name: "不确定", exact: true })
    .scrollIntoViewIfNeeded();
  await page.getByRole("option", { name: "不确定", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "不确定", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  const problem = page.getByRole("textbox", {
    name: "目前最想解决的问题",
    exact: false,
  });
  await expect(problem).toBeVisible();
  await expect(page.locator(".sd-question[data-name]:visible")).toHaveCount(5);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(problem).toBeVisible();
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "目前最想解决的问题" }),
  ).toBeVisible();
  await problem.fill("虚构：先梳理业务");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "其他补充", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await expect(problem).toHaveValue("虚构：先梳理业务");
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已提交");
});

for (const profile of [
  {
    name: "small manufacturing process",
    width: 1440,
    industry: "制造与加工",
    size: "2–10人",
    customer: "企业 / 商户",
    stage: "从零开始，还没有工具",
    direction: "流程与业务工具",
    focus: "manufacturingFocus",
    answer: "物料与库存",
    scale: "smallCollaboration",
    project: "newProjectStart",
    required: "processAutomation",
    absent: "websiteActions",
  },
  {
    name: "large retail website",
    width: 390,
    industry: "批发与零售",
    size: "200人以上",
    customer: "企业内部部门",
    stage: "已有工具，需要改进",
    direction: "网站与客户触达",
    focus: "retailFocus",
    answer: "商品与库存",
    scale: "largeGovernance",
    project: "existingProjectIssue",
    required: "websiteActions",
    absent: "aiTask",
  },
])
  test("adaptive profile: " + profile.name, async ({ page }) => {
    await page.setViewportSize({ width: profile.width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "企业 / 团队称呼", exact: false })
      .fill("虚构分支测试");
    await select(page, "industry", profile.industry);
    await page
      .locator('.sd-question[data-name="size"]')
      .getByText(profile.size, { exact: false })
      .click();
    await question(page, "目前最想解决的问题");
    await page
      .getByRole("textbox", { name: "目前最想解决的问题", exact: false })
      .fill("虚构：希望改进工作");
    await page.getByRole("button", { name: "详细模式", exact: true }).click();
    await select(page, "customerType", profile.customer);
    await select(page, "projectStage", profile.stage);
    await question(page, "需求方向", "checkbox");
    await page
      .locator('.sd-question[data-name="types"]')
      .getByText(profile.direction, { exact: false })
      .click();
    await question(page, labels[profile.focus], "checkbox");
    await page
      .locator(`.sd-question[data-name="${profile.focus}"]`)
      .getByText(profile.answer, { exact: false })
      .click();
    await expect(
      page
        .locator(`.sd-question[data-name="${profile.focus}"]`)
        .getByRole("checkbox", { name: profile.answer, exact: false }),
    ).toBeChecked();
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("草稿已保存");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "详细模式", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      const visible = page.locator(".sd-question[data-name]:visible");
      const step = await visible.evaluateAll((elements) =>
        elements.map((e) => e.getAttribute("data-name")!),
      );
      expect(step.length).toBeGreaterThan(0);
      expect(step.length).toBeLessThanOrEqual(5);
      seen.push(...step);
      await noOverflow(page);
      const next = page.getByRole("button", { name: "下一步", exact: true });
      if (!(await next.isVisible())) break;
      const first = step[0];
      await next.click();
      await expect(visible.first()).not.toHaveAttribute("data-name", first);
    }
    for (const key of [
      profile.focus,
      profile.scale,
      profile.project,
      profile.required,
    ])
      expect(seen).toContain(key);
    expect(seen).not.toContain(profile.absent);
    expect(new Set(seen).size).toBe(seen.length);
    await question(page, labels[profile.focus], "checkbox");
    await expect(
      page
        .locator(`.sd-question[data-name="${profile.focus}"]`)
        .getByRole("checkbox", { name: profile.answer, exact: false }),
    ).toBeChecked();
    await page.screenshot({
      path: `evidence/adaptive-${profile.width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    // Changing industry hides the previous branch without losing its answers.
    const other =
      profile.industry === "制造与加工" ? "批发与零售" : "制造与加工";
    await select(page, "industry", other);
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("草稿已保存");
    await page.reload();
    await select(page, "industry", profile.industry);
    await question(page, labels[profile.focus], "checkbox");
    await expect(
      page
        .locator(`.sd-question[data-name="${profile.focus}"]`)
        .getByRole("checkbox", { name: profile.answer, exact: false }),
    ).toBeChecked();
    await page.getByRole("button", { name: "提交需求", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("已提交");
    expect(errors).toEqual([]);
  });
