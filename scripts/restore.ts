import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync, realpathSync, chmodSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg)
  throw new Error(
    "用法：npm run restore -- backups/指定备份.sqlite data/restored-日期",
  );
const root = realpathSync(resolve(".")),
  source = realpathSync(resolve(sourceArg)),
  target = resolve(targetArg);
if (!source.startsWith(join(root, "backups") + "/"))
  throw new Error("只接受本项目backups目录的备份");
if (
  !target.startsWith(join(root, "data", "restored-")) ||
  relative(root, target).includes("..")
)
  throw new Error("目标必须为本项目data/restored-名称");
if (existsSync(target)) throw new Error("目标已存在，拒绝覆盖");
if (realpathSync(dirname(target)) !== join(root, "data"))
  throw new Error("目标父目录不符合范围");
const db = new DatabaseSync(source, { readOnly: true });
try {
  const check = db.prepare("PRAGMA integrity_check").get() as {
    integrity_check: string;
  };
  if (check.integrity_check !== "ok") throw new Error("备份完整性失败");
  mkdirSync(target, { mode: 0o700 });
  await backup(db, join(target, "intake.sqlite"));
  chmodSync(join(target, "intake.sqlite"), 0o600);
  console.log(
    "恢复到独立目录完成，原数据库未覆盖。确认内容后可使用DATA_DIR启动该副本。",
  );
} finally {
  db.close();
}
