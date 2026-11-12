import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
mkdirSync("docs/licenses", { recursive: true });
const lines = [
  "# 安装依赖许可清单",
  "",
  "来源：本次package-lock和已安装包。保留随包许可；再分发时带上本目录及对应依赖声明。",
  "",
  "| 包 | 版本 | 许可 |",
  "|---|---|---|",
];
for (const [path, p] of Object.entries(lock.packages)) {
  if (!path) continue;
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  } catch {
    continue;
  }
  lines.push(
    `| ${meta.name} | ${meta.version} | ${meta.license ?? "UNKNOWN"} |`,
  );
  const name = meta.name.replaceAll("/", "_");
  for (const file of [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "license",
    "LICENCE",
  ]) {
    if (existsSync(join(path, file))) {
      copyFileSync(join(path, file), join("docs/licenses", name + "-" + file));
      break;
    }
  }
}
writeFileSync("docs/THIRD_PARTY_NOTICES.md", lines.join("\n") + "\n");
console.log("安装包许可已保留至docs/licenses与THIRD_PARTY_NOTICES.md");
