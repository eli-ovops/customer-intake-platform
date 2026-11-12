import express from "express";
import helmet from "helmet";

// A separate listener, sharing the same writer. Owner cookies never authorize
// internal routes here, even when the browser sends cookies across localhost ports.
export function customerEntry(
  app: express.Express,
  enter?: (req: express.Request, res: express.Response) => boolean,
) {
  const customer = express();
  customer.disable("x-powered-by");
  customer.use(helmet());
  customer.use((req, res, next) => {
    if (enter && enter(req, res) === false) return;
    let path: string;
    try {
      path = decodeURIComponent(req.path).toLowerCase();
    } catch {
      return res.status(400).json({ error: "无效路径" });
    }
    if (path === "/api/auth/me" && req.method === "GET")
      return res.json({ user: null, localDemo: false });
    if (path === "/api/health" && req.method === "GET")
      return res.json({ status: "ok", version: "0.2.0", customerOnly: true });
    if (
      /^\/admin(?:\/|$)/.test(path) ||
      /^\/api\/(?:admin|auth)(?:\/|$)/.test(path)
    )
      return res.status(403).json({ error: "客户填写入口不能访问内部工作台" });
    if (
      path.startsWith("/api/") &&
      !/^\/api\/intakes(?:\/[^/]+(?:\/submit)?)?$/.test(path)
    )
      return res.status(404).json({ error: "客户入口没有此接口" });
    next();
  });
  customer.use(app);
  return customer;
}
