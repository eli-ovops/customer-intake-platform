import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { openDatabase } from "../server/db.ts";
import { createAdmin } from "../server/app.ts";
const dir = resolve(process.env.DATA_DIR ?? "data");
const db = openDatabase(dir);
try {
  const password = randomBytes(24).toString("base64url");
  await createAdmin(db, password);
  writeFileSync(
    join(dir, "admin-setup.txt"),
    `本机初始化凭据，仅本人查看。首次登录必须修改。\n账号: owner\n密码: ${password}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "管理员已初始化。凭据仅写入数据目录 admin-setup.txt；不会在终端显示。",
  );
} finally {
  db.close();
}
