import express, { type Request, type Response } from "express";
import { createServer } from "node:net";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { WriteBarrier } from "./delivery-root.ts";
import { transaction } from "./db.ts";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
function cookie(req: Request, name: string) {
  return (
    String(req.headers.cookie ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
export function ownerApproval(
  auth: DatabaseSync,
  cookieName: string,
  authRoot: string,
  validate: () => void,
  barrier: WriteBarrier,
  audit: (actor: string, action: string) => void,
) {
  const activeSessions = new Set<string>(),
    revocations = new Map<string, string>();
  // Authorizations belong to this service epoch; a failed durable revoke can
  // never revive an old session after restart.
  barrier.persist(() => audit("system", "owner-epoch-start"));
  const flushRevocations = () => {
    for (const [sessionHash, actor] of revocations) {
      barrier.persist(() =>
        transaction(auth, () => {
          auth.prepare("DELETE FROM sessions WHERE hash=?").run(sessionHash);
          audit(actor, "owner-session-revoked");
        }),
      );
      revocations.delete(sessionHash);
    }
  };
  const unsubscribe = barrier.onResume(flushRevocations);
  const requestCookie = cookieName + "_approval",
    pending = new Map<
      string,
      { code: string; approved: boolean; expires: number }
    >();
  const options = {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    secure: false,
  };
  const middleware = express.Router();
  middleware.use((req, res, next) => {
    if (/^\/(?:admin|api\/auth|api\/admin)(?:\/|$)/i.test(req.path))
      res.setHeader("Cache-Control", "no-store");
    try {
      if (!barrier.paused) flushRevocations();
    } catch {
      return res.status(503).json({ error: "权限记录暂不可用，请稍后再试" });
    }
    if (
      /^\/api\/admin(?:\/|$)/i.test(req.path) &&
      !activeSessions.has(hash(cookie(req, cookieName)))
    )
      return res.status(401).json({ error: "需要本人本机授权" });
    next();
  });
  middleware.all("/api/auth/local-session", (_req, res) =>
    res.status(403).json({ error: "内部工作台需要本人重新授权" }),
  );
  middleware.all("/api/auth/login", (_req, res) =>
    res.status(403).json({ error: "请使用本人本机授权入口" }),
  );
  middleware.get("/api/auth/me", (req, res) => {
    validate();
    const s = auth
      .prepare(
        "SELECT users.name,users.must_change,sessions.csrf,sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=?",
      )
      .get(hash(cookie(req, cookieName))) as any;
    res.json(
      s &&
        s.expires > Date.now() &&
        activeSessions.has(hash(cookie(req, cookieName)))
        ? {
            user: { name: s.name, mustChange: !!s.must_change },
            csrf: s.csrf,
            localDemo: false,
          }
        : { user: null, localDemo: false },
    );
  });
  middleware.post(
    "/api/auth/owner-request",
    express.json({ limit: "1kb" }),
    (req, res) => {
      validate();
      if (
        req.hostname !== "127.0.0.1" ||
        req.get("Origin") !== "http://" + req.get("Host")
      )
        return res.status(403).json({ error: "授权请求来源无效" });
      if (!req.body || Object.keys(req.body).length)
        return res.status(400).json({ error: "无效授权请求" });
      for (const [key, value] of pending)
        if (value.expires < Date.now()) pending.delete(key);
      pending.delete(hash(cookie(req, requestCookie)));
      if (pending.size >= 32)
        return res.status(429).json({ error: "授权请求过多，请稍后再试" });
      const t = token(),
        code = randomBytes(4).toString("hex").toUpperCase();
      pending.set(hash(t), {
        code,
        approved: false,
        expires: Date.now() + 5 * 60000,
      });
      res.cookie(requestCookie, t, { ...options, maxAge: 5 * 60000 });
      res.json({ code, expiresInSeconds: 300 });
    },
  );
  middleware.get(
    "/api/auth/owner-request/status",
    (req, res, next) => {
      (req as any).deliveryPersistentWrite = true;
      barrier.middleware(req, res, next);
    },
    (req, res) => {
      validate();
      const key = hash(cookie(req, requestCookie)),
        request = pending.get(key);
      if (!request || request.expires < Date.now()) {
        pending.delete(key);
        return res.status(410).json({ error: "授权请求已过期，请重新申请" });
      }
      if (!request.approved) return res.json({ state: "pending" });
      const user = auth
        .prepare("SELECT id FROM users WHERE name='owner'")
        .get() as any;
      if (!user) return res.status(503).json({ error: "本人身份不可用" });
      const t = token(),
        csrf = token();
      barrier.persist(() =>
        transaction(auth, () => {
          auth
            .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
            .run(hash(t), user.id, csrf, Date.now() + 8 * 3600000);
          audit("owner", "owner-session-granted");
        }),
      );
      activeSessions.add(hash(t));
      pending.delete(key);
      res.clearCookie(requestCookie, options);
      res.cookie(cookieName, t, { ...options, maxAge: 8 * 3600000 });
      res.json({ state: "authorized" });
    },
  );
  const socketPath = join(authRoot, `oa-${process.pid}.sock`);
  if (Buffer.byteLength(socketPath) > 100)
    throw new Error("本机授权路径过长，请使用更短的登记数据根");
  const socket = createServer((connection) => {
    connection.setTimeout(3000, () => connection.destroy());
    let buffer = "";
    connection.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 256) {
        connection.destroy();
        return;
      }
      if (!buffer.includes("\n")) return;
      try {
        validate();
        const { code } = JSON.parse(buffer.split("\n")[0]);
        if (typeof code !== "string" || !/^[A-F0-9]{8}$/.test(code))
          throw new Error();
        const request = [...pending.values()].find(
          (v) => v.code === code && v.expires > Date.now(),
        );
        if (!request) throw new Error();
        request.approved = true;
        connection.end(JSON.stringify({ ok: true }) + "\n");
      } catch {
        connection.end(JSON.stringify({ ok: false }) + "\n");
      }
    });
  });
  socket.listen(socketPath, () => chmodSync(socketPath, 0o600));
  const enterCustomer = (req: Request, res: Response) => {
    validate();
    const t = cookie(req, cookieName),
      request = cookie(req, requestCookie);
    if (t) {
      const sessionHash = hash(t);
      const existing = auth
        .prepare(
          "SELECT users.name FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=?",
        )
        .get(sessionHash) as any;
      activeSessions.delete(sessionHash);
      if (existing) revocations.set(sessionHash, existing.name);
    }
    if (request) pending.delete(hash(request));
    res.clearCookie(cookieName, options);
    res.clearCookie(requestCookie, options);
    res.setHeader("Cache-Control", "no-store");
    if (revocations.size && barrier.paused) {
      res
        .status(503)
        .json({ error: "一致备份进行中，内部权限已停止，稍后重试填写" });
      return false;
    }
    try {
      flushRevocations();
    } catch {
      res.status(503).json({ error: "内部权限已停止，权限记录暂不可用" });
      return false;
    }
    return true;
  };
  return {
    middleware,
    enterCustomer,
    socketPath,
    socket,
    close: () => {
      unsubscribe();
      return new Promise<void>((resolve) => socket.close(() => resolve()));
    },
  };
}
