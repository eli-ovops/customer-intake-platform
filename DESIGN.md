---
name: Eli FDE 客户协作工作台
description: 简洁专业的本机客户协作界面
colors:
  primary: "#1b6558"
  primary-hover: "#174e44"
  ink: "#202a33"
  muted: "#596671"
  line: "#dce1e5"
  surface: "#ffffff"
  ground: "#f3f5f6"
  rail: "#202e36"
  rail-text: "#c6d1d6"
  rail-hover: "#2d4049"
  rail-active: "#37524f"
  rail-focus: "#b7e0d0"
  control-line: "#cbd3d8"
  control-hover: "#edf1f2"
  control-active: "#e2e8eb"
  placeholder: "#63717b"
  tag-bg: "#edf3f0"
  tag-text: "#345e4c"
  selection-bg: "#c8e3da"
  selection-text: "#17382f"
  error: "#973f2e"
  error-bg: "#fff2ef"
  error-line: "#f0cec5"
  customer-ground: "#ffffff"
  customer-surface: "#ffffff"
  customer-ink: "#202124"
  customer-muted: "#626670"
  customer-line: "#dfe2e7"
  customer-accent: "#635de5"
  customer-action: "#4e4bff"
  customer-action-hover: "#5b58ff"
  customer-focus: "#5b58ff"
  customer-input: "#f8f9fb"
  customer-input-line: "#818792"
  customer-secondary: "#f3f4f7"
  customer-secondary-hover: "#e7eaf0"
  customer-selected: "#f1efff"
  customer-error: "#a33c32"
  customer-error-text: "#903429"
  customer-error-bg: "#fff2ef"
  customer-error-line: "#ddb6b0"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontSize: "19px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.015em"
  subheading:
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    lineHeight: 1.6
  lead:
    fontSize: "14px"
    lineHeight: 1.7
  label:
    fontSize: "13px"
    fontWeight: 550
  button:
    fontSize: "13px"
    fontWeight: 550
  input:
    fontSize: "14px"
  caption:
    fontSize: "12px"
  fine:
    fontSize: "11px"
  customer-headline:
    fontSize: "48px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  customer-headline-mobile:
    fontSize: "34px"
    lineHeight: 1.3
  customer-input:
    fontSize: "16px"
rounded:
  tag: "4px"
  field: "5px"
  control: "6px"
  toolbar: "7px"
  panel: "8px"
  customer-panel: "16px"
  customer-panel-mobile: "12px"
  customer-field: "8px"
  customer-pill: "999px"
spacing:
  control-gap: "8px"
  compact: "12px"
  mobile-gutter: "16px"
  section: "24px"
  panel-inset: "28px"
  desktop-gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 15px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 15px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.field}"
    padding: "9px 11px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "28px"
  tag:
    backgroundColor: "{colors.tag-bg}"
    textColor: "{colors.tag-text}"
    rounded: "{rounded.tag}"
    padding: "3px 8px"
  customer-button-primary:
    backgroundColor: "{colors.customer-action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.customer-pill}"
    padding: "10px 22px"
  customer-field:
    backgroundColor: "{colors.customer-input}"
    textColor: "{colors.customer-ink}"
    typography: "{typography.customer-input}"
    rounded: "{rounded.customer-field}"
  customer-panel:
    backgroundColor: "{colors.customer-surface}"
    textColor: "{colors.customer-ink}"
    rounded: "{rounded.customer-panel}"
---

# Design System: Eli FDE 客户协作工作台

## Overview

适用分区：原浅色「Operate」规范继续用于内部工作台与工作人员代填。2026-10-13 客户入口按用户明确指定的个人官网字体、布局和 Eli 星芒品牌追加独立主题；用户随后明确覆盖原站深色配色，最终要求白底保留、logo 和按钮可用紫色。下述 customer-* tokens 仅用于 public-frame。参考：[用户个人官网](http://[REDACTED_HOST]/sites/portfolio/?pv=374bf42e288f80f56bf7)。主 Owner 于 2026-10-13 实际浏览提取；本文件记录当前源码与同日最终 1440px、1317px、390px 客户截图，不声称原黑色官网像素复刻或线上交付。

**Creative North Star: "Operate"**

用户已确认「简洁专业」：浅灰底、白色工作区、深色侧栏。界面采用专业文档的层级与留白，信息紧凑，主要操作和保存状态直接呈现。颜色用于导航、任务重点和状态，动效用于切换与反馈。

**Key Characteristics:**
- 浅灰背景、白色工作区、深色导航。
- 列表与分隔线组织记录，正文保持明确层级。
- 四页签拆分交付任务，保存状态集中呈现。
- 克制的状态动效与可见键盘焦点。

## Colors

### Customer portfolio theme

客户入口使用白色页面与面板、深灰正文和冷灰辅助文字。紫色用于星芒、当前模式、进度和输入焦点，饱和紫用于主要 CTA，浅紫底用于选中与成功反馈；客户错误标记使用深红、错误背景使用浅红。字段采用浅灰表面和可辨边框。颜色由 customer-* tokens 定义，不覆盖内部工作台 tokens。

### Primary

深绿用于主要操作、当前页签、输入焦点和文本光标；悬停使用更深的绿色。浅绿标签只表达记录状态。

错误提示与问卷必填星号沿用既有深红语义色；错误通知使用浅红背景与边框，不把错误状态改成主要操作色。

### Neutral

墨色用于正文，灰色用于辅助信息，浅灰用于页面背景，白色用于工作区。冷灰线条区分相邻信息。深蓝灰侧栏配浅色文字；悬停与选中采用不同背景。文本选区采用浅绿底与深色文字。

## Typography

客户入口沿用 -apple-system、BlinkMacSystemFont、Helvetica Neue、PingFang SC、Microsoft YaHei、sans-serif 字体栈，不复制参考站字体文件或安装新字体。中文一级标题使用 customer-headline；900px 以下（40px），760px 以下使用 customer-headline-mobile。客户输入（16px）避免手机输入时字号过小；题目（16px）、选项（14px）、辅助信息（12px）。标题靠字重与尺度表达，不添加渐变文字。

界面沿用系统字体栈，以中文阅读和本机渲染为主；没有独立的装饰性展示字体。标题、说明、标签、控件分别使用 frontmatter 中的实际字号与字重。

一级标题移动端缩至（26px）。记录标题桌面（16px）、移动端（15px）；页签桌面（14px）、移动端（12px）。辅助信息主要为（12px），页脚和移动导航次要文字为（11px）。说明文字最大行长（68ch），说明页正文最大（70ch）。计数和记录元信息使用等宽数字。

客户问卷问题标题（15px）、选项正文（13px）、输入内容（14px）；题目说明、模式说明和步骤进度（12px），隐私说明与保存说明（11px）。这些小字号仅用于辅助信息，不用于题目或答案。

## Layout

客户入口最大宽度（1240px）、横向内边距（40px）；问卷上方留白（62px），页头以细线结束。桌面填写说明列（248px）、列间距（54px）；900px 以下改为（196px）与（30px）。760px 以下隐藏侧边说明，页面横向内边距（20px）、问卷上方留白（30px）。选项保持桌面双列、手机单列；题目行分隔上下各（22px）。客户顶栏只含品牌、需求问卷与使用说明，没有后台导航。

桌面布局为（216px）侧栏与可伸缩工作区；视口不超过（1100px）时侧栏缩至（184px）。内容最大宽度（1240px），桌面内边距（38px 40px 60px），中间断点改为（30px 26px 48px）。顶栏高度（65px）。

不超过（760px）时侧栏成为顶部导航，只保留需求列表与新建入口；顶栏高度（50px），内容内边距（28px 16px 40px）。客户需求页头将标题说明与新建按钮并排，其他页头仍纵向排列。筛选框换行，记录状态列纵向排列，交付双列表单成为单列。

列表工作区使用连续行与细分隔线。CSV 导出位于需求列表标题旁，筛选区只放搜索、跟进阶段和刷新；移动端列表标题、记录数与导出保持紧凑同行分组。交付区域采用四等分页签和单个当前工作区；常规容器内边距（28px），交付容器桌面（30px）、移动端（21px 16px）。

客户问卷沿用同一世界：桌面为（208px）填写说明与可伸缩表单，列间距（36px）；表单中单选、多选采用两列，间距（8px）。不超过（760px）时隐藏侧边说明，选项改为单列。问题之间用细线与垂直间隔组织，桌面与移动端的题目行 margin-bottom 和 padding-bottom 均为（16px）。模式说明位于问卷顶端；底部将保存草稿、提交需求与步骤翻页分开。隐私提示保持简短，联系方式选填状态只在对应题目说明。

## Elevation & Depth

客户主题依靠浅灰字段与细边框表达层级，表单无投影。字段焦点使用紫色边框与（0 0 0 1px）轮廓。SurveyJS 下拉 portal 同步使用白色主题变量与深灰文字，不因 portal 脱离表单 DOM 而残留原暗色。body 与原生控件 color-scheme 均为 light。

主体依靠表面颜色和细边界区分层级。顶部保存条桌面使用（0 4px 16px #202e3610）轻阴影，sticky 距顶部（12px）；移动端采用普通文档流并取消阴影。交付页签内的资料操作条采用 static 且无阴影，避免与顶部保存条竞争。表单容器取消旧阴影。

## Shapes

客户面板桌面圆角（16px）、手机（12px）；输入与选项（8px），按钮及模式选择采用胶囊轮廓（999px）。品牌使用源码内联 SVG 的紫色八向星芒，不用字符代替图形。

轻圆角用于控件和工作区，具体值由 frontmatter 定义。列表行与交付子项保持平直分隔，不用独立卡片包裹每条内容。页签采用平直底线，指示线高度（2px）。

## Components

### Customer portfolio controls

客户按钮最小高度（44px），padding（10px 22px）；主要 CTA 饱和紫底白字，hover 使用 customer-action-hover。次要按钮浅灰底深灰字、可辨边框；当前模式紫底白字，模式按钮最小高度（38px）。下拉内部操作按钮（32px）保持紧凑，不套通用 CTA 尺寸。

客户输入继续采用统一（44px）单行字段、最小（100px）长文本、最小（46px）选项区域。默认输入浅灰、placeholder 冷灰；选中选项使用浅紫表面与紫色边框。公共键盘焦点（2px）紫色轮廓、偏移（4px），文本选区紫底白字。成功回执采用浅紫表面，错误采用浅红表面与深红文字；真实保存与失败处理规则沿用既有组件逻辑。

动效沿用已有状态反馈与进度 scaleX，不增加装饰性入场。客户 prefers-reduced-motion 对所有子元素关闭 transition 与 animation。内部交付页签指示线不因客户主题改变。

### Buttons

主要按钮深绿底白字；次要按钮白底墨色字，细灰边框。通用按钮最小高度（40px），保存条按钮最小高度（34px）。悬停和按下使用背景变化；禁用状态透明度（0.5）并使用 not-allowed 光标。通用背景/边框反馈为（160ms）。

### Inputs / Fields

字段最小高度（42px），白底细边框；placeholder 使用专门的灰色。悬停边框加深，焦点边框采用深绿。全局键盘焦点为（2px）轮廓，外偏移（3px）。深色侧栏单独使用浅绿焦点环。

### Navigation

侧栏导航使用一致线宽的 SVG 图标；悬停与选中采用背景色变化，反馈为（180ms）。客户需求列表、已有需求详情、编辑与交付页均保留「客户需求」选中状态和 aria-current="page"；新建需求页单独选中「新建需求」。移动端保留两个主要入口。顶部快捷导航仍可返回问卷。

### Chips / Containers

状态标签浅绿底深绿字，属于辅助信息。白色工作区用细边框界定。交付子项只有顶部细分隔线，避免多层卡片。

### Delivery tabs and save toolbar

页签按需求与范围、报价草案、变更与验收、资料与备份拆分任务。活动指示线以（220ms）位移切换，缓动为（cubic-bezier(0.16, 1, 0.3, 1)）；面板与提示反馈为（180ms）透明度（0.65 → 1）。方向键、Home 和 End 移动页签焦点。草稿保存在页签外的状态中，切换页签不重置输入。reduced-motion 关闭动画及过渡。

### Customer questionnaire

简单与详细模式使用同一套颜色、字号、字段与选项样式。模式按钮采用 pressed 状态，说明文字分别表达初次沟通和按条件补充问题；切换保留已填写答案。

选项区域最小高度（46px），圆角（5px），默认白底细灰边框；选中采用浅绿底与深绿边框，键盘焦点为（2px）深绿轮廓、偏移（2px）。选项状态反馈（150ms）。SurveyJS v3 的实际 sd-formbox 容器统一单行输入和下拉的最小高度（44px），内层输入最小高度（42px），长文本 textarea 最小高度（100px）；焦点边框深绿并叠加（0 0 0 1px）深绿轮廓。下拉内层取消额外 padding，避免叠加后高度不一致。

自定义进度显示实际当前步与动态可见总步数，每步最多五题；进度线高（3px），以 scaleX 做（180ms）状态切换，reduced-motion 关闭过渡。模式状态与进度的动效只提供反馈。SurveyJS 页面切换动画关闭；翻页同步滚动到进度区域，其 scroll-margin-top 为（16px），并用 focus({ preventScroll: true }) 定位焦点。进度 tabIndex=-1，不加入常规 Tab 序列，下一次 Tab 进入当前页第一题；错误定位仍使用同步滚动，避免延迟滚动干扰下拉选择。下一步为主要按钮，上一步为次要按钮；保存草稿和提交需求在独立底部操作区。

### Questionnaire submission feedback

保存或提交须在服务端成功响应后才显示回执，回执读取返回记录的保存时间与提交版本；草稿与提交使用不同标题和说明。首次草稿引导「提交需求」，已有提交记录再保存草稿时引导「提交补充版本」，不新增提交版本。继续填写或继续补充按钮沿用次要按钮样式，回到问卷进度区域；编辑清除旧成功回执。

回执采用既有浅绿表面、墨色正文、深绿标题，桌面 padding（24px 28px）、移动端（21px 16px）。标题（19px）、正文和数据（13px）、数据标签（12px）；时间和版本使用等宽数字。保存时间与版本桌面两列、移动端单列。继续按钮距上方（14px），保持既有边框、圆角与焦点规范；不添加庆祝动画。回执使用 role="status" 和 tabIndex=-1，成功后滚动并获取焦点，焦点深绿内描边（2px）。

请求处理中填写区 inert 并标记 aria-busy，模式切换、新建、保存与提交按钮禁用。校验或请求失败在操作区显示单一操作错误 alert，保留填写内容，不显示成功回执；校验失败提供「检查必填项」按钮定位问题。错误反馈容器使用 tabIndex=-1，获得（2px）既有深红焦点轮廓、外偏移（4px）。

## Do's and Don'ts

### Do:
- **Do** 使用明确任务名、当前保存状态与专业文档层级。
- **Do** 让主操作、筛选和记录保持可定位。
- **Do** 保留页签切换中的输入，并尊重 reduced-motion。

### Don't:
- **Don't** 引入装饰性动画、渐变或卡片堆叠。
- **Don't** 使用展示性数字替代真实任务信息。
- **Don't** 把内部资料与对客资料的状态混写。
