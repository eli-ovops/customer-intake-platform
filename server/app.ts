import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { type DatabaseSync } from "node:sqlite";
import { openDatabase, transaction } from "./db.ts";
import {
  fields,
  stages,
  requiredFields,
  type Answers,
} from "../src/questions.ts";
import { summarize, ruleVersion, csvCell } from "./summary.ts";
import type { WriteBarrier } from "./delivery-root.ts";
export type AppOptions = {
  passwordlessDemo?: boolean;
  localPrivateAccess?: boolean;
  appVersion?: string;
  healthDetails?: {
    producerApp: string;
    rootId: string;
    syntheticOnly: boolean;
  };
  authDb?: DatabaseSync;
  cookieName?: string;
  barrier?: WriteBarrier;
  disableCustomer?: boolean;
  validateRoot?: (req: express.Request) => void;
  install?: (
    app: express.Express,
    db: DatabaseSync,
    auth: express.RequestHandler,
  ) => void;
};
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const now = () => new Date().toISOString();
const key = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
const answersSchema = z
  .record(
    z.string(),
    z.union([z.string().max(2000), z.array(z.string().max(200)).max(12)]),
  )
  .refine((v) => Object.keys(v).every((k) => fields.includes(k)), "未知字段");
const writeSchema = z
  .object({
    mode: z.enum(["simple", "detailed"]),
    answers: answersSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();
const submitSchema = writeSchema.extend({ requestKey: key }).strict();
type Intake = {
  id: string;
  cap_hash: string | null;
  create_key: string;
  source: string;
  actor: string;
  answers: string;
  mode: string;
  revision: number;
  status: string;
  stage: string;
  created: string;
  updated: string;
};
type User = { id: string; name: string; password: string; must_change: number };
type Session = {
  hash: string;
  user_id: string;
  csrf: string;
  expires: number;
  name: string;
  must_change: number;
};
class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function createAdmin(
  db: DatabaseSync,
  password: string,
  mustChange = true,
) {
  if (db.prepare("SELECT id FROM users LIMIT 1").get())
    throw new Error("管理员已存在，初始化不会覆盖");
  db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
    randomUUID(),
    "owner",
    await bcrypt.hash(password, 12),
    mustChange ? 1 : 0,
  );
}
export function createApp(
  dataDir: string,
  staticDir = resolve("dist"),
  options: AppOptions = {},
) {
  const db = openDatabase(dataDir);
  const authDb = options.authDb ?? db;
  const cookieName = options.cookieName ?? "fde_session";
  const localDemo =
    !!options.authDb &&
    ((!!options.passwordlessDemo && !!options.healthDetails?.syntheticOnly) ||
      (!!options.localPrivateAccess && options.healthDetails?.syntheticOnly === false));
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use((req, res, next) => {
    const host = req.headers.host?.split(":")[0];
    if (host !== "127.0.0.1" && host !== "localhost")
      return res.status(403).json({ error: "仅允许本机访问" });
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`)
        return res.status(403).json({ error: "来源校验失败" });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "需要JSON请求" });
    }
    next();
  });
  if (options.barrier) app.use(options.barrier.middleware);
  if (options.disableCustomer)
    app.use("/api/intakes", (_req, res) =>
      res.status(403).json({ error: "恢复副本仅内部查看，不复活客户回访能力" }),
    );
  app.use(express.json({ limit: "48kb" }));
  if (options.validateRoot)
    app.use("/api", (req, res, next) => {
      try {
        options.validateRoot!(req);
        next();
      } catch (e: any) {
        res
          .status(e.status ?? 503)
          .json({ error: e.message ?? "数据根不可用，已停止写入" });
      }
    });
  const audit = (actor: string, action: string, resource: string) =>
    db
      .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
      .run(randomUUID(), actor, action, resource, now());
  const session = (req: Request): Session | undefined => {
    const c = (req.headers.cookie ?? "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!c) return undefined;
    return authDb
      .prepare(
        "SELECT sessions.*,users.name,users.must_change FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=? AND expires>?",
      )
      .get(hash(c), Date.now()) as Session | undefined;
  };
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const s = session(req);
    if (!s) return next(new AppError(401, "请先登录"));
    res.locals.session = s;
    if (req.method !== "GET" && req.headers["x-csrf-token"] !== s.csrf)
      return next(new AppError(403, "会话校验失败，请刷新"));
    if (
      s.must_change &&
      !localDemo &&
      !req.path.endsWith("/password") &&
      !req.path.endsWith("/logout") &&
      !req.path.endsWith("/me")
    )
      return next(new AppError(403, "请先修改初始化密码"));
    next();
  };
  const customer = (req: Request): Intake => {
    const raw = req.headers.authorization;
    if (!raw?.startsWith("Bearer ") || !/^Bearer [\w-]{43}$/.test(raw))
      throw new AppError(401, "需要有效回访凭证");
    const row = db
      .prepare("SELECT * FROM intakes WHERE id=? AND cap_hash=?")
      .get(String(req.params.id), hash(raw.slice(7))) as Intake | undefined;
    if (!row || row.source === "test-isolated")
      throw new AppError(404, "记录不可访问");
    return row;
  };
  const byId = (id: string): Intake => {
    const r = db.prepare("SELECT * FROM intakes WHERE id=?").get(id) as
      Intake | undefined;
    if (!r) throw new AppError(404, "没有找到记录");
    return r;
  };
  const detail = (r: Intake, admin = false) => {
    const result = summarize(JSON.parse(r.answers));
    const base = {
      id: r.id,
      source: r.source,
      actor: r.actor,
      answers: JSON.parse(r.answers),
      mode: r.mode,
      revision: r.revision,
      status: r.status,
      stage: r.stage,
      created: r.created,
      updated: r.updated,
      submissions: db
        .prepare(
          "SELECT id,version,answers,mode,actor,created FROM submissions WHERE intake_id=? ORDER BY version",
        )
        .all(r.id)
        .map((s: any) => ({ ...s, answers: JSON.parse(s.answers) })),
    };
    return admin
      ? {
          ...base,
          notes: db
            .prepare("SELECT * FROM notes WHERE intake_id=? ORDER BY created")
            .all(r.id),
          summary: result,
        }
      : base;
  };
  function create(source: string, actor: string, createKey: string) {
    return transaction(db, () => {
      const id = randomUUID(),
        cap = source === "customer" ? createKey : null;
      db.prepare("INSERT INTO intakes VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
        id,
        cap ? hash(cap) : null,
        hash(createKey),
        source,
        actor,
        "{}",
        "simple",
        0,
        "draft",
        "待了解",
        now(),
        now(),
      );
      audit(actor, "create", id);
      return { record: detail(byId(id)), capability: cap };
    });
  }
  function save(r: Intake, body: z.infer<typeof writeSchema>, actor: string) {
    if (r.revision !== body.revision)
      throw new AppError(
        409,
        "另一处已更新。请保留本页内容，刷新后核对再填写。",
      );
    db.prepare(
      "UPDATE intakes SET answers=?,mode=?,revision=revision+1,updated=? WHERE id=?",
    ).run(JSON.stringify(body.answers), body.mode, now(), r.id);
    const next = byId(r.id);
    const summary = summarize(body.answers);
    db.prepare(
      "INSERT INTO summaries VALUES(?,?,?,?,?) ON CONFLICT(intake_id) DO UPDATE SET source_revision=excluded.source_revision,rule_version=excluded.rule_version,result=excluded.result,created=excluded.created",
    ).run(r.id, next.revision, ruleVersion, JSON.stringify(summary), now());
    audit(actor, "save-draft", r.id);
    return next;
  }
  function submit(
    r: Intake,
    body: z.infer<typeof submitSchema>,
    actor: string,
  ) {
    return transaction(db, () => {
      const prior = db
        .prepare("SELECT intake_id FROM submissions WHERE request_key=?")
        .get(body.requestKey) as { intake_id: string } | undefined;
      if (prior) {
        if (prior.intake_id !== r.id) throw new AppError(409, "提交标识冲突");
        return byId(r.id);
      }
      for (const field of requiredFields)
        if (!String(body.answers[field] ?? "").trim())
          throw new AppError(
            400,
            "请填写企业 / 团队称呼、所在行业和目前最想解决的问题。",
          );
      const next = save(r, body, actor);
      const count = db
        .prepare("SELECT COUNT(*) AS n FROM submissions WHERE intake_id=?")
        .get(r.id) as { n: number };
      db.prepare("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)").run(
        randomUUID(),
        r.id,
        count.n + 1,
        body.requestKey,
        JSON.stringify(body.answers),
        body.mode,
        actor,
        now(),
      );
      db.prepare("UPDATE intakes SET status='submitted' WHERE id=?").run(r.id);
      audit(actor, count.n ? "supplement" : "submit", r.id);
      return byId(next.id);
    });
  }
  const attempts = new Map<string, { count: number; until: number }>();
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      version: options.appVersion ?? "0.1.0",
      ...options.healthDetails,
    }),
  );
  app.get("/api/auth/me", (req, res) => {
    const s = session(req);
    res.json(
      s
        ? {
            user: {
              name: s.name,
              mustChange: localDemo ? false : !!s.must_change,
              localDemo: !!localDemo,
            },
            csrf: s.csrf,
          }
        : { user: null, localDemo: !!localDemo },
    );
  });
  app.post("/api/auth/local-session", (req, res) => {
    if (!localDemo) throw new AppError(404, "本环境未启用本机工作台");
    if (req.headers.origin !== `http://${req.headers.host}`)
      throw new AppError(403, "来源校验失败");
    z.object({}).strict().parse(req.body);
    options.validateRoot?.(req);
    const existing = session(req);
    if (existing)
      return res.json({
        user: { name: existing.name, mustChange: false, localDemo: true },
        csrf: existing.csrf,
      });
    const u = authDb
      .prepare("SELECT id,name FROM users WHERE name='owner'")
      .get() as { id: string; name: string } | undefined;
    if (!u) throw new AppError(503, "本机工作台身份不可用");
    const t = token(),
      csrf = token();
    authDb
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(hash(t), u.id, csrf, Date.now() + 8 * 3600000);
    audit(u.name, options.localPrivateAccess ? "local-workbench-session" : "local-demo-session", "auth");
    res.cookie(cookieName, t, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
      maxAge: 8 * 3600000,
    });
    res.json({
      user: { name: u.name, mustChange: false, localDemo: true },
      csrf,
    });
  });
  app.post("/api/auth/login", async (req, res) => {
    const body = z
      .object({ name: z.string().max(80), password: z.string().max(200) })
      .strict()
      .parse(req.body);
    const slot = "local-login";
    let a = attempts.get(slot);
    if (a && a.until > Date.now() && a.count >= 6)
      throw new AppError(429, "尝试过于频繁，请10分钟后重试");
    if (!a || a.until <= Date.now()) {
      a = { count: 0, until: Date.now() + 600000 };
      attempts.set(slot, a);
    }
    const u = authDb
      .prepare("SELECT * FROM users WHERE name=?")
      .get(body.name) as User | undefined;
    const dummy =
      "$2b$12$7ThMdBGJKVH8/wGnIbBw2OLCMkf2lfNxGsizgmwm5pjTeVYqtwdzO";
    const ok = await bcrypt.compare(body.password, u?.password ?? dummy);
    options.validateRoot?.(req);
    if (!u || !ok) {
      a.count++;
      audit("anonymous", "login-failed", "auth");
      throw new AppError(401, "账号或密码不正确");
    }
    attempts.delete(slot);
    const t = token(),
      csrf = token();
    options.validateRoot?.(req);
    authDb
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(hash(t), u.id, csrf, Date.now() + 8 * 3600000);
    audit(u.name, "login", "auth");
    res.cookie(cookieName, t, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
      maxAge: 8 * 3600000,
    });
    res.json({ user: { name: u.name, mustChange: !!u.must_change }, csrf });
  });
  app.post("/api/auth/logout", auth, (req, res) => {
    const s = res.locals.session as Session;
    authDb.prepare("DELETE FROM sessions WHERE hash=?").run(s.hash);
    audit(s.name, "logout", "auth");
    res.clearCookie(cookieName, { path: "/" });
    res.json({ ok: true });
  });
  app.post("/api/auth/password", auth, async (req, res) => {
    const b = z
      .object({
        current: z.string().max(200),
        next: z.string().min(12).max(200),
      })
      .strict()
      .parse(req.body);
    if (b.current === b.next) throw new AppError(400, "新密码不能与旧密码相同");
    const s = res.locals.session as Session;
    const u = authDb
      .prepare("SELECT * FROM users WHERE id=?")
      .get(s.user_id) as User;
    if (!(await bcrypt.compare(b.current, u.password)))
      throw new AppError(401, "当前密码不正确");
    const pw = await bcrypt.hash(b.next, 12);
    options.validateRoot?.(req);
    transaction(authDb, () => {
      authDb
        .prepare("UPDATE users SET password=?,must_change=0 WHERE id=?")
        .run(pw, u.id);
      authDb
        .prepare("DELETE FROM sessions WHERE user_id=? AND hash<>?")
        .run(u.id, s.hash);
      audit(s.name, "password-change", "auth");
    });
    res.json({ ok: true });
  });
  const creates = new Map<string, { n: number; until: number }>();
  app.post("/api/intakes", (req, res) => {
    const b = z.object({ createKey: key }).strict().parse(req.body);
    const existing = db
      .prepare("SELECT * FROM intakes WHERE create_key=? AND cap_hash=?")
      .get(hash(b.createKey), hash(b.createKey)) as Intake | undefined;
    if (existing)
      return res.json({ record: detail(existing), capability: b.createKey });
    let rate = creates.get("local");
    if (!rate || rate.until < Date.now()) {
      rate = { n: 0, until: Date.now() + 600000 };
      creates.set("local", rate);
    }
    if (rate.n >= 30) throw new AppError(429, "创建过于频繁，请稍后重试");
    rate.n++;
    res
      .status(201)
      .json(create("customer", "客户（填写方式为自述）", b.createKey));
  });
  app.get("/api/intakes/:id", (req, res) => res.json(detail(customer(req))));
  app.put("/api/intakes/:id", (req, res) => {
    const b = writeSchema.parse(req.body);
    const result = transaction(db, () =>
      save(customer(req), b, "客户（填写方式为自述）"),
    );
    res.json(detail(result));
  });
  app.post("/api/intakes/:id/submit", (req, res) => {
    const b = submitSchema.parse(req.body);
    res.json(detail(submit(customer(req), b, "客户（填写方式为自述）")));
  });
  app.use("/api/admin", auth);
  app.get("/api/admin/intakes", (req, res) => {
    const q = String(req.query.q ?? "").slice(0, 150),
      stage = String(req.query.stage ?? "");
    const rows = db
      .prepare(
        "SELECT * FROM intakes WHERE source != 'test-isolated' AND (?='' OR instr(lower(answers),lower(?))>0 OR instr(id,?)>0) AND (?='' OR stage=?) ORDER BY updated DESC LIMIT 200",
      )
      .all(q, q, q, stage, stage) as Intake[];
    res.json({
      records: rows.map((r) => ({
        id: r.id,
        organization: JSON.parse(r.answers).organization ?? "未命名需求",
        industry: JSON.parse(r.answers).industry ?? "",
        status: r.status,
        stage: r.stage,
        source: r.source,
        updated: r.updated,
      })),
      limit: 200,
    });
  });
  app.post("/api/admin/intakes", (req, res) => {
    const b = z.object({ createKey: key }).strict().parse(req.body);
    const existing = db
      .prepare("SELECT * FROM intakes WHERE create_key=? AND source=?")
      .get(hash(b.createKey), "staff") as Intake | undefined;
    if (existing)
      return res.json({ record: detail(existing), capability: null });
    res
      .status(201)
      .json(
        create("staff", `工作人员：${res.locals.session.name}`, b.createKey),
      );
  });
  app.get("/api/admin/intakes/:id", (req, res) =>
    res.json(detail(byId(String(req.params.id)), true)),
  );
  app.put("/api/admin/intakes/:id", (req, res) => {
    const b = writeSchema.parse(req.body);
    const r = transaction(db, () =>
      save(
        byId(String(req.params.id)),
        b,
        `工作人员：${res.locals.session.name}`,
      ),
    );
    res.json(detail(r, true));
  });
  app.post("/api/admin/intakes/:id/submit", (req, res) => {
    const b = submitSchema.parse(req.body);
    res.json(
      detail(
        submit(
          byId(String(req.params.id)),
          b,
          `工作人员：${res.locals.session.name}`,
        ),
        true,
      ),
    );
  });
  app.post("/api/admin/intakes/:id/notes", (req, res) => {
    const b = z
      .object({ body: z.string().trim().min(1).max(4000) })
      .strict()
      .parse(req.body);
    const r = byId(String(req.params.id));
    transaction(db, () => {
      db.prepare("INSERT INTO notes VALUES(?,?,?,?,?)").run(
        randomUUID(),
        r.id,
        b.body,
        `工作人员：${res.locals.session.name}`,
        now(),
      );
      audit(res.locals.session.name, "add-note", r.id);
    });
    res.status(201).json(detail(r, true));
  });
  app.patch("/api/admin/intakes/:id/stage", (req, res) => {
    const b = z
      .object({ stage: z.string().refine((v) => stages.includes(v)) })
      .strict()
      .parse(req.body);
    const r = byId(String(req.params.id));
    transaction(db, () => {
      db.prepare("UPDATE intakes SET stage=?,updated=? WHERE id=?").run(
        b.stage,
        now(),
        r.id,
      );
      audit(res.locals.session.name, "stage:" + b.stage, r.id);
    });
    res.json(detail(byId(r.id), true));
  });
  app.get("/api/admin/export.csv", (req, res) => {
    const rows = db
      .prepare(
        "SELECT * FROM intakes WHERE source != 'test-isolated' ORDER BY updated DESC",
      )
      .all() as Intake[];
    audit(res.locals.session.name, "export-csv", "all");
    const csv = [
      ["编号", "团队", "行业", "问题", "状态", "跟进阶段", "更新时间"]
        .map(csvCell)
        .join(","),
      ...rows.map((r) => {
        const a = JSON.parse(r.answers);
        return [
          r.id,
          a.organization,
          a.industry,
          a.problem,
          r.status,
          r.stage,
          r.updated,
        ]
          .map(csvCell)
          .join(",");
      }),
    ].join("\r\n");
    res
      .type("text/csv")
      .attachment("fde-intakes.csv")
      .send("\uFEFF" + csv);
  });
  app.get("/api/admin/intakes/:id/export", (req, res) => {
    const r = byId(String(req.params.id)),
      d = detail(r, true);
    if (!("summary" in d)) throw new AppError(500, "导出失败");
    audit(res.locals.session.name, "export-record", r.id);
    if (req.query.format === "json")
      return res
        .type("application/json")
        .attachment("intake-" + r.id + ".json")
        .send(JSON.stringify(d, null, 2));
    const lines = [
      "# 需求记录",
      `编号：${r.id}`,
      `阶段：${r.stage}`,
      `来源：${r.actor}`,
      "",
      "## 规则整理（当前工作草稿）",
      d.summary.statement,
      ...d.summary.items.map((i) => `${i.label}：${i.value}`),
      "",
      "## 下次访谈问题",
      ...d.summary.questions.map((q) => "- " + q),
      "",
      "## 提交原文版本",
      ...d.submissions.flatMap((s: any) => [
        `版本 ${s.version} / ${s.created} / ${s.actor}`,
        JSON.stringify(s.answers, null, 2),
      ]),
      "",
      "## 工作人员备注",
      ...d.notes.flatMap((n: any) => [`${n.created} / ${n.actor}`, n.body]),
    ];
    res
      .type("text/plain")
      .attachment("intake-" + r.id + ".md")
      .send(lines.join("\n"));
  });
  app.get("/api/admin/audit", (_req, res) =>
    res.json({
      events: db
        .prepare("SELECT * FROM audit ORDER BY created DESC LIMIT 200")
        .all(),
    }),
  );
  options.install?.(app, db, auth);
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false }));
    app.get(/.*/, (_req, res) =>
      res.sendFile(resolve(staticDir, "index.html")),
    );
  }
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      err instanceof AppError
        ? err.status
        : err instanceof z.ZodError
          ? 400
          : err.type === "entity.too.large"
            ? 413
            : err.status === 400
              ? 400
              : 500;
    res.status(status).json({
      error:
        status === 500
          ? "保存或读取失败，请保留当前内容后重试。"
          : err instanceof z.ZodError
            ? "字段格式不正确或包含不允许的字段"
            : err.type === "entity.too.large"
              ? "内容过长"
              : err.message,
    });
  });
  return { app, db };
}
