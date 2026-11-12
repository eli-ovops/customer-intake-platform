import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readIdentity } from "../server/delivery-root.ts";
const code = (process.argv[2] ?? "").trim().toUpperCase(),
  root = resolve(process.argv[3] ?? "runtime/real-projects-20261012");
if (!/^[A-F0-9]{8}$/.test(code))
  throw new Error("请输入内部页面上的8位授权编号");
const identity = readIdentity(root),
  runtime = JSON.parse(readFileSync(join(root, "runtime.json"), "utf8"));
const expected = join(root, "auth", `oa-${runtime.pid}.sock`);
if (
  runtime.ownerApprovalSocket !== expected ||
  runtime.rootId !== identity.rootId ||
  runtime.producerApp !== "eli-fde-delivery"
)
  throw new Error("工作台授权入口不匹配，请先启动当前工作台");
process.kill(runtime.pid, 0);
await new Promise<void>((resolve, reject) => {
  const c = createConnection(expected);
  c.setTimeout(3000, () => {
    c.destroy();
    reject(new Error("授权连接超时"));
  });
  let data = "";
  c.on("connect", () => c.write(JSON.stringify({ code }) + "\n"));
  c.on("data", (chunk) => {
    data += chunk;
  });
  c.on("error", reject);
  c.on("end", () => {
    try {
      if (JSON.parse(data).ok) resolve();
      else reject(new Error("编号未找到或已过期"));
    } catch (e) {
      reject(e);
    }
  });
});
console.log("本人授权已完成。回到内部页面即可进入工作台。");
