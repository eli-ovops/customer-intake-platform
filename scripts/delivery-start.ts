import {
  existsSync,
  writeFileSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import express from "express";
import { customerEntry } from "../server/customer-entry.ts";
import { createFixture } from "../server/delivery-fixture.ts";
import {
  openDeliveryRuntime,
  initializeAuth,
} from "../server/delivery-runtime.ts";
import { projectRoot, readIdentity } from "../server/delivery-root.ts";
import { restoreBatch } from "../server/delivery-packages.ts";
const args = process.argv.slice(2),
  mode = args[0] ?? "normal";
const root = resolve(
  args[1] ??
    join(
      projectRoot,
      "runtime",
      mode === "normal" &&
        existsSync(
          join(
            projectRoot,
            "runtime",
            "real-projects-20261012",
            "identity.json",
          ),
        )
        ? "real-projects-20261012"
        : "delivery-demo-20261012",
    ),
);
if (mode === "init-demo") {
  const fixture = await createFixture(root, true, true);
  writeFileSync(join(root, "fixture.json"), JSON.stringify(fixture, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    "合成样例初始化完成。账号凭据仅在 " + join(root, "auth", "credential.json"),
  );
} else if (mode === "restore") {
  if (!args[2])
    throw new Error("用法：delivery-start restore 目标新根 备份批次目录");
  const result = await restoreBatch(args[2], root);
  await initializeAuth(root, true);
  console.log(JSON.stringify(result));
} else if (mode !== "normal")
  throw new Error("模式无效：仅init-demo / normal / restore");
const identity = readIdentity(root);
if (!existsSync(join(projectRoot, "dist", "index.html")))
  throw new Error("交付构建不存在；请联系Owner，用户无需自己build");
const free = async (port: number) =>
  new Promise<boolean>((r) => {
    const s = createServer();
    s.once("error", () => r(false));
    s.listen(port, "127.0.0.1", () => s.close(() => r(true)));
  });
let port = Number(process.env.DELIVERY_PORT ?? 4181);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("端口无效");
for (let i = 0; i < 40; i++, port++) if (await free(port)) break;
if (!(await free(port)))
  throw new Error("没有可用的本应用端口，未终止其他进程");
const runtime = openDeliveryRuntime(root, {
  staticDir: join(projectRoot, "dist"),
  localPrivateAccess:
    identity.localPrivateAccess === true &&
    !identity.syntheticOnly &&
    mode === "normal",
  passwordlessDemo:
    root === join(projectRoot, "runtime", "delivery-demo-20261012") &&
    mode === "normal",
});
let customerPort = Number(process.env.CUSTOMER_PORT ?? port + 1);
if (
  !Number.isInteger(customerPort) ||
  customerPort < 1024 ||
  customerPort > 65535
)
  throw new Error("客户端口无效");
for (
  let i = 0;
  i < 40 && (customerPort === port || !(await free(customerPort)));
  i++
)
  customerPort++;
if (!(await free(customerPort))) throw new Error("客户入口没有空闲端口");
const customerUrl = "http://127.0.0.1:" + customerPort;
// The user explicitly chose direct access for their local personal workbench.
// Customer routes are filtered before they can reach the shared application.
const customerServer = customerEntry(runtime.app).listen(customerPort, "127.0.0.1");
const ownerApp = express();
ownerApp.get("/", (_req, res) => res.redirect("/admin"));
ownerApp.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    version: "0.2.0",
    syntheticOnly: identity.syntheticOnly,
    rootId: identity.rootId,
    producerApp: "eli-fde-delivery",
    customerUrl,
    ownerApproval: false,
  }),
);
ownerApp.use(runtime.app);
const server = ownerApp.listen(port, "127.0.0.1", () => {
  const fixture = existsSync(join(root, "fixture.json"))
    ? JSON.parse(readFileSync(join(root, "fixture.json"), "utf8"))
    : null;
  const url = "http://127.0.0.1:" + port;
  writeFileSync(
    join(root, "runtime.json"),
    JSON.stringify(
      {
        producerApp: "eli-fde-delivery",
        appVersion: "0.2.0",
        pid: process.pid,
        startedAt: new Date().toISOString(),
        node: process.version,
        runtime: realpathSync(process.execPath),
        projectRoot,
        dataRoot: root,
        authRoot: join(root, "auth"),
        port,
        url,
        entry: fixture
          ? url + "/admin/intakes/" + fixture.intakeId + "/delivery"
          : url + "/admin",
        syntheticOnly: identity.syntheticOnly,
        rootId: identity.rootId,
        ownerAccess: "direct-local",
        customerPort,
        customerUrl,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log("Eli FDE 交付工作台：" + url + "/admin");
  console.log("客户填写入口：" + customerUrl + "/ （不提供内部资料接口）");
  console.log(
    (identity.syntheticOnly ? "合成演示根：" : "真实项目资料根：") + root,
  );
  console.log(
    "本人工作台直接打开；客户独立入口仅提供问卷，不提供历史客户资料。",
  );
});
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () =>
    server.close(() =>
      customerServer.close(async () => {
        runtime.close();
        process.exit(0);
      }),
    ),
  );
