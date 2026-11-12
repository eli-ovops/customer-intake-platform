# 执行验收报告（待PMO验收）

结论：本次本机实施范围的必需执行检查通过；不代表PMO已验收、真实手机可达、公开或生产上线。用户只授权本机和项目内依赖。本执行Owner提供原始证据，最终验收Owner为FDE PMO（01a109fd-856d-7de3-8329-95d7e3763cf4）。

本地入口 http://127.0.0.1:4180/ ，工作人员 /admin/login；检查时43225监听127.0.0.1，未监听LAN。登录初始化凭据位置见README；报告不含其值。检查时主库0客户记录、1初始化账号、integrity ok；虚构客户只在测试/QA恢复副本。

运行源码指纹：`7240e8f0ac212b27576927a3ff835c9c9a8c8f874f84f32e5d7336b253fac17d`（SHA256）。文件级清单：evidence/source-manifest.json。没有Git/commit，按用户禁止初始化要求以哈希记录版本。测试变更未改变运行源码，日志匹配当前实现。

| 必需验收 | Owner/方法 | 原始证据/结果 |
|---|---|---|
| 双模式、按需求分支、预算分支、切换保留 | 执行Owner，真实Google Chrome1440/390px | browser-test.log，browser-results.json：3/3通过；desktop-branches.png |
| 保存草稿、刷新、补充、原文版本 | 执行Owner，真实Chrome＋API断言 | browser-test.log、api-test.log；重试保持1版，修改后追加2版，首版原文保留 |
| 真正服务重启持久读取 | 执行Owner，退出子进程再启动新PID | api-test.log第8项：草稿字段、2快照、备注、阶段、会话恢复 |
| 后台登录/首次改密/退出、工作人员代填 | 执行Owner，Chrome＋API | browser-test.log、api-test.log；强制首改，服务器身份，无凭证拒绝 |
| 未授权后台/导出/修改、横向草稿和补充、字段伪造 | 执行Owner，直接API请求 | api-test.log第1/2/3/4/7/11项：401/403/404；伪actor字段400，填写方式不提升身份，过期/退出失效 |
| 跟进、搜索、备注、摘要与访谈问题 | 执行Owner，Chrome＋API | desktop-dashboard.png、desktop-record.png、mobile-record.png；API与browser结果 |
| JSON/Markdown/CSV中文导出与公式防护 | 执行Owner，浏览器实际下载＋API返回检查 | virtual-export.md、api-test.log：原始版本/备注完整，实际CSV公式字段加引号前缀、中文保留 |
| 保存失败不伪称成功、不部分写入 | 执行Owner，Chrome500故障注入＋SQLite query_only | mobile-save-failure.png、browser-test.log；api-test.log第10项：500、revision0、原内容不变 |
| 原文/备注脚本不执行 | 执行Owner，虚构脚本输入真实Chrome | browser-test.log；页面global变量未建立，原文文本可见 |
| 备份独立恢复、无覆盖 | 执行Owner，SQLite线上backup＋恢复副本API＋实际CLI | api-test.log第9项；operations-restore.json、operations-test.log：7表一致、integrity ok，已有/项目外目标被拒绝 |
| 本机交付入口真实浏览器 | 执行Owner，新Chrome context访问4180 | local-browser.json、local-entry.png、local-listener.txt、live-data-scope.json；只有本机来源，无pageerror，未登录后台转登录页 |
| 构建/格式/已知依赖漏洞/有限秘密模式 | 执行Owner，tsc/Vite/Prettier/npm audit/源码扫描 | build.log exit0、format-check.log通过；audit-all.json与audit-production.json均0；source-secret-scan.json0发现 |

API共11/11通过；浏览器3/3通过（包含首改密码）。浏览器网络事件见browser-network.json，无页面脚本异常。Chrome版本见local-browser.json。390px是浏览器视口，不等于实际手机、WiFi或公网可达。

## 保留限制与公开前门槛

node:sqlite在固定Node22.16仍为实验API，SQLite同步单进程适合本机小规模；未做生产并发/容量验证。前端约1.98MB JS、524KB CSS（gzip约474KB/52KB），有chunk体积提示；本地验证加载可用，无额外外部字体/图片请求，本轮不扩性能优化。
Cookie本机HTTP secure=false；回访凭证本机localStorage/fragment，本机设备保管重要，无自动到期/轮换UI；无多账号/忘密、附件、删除、邮件、AI外发和定时备份。公开前必须重新评审TLS/数据库/账号生命周期/隐私留存删除/监控/恢复切换/依赖及runtime，取得具体部署授权和正式验收。
真实数据责任及留存未被测试虚构数据替代；没有客户商业效果证明。有限秘密模式与npm audit不能代表全面渗透或绝对安全。

## SOP适用与例外

DS-002B V2.5首次完整阅读并记SHA/mtime，当前未变。四项模板项目实例、PRD、选型与安全契约均在docs；设计属Owner在明确授权内自主选择，人类/PMO视觉及最终验收未代签。为遵从本次先持久化/版本闭环派单，没有独立先Mock交付，真实功能用隔离虚构数据验收，已在骨架实例与开发日志报告。默认pnpm/Prisma改为已有npm和node:sqlite；非Git、无Server Owner/公网发布、客户合同/费用和L2条款不适用于当前授权，不能冒称已通过生产门禁。

## 收尾

源码仅本项目，未修改FDE根资料/skills/其他工程/服务器；没有子agent或向其他会话发送消息。主服务普通本机前台运行，非守护/自动化，不承诺关机或会话结束后自动恢复。测试进程/浏览器已退出，主服务留供用户验收。启动/停止/备份/恢复见README。
新建产物精确路径见generated-files.json；依赖、缓存、源码、测试数据、QA恢复副本、备份与原始证据保留，未清理。磁盘约1.5TiB可用/19%占用；无删除和空间释放声明。初始失败日志保留，以最后通过日志作为当前结论。

后续：PMO审本文件和原始证据，核适用例外，给通过/退回；未获PMO结论前保持待验收。用户可在本机检查体验，无再次开工/设计批准问卷。

## 增量验收 2026-10-06T10:42:28+08:00：逐题与行业选择

本轮用户指定范围已验证通过。单题显示、前后切换、20个常用行业＋其他/不确定、模式切换保留、保存刷新、旧自由文本行业保留，以及桌面/390px流程：Chrome4/4。构建通过。原始日志one-question-browser.log、one-question-build.log，截图industry-options.png、mobile-questionnaire.png；当前browser-results.json为4项本轮结果。当前源码指纹837d49fe72a2e916dc8810f3402b901b0e35bbcddd1d73bcd527cfd11b41ea7d，此前正文指纹及3项browser结论为初版历史证据；后台API/恢复代码未修改，其对应原证据继续适用。未改数据库或删除数据。


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
