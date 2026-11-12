# API、数据与权限契约

服务仅127.0.0.1，Host只接受localhost/127.0.0.1；非GET要求JSON，48KiB上限；存在Origin时必须同源。无需CORS，外域脚本不能凭Cookie读取。静态服务只发布dist，data不在static内。

| 接口 | 权限/用途 |
|---|---|
| GET /api/health | 公共，不含数据或路径 |
| GET /api/auth/me | 当前认证身份/会话CSRF，无会话返回null |
| POST /api/auth/login | owner密码bcrypt；6次失败10分钟限制；初始化必须改密 |
| POST /api/auth/password、logout | httpOnly sameSite=strict Cookie＋CSRF头；8小时会话；改密撤销其他会话；退出撤销当前 |
| POST /api/intakes | 43字符客户端crypto随机256bit createKey，能力凭证；哈希去重，重试同key返回同一份记录；30次/10分钟创建限制 |
| GET/PUT /api/intakes/:id | Authorization Bearer随机凭证，id与cap_hash同时匹配；无凭证401/错记录404 |
| POST /api/intakes/:id/submit | 同上；revision乐观并发，requestKey事务去重；追加原文版本 |
| GET/POST /api/admin/intakes | 已认证且改过初始化密码；写操作另需CSRF；创建身份由服务端会话写入 |
| GET/PUT /api/admin/intakes/:id、submit | 后台鉴权；修改工作草稿，提交追加原文，不改旧快照 |
| POST notes、PATCH stage | 后台鉴权/CSRF；备注追加、actor时间；阶段更新审计 |
| GET export.csv、intakes/:id/export、audit | 后台鉴权；导出审计。JSON/Markdown附件；CSV公式前缀处理+BOM |

没有删除、附件、客户列表、客户导出或客户读取后台备注接口。客户不能通过请求字段提升身份，strict Zod拒绝actor/source等额外参数；填写方式文本只是自述。

## 数据schema v1

server/db.ts是可重放的schema定义。intakes保存草稿、mode、revision、创建身份与跟进状态；submissions保存版本/原文/时间/实际操作身份/幂等key；notes保存独立工作人员追加；summaries保存规则版本/来源revision/结果；audit保存动作、资源、actor、时间；users bcrypt password及首改状态；sessions仅保存会话token哈希、csrf、expires。intakes客户cap及createKey仅哈希。
WAL、FULL同步和IMMEDIATE事务覆盖保存/提交，任何失败ROLLBACK。schema_version=1；已有未知schema不自动迁移。后续schema变化必须备份、独立副本验证和明确迁移/失败策略，不复用CREATE IF NOT EXISTS冒称迁移。

## 风险与边界

httpOnly降低登录token脚本读取风险；本机HTTP Cookie secure=false，仅限loopback，公开前必须TLS+secure。客户回访凭证在本机localStorage/分享fragment；本机设备其他使用者或XSS会带来风险，因此不分享浏览器账号，正文由React转义、CSP拒绝外部脚本，回访凭证不写日志/截图。
能力链接丢失无编号找回接口。能力凭证无自动到期/轮换UI；公开前需要留存/回访期限及撤销流程。后台单owner，无多账号/邀请；启动服务在前台，退出会话和停止进程分别处理，无自启动或定时任务。
登录限流内存状态服务重启重置，仅适合当前本机范围。审计含操作记录，不含请求体、密码或原始凭证。密码遗忘/账号停用由用户另行授权本地运维，无自助找回。依赖扫描只能说明扫描时已知漏洞，不替代渗透或正式安全验收。

## 数据处理与维护

收集目的为需求访谈和跟进，联系方式可选；不收合同/密码/Key/真实单据，不调用外部AI。当前本机库不设定未批准的自动留存删除策略；实际录入前由用户决定留存期限与线下处理删除请求。无删除功能不意味着已获得永久保存授权。测试只虚构数据。
备份手动执行，无自动保留清理。恢复脚本只写独立新目录，不覆盖新数据；生产恢复切换和补偿未授权。维护无7x24、持续费用/期限承诺。公开或服务器部署需新具体授权与L2评审。
