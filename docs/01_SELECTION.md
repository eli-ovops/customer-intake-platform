# 选型与映射（2026-10-06）
官方来源只读核对：SurveyJS https://github.com/surveyjs/survey-library （MIT，3.1.2发布9月29日）；Formbricks https://github.com/formbricks/formbricks （AGPL核心+企业许可，6.0.2发布10月1日，Docker多个本地服务）；NocoDB https://github.com/nocodb/nocodb （Sustainable Use，2026.09.1发布9月29日，仅内部/非商业用途受限制，不能当宽松开源）。实际包许可以安装版本license再核。
采用SurveyJS Form Library组件（手工JSON题目，无付费Creator/PDF/Dashboard），自建工作台/API，数据自主控制、无持续云费；仅靠完整问卷平台不能直接满足原文/备注/跟进独立存储与自述身份区别。纯自建表单可控但需重写问卷分步、分支、校验与本地化，本轮优先复用。
映射：SurveyJS分步/条件显示→客户少负担问卷（采用抽象交互及合法MIT库，原创中文问题）；Formbricks任务聚焦→问卷与跟进不同区域（仅抽象原则）；NocoDB表格阶段→后台列表筛选（原创布局，不复用其源码/资产）。
原创视觉：暖白、深蓝文字、青色主操作，左侧阶段导览＋主表单/右侧说明；手机单列。系统字体，无外部图片/字体/品牌素材。装饰仅CSS，无待确认素材。键盘可用、可见焦点、错误文字反馈、减少动效。
Node22.16 API参考 https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html；DatabaseSync处于Active development，仅固定runtime本机版本。SQLite事务与在线backup，版本化SQL，不用磁盘文件直拷WAL代替备份。
