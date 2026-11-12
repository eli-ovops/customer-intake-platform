import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initializeRoot } from "../server/delivery-root.ts";
import {
  initializeAuth,
  openDeliveryRuntime,
} from "../server/delivery-runtime.ts";
import type { Requirement } from "../src/delivery-types.ts";

// One authorized, curated import. Never loads old databases, media or credentials.
const root = resolve(process.argv[2] ?? "runtime/real-projects-20261012");
const actor = "PMO资料整理导入";
const meeting =
  "/Volumes/EXTERNAL/Eli归档/旧组织隔离归档_20260809/contents/05_网站修改对焦会接收记录_20260707.md";
const projects = [
  {
    title: "WilliamRock家具展示网站",
    industry: "制造与加工",
    date: "资料日期未明；2026-10-12核原件",
    paths: [
      "/Volumes/EXTERNAL/wl/docs/00_PROJECT_INIT.md",
      "/Volumes/EXTERNAL/wl/PRODUCT.md",
    ],
    problem:
      "在现有英文家具展示前台之上建立询盘闭环，并管理英文内容、产品与公开媒体。",
    outcome:
      "国际采购商浏览产品和工厂资料，提交询盘；两类管理员后台查看，人工线下跟进。",
    excluded:
      "支付、CRM、自动营销、通知、中文后台、生产部署；真实询盘隐私与素材权利待确认。",
    context:
      "已有范围草案与已确认需求记录，不证明CMS当前实现或客户验收；本人主导项目，不代表全部代码独立开发。",
    items: [
      [
        "询盘表单与后台查看",
        "姓名、邮箱、公司名、电话或WhatsApp字段；提交后保存、后台查看与人工跟进。",
      ],
      [
        "英文内容管理",
        "维护现有英文文案、产品、图片与联系方式，保留现有前台结构。",
      ],
      [
        "两类管理员权限",
        "客户管理员维护内容与查看询盘；系统管理权限仅最高管理员拥有。",
      ],
    ],
    unknown: "确认素材使用权、询盘留存与删除规则、当前实现状态及验收边界。",
  },
  {
    title: "淼瀚洁具库存系统",
    industry: "",
    date: "2026-09-23历史复查；当前状态待确认",
    paths: [
      "/Users/USER/Documents/ChatGPT/淼瀚洁具 库存管理系统/docs/9项问题复查-20260922.md",
    ],
    problem:
      "库存、规格与仓库保持一致；盘点、发货、采购到货及搜索流程需要可靠持久化。",
    outcome:
      "按真实业务问题整理复查任务，后续以当前版本重新核实；不把历史样例通过当成现行整体验收。",
    excluded:
      "真实库存账、采购销售单、收款金额、测试单号与产品数据；不连接ERP接口或服务器。",
    context:
      "原件记载2026-09-23九项针对性复查：八个具体样例通过，未到仓退货提前增库存一项未通过。当前修复状态UNKNOWN，测试样例不是客户真实订单。",
    items: [
      [
        "未到仓退货库存边界",
        "未到仓不增加库存、实际到仓只增加一次；历史复查未通过，当前待复核。",
      ],
      [
        "仓库与规格一致性",
        "新增库存保留仓库/规格，盘点前后数量、名称与出入库规格可追溯。",
      ],
      [
        "发货与采购状态持久化",
        "手机发货删除后重开保持一致，实际收货后采购状态更新。",
      ],
      [
        "库存与出入库搜索",
        "按产品及规格进行查询；历史样例记录可参考，当前版本待复核。",
      ],
    ],
    unknown:
      "核当前软件版本与第01项修复状态；当前交付阶段、报价和客户确认均待确认。",
  },
  {
    title: "公益基金会官网｜历史团队项目",
    industry: "公益与社会组织",
    date: "2026-07-07资料接收；实际会议时间待确认",
    paths: [meeting],
    problem:
      "整理官网初稿的头部、导航和基础冗余功能，统一页面呈现并评估地图交互。",
    outcome:
      "按会议任务准备客户初稿与修改清单；Eli承担团队中部分技术支持任务。",
    excluded:
      "客户法人名称、团队个人姓名、联系人、媒体与截图；不恢复旧工程，不把历史任务写成已完成交付。",
    context:
      "历史会议纪要来自用户粘贴文本与企业微信临时截图；仅使用匿名的非敏感任务文本。具体交付、当前状态及公开许可未核。",
    items: [
      [
        "头部与导航基础调整",
        "调整标识、导航与title，移除搜索、注册和登录等会议指定冗余入口。",
      ],
      [
        "全站一致性与交付清单",
        "页面导航/页脚一致，准备源码打包的修改清单和已知问题；历史任务，完成状态待确认。",
      ],
      [
        "地图方案评估",
        "评估地址跳转或热区坐标交互；地址、地图平台及移动体验待确认。",
      ],
    ],
    unknown:
      "核本人具体已交付内容、客户初稿反馈与地图需求；素材公开权利待确认。",
  },
  {
    title: "律所官网｜历史团队项目",
    industry: "专业服务",
    date: "2026-07-07资料接收；实际会议时间待确认",
    paths: [meeting],
    problem: "分批回收官网静态与动态内容，核对Payload字段与前台展示关系。",
    outcome:
      "以内容状态和页面映射支持团队官网调整；记录参与经历，不宣称独立完成全站。",
    excluded:
      "客户法人名称、个人姓名、OA内容、联系方式、图片和截图；不访问旧工程或客户后台。",
    context:
      "历史会议任务分配，内容状态需区分已确认合规、需修改和未覆盖；不证明当前实现或客户验收。",
    items: [
      [
        "静态与动态内容分批回收",
        "先回收前端静态内容，后回收动态内容，按全页面/导航核对。",
      ],
      ["内容状态登记", "区分已确认合规、需修改、未覆盖；未知内容继续待确认。"],
      [
        "Payload字段与前台映射",
        "核素材上传、内容编辑、排序与字段对应的前台效果。",
      ],
    ],
    unknown: "核当前内容、本人具体工作与客户反馈；不继承历史未核的验收结论。",
  },
];
const provenance = projects.map((p) => ({
  title: p.title,
  documentDate: p.date,
  sources: p.paths.map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  })),
}));
initializeRoot(root, { syntheticOnly: false, localPrivateAccess: true });
await initializeAuth(root, false);
const db = new DatabaseSync(join(root, "intake.sqlite"));
const records = projects.map((p, index) => {
  const id = randomUUID(),
    submissionId = randomUUID(),
    now = new Date().toISOString();
  const sources = provenance[index].sources
    .map((s) => `${s.path}\nSHA-256 ${s.sha256}`)
    .join("\n");
  const answers = {
    organization: p.title,
    industry: p.industry,
    problem: p.problem,
    outcome: p.outcome,
    additional: `来源：已有真实项目文档，由PMO核对后整理导入，非客户本人问卷。\n资料日期：${p.date}\n${p.context}\n${sources}\n未填写字段均待确认；没有现行报价、成本、工时或客户签证。`,
  };
  db.prepare("INSERT INTO intakes VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
    id,
    null,
    randomUUID(),
    "project",
    actor,
    JSON.stringify(answers),
    "detailed",
    1,
    "draft",
    "待了解",
    now,
    now,
  );
  db.prepare("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)").run(
    submissionId,
    id,
    1,
    randomUUID(),
    JSON.stringify(answers),
    "detailed",
    actor,
    now,
  );
  db.prepare("INSERT INTO notes VALUES(?,?,?,?,?)").run(
    randomUUID(),
    id,
    `${p.context}\n使用范围：本人本机私有工作台；其他项目原件只读。\n${p.unknown}`,
    actor,
    now,
  );
  return { id, submissionId, p };
});
db.close();
const runtime = openDeliveryRuntime(root);
try {
  for (const { id, submissionId, p } of records) {
    let w = runtime.store.create(id, submissionId, actor);
    const act = (op: string, args: object) => {
      w = runtime.store.action(
        id,
        w.id,
        { revision: w.revision, requestKey: randomUUID(), op, args },
        actor,
      );
    };
    act("scopeMeta", { goal: p.outcome, excluded: p.excluded });
    const requirements: Requirement[] = p.items.map(
      ([title, deliverable], i) => ({
        id: `R${i + 1}`,
        title,
        deliverable,
        sourceField: "原项目文档；来源见资料版本",
        kind: "build",
        status: "later",
        stage: "资料整理·待复核",
        acceptance: "待核当前版本及客户确认，不能沿用历史结果",
        condition: "仅整理已授权非敏感文字",
        stop: "不开展来源项目实施或处理真实业务单据",
      }),
    );
    act("patch", { collection: "requirements", records: requirements });
    act("patch", {
      collection: "questions",
      records: [
        {
          id: "SOURCE-CHECK",
          title: p.unknown,
          sourceField: "原项目文档",
          blocking: false,
          requirementIds: [],
          status: "open",
          answer: "",
        },
      ],
    });
    // No freeze, quote, acceptance or public permission is inferred from imported text.
  }
} finally {
  runtime.close();
}
const receipt = {
  importedAt: new Date().toISOString(),
  syntheticOnly: false,
  privateLocalOnly: true,
  actor,
  sourceAuthority:
    "用户2026-10-12要求真实内容，PMO只读核原件并回复允许最小文本提取",
  projects: records.map(({ id, p }, i) => ({
    intakeId: id,
    ...provenance[i],
    fieldStatus: "document-derived; customer confirmation unknown",
  })),
  excluded: [
    "credentials",
    "contacts",
    "media",
    "real orders or stock ledger",
    "prices",
    "client acceptance",
  ],
  root,
};
writeFileSync(
  join(root, "import-receipt.json"),
  JSON.stringify(receipt, null, 2),
  { mode: 0o600, flag: "wx" },
);
console.log(
  JSON.stringify({
    root,
    count: records.length,
    syntheticOnly: false,
    status: "document-derived private project records",
  }),
);
