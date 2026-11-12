import { backup, DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
const source = resolve(process.env.DATA_DIR ?? "data", "intake.sqlite");
if (!existsSync(source)) throw new Error("数据不存在");
const dir = resolve("backups");
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
const destination = join(
  dir,
  `intake-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  chmodSync(destination, 0o600);
  console.log("在线备份完成：" + destination);
} finally {
  db.close();
}
