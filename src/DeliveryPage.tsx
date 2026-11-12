import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, download, key, setCsrf, type Intake } from "./api";
import type {
  Workspace,
  DeliveryState,
  Requirement,
  QuoteStage,
  Change,
  DeliveryExport,
} from "./delivery-types";
const newId = () => crypto.randomUUID();
const fen = (v: number | null) =>
  v === null ? "待估" : (v / 100).toFixed(2) + "元";
async function hashText(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function numeric(v: any, money = false) {
  if (v === null || v === "") return null;
  if (typeof v === "number") return v;
  if (!(money ? /^\d+(\.\d{1,2})?$/ : /^\d+$/).test(v))
    throw new Error("金额最多两位小数，分钟与费率需为有效非负数；编辑已保留");
  if (money) {
    const [a, b = ""] = v.split(".");
    return Number(a) * 100 + Number(b.padEnd(2, "0"));
  }
  return Number(v);
}
export function DeliveryPage() {
  const { id = "" } = useParams();
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ["需求与范围", "报价草案", "变更与验收", "资料与备份"];
  const [intake, setIntake] = useState<Intake | null>(null),
    [workspace, setWorkspace] = useState<Workspace | null>(null),
    [draft, setDraft] = useState<DeliveryState | null>(null),
    [source, setSource] = useState(""),
    [dirty, setDirty] = useState<string[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [packs, setPacks] = useState<DeliveryExport[]>([]),
    [resultDrafts, setResultDrafts] = useState<Record<string, any>>({});
  const current = useRef<Workspace | null>(null),
    pending = useRef<any>(null),
    exportPending = useRef<any>(null),
    backupPending = useRef<string | null>(null);
  current.current = workspace;
  const base = "/api/admin/intakes/" + id + "/delivery";
  async function load(initial = false) {
    const auth = await api<{ csrf: string }>("/api/auth/me");
    setCsrf(auth.csrf);
    const i = await api<Intake>("/api/admin/intakes/" + id);
    setIntake(i);
    if (!source) setSource(i.submissions[0]?.id ?? "");
    try {
      const w = await api<Workspace>(base);
      current.current = w;
      setWorkspace(w);
      if (initial) setDraft(structuredClone(w.state));
    } catch (e: any) {
      if (!String(e.message).includes("工作台不存在")) throw e;
    }
  }
  useEffect(() => {
    load(true)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(part: string, fn: (s: DeliveryState) => void) {
    setDraft((d) => {
      const v = structuredClone(d!);
      fn(v);
      return v;
    });
    setDirty((v) => [...new Set([...v, part])]);
    setMessage("");
  }
  function editRecord(
    collection: string,
    index: number,
    field: string,
    value: any,
  ) {
    edit(collection, (s) => {
      (s as any)[collection][index][field] = value;
    });
  }
  async function perform(op: string, args: any = {}) {
    const w = current.current!;
    if (pending.current) throw new Error("上一请求结果未明，请先核实上次提交");
    const body = { revision: w.revision, requestKey: key(), op, args };
    if (new TextEncoder().encode(JSON.stringify(body)).length > 40960)
      throw new Error("提交块超过40KiB，请拆小；当前编辑保留");
    pending.current = body;
    try {
      const result = await api<Workspace>(base + "/" + w.id + "/actions", {
        method: "POST",
        body,
      });
      pending.current = null;
      current.current = result;
      setWorkspace(result);
      return result;
    } catch (e) {
      try {
        const r = await api<any>(
          base + "/" + w.id + "/actions/" + op + "/" + body.requestKey,
        );
        if (r.committed) {
          pending.current = null;
          current.current = r.result;
          setWorkspace(r.result);
          return r.result;
        }
        pending.current = null;
      } catch {}
      throw e;
    }
  }
  async function task(fn: () => Promise<void>) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function savePart(part: string) {
    if (part === "results") {
      for (const v of Object.values(resultDrafts))
        await perform("recordResult", {
          id: v.id,
          status: v.status,
          result: v.result,
          evidence: v.evidence,
          testedVersion: v.testedVersion,
        });
      setResultDrafts({});
    } else if (part === "scopeMeta")
      await perform("scopeMeta", draft!.scopeMeta);
    else {
      const collection = part as
        "questions" | "requirements" | "quoteStages" | "changes";
      let records: any[] = structuredClone(draft![collection]);
      if (collection === "quoteStages")
        records = records.map((v) => ({
          ...v,
          saleFen: numeric(v.saleFen, true),
          costFen: numeric(v.costFen, true),
          minutes: numeric(v.minutes),
          rateFen: numeric(v.rateFen, true),
        }));
      const ids = new Set(records.map((v) => v.id)),
        remove = (current.current!.state[collection] as any[])
          .filter((v) => !ids.has(v.id))
          .map((v) => v.id);
      if (collection === "changes")
        records = records.filter((v) => v.status !== "accepted");
      for (let offset = 0; offset < remove.length; offset += 5)
        await perform("patch", {
          collection,
          records: [],
          removeIds: remove.slice(offset, offset + 5),
        });
      while (records.length) {
        let n = Math.min(5, records.length);
        while (
          n > 0 &&
          new TextEncoder().encode(JSON.stringify(records.slice(0, n))).length >
            40000
        )
          n--;
        if (!n) throw new Error("单条记录超过允许字节，编辑已保留");
        await perform("patch", {
          collection,
          records: records.slice(0, n),
          removeIds: [],
        });
        records = records.slice(n);
      }
    }
    setDirty((v) => v.filter((k) => k !== part));
  }
  async function saveAll() {
    for (const part of dirty) await savePart(part);
    setMessage("所有修改已保存");
  }
  async function action(op: string, args: any = {}) {
    if (dirty.length && op !== "revokePublic")
      throw new Error("请先保存所有修改，操作只使用服务器已保存修订");
    const w = await perform(op, args);
    if (op !== "revokePublic") setDraft(structuredClone(w.state));
    setMessage("操作已保存 · 修订 " + w.revision);
  }
  function rescue() {
    const text = JSON.stringify(
      {
        status: "UNSUBMITTED",
        intakeId: id,
        baseRevision: workspace?.revision,
        dirtySections: dirty,
        editing: draft,
        resultEditing: resultDrafts,
      },
      null,
      2,
    );
    const u = URL.createObjectURL(
        new Blob([text], { type: "text/plain;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = u;
    a.download = "未提交编辑文本.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  async function exportPack(mode: "internal" | "customer") {
    if (dirty.length)
      throw new Error("请先保存或下载未提交文本，再导出已保存资料");
    const w = current.current!;
    if (
      exportPending.current &&
      (exportPending.current.mode !== mode ||
        exportPending.current.revision !== w.revision)
    )
      throw new Error("上次导出结果未明，请先核实；不能用新正文混入旧包");
    const body = exportPending.current ?? {
      mode,
      revision: w.revision,
      exportId: newId(),
    };
    exportPending.current = body;
    const p = await api<DeliveryExport>(base + "/" + w.id + "/exports", {
      method: "POST",
      body,
    });
    exportPending.current = null;
    setPacks((v) => [p, ...v]);
    if (p.status !== "COMPLETED")
      throw new Error(p.error ?? "资料包未完成，现场已保留");
    setMessage("资料包已完成，下载前仍会校验许可");
  }
  const button = (label: string, fn: () => Promise<void>) => (
    <button
      disabled={busy || !!workspace?.readOnlyReason}
      onClick={() => task(fn)}
    >
      {label}
    </button>
  );
  const partSave = (part: string) => (
    <button
      disabled={busy || !dirty.includes(part) || !!workspace?.readOnlyReason}
      onClick={() =>
        task(async () => {
          await savePart(part);
          setMessage("本段已保存");
        })
      }
    >
      保存本段
    </button>
  );
  const remove = (collection: string, index: number) =>
    edit(collection, (s) => {
      (s as any)[collection].splice(index, 1);
    });
  const refs = workspace
    ? workspace.snapshots.filter((v) => v.kind === "scope")
    : [];
  if (loading)
    return (
      <main className="shell">
        <p role="status">正在读取交付资料…</p>
      </main>
    );
  return (
    <main className="shell delivery-shell">
      <Link className="back-link" to={"/admin/intakes/" + id}>
        返回需求记录
      </Link>
      <div className="page-heading">
        <div>
          <h1>交付资料</h1>
          <p className="lead">
            {intake?.answers.organization as string} ·
            按范围、报价、验收整理项目
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="notice error">
          {error} · 编辑仍保留，可下载未提交文本。
        </div>
      )}
      {message && (
        <div role="status" className="notice success">
          {message}
        </div>
      )}
      <div className="delivery-toolbar">
        <strong>
          {workspace ? "保存修订 " + workspace.revision : "尚未建立工作台"} ·{" "}
          {dirty.length ? "有未保存修改" : "已保存"}
        </strong>
        {workspace && (
          <>
            <button
              disabled={busy || !dirty.length}
              onClick={() => task(saveAll)}
            >
              保存所有修改
            </button>
            <button onClick={rescue}>下载未提交文本</button>
            <button
              disabled={busy}
              onClick={() =>
                task(async () => {
                  await load(false);
                  setMessage(
                    "已读取最新修订，编辑草稿未覆盖；请核对后保存或重基",
                  );
                })
              }
            >
              核对新修订
            </button>
            <button
              disabled={busy}
              onClick={() =>
                task(async () => {
                  if (!pending.current) {
                    setMessage("没有待核请求");
                    return;
                  }
                  const b = pending.current,
                    r = await api<any>(
                      base +
                        "/" +
                        workspace.id +
                        "/actions/" +
                        b.op +
                        "/" +
                        b.requestKey,
                    );
                  pending.current = null;
                  if (r.committed) {
                    current.current = r.result;
                    setWorkspace(r.result);
                  }
                  setMessage(
                    r.committed
                      ? "原请求已提交，编辑仍保留"
                      : "原请求未提交，可重试",
                  );
                })
              }
            >
              核实上次提交
            </button>
          </>
        )}
      </div>
      {workspace?.readOnlyReason && (
        <div role="alert" className="notice error">
          {workspace.readOnlyReason}
        </div>
      )}
      <div
        className="delivery-tabs"
        role="tablist"
        aria-label="交付资料导航"
        style={{ "--tab-index": activeTab } as React.CSSProperties}
      >
        {tabs.map((name, i) => (
          <button
            key={name}
            id={"delivery-tab-" + i}
            role="tab"
            aria-selected={activeTab === i}
            aria-controls={"delivery-panel-" + i}
            tabIndex={activeTab === i ? 0 : -1}
            disabled={!workspace && i > 0}
            onClick={() => setActiveTab(i)}
            onKeyDown={(e) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? 3
                    : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
              if (!workspace && next > 0) return;
              setActiveTab(next);
              document.getElementById("delivery-tab-" + next)?.focus();
            }}
          >
            {name}
          </button>
        ))}
        <span className="tab-indicator" aria-hidden="true" />
      </div>
      <fieldset
        className="delivery-fields"
        disabled={busy || !!workspace?.readOnlyReason}
      >
        <section
          className="panel delivery-block"
          id="delivery-panel-0"
          role="tabpanel"
          aria-labelledby="delivery-tab-0"
          hidden={activeTab !== 0}
        >
          <h2>需求与范围</h2>
          <p className="muted small">
            选原文不会自动切换。内部冻结不代表客户确认；关键未知可先作为有条件调研。
          </p>
          <label>
            {intake?.source === "project"
              ? "采用的项目资料版本"
              : "采用的提交原文"}
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {intake?.submissions.map((s) => (
                <option key={s.id} value={s.id}>
                  原文版本 {s.version} · {s.created}
                </option>
              ))}
            </select>
          </label>
          {!workspace ? (
            <button
              disabled={busy || !source}
              onClick={() =>
                task(async () => {
                  const w = await api<Workspace>(base, {
                    method: "POST",
                    body: { submissionId: source },
                  });
                  current.current = w;
                  setWorkspace(w);
                  setDraft(structuredClone(w.state));
                  setMessage("工作台已建立");
                })
              }
            >
              建立工作台
            </button>
          ) : (
            button("采用这个原文版本", () =>
              action("switchSource", { submissionId: source }),
            )
          )}
          {workspace && draft && (
            <>
              <p className="small">
                原文快照：
                {workspace.snapshots
                  .filter((v) => v.kind === "source")
                  .map((v) => `v${v.version}（原提交${v.payload.version}）`)
                  .join(" / ")}{" "}
                · 当前来源{workspace.sourceValid ? "可核" : "需复核"}
              </p>
              <div className="delivery-grid">
                <label>
                  本阶段目标
                  <textarea
                    maxLength={1000}
                    value={draft.scopeMeta.goal}
                    onChange={(e) =>
                      edit("scopeMeta", (s) => {
                        s.scopeMeta.goal = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  明确不包含
                  <textarea
                    maxLength={1000}
                    value={draft.scopeMeta.excluded}
                    onChange={(e) =>
                      edit("scopeMeta", (s) => {
                        s.scopeMeta.excluded = e.target.value;
                      })
                    }
                  />
                </label>
              </div>
              {partSave("scopeMeta")}
              <h3>待确认问题</h3>
              {draft.questions.map((q, i) => (
                <article className="delivery-item" key={q.id}>
                  <label>
                    问题
                    <input
                      maxLength={1000}
                      value={q.title}
                      onChange={(e) =>
                        editRecord("questions", i, "title", e.target.value)
                      }
                    />
                  </label>
                  <div className="delivery-grid">
                    <label>
                      处理状态
                      <select
                        value={q.status}
                        onChange={(e) =>
                          editRecord("questions", i, "status", e.target.value)
                        }
                      >
                        <option value="open">待问</option>
                        <option value="answered">已记录答复</option>
                        <option value="deferred">明确后置</option>
                      </select>
                    </label>
                    <label>
                      答复与依据
                      <input
                        maxLength={1000}
                        value={q.answer}
                        onChange={(e) =>
                          editRecord("questions", i, "answer", e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={q.blocking}
                      onChange={(e) =>
                        editRecord("questions", i, "blocking", e.target.checked)
                      }
                    />
                    阻断正式开发范围
                  </label>
                  <button
                    className="secondary"
                    onClick={() => remove("questions", i)}
                  >
                    移除此问题草稿
                  </button>
                </article>
              ))}
              <button
                onClick={() =>
                  edit("questions", (s) =>
                    s.questions.push({
                      id: newId(),
                      title: "新增待确认问题",
                      sourceField: "人工整理",
                      blocking: false,
                      requirementIds: [],
                      status: "open",
                      answer: "",
                    }),
                  )
                }
              >
                新增问题
              </button>{" "}
              {partSave("questions")}
              <h3>范围条目 · 输入一次，报价与清单引用</h3>
              {draft.requirements.map((r, i) => (
                <article className="delivery-item" key={r.id}>
                  <label>
                    条目标题
                    <input
                      maxLength={1000}
                      value={r.title}
                      onChange={(e) =>
                        editRecord("requirements", i, "title", e.target.value)
                      }
                    />
                  </label>
                  <div className="delivery-grid">
                    <label>
                      阶段名称
                      <input
                        maxLength={1000}
                        value={r.stage}
                        onChange={(e) =>
                          editRecord("requirements", i, "stage", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      范围归类
                      <select
                        value={r.status}
                        onChange={(e) =>
                          editRecord(
                            "requirements",
                            i,
                            "status",
                            e.target.value,
                          )
                        }
                      >
                        <option value="included">本阶段包含</option>
                        <option value="later">后置</option>
                        <option value="excluded">不做</option>
                      </select>
                    </label>
                    <label>
                      工作类型
                      <select
                        value={r.kind}
                        onChange={(e) =>
                          editRecord("requirements", i, "kind", e.target.value)
                        }
                      >
                        <option value="build">正式建设</option>
                        <option value="research">调研验证</option>
                      </select>
                    </label>
                    <label>
                      来自原文字段
                      <input
                        maxLength={1000}
                        value={r.sourceField}
                        onChange={(e) =>
                          editRecord(
                            "requirements",
                            i,
                            "sourceField",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="delivery-grid">
                    <label>
                      交付物
                      <textarea
                        maxLength={1000}
                        value={r.deliverable}
                        onChange={(e) =>
                          editRecord(
                            "requirements",
                            i,
                            "deliverable",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      验收动作
                      <textarea
                        maxLength={1000}
                        value={r.acceptance}
                        onChange={(e) =>
                          editRecord(
                            "requirements",
                            i,
                            "acceptance",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                  </div>
                  {r.kind === "research" && (
                    <div className="delivery-grid">
                      <label>
                        调研前提
                        <input
                          maxLength={1000}
                          value={r.condition}
                          onChange={(e) =>
                            editRecord(
                              "requirements",
                              i,
                              "condition",
                              e.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        停止条件
                        <input
                          maxLength={1000}
                          value={r.stop}
                          onChange={(e) =>
                            editRecord(
                              "requirements",
                              i,
                              "stop",
                              e.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                  )}
                  <button
                    className="secondary"
                    onClick={() => remove("requirements", i)}
                  >
                    移除此范围草稿
                  </button>
                </article>
              ))}
              <button
                onClick={() =>
                  edit("requirements", (s) =>
                    s.requirements.push({
                      id: newId(),
                      title: "新范围条目",
                      sourceField: "problem",
                      kind: "build",
                      status: "included",
                      stage: "第一阶段",
                      deliverable: "",
                      acceptance: "",
                      condition: "",
                      stop: "",
                    }),
                  )
                }
              >
                新增范围条目
              </button>{" "}
              {partSave("requirements")}{" "}
              {button("冻结内部范围", () => action("freezeScope"))}
              <p className="small">
                范围版本：
                {refs.map((v) => `S${v.version}`).join(" / ") ||
                  "未冻结"} ·{" "}
                {workspace.alignment.scope
                  ? "当前来源对齐"
                  : "来源或范围需核对"}
              </p>
            </>
          )}
        </section>
        {workspace && draft && (
          <>
            <section
              className="panel delivery-block"
              id="delivery-panel-1"
              role="tabpanel"
              aria-labelledby="delivery-tab-1"
              hidden={activeTab !== 1}
            >
              <h2>
                报价草案 <span className="currency-label">CNY</span>
              </h2>
              <p className="muted small">
                固定销售价与内部估算分开；第三方成本不自动加价。空值待估，显式0需说明。
              </p>
              <button
                onClick={() =>
                  edit("quoteStages", (s) => {
                    const included = (workspace.snapshots.find(
                      (v) => v.id === workspace.state.scope,
                    )?.payload.requirements ?? []) as Requirement[];
                    const groups = [
                      ...new Set(
                        included
                          .filter((v) => v.status === "included")
                          .map((v) => v.stage),
                      ),
                    ];
                    s.quoteStages = groups.map((title) => {
                      const prior = s.quoteStages.find(
                        (v) => v.title === title,
                      );
                      return {
                        ...(prior ?? {
                          id: newId(),
                          saleFen: null,
                          minutes: null,
                          rateFen: null,
                          costFen: null,
                          costState: "unknown",
                          costPayer: "unknown",
                          zeroReason: "",
                        }),
                        title,
                        requirementIds: included
                          .filter(
                            (v) => v.status === "included" && v.stage === title,
                          )
                          .map((v) => v.id),
                      } as QuoteStage;
                    });
                  })
                }
              >
                从当前范围带入报价阶段
              </button>
              {draft.quoteStages.map((q, i) => (
                <article className="delivery-item" key={q.id}>
                  <h3>{q.title}</h3>
                  <div className="delivery-grid">
                    {(
                      [
                        ["saleFen", "固定销售价（元）"],
                        ["minutes", "内部估算分钟"],
                        ["rateFen", "内部费率（元／小时）"],
                        ["costFen", "第三方固定成本（元）"],
                      ] as const
                    ).map(([f, label]) => (
                      <label key={f}>
                        {label}
                        <input
                          inputMode="decimal"
                          value={
                            q[f] === null
                              ? ""
                              : typeof q[f] === "string"
                                ? q[f]!
                                : f === "minutes"
                                  ? q[f]!
                                  : String(q[f]! / 100)
                          }
                          onChange={(e) =>
                            editRecord(
                              "quoteStages",
                              i,
                              f,
                              e.target.value as any,
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="delivery-grid">
                    <label>
                      成本信息
                      <select
                        value={q.costState}
                        onChange={(e) =>
                          editRecord(
                            "quoteStages",
                            i,
                            "costState",
                            e.target.value,
                          )
                        }
                      >
                        <option value="unknown">待确认</option>
                        <option value="known">已知金额</option>
                        <option value="na">明确不适用</option>
                      </select>
                    </label>
                    <label>
                      成本责任方
                      <select
                        value={q.costPayer}
                        onChange={(e) =>
                          editRecord(
                            "quoteStages",
                            i,
                            "costPayer",
                            e.target.value,
                          )
                        }
                      >
                        <option value="unknown">待确认</option>
                        <option value="eli">Eli承担</option>
                        <option value="customer">客户直付</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    显式0或免费说明
                    <input
                      maxLength={1000}
                      value={q.zeroReason}
                      onChange={(e) =>
                        editRecord(
                          "quoteStages",
                          i,
                          "zeroReason",
                          e.target.value,
                        )
                      }
                    />
                  </label>
                </article>
              ))}
              {partSave("quoteStages")}{" "}
              {button("保存报价版本", () => action("saveQuote"))}
              {workspace.quoteTotals && (
                <div className="notice">
                  <strong>
                    总销售报价：{fen(workspace.quoteTotals.saleTotalFen)}
                  </strong>
                  <p>
                    已填写部分小计：{fen(workspace.quoteTotals.saleSubtotalFen)}
                    （不是待估时的总报价）
                  </p>
                  <p className="muted small">
                    内部估算：{fen(workspace.quoteTotals.estimateTotalFen)} ·
                    内部已填小计{" "}
                    {fen(workspace.quoteTotals.estimateSubtotalFen)} ·{" "}
                    {workspace.alignment.quote
                      ? "与当前范围对齐"
                      : "旧报价，需核对新基线"}
                  </p>
                </div>
              )}
            </section>
            <section
              className="panel delivery-block"
              id="delivery-panel-2"
              role="tabpanel"
              aria-labelledby="delivery-tab-2"
              hidden={activeTab !== 2}
            >
              <h2>变更与验收</h2>
              <p className="muted small">
                先保存范围，再采纳变更。遇到版本冲突时，提案会保留；新建验收清单需重新检查。
              </p>
              {draft.changes.map((c, i) => (
                <article className="delivery-item" key={c.id}>
                  <label>
                    变更内容
                    <input
                      maxLength={1000}
                      value={c.title}
                      readOnly={c.status === "accepted"}
                      onChange={(e) =>
                        editRecord("changes", i, "title", e.target.value)
                      }
                    />
                  </label>
                  <div className="delivery-grid">
                    <label>
                      原因
                      <input
                        maxLength={1000}
                        value={c.reason}
                        readOnly={c.status === "accepted"}
                        onChange={(e) =>
                          editRecord("changes", i, "reason", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      范围、时间与成本影响
                      <input
                        maxLength={1000}
                        value={c.impact}
                        readOnly={c.status === "accepted"}
                        onChange={(e) =>
                          editRecord("changes", i, "impact", e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <p className="small">
                    {c.status === "accepted"
                      ? "已采纳，记录不可改写"
                      : "待决定"}{" "}
                    ·{" "}
                    {c.baseScopeId === workspace.state.scope
                      ? "基线当前"
                      : "基线已变，需重基"}
                  </p>
                  {c.status !== "accepted" && (
                    <>
                      <button
                        onClick={() =>
                          editRecord(
                            "changes",
                            i,
                            "baseScopeId",
                            workspace.state.scope ?? "",
                          )
                        }
                      >
                        将此提案重基到当前范围
                      </button>{" "}
                      {button("采纳变更并重建基线", () =>
                        action("adoptChange", { changeId: c.id }),
                      )}
                    </>
                  )}
                </article>
              ))}
              <button
                onClick={() =>
                  edit("changes", (s) =>
                    s.changes.push({
                      id: newId(),
                      title: "新变更提案",
                      reason: "",
                      impact: "",
                      baseScopeId: workspace.state.scope ?? "",
                      status: "pending",
                    }),
                  )
                }
              >
                新增变更
              </button>{" "}
              {partSave("changes")}
              <h3>当前范围的验收</h3>
              {button("从当前范围重建未测清单", () => action("buildPlan"))}
              <p className="small">
                {workspace.alignment.plan
                  ? "清单与基线对齐"
                  : "旧清单需重建，旧结果仍可回看"}
              </p>
              {workspace.snapshots
                .find((v) => v.id === workspace.state.plan)
                ?.payload.items.map((v: any) => (
                  <ResultItem
                    key={v.id}
                    item={resultDrafts[v.id] ?? v}
                    edit={(value) => {
                      setResultDrafts((d) => ({ ...d, [v.id]: value }));
                      setDirty((d) => [...new Set([...d, "results"])]);
                    }}
                    busy={
                      busy ||
                      !workspace.alignment.plan ||
                      !!workspace.readOnlyReason
                    }
                    save={(args) =>
                      task(async () => {
                        if (dirty.some((d) => d !== "results"))
                          throw new Error("请先保存其他修改");
                        await perform("recordResult", args);
                        setResultDrafts((d) => {
                          const next = { ...d };
                          delete next[v.id];
                          if (!Object.keys(next).length)
                            setDirty((items) =>
                              items.filter((k) => k !== "results"),
                            );
                          return next;
                        });
                        setMessage("验收记录已保存");
                      })
                    }
                  />
                ))}
            </section>
            <section
              className="panel delivery-block"
              id="delivery-panel-3"
              role="tabpanel"
              aria-labelledby="delivery-tab-3"
              hidden={activeTab !== 3}
            >
              <h2>资料与备份</h2>
              <p className="muted small">
                内部JSON／Markdown与对客Markdown独立，JSON不是数据库备份。对客包不包含成本、费率或内部备注。
              </p>
              <details>
                <summary>查看对客文本，按当前版本复核</summary>
                <pre className="delivery-preview">
                  {workspace.publicPreview ||
                    "请先冻结范围、保存报价版本并建立清单"}
                </pre>
              </details>
              <p className="small">
                {workspace.publicApprovalValid
                  ? "本次运行已核准当前文本"
                  : "旧许可仅历史或未核准，本次需复核文本与版本"}
              </p>
              {button("核准当前对客草案", async () =>
                action("approvePublic", {
                  textHash: await hashText(workspace.publicPreview),
                }),
              )}{" "}
              {button("撤销对客许可", () => action("revokePublic"))}
              <div className="delivery-toolbar">
                {button("生成内部资料包", () => exportPack("internal"))}{" "}
                {button("生成对客沟通包", () => exportPack("customer"))}{" "}
                {button("核实上次导出", async () => {
                  const b = exportPending.current;
                  if (!b) {
                    setMessage("没有待核导出");
                    return;
                  }
                  const p = await api<DeliveryExport>(
                    base +
                      "/" +
                      workspace.id +
                      "/exports/" +
                      b.exportId +
                      "/status",
                  );
                  exportPending.current = null;
                  setPacks((items) => [
                    p,
                    ...items.filter((v) => v.exportId !== p.exportId),
                  ]);
                  setMessage("已核实导出状态：" + p.status);
                })}
                {button("一致备份两库", async () => {
                  if (dirty.length) throw new Error("请先保存或下载未提交文本");
                  const batchId = backupPending.current ?? newId();
                  backupPending.current = batchId;
                  const b = await api<any>(
                    "/api/admin/delivery-system/backup",
                    { method: "POST", body: { batchId } },
                  );
                  backupPending.current = null;
                  if (b.status !== "COMPLETED") throw new Error(b.error);
                  setMessage("双库一致备份完成 · 批次 " + b.exportId);
                })}
              </div>
              {packs.map((p) => (
                <article className="delivery-item" key={p.exportId}>
                  <strong>
                    {p.privacyMode === "customer" ? "对客草案" : "内部资料"} ·{" "}
                    {p.status}
                  </strong>
                  <p className="small">{p.exportId}</p>
                  {p.status === "COMPLETED" &&
                    [
                      ...p.files.map((f) => f.relativePath),
                      "manifest.json",
                    ].map((name) => (
                      <button
                        key={name}
                        onClick={() =>
                          task(async () => {
                            await download(
                              base +
                                "/" +
                                workspace.id +
                                "/exports/" +
                                p.exportId +
                                "/" +
                                name,
                              name,
                            );
                            setMessage("下载请求完成，许可已校验");
                          })
                        }
                      >
                        下载 {name}
                      </button>
                    ))}
                </article>
              ))}
              <details>
                <summary>不可变版本历史</summary>
                {workspace.snapshots.map((v) => (
                  <details key={v.id}>
                    <summary>
                      {v.kind} v{v.version} · {v.created}
                    </summary>
                    <pre className="delivery-preview">
                      {JSON.stringify(v.payload, null, 2)}
                    </pre>
                  </details>
                ))}
              </details>
            </section>
          </>
        )}
      </fieldset>
    </main>
  );
}
function ResultItem({
  item,
  busy,
  save,
  edit,
}: {
  item: any;
  busy: boolean;
  edit: (v: any) => void;
  save: (v: any) => Promise<void>;
}) {
  const v = item,
    set = edit;
  return (
    <article className="delivery-item">
      <h3>{v.title}</h3>
      <p>{v.action}</p>
      <label>
        验收记录状态
        <select
          value={v.status}
          onChange={(e) => set({ ...v, status: e.target.value })}
        >
          <option value="unmeasured">未测</option>
          <option value="passed">记录通过</option>
          <option value="failed">未通过</option>
          <option value="na">不适用</option>
        </select>
      </label>
      <label>
        实际结果或原因
        <input
          maxLength={1000}
          value={v.result}
          onChange={(e) => set({ ...v, result: e.target.value })}
        />
      </label>
      <div className="delivery-grid">
        <label>
          证据定位
          <input
            maxLength={1000}
            value={v.evidence}
            onChange={(e) => set({ ...v, evidence: e.target.value })}
          />
        </label>
        <label>
          受测版本
          <input
            maxLength={1000}
            value={v.testedVersion}
            onChange={(e) => set({ ...v, testedVersion: e.target.value })}
          />
        </label>
      </div>
      <button
        disabled={busy}
        onClick={() =>
          save({
            id: v.id,
            status: v.status,
            result: v.result,
            evidence: v.evidence,
            testedVersion: v.testedVersion,
          })
        }
      >
        保存验收记录
      </button>
      <p className="small">{v.actor && `${v.actor} · ${v.created}`}</p>
    </article>
  );
}
