# 当前界面增量验收（2026-10-12）

免密码本机样例入口、简洁专业布局与四页签已实现。当前证据见 evidence/ui-refresh-20261012/receipt.json：19接口/规则、7问卷浏览器、交付五场景和5组界面交互检查通过；独立静态界面审查 ship。PMO与本人体验另行确认，不代表真实业务验收。

# 历史：界面更新前的 Rev2 P0 验收

下文对应原指纹与当时启动回执；原源码清单为 evidence/delivery-rev2/source-manifest-original.json。

# FDE客户交付工作台 Rev2：执行验收

2026-10-12，软件0.2.0。结论：B1—B4与D01—D05的本机合成技术验收通过。PMO审证、本人体验和真实客户/商业结果分别待定；不代表旧平台全验收、公开或生产上线。新目标模式未激活，原因是线程内旧未完成目标阻止create_goal，实际回执在START_RECEIPT；不将旧目标虚标complete。

## 交付入口

- [已测启动文件](/Volumes/EXTERNAL/FDE/customer-intake-platform/Start-Delivery.command)，无需用户build。
- [本机工作台](http://127.0.0.1:4180/admin)。实际虚构案例入口及当前PID/根/端口见runtime/delivery-demo-20261012/runtime.json；本次检查PID34278只监听127.0.0.1:4180。
- [运行恢复说明](/Volumes/EXTERNAL/FDE/customer-intake-platform/docs/DELIVERY_RUNBOOK-20261012.md)。认证只在演示根auth中，凭据只报告位置，不进入本文件或导出包。
- 三种实际浏览器下载位于evidence/delivery-rev2/D05/launcher-internal.json、launcher-internal.md、launcher-customer-draft.md；内部包与对客包独立，对客文件不附内部JSON/成本/路径。

源码指纹：319ec7a73d95603b9731d7316e1e82e80b3d06ba91bd77145fcb3d869c3c3dfe。PRD指纹：ef84b0201b1b639934a5bc90aeb1149ceeee4e3d07a9d41d51bac9608807ccf9。逐文件历史原件在evidence/delivery-rev2/source-manifest-original.json；有限秘密模式0发现，不代表全面安全审计。

## 五场景与证据

| 场景 | 已观察的结果 | 原始回执 |
|---|---|---|
| D01 主链 | 真实浏览器编辑目标、保存、冻结、保存报价/清单及刷新；条目id继承，标题无强制重复输入；待估与15000分内部估算分开；1440/390px可操作 | evidence/delivery-rev2/D01/receipt.json、core-receipt.json、browser-receipt.json、截图；verification-final.log |
| D02 来源/变更 | v1/v2保留；旧基线409，显式重基后仅一次采纳；同键不同payload拒绝；旧报价/结果历史，新版本恢复aligned；同id改验收动作不沿用通过 | D02/receipt.json及其core/browser回执 |
| D03 错误/安全 | 401/409/413/500全dirty下载含四段及验收编辑，服务端零部分写；40KiB/最多5记录拒绝；未知结果按原键核实；跨客户、CSRF/Origin/伪身份、过期/第二实例/根丢失拒绝；满额保留撤销；缺delivery旧问卷继续且不重建空库 | D03/receipt.json、unsubmitted.txt、failure-rescue.png、bounded-result-query-verified.log、core/browser回执 |
| D04 导出/恢复 | 实际JSON/Markdown及独立对客文件下载/回读；第二文件故障PARTIAL；锁定后与完成后撤销阻断新对客下载；撤销写失败及重启不复活核准；停写屏障拒绝旧/新写，两库实际备份/独立恢复、逐引用核对及新AUTH_ROOT/cookie隔离；错hash/path拒绝 | D04/receipt.json、下载原件及core/browser回执，合成恢复根和batch manifest保留 |
| D05 冷启动/旧回归 | 实际Start-Delivery.command启动、登录与首改、预置完整虚构案例、三文件实际下载；关闭重开原修订保留；原详情入口/auth和问卷分支/必填/草稿回访/原文补充/备注阶段/原导出必要回归通过 | D05/receipt.json、launcher-receipt.json、launcher-verified.log、legacy-browser-verified.log（7/7） |

规则/API18/18通过，见unit-api-final.log；G1—G3、空值/0/金额边界有断言，见model.log及verification-final.log。构建和格式通过，见build.log、format-final.log。每个最终场景receipt含deviations:[]；核心与浏览器分层原件保留，不能拿CORE_PASSED单层替代完整场景。FINAL_RECEIPT.json记录全局技术状态、起止/累计与层级。

## 定向修正与未扩范围

旧必填下拉回归出现校验后的异步焦点干扰；改为校验错误同步原生聚焦/滚动，验证本身不减弱；最终7项完整回归通过。失败历史legacy-browser.log、legacy-browser-final.log、browser-first.log等保留。新增测试扩展导致未重建引用的夹具409亦已修正，日志保留；不是绕过依赖规则。

新增delivery独立三表/JSON快照、保存/版本/金额、资料包、根与写屏障、认证可配置接线和四段界面；复用旧React/Express/auth，不迁移旧库、不升级依赖。正常启动遇缺/坏delivery保持模块不可用而不造空库。发布核准绑定运行epoch，重启需显式复核历史文本；对客完成和新下载前再次检查许可/依赖，不混读新正文。

## 已知限制与保护

仅运行/测试合成intake、delivery和独立auth，真实data/intake.sqlite与真实认证数据未读写。没有外部AI、平台账号、真实媒体、付款、对外发送、服务器部署、Git初始化/push/merge、系统升级、自动化、源/数据库/备份清理。

固定Node22的SQLite接口仍为实验性；本机单人低并发，有既有大chunk体积提示。未保存文本仅保证打开页面可挽救，不承诺浏览器崩溃零丢失。JSON是资料包，完整恢复需受支持双库批次；副本不自动成为日常库，不恢复旧客户能力/公开核准。容量和故障通过本任务合成适配器核查，不拔真实盘，不修改真实权限。许可确认与客户验收仍是今后实际业务动作。

源码、脚本、场景夹具、演示根、QA副本、失败日志、导出/备份均保留，记录见FINAL_RECEIPT。无未知文件删除，无空间释放声明；本轮未安装依赖或生成媒体。累计保守计时以FINAL_RECEIPT和START_RECEIPT为准，旧Goal的394516tokens/2210秒不是本轮账。

执行Owner本地技术层收口，协调PMO读取原件并维护其自己的验收结论。目标平台阻断已由PMO集中协调人类处理，不绕过桌面安全控制、不改Codex内部状态、不再重复失败create_goal。
