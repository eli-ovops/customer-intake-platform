import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useNavigate,
  useParams,
  NavLink,
  useLocation,
} from "react-router-dom";
import type { Model } from "survey-core";
import { SurveyForm } from "./SurveyForm";
import { DeliveryPage } from "./DeliveryPage";
import { api, setCsrf, download, key, type Intake } from "./api";
import { labels, stages, fields, type Answers } from "./questions";
import "./styles.css";
import "./workbench.css";
import "./questionnaire.css";
import "./portfolio-theme.css";
type User = { name: string; mustChange: boolean; localDemo?: boolean };
const Session = React.createContext<{
  user: User | null;
  refresh: () => Promise<void>;
}>({ user: null, refresh: async () => {} });
const stamp = (v: string) =>
  new Date(v).toLocaleString("zh-CN", { hour12: false });
function Notice({ error, message }: { error?: string; message?: string }) {
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
    </>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    let r = await api<{
      user: User | null;
      csrf?: string;
      localDemo?: boolean;
    }>("/api/auth/me");
    if (!r.user && r.localDemo)
      r = await api("/api/auth/local-session", { method: "POST", body: {} });
    setCsrf(r.csrf ?? "");
    setUser(r.user);
  }, []);
  useEffect(() => {
    const lock = () => {
      if (location.pathname.startsWith("/admin"))
        document.documentElement.dataset.ownerLock = "true";
    };
    const resume = async () => {
      if (
        !location.pathname.startsWith("/admin") ||
        document.visibilityState === "hidden"
      )
        return;
      lock();
      try {
        await refresh();
      } catch {
        setUser(null);
      }
      // React commits the new session before the next animation frame can show
      // an old page restored from browser history.
      requestAnimationFrame(() => {
        delete document.documentElement.dataset.ownerLock;
      });
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") lock();
      else void resume();
    };
    window.addEventListener("pagehide", lock);
    window.addEventListener("blur", lock);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", lock);
      window.removeEventListener("blur", lock);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  useEffect(() => {
    refresh()
      .catch(() => setError("无法连接本机服务，请检查服务是否启动"))
      .finally(() => setLoading(false));
  }, [refresh]);
  return (
    <Session.Provider value={{ user, refresh }}>
      <BrowserRouter>
        <AppFrame>
          {loading ? (
            <main className="shell">
              <p role="status">正在连接本机服务…</p>
            </main>
          ) : error ? (
            <main className="shell">
              <Notice error={error} />
              <button onClick={() => location.reload()}>重新连接</button>
            </main>
          ) : (
            <Routes>
              <Route path="/" element={<IntakePage />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/admin/login" element={<Login />} />
              <Route
                path="/admin"
                element={
                  <Guard>
                    <Dashboard />
                  </Guard>
                }
              />
              <Route
                path="/admin/intakes/:id/delivery"
                element={
                  <Guard>
                    <DeliveryPage />
                  </Guard>
                }
              />
              <Route
                path="/admin/intakes/:id"
                element={
                  <Guard>
                    <Detail />
                  </Guard>
                }
              />
              <Route
                path="/admin/intakes/:id/edit"
                element={
                  <Guard>
                    <IntakePage staff />
                  </Guard>
                }
              />
              <Route
                path="*"
                element={
                  <main className="shell">
                    <h1>没有找到这个页面</h1>
                    <Link to="/">返回需求问卷</Link>
                  </main>
                }
              />
            </Routes>
          )}
        </AppFrame>
      </BrowserRouter>
    </Session.Provider>
  );
}
function Icon({ kind }: { kind: "list" | "edit" | "book" | "arrow" }) {
  const paths = {
    list: "M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01",
    edit: "M15 4l5 5M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15v5Z",
    book: "M12 5v15M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z",
    arrow: "M5 12h14M13 6l6 6-6 6",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
function AppFrame({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation(),
    { user } = React.useContext(Session);
  const admin = pathname.startsWith("/admin");
  const [synthetic, setSynthetic] = useState<boolean | null>(null);
  const [customerUrl, setCustomerUrl] = useState<string>("/");
  useEffect(() => {
    api<{ syntheticOnly?: boolean; customerUrl?: string }>("/api/health")
      .then((r) => {
        setSynthetic(r.syntheticOnly ?? null);
        setCustomerUrl(r.customerUrl ?? "/");
      })
      .catch(() => setSynthetic(null));
  }, []);
  return (
    <div
      className={admin ? "app-frame workbench-frame" : "app-frame public-frame"}
    >
      {admin && (
        <aside className="workspace-rail">
          <Link to="/admin" className="rail-brand">
            Eli<span>FDE</span>
          </Link>
          <p className="rail-caption">客户协作工作台</p>
          <nav aria-label="工作台导航">
            <Link
              to="/admin"
              className={
                pathname === "/admin" ||
                (pathname.startsWith("/admin/intakes/") &&
                  pathname !== "/admin/intakes/new/edit")
                  ? "active"
                  : ""
              }
              aria-current={
                pathname === "/admin" ||
                (pathname.startsWith("/admin/intakes/") &&
                  pathname !== "/admin/intakes/new/edit")
                  ? "page"
                  : undefined
              }
            >
              <Icon kind="list" />
              客户需求
            </Link>
            <NavLink to="/admin/intakes/new/edit">
              <Icon kind="edit" />
              新建需求
            </NavLink>
            <a href={customerUrl}>
              <Icon kind="arrow" />
              客户填写入口
            </a>
            <Link to="/guide">
              <Icon kind="book" />
              使用说明
            </Link>
          </nav>
          <div className="rail-bottom">
            <span className="runtime-dot" />
            本机工作区
            <small>
              {synthetic === true
                ? "虚构样例 · 本地保存"
                : synthetic === false
                  ? "真实项目资料 · 私有保存"
                  : "本地保存"}
            </small>
          </div>
        </aside>
      )}
      <div className="app-content">
        <header className="topbar">
          {admin ? (
            <span className="workspace-location">
              工作台 <span>/</span>{" "}
              {pathname.endsWith("delivery")
                ? "交付资料"
                : pathname.endsWith("edit")
                  ? "需求填写"
                  : pathname === "/admin"
                    ? "客户需求"
                    : "需求记录"}
            </span>
          ) : (
            <Link to="/" className="brand">
              <span className="brandmark" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2v20M2 12h20M5 5l14 14M5 19L19 5"
                    stroke="currentColor"
                    strokeWidth="3.2"
                  />
                </svg>
              </span>
              <span>
                Eli FDE<span className="brand-sub">客户协作</span>
              </span>
            </Link>
          )}
          <nav aria-label="快捷导航">
            {admin && <Link to={user ? "/admin" : "/admin/login"}>工作台</Link>}
            <a href={customerUrl}>需求问卷</a>
            {!admin && <Link to="/guide">使用说明</Link>}
          </nav>
        </header>
        {children}
        <footer className="global-footer">
          Eli FDE · 本地工作区<span>需求记录 / 交付协作</span>
        </footer>
      </div>
    </div>
  );
}
function Guard({ children }: { children: React.ReactNode }) {
  const { user } = React.useContext(Session);
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.mustChange) return <ChangePassword />;
  return <>{children}</>;
}
function Login() {
  const { user, refresh } = React.useContext(Session),
    nav = useNavigate();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [localApproval, setLocalApproval] = useState(false);
  useEffect(() => {
    api<{ ownerApproval?: boolean }>("/api/health")
      .then((r) => setLocalApproval(!!r.ownerApproval))
      .catch(() => {});
  }, []);
  if (user) return <Navigate to="/admin" replace />;
  if (localApproval) return <LocalOwnerAccess onAuthorized={refresh} />;
  return (
    <main className="auth-layout">
      <div className="eyebrow">工作人员入口</div>
      <h1>继续你的客户协作</h1>
      <p className="muted">
        客户填写无需登录。只有这里认证后的操作才记为工作人员。
      </p>
      <form
        className="panel auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const r = await api<{ csrf: string }>("/api/auth/login", {
              method: "POST",
              body: { name: data.get("name"), password: data.get("password") },
            });
            setCsrf(r.csrf);
            await refresh();
            nav("/admin");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          账号
          <input
            name="name"
            defaultValue="owner"
            autoComplete="username"
            required
          />
        </label>
        <label>
          密码
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
        <Notice error={error} />
        <button className="primary" disabled={busy}>
          {busy ? "正在登录…" : "登录工作台"}
        </button>
        <p className="small muted">
          首次凭据在本项目 data/admin-setup.txt，本页不显示初始密码。
        </p>
      </form>
    </main>
  );
}
function LocalOwnerAccess({
  onAuthorized,
}: {
  onAuthorized: () => Promise<void>;
}) {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) return;
    const id = setInterval(async () => {
      try {
        const result = await api<{ state: string }>(
          "/api/auth/owner-request/status",
        );
        if (result.state === "authorized") {
          clearInterval(id);
          await onAuthorized();
        }
      } catch (e) {
        clearInterval(id);
        setError((e as Error).message);
        setCode("");
      }
    }, 1500);
    return () => clearInterval(id);
  }, [code, onAuthorized]);
  return (
    <main className="auth-layout">
      <h1>本人工作台授权</h1>
      <p className="muted">
        客户填写不需要授权。查看内部客户资料，需由本人在这台电脑上确认。
      </p>
      <section className="panel auth-form">
        <Notice error={error} />
        {code ? (
          <>
            <p>
              双击项目中的 <strong>Authorize-Workbench.command</strong>
              ，输入下面的授权编号。
            </p>
            <output className="owner-approval-code" aria-label="授权编号">
              {code}
            </output>
            <p className="small muted">
              编号用于匹配当前浏览器请求，5分钟内有效。本人确认后，本页自动进入工作台。
            </p>
          </>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await api<{ code: string }>(
                  "/api/auth/owner-request",
                  { method: "POST", body: {} },
                );
                setCode(r.code);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "正在申请…" : "申请本机授权"}
          </button>
        )}
      </section>
    </main>
  );
}
function ChangePassword() {
  const { refresh } = React.useContext(Session);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth-layout">
      <h1>先设置自己的密码</h1>
      <p>首次使用必须修改初始化密码，至少12个字符。</p>
      <form
        className="panel auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          if (d.get("next") !== d.get("confirm")) {
            setError("两次新密码不一致");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api("/api/auth/password", {
              method: "POST",
              body: { current: d.get("current"), next: d.get("next") },
            });
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          当前密码
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          新密码
          <input
            name="next"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          再次输入新密码
          <input
            name="confirm"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
        </label>
        <Notice error={error} />
        <button className="primary" disabled={busy}>
          保存新密码
        </button>
      </form>
    </main>
  );
}
type Resume = { id: string; capability: string };
const storage = "fde-active-filling-v2";
function validResume(r: any): r is Resume {
  return (
    !!r &&
    typeof r.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      r.id,
    ) &&
    typeof r.capability === "string" &&
    /^[\w-]{43}$/.test(r.capability)
  );
}
function getResume(): Resume | null {
  try {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has("record") && p.has("key")) {
      const r = { id: p.get("record")!, capability: p.get("key")! };
      if (!validResume(r)) {
        sessionStorage.removeItem(storage);
        return null;
      }
      sessionStorage.setItem(storage, JSON.stringify(r));
      history.replaceState(null, "", location.pathname);
      return r;
    }
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    if (navigation?.type !== "reload") {
      sessionStorage.removeItem(storage);
      return null;
    }
    const r = JSON.parse(sessionStorage.getItem(storage) ?? "null");
    return validResume(r) ? r : null;
  } catch {
    return null;
  }
}
function IntakePage({ staff = false }: { staff?: boolean }) {
  const { id } = useParams(),
    nav = useNavigate();
  const [formIdentity, setFormIdentity] = useState(key()),
    [record, setRecord] = useState<Intake | null>(null),
    [answers, setAnswers] = useState<Answers>({}),
    [mode, setMode] = useState<"simple" | "detailed">("simple"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [outcome, setOutcome] = useState<"draft" | "submit" | null>(null),
    [actionError, setActionError] = useState(false),
    [validationError, setValidationError] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const actionErrorRef = useRef<HTMLDivElement>(null);
  const [initialCredential] = useState<Resume | null>(() =>
    staff ? null : getResume(),
  );
  const [resumeVersion, setResumeVersion] = useState(0);
  const credential = useRef<Resume | null>(initialCredential),
    createKey = useRef(key()),
    submissionKey = useRef<string | null>(null),
    model = useRef<Model | null>(null);
  useEffect(() => {
    if (staff) return;
    const explicitRevisit = () => {
      const params = new URLSearchParams(location.hash.slice(1));
      if (!params.has("record") || !params.has("key")) return;
      if (dirty && !confirm("当前有未保存内容。是否切换到本人回访记录？")) {
        history.replaceState(null, "", location.pathname);
        return;
      }
      const resume = getResume();
      if (!resume) return;
      credential.current = resume;
      setLoading(true);
      setRecord(null);
      setAnswers({});
      setFormIdentity(key());
      setDirty(false);
      setOutcome(null);
      setMessage("");
      setError("");
      setResumeVersion((v) => v + 1);
    };
    const hide = () => {
      document.documentElement.dataset.customerLock = "true";
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        sessionStorage.removeItem(storage);
        location.replace(location.pathname);
      }
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restore);
    window.addEventListener("hashchange", explicitRevisit);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("hashchange", explicitRevisit);
    };
  }, [staff, dirty]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        let r: Intake | undefined;
        if (staff && id && id !== "new")
          r = await api<Intake>("/api/admin/intakes/" + id);
        else if (!staff && credential.current)
          r = await api<Intake>("/api/intakes/" + credential.current.id, {
            capability: credential.current.capability,
          });
        if (active && r) {
          setRecord(r);
          setAnswers(r.answers);
          setMode(r.mode);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id, staff, resumeVersion]);
  const changed = useCallback((a: Answers) => {
    setAnswers(a);
    setDirty(true);
    setMessage("");
    setOutcome(null);
    submissionKey.current = null;
  }, []);
  const bind = useCallback((m: Model) => {
    model.current = m;
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (outcome && message) {
      receiptRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
      receiptRef.current?.focus({ preventScroll: true });
    }
  }, [outcome, message]);
  useEffect(() => {
    if (actionError && error) {
      actionErrorRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
      actionErrorRef.current?.focus({ preventScroll: true });
    }
  }, [actionError, error]);
  function checkRequired() {
    const m = model.current;
    const q = m
      ?.getAllQuestions()
      .find(
        (q) =>
          q.isVisible && ((q.isRequired && q.isEmpty()) || q.errors.length),
      );
    if (!m || !q) return;
    const page = m.getPageByQuestion(q);
    if (page) m.currentPage = page;
    requestAnimationFrame(() => {
      const input = document.getElementById(q.inputId);
      input?.focus({ preventScroll: true });
      input?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }
  function continueEditing() {
    const progress = document.querySelector<HTMLElement>(
      ".questionnaire-shell .questionnaire-progress",
    );
    progress?.scrollIntoView({ block: "start", behavior: "instant" });
    progress?.focus({ preventScroll: true });
  }
  async function persist(submit: boolean) {
    const currentAnswers: Answers = {};
    for (const f of fields)
      if (model.current?.data[f] !== undefined)
        currentAnswers[f] = structuredClone(model.current.data[f]);
    setAnswers(currentAnswers);
    setError("");
    setMessage("");
    setOutcome(null);
    setActionError(true);
    setValidationError(false);
    if (submit && !String(currentAnswers.problem ?? "").trim()) {
      setValidationError(true);
      setError("请填写带 * 的“目前最想解决的问题”；其余选填内容可以跳过。");
      return;
    }
    if (submit && !model.current?.validate()) {
      setValidationError(true);
      setError("请补齐带 * 的必填题，并检查字段长度和格式。");
      return;
    }
    setBusy(true);
    try {
      let current = record;
      if (!current) {
        const c = await api<{ record: Intake; capability: string | null }>(
          staff ? "/api/admin/intakes" : "/api/intakes",
          { method: "POST", body: { createKey: createKey.current } },
        );
        current = c.record;
        if (!staff && c.capability) {
          credential.current = { id: current.id, capability: c.capability };
          sessionStorage.setItem(storage, JSON.stringify(credential.current));
        }
        setRecord({ ...current, answers: currentAnswers, mode });
      }
      const prefix = staff ? "/api/admin/intakes/" : "/api/intakes/";
      if (submit && !submissionKey.current) submissionKey.current = key();
      const result = await api<Intake>(
        prefix + current.id + (submit ? "/submit" : ""),
        {
          method: submit ? "POST" : "PUT",
          body: {
            answers: currentAnswers,
            mode,
            revision: current.revision,
            ...(submit ? { requestKey: submissionKey.current } : {}),
          },
          capability: staff ? undefined : credential.current?.capability,
        },
      );
      setRecord(result);
      setDirty(false);
      setOutcome(submit ? "submit" : "draft");
      setMessage(
        submit
          ? "已提交。原文版本已保存，你仍可继续补充。"
          : "草稿已保存，可刷新或稍后继续。",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copyResume() {
    setOutcome(null);
    setMessage("");
    setActionError(false);
    setValidationError(false);
    if (!credential.current) {
      setError("请先保存草稿，再复制回访链接。");
      return;
    }
    try {
      const p = new URLSearchParams({
        record: credential.current.id,
        key: credential.current.capability,
      });
      await navigator.clipboard.writeText(
        location.origin + "/#" + p.toString(),
      );
      setMessage("回访链接已复制。它包含访问凭证，请仅交给本人或授权代填者。");
    } catch {
      setError("无法复制。本次填写可刷新继续；请联系工作人员保留回访方式。");
    }
  }
  if (loading)
    return (
      <main className="shell">
        <p role="status">正在读取草稿…</p>
      </main>
    );
  return (
    <main className="shell questionnaire-shell">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {staff ? "认证工作人员代填" : "Eli FDE · 从一次对话开始"}
          </div>
          <h1>{staff ? "为客户整理需求" : "把 AI 变成企业的生产力。"}</h1>
          <p className="lead">
            不用先想清楚技术方案。把现状和期望告诉我们，其余可以在访谈中一起梳理。
          </p>
        </div>
        {staff ? (
          <Link className="button" to="/admin">
            返回工作台
          </Link>
        ) : (
          <span className="local-pill">
            <i />
            本机保存
          </span>
        )}
      </div>
      <div className="intake-layout">
        <aside className="side-guide">
          <div className="eyebrow">填写建议</div>
          <h2>客户需求问卷</h2>
          <p>每步最多 5 题，以选择题为主。带 * 的题目必填，其余可以跳过。</p>
          <ol>
            <li>选择填写模式</li>
            <li>填写团队与需求</li>
            <li>保存草稿或提交</li>
          </ol>
          <div className="aside-note">
            没想清楚，可以选“不确定”。
            <br />
            切换模式会保留已经填写的答案。
          </div>
          <Link to="/guide">数据与使用说明</Link>
        </aside>
        <section className="form-panel">
          <div className="form-toolbar">
            <div className="mode-tabs" role="group" aria-label="问卷模式">
              <button
                aria-label="简单模式"
                disabled={busy}
                className={mode === "simple" ? "active" : ""}
                aria-pressed={mode === "simple"}
                onClick={() => {
                  setMode("simple");
                  submissionKey.current = null;
                  setDirty(true);
                  setMessage("");
                }}
              >
                简单模式
              </button>
              <button
                aria-label="详细模式"
                disabled={busy}
                className={mode === "detailed" ? "active" : ""}
                aria-pressed={mode === "detailed"}
                onClick={() => {
                  setMode("detailed");
                  submissionKey.current = null;
                  setDirty(true);
                  setMessage("");
                }}
              >
                详细模式
              </button>
            </div>
            <span className="save-label">
              {busy
                ? "正在保存…"
                : dirty
                  ? "有未保存内容"
                  : record
                    ? "已载入保存记录"
                    : "尚未保存"}
            </span>
          </div>
          <div className="mode-help">
            <strong>
              {mode === "simple" ? "先说明主要需求" : "深入了解具体场景"}
            </strong>
            <p>
              {mode === "simple"
                ? "填写基础信息和主要问题，适合初次沟通。"
                : "根据客户类型、团队规模、行业和需求方向，补充相关问题。"}
            </p>
            <span>* 必填 · 其余选填</span>
          </div>
          {record && (
            <div className="record-bar">
              {record.status === "submitted"
                ? `已提交 ${record.submissions.length} 个版本 · 可以继续补充`
                : "工作草稿"}{" "}
              <span>最后保存 {stamp(record.updated)}</span>
            </div>
          )}
          <div className="privacy-inline">
            仅用于需求沟通，请勿填写密码、密钥、合同、真实单据或他人的敏感资料。
          </div>
          {error && !actionError && <Notice error={error} />}
          <div className="survey-edit-region" inert={busy} aria-busy={busy}>
            <SurveyForm
              identity={formIdentity}
              mode={mode}
              appearance={staff ? "workbench" : "portfolio"}
              initial={answers}
              onAnswers={changed}
              onModel={bind}
            />
          </div>
          <div className="form-actions">
            <div>
              <p className="small muted">
                保存草稿不会提交；提交会保存一份原文版本。
              </p>
              <Notice message={outcome ? undefined : message} />
              {actionError && error && (
                <div
                  className="form-error-feedback"
                  ref={actionErrorRef}
                  tabIndex={-1}
                >
                  <Notice error={error} />
                  <p className="small muted">
                    填写内容仍保留，请按提示处理后再保存。
                  </p>
                  {validationError && (
                    <button type="button" onClick={checkRequired}>
                      检查必填项
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="action-buttons">
              <button disabled={busy} onClick={() => persist(false)}>
                保存草稿
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => persist(true)}
              >
                {busy
                  ? "正在处理…"
                  : record?.status === "submitted"
                    ? "提交补充版本"
                    : "提交需求"}
              </button>
            </div>
          </div>
          {outcome && message && record && (
            <div
              className="submission-receipt"
              ref={receiptRef}
              tabIndex={-1}
              role="status"
              aria-label={outcome === "submit" ? "提交结果" : "草稿保存结果"}
            >
              <h2>{outcome === "submit" ? "需求已提交" : "草稿已保存"}</h2>
              <p>{message}</p>
              <dl>
                <div>
                  <dt>保存时间</dt>
                  <dd>{stamp(record.updated)}</dd>
                </div>
                <div>
                  <dt>{outcome === "submit" ? "本次提交版本" : "保存方式"}</dt>
                  <dd>
                    {outcome === "submit"
                      ? `第 ${record.submissions.length} 版 · ${record.mode === "simple" ? "简单模式" : "详细模式"}`
                      : "仅保存草稿，不新增提交版本"}
                  </dd>
                </div>
              </dl>
              <p className="receipt-next">
                {outcome === "submit"
                  ? "有遗漏也可以继续修改，再提交补充版本。"
                  : `可以继续填写；准备好后，再点击“${record.status === "submitted" ? "提交补充版本" : "提交需求"}”。`}
              </p>
              <button
                className="receipt-continue"
                type="button"
                onClick={continueEditing}
              >
                {outcome === "submit" ? "继续补充" : "继续填写"}
              </button>
            </div>
          )}
          {!staff && record && (
            <div className="resume-tools">
              <button disabled={busy} onClick={copyResume}>
                复制回访链接
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (
                    dirty &&
                    !confirm("当前有未保存内容。是否放弃本页修改并新建？")
                  )
                    return;
                  sessionStorage.removeItem(storage);
                  history.replaceState(null, "", location.pathname);
                  credential.current = null;
                  createKey.current = key();
                  setFormIdentity(key());
                  setRecord(null);
                  setAnswers({});
                  setMode("simple");
                  setDirty(false);
                  setMessage("");
                  setOutcome(null);
                  setError("");
                  submissionKey.current = null;
                }}
              >
                新建另一份需求
              </button>
              <p className="small muted">
                回访链接等同访问凭证，编号本身不能读取记录。请勿公开链接。
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
function Dashboard() {
  const { refresh, user } = React.useContext(Session),
    nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]),
    [q, setQ] = useState(""),
    [stage, setStage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const r = await api<{ records: any[] }>(
        "/api/admin/intakes?" + new URLSearchParams({ q, stage }),
      );
      if (sequence === loadSequence.current) setRows(r.records);
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [q, stage]);
  useEffect(() => {
    load();
  }, [load]);
  async function logout() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      await refresh();
      nav("/admin/login");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shell dashboard-shell">
      <div className="page-heading">
        <div>
          <h1>客户需求</h1>
          <p className="lead">查看客户提交，安排访谈，继续准备交付。</p>
        </div>
        <div className="action-buttons">
          <Link className="button primary" to="/admin/intakes/new/edit">
            新建需求
          </Link>
          {!user?.localDemo && (
            <button disabled={busy} onClick={logout}>
              退出登录
            </button>
          )}
        </div>
      </div>
      <div className="stats" aria-label="当前筛选概况">
        <div>
          <strong>{rows.length}</strong>
          <span>当前筛选记录</span>
        </div>
        <div>
          <strong>{rows.filter((r) => r.status === "submitted").length}</strong>
          <span>已提交需求</span>
        </div>
        <div>
          <strong>{rows.filter((r) => r.stage === "待访谈").length}</strong>
          <span>待安排访谈</span>
        </div>
      </div>
      <section className="panel records-panel">
        <div className="section-heading">
          <div>
            <h2>需求列表</h2>
            <span className="small muted">{rows.length} 条记录</span>
          </div>
          <button
            type="button"
            onClick={() =>
              download("/api/admin/export.csv", "fde-intakes.csv").catch((e) =>
                setError(e.message),
              )
            }
          >
            导出全部 CSV
          </button>
        </div>
        <form
          className="searchbar"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <label className="search-label">
            搜索需求
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="团队、行业、问题或编号"
            />
          </label>
          <label>
            跟进阶段
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">全部阶段</option>
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="submit">刷新</button>
        </form>
        <Notice error={error} />
        {loading ? (
          <p role="status">正在读取…</p>
        ) : !rows.length ? (
          <div className="empty">
            <h2>这里还没有匹配的需求</h2>
            <p>客户填写并保存后会出现在这里，也可以由工作人员代填。</p>
          </div>
        ) : (
          <div className="record-list">
            <div className="record-columns" aria-hidden="true">
              <span>客户 / 行业</span>
              <span>跟进阶段</span>
            </div>
            {rows.map((r) => (
              <Link
                className="record-item"
                key={r.id}
                to={"/admin/intakes/" + r.id}
              >
                <div>
                  <h2>{r.organization}</h2>
                  <p>
                    {r.industry || "行业待了解"} ·{" "}
                    {r.source === "project"
                      ? "项目资料导入"
                      : r.source === "staff"
                        ? "工作人员代填"
                        : "客户 / 自述代填"}
                  </p>
                  <span className="small muted">{stamp(r.updated)}</span>
                </div>
                <div className="record-tags">
                  <span className="tag">{r.stage}</span>
                  <span className="small">
                    {r.source === "project"
                      ? "待复核资料"
                      : r.status === "submitted"
                        ? "已提交"
                        : "草稿"}
                  </span>
                  <span aria-hidden>↗</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <p className="small muted">
          列表最多显示200条匹配记录；CSV包含全部记录。草稿与已提交分开标记。
        </p>
      </section>
    </main>
  );
}
function Detail() {
  const { id } = useParams();
  const [record, setRecord] = useState<Intake | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(-1);
  useEffect(() => {
    api<Intake>("/api/admin/intakes/" + id)
      .then(setRecord)
      .catch((e) => setError(e.message));
  }, [id]);
  const r = record;
  async function mutate(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setRecord(
        await api<Intake>("/api/admin/intakes/" + id + path, { method, body }),
      );
      setMessage("已保存");
      if (path === "/notes") setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!r)
    return (
      <main className="shell">
        <Notice error={error} />
        {!error && <p role="status">正在读取记录…</p>}
        <Link to="/admin">返回工作台</Link>
      </main>
    );
  const a = version < 0 ? r.answers : (r.submissions[version]?.answers ?? {});
  return (
    <main className="shell">
      <Link className="back-link" to="/admin">
        ← 全部需求
      </Link>
      <div className="page-heading">
        <div>
          <div className={r.source === "project" ? "small muted" : "eyebrow"}>
            {r.source === "project" ? (
              "真实项目资料 · 非客户问卷"
            ) : (
              <>需求记录 · {r.status === "submitted" ? "已提交" : "草稿"}</>
            )}
          </div>
          <h1>{String(r.answers.organization ?? "未命名需求")}</h1>
          <Link className="button" to={"/admin/intakes/" + r.id + "/delivery"}>
            交付资料
          </Link>
          <p className="muted">
            {r.actor} · {stamp(r.created)}
          </p>
          <p className="small muted">编号 {r.id}</p>
        </div>
        <div className="action-buttons">
          <Link className="button" to={"/admin/intakes/" + r.id + "/edit"}>
            补充 / 代填
          </Link>
          <button
            onClick={() =>
              download(
                "/api/admin/intakes/" + r.id + "/export",
                "intake.md",
              ).catch((e) => setError(e.message))
            }
          >
            导出摘要
          </button>
          <button
            onClick={() =>
              download(
                "/api/admin/intakes/" + r.id + "/export?format=json",
                "intake.json",
              ).catch((e) => setError(e.message))
            }
          >
            导出JSON
          </button>
        </div>
      </div>
      <Notice error={error} message={message} />
      <div className="detail-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{r.source === "project" ? "项目资料原文整理" : "原始回答"}</h2>
            <label>
              查看版本
              <select
                value={version}
                onChange={(e) => setVersion(Number(e.target.value))}
              >
                <option value={-1}>当前工作草稿</option>
                {r.submissions.map((s, i) => (
                  <option key={s.id} value={i}>
                    {r.source === "project" ? "资料版本" : "提交版本"}{" "}
                    {s.version} · {stamp(s.created)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="small muted">
            {r.source === "project"
              ? "依据已有文档整理，未填写字段为待确认；不代表客户本人提交或当前验收。"
              : "提交版本保留原文；工作人员备注不会覆盖原始回答。"}
            {version >= 0 && ` ${r.submissions[version].actor}`}
          </p>
          <dl className="answers">
            {Object.entries(a)
              .filter(([_, v]) =>
                Array.isArray(v) ? v.length : String(v).trim(),
              )
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{labels[k] ?? k}</dt>
                  <dd>{Array.isArray(v) ? v.join("、") : v}</dd>
                </div>
              ))}
          </dl>
          {Object.keys(a).length === 0 && <p className="muted">尚未填写答案</p>}
        </section>
        <aside className="detail-side">
          <section className="panel">
            <h2>跟进到哪一步</h2>
            <label>
              跟进阶段
              <select
                disabled={busy}
                value={r.stage}
                onChange={(e) =>
                  mutate("/stage", { stage: e.target.value }, "PATCH")
                }
              >
                {stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </section>
          <section className="panel">
            <div className="eyebrow">规则整理 · {r.summary?.ruleVersion}</div>
            <h2>下次访谈可以问</h2>
            <p className="small muted">
              根据当前工作草稿生成。整理结果是建议，需访谈核对。
            </p>
            <ol className="interview">
              {r.summary?.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </section>
        </aside>
        <section className="panel">
          <h2>工作人员备注</h2>
          <p className="small muted">
            追加记录，保留认证身份和时间，与客户原文分开。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutate("/notes", { body: note });
            }}
          >
            <label>
              访谈记录或下一步
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={4000}
                rows={4}
                required
              />
            </label>
            <button className="primary" disabled={busy || !note.trim()}>
              添加备注
            </button>
          </form>
          <div className="notes">
            {r.notes?.map((n) => (
              <article key={n.id}>
                <p className="small muted">
                  {n.actor} · {stamp(n.created)}
                </p>
                <p>{n.body}</p>
              </article>
            ))}
            {!r.notes?.length && <p className="muted">还没有工作人员备注</p>}
          </div>
        </section>
        <section className="panel">
          <h2>当前需求摘要</h2>
          <p className="small muted">{r.summary?.statement}</p>
          <dl className="answers">
            {r.summary?.items.map((i) => (
              <div key={i.label}>
                <dt>{i.label}</dt>
                <dd>{i.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
function Guide() {
  return (
    <main className="shell prose">
      <div className="eyebrow">使用与数据说明</div>
      <h1>把现状说清楚，下一步一起确定</h1>
      <section className="panel">
        <h2>客户怎么填写</h2>
        <p>
          从简单模式开始。不确定可以写“不确定”，非必填可以跳过。详细模式会按客户类型、团队规模、行业、项目阶段和需求方向组合问题，每步最多5题，以选择题为主。切换模式或分支保留已填写答案；未启用分支的旧答案不代表当前需求。
        </p>
        <p>
          “保存草稿”保存当前内容；“提交需求”保存一份原文版本。提交后还可补充，每次提交成为新的版本。填写过程中不会自动保存，离开前请点击保存。
        </p>
        <h2>回访与代填</h2>
        <p>
          普通填写入口默认空白，不会自动打开浏览器中上一位客户的记录。本次填写保存后可刷新继续；稍后续填请使用本人明确保留的回访链接，仅交给本人或授权代填者。它等同访问凭证，请勿公开。编号不能用于读取，凭证丢失后需联系工作人员线下核对。
        </p>
        <p>
          客户选择“代客户整理”只是自述；只有登录工作台后的代填和备注才记录认证工作人员身份。本机版客户需在这台电脑填写，尚未开放手机或公网访问。
        </p>
        <h2>数据用途与边界</h2>
        <p>
          数据用于需求了解、访谈准备和跟进，保存在本机数据库。联系信息可选。请勿填写密码、密钥、合同、真实单据或他人敏感信息。导入的项目资料保留来源和待确认状态，不调用外部AI，不发邮件或自动联系客户。
        </p>
        <p>
          客户原文、工作人员备注和规则整理分开。摘要及访谈问题是规则建议，不是最终需求、报价或成功承诺。提交数据没有默认删除功能；导出、留存和删除请求由平台所有者线下核实并授权处理。
        </p>
        <h2>出现问题时</h2>
        <p>
          保存失败时，本页仍保留填写内容。先复制到自己安全的本地记录，确认服务正常后重试。遇版本冲突请先保留本页内容，再刷新核对；不要直接覆盖另一处修改。
        </p>
        <p>
          后台凭据由本地初始化建立，首次登录改密；不要共享密码。源码更新和构建不会替换数据目录，仍需定期执行本地备份。
        </p>
        <Link className="button primary" to="/">
          开始填写
        </Link>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
