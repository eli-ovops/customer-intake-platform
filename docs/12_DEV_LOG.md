# 实施记录

2026-10-06：在已授权目录新建工程，未初始化Git。完成公开官方3项比较并选SurveyJS Form Library＋自建跟进；npm和node:sqlite为本地简化例外，保留精确lockfile及Node22.16契约。
API首次测试发现INSERT占位数与schema不符，修正12列绑定后11项通过；错误未写入数据。创建幂等使用客户端随机256bit能力凭证的哈希去重，网络重试不产生重复草稿。
依赖扫描发现初选React Router和Vite版本漏洞，依官方audit建议更新项目内版本；生产/全依赖均0已知漏洞。
浏览器第一轮：原生隐藏checkbox被视觉wrapper拦截，改点击可见选项并断言checked；首次创建保存触发表单重建跳页，改稳定表单实例，保存保留页及内容；工作人员新建返回路径修正。保留initial日志。
浏览器第二轮：手机客户流程/工作人员流程通过；桌面补充版本失败，继续定位Survey文本事件提交时序，不把局部通过当完成。

最终定位并修正：文本使用onTyping并保存读取当前模型快照；关闭组件本地完成按钮。后台测试选中旧列表同名filter，加入详情h1到达断言后通过。真正Chrome检查3/3含首次密码修改，API11/11含横向补充/实际CSV公式。实际CLI备份恢复副本7表一致、拒绝覆盖/项目外；主服务重启到当前源码并验证空交付库。初始化本任务data/backups700、数据库和凭据600。目标完成后停止新增功能，待PMO验收，全部原始证据保留。

2026-10-06T10:42:28+08:00 用户局部修改：SurveyJS questionPerPage、下一题/上一题、行业dropdown20类＋other/unknown、旧已填行业兼容。修正测试从分组页导航改为实际单题按钮，点击下拉可见选择按钮，不点击其被wrapper覆盖的隐藏input。build与Chrome4项通过，未重跑无关后端测试。


## 用户局部修改回执 2026-10-06：每步5题和必填

用户更正为一次约5题再下一步，带星标必填并保留选填。按顺序每步最多5题，条件隐藏时可少于5题，空步骤跳过。企业 / 团队称呼、所在行业、目前最想解决的问题必填并显示 *，其他题可跳过。下一步校验当前步，提交校验全部，服务端拒绝缺少或全空白的必填项；草稿允许不完整。行业20类和旧答案兼容保留。

验证：evidence/five-question-build.log构建通过；five-question-browser.log共5项通过，包含必填拦截、不完整草稿、选填留空提交、返回保留、手机排版和旧行业；five-question-api.log共12项通过，包含三项逐个空白拒绝及最少答案提交；five-question-format-check.log通过。实际4180独立Chrome入口检查通过，见evidence/local-browser.json。服务已加载新规则，PID71041仅监听127.0.0.1:4180，沿用数据库，无schema变化或数据覆盖。此前PID43225及0客户记录均为历史检查，当前客户记录数未复核。

最新源码指纹以evidence/source-manifest.json为准，取代之前回执。整体待PMO验收，本次局部修改执行验证通过；规则ROUTING-2026-09-30-v3未变，实际model/effort/速度UNKNOWN。复用唯一Owner，无新任务/子agent/外部联系。新增证据保留在本项目evidence/，测试运行数据仅在tests/runtime/隔离生成，未删除文件。


## 2026-10-06 详细模式按客户与项目动态组合

用户直接授权“开始吧”，要求按客户类型、项目和行业评估题量，以选择为主、少量简答。由原唯一Owner在本机范围执行；无新Owner、子agent、外部联系、依赖安装、schema变更或用户数据库覆盖。沿用ROUTING-2026-09-30-v3；实际model/effort/速度UNKNOWN。website-delivery-sop原文指纹未变，补读P6；应用webapp-testing、verification-before-completion和systematic-debugging。

实现：src/question-options.ts维护客户类型、项目阶段、规模、20行业各2题和需求专项选项；src/questions.ts只组合实际相关题，再每5题分页，共用的数据来源/权限只问一次。不确定和旧特殊行业不强行猜测。选择题带A/B/C，保留称呼、联系方式、问题、期望结果、预算补充、其他补充等少量短文本。src/survey-routing.ts统一初始化/重排、保留页位置与隐藏答案、兼容旧自由文本。三个既有必填字段不变，草稿可不完整。摘要规则升为fde-intake-rules-2，标明未启用分支的历史答案。

浏览器发现SurveyJS延迟翻页滚动可能关闭刚打开的下拉菜单；关闭框架动画，以onScrollToTop取消延迟页面滚动，并在onAfterRenderPage即时滚动到新页。先定位原始日志与本地库实现，再修正；最终真实点击通过，未用强制点击或脚本绕过UI。下拉选中值由单独标签显示，搜索输入本身为空，因此浏览器持久化断言检查实际选中标签；规则/API另验证原始值。

验收：evidence/adaptive-build.log构建通过；adaptive-unit-api.log 16/16（13接口+3规则测试，规则矩阵覆盖20行业×6规模×16需求组合共1920组合、类型/阶段分支、分页去重、旧值与隐藏答案）；adaptive-browser.log 7/7，含原流程回归和小制造流程/大零售网站两种实际选择、保存刷新、切换行业恢复答案、提交，桌面与390px无横向溢出，未捕捉pageerror；adaptive-format-check.log通过。evidence/local-browser.json实际4180空白问卷5题、详细模式切换、后台未登录跳转通过。主服务PID79109仅127.0.0.1:4180，后端已重启载入新增字段白名单与摘要规则，原data沿用。没有重新核验当前客户记录数，之前0客户记录是历史检查。

题库原件docs/QUESTION_BANK.md，由scripts/question-bank-doc.ts生成；evidence/adaptive-route-examples.json给出实际组合题量：简单11/3步；详细未确定22/5步；小制造新流程30/6步（25选择）；大零售改网站31/7步（26选择）；个人专业服务AI32/7步（27选择）；大制造多方向整合42/9步（36选择）。题库是访谈素材，不代表客户已确认最终范围。

新增/更新的证据日志、adaptive-390.png、adaptive-1440.png、两张dropdown/workflow诊断截图与source-manifest.json均位于本项目evidence/，保留供验收；隔离QA记录位于tests/runtime/，无无用途文件删除。docs/QUESTION_BANK.md、QUESTION_BANK生成脚本、src/question-options.ts、src/survey-routing.ts、tests/routing.test.ts为本轮新增持久文件。失败历史见adaptive-browser-first.log、adaptive-browser-second.log、adaptive-browser-focus.log；最终通过日志明确为adaptive-browser.log。构建有既有大chunk警告，本轮未扩展性能优化范围。整体仍待PMO验收，本次具体修改执行与验证通过。最新源码指纹以source-manifest.json为准，替代历史指纹。


## 2026-10-06 Eli FDE 品牌文案

用户认可“Eli FDE / 把 AI 变成企业的生产力。”并明确授权嵌入。顶部品牌改为Eli FDE，客户首页H1使用该句，保留工作人员代填标题；HTML标题和描述同步。仅改src/main.tsx、index.html及测试/本机检查中的标题定位；不改变题库、流程、API或数据库。

本轮evidence/brand-build.log构建通过；brand-browser.json记录实际127.0.0.1:4180桌面1440与390px品牌/主标题/网页标题、详细模式入口、首步5题、无横向溢出、无pageerror通过；brand-1440.png与brand-390.png为只读新浏览器上下文截图，390px图片已目视检查；brand-format.log通过。先前7项完整流程/16规则接口证据保留为品牌变更前检查，未重复重跑无变化流程。本轮页面由现有本机服务直接加载新dist，无后端重启或用户数据写入。截图、日志与source-manifest.json保留用于验收，无文件删除。最新源码指纹2b7bbceccfd0e3cf78590bd8dff167a63c81b5d2fdf123889070919ca0b56a18。整体PMO状态仍待验收。
