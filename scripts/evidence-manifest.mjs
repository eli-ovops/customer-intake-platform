import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.isFile()) files.push(p);
  }
}
for (const dir of ["src", "server", "scripts"]) walk(dir);
for (const entry of readdirSync("tests", { withFileTypes: true }))
  if (entry.isFile() && entry.name.endsWith(".ts"))
    files.push("tests/" + entry.name);
files.push(
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "playwright.config.ts",
  "index.html",
  "start.sh",
  "Start-Delivery.command",
  "Authorize-Workbench.command",
  "site.yaml",
  ".env.example",
  ".npmrc",
);
files.sort();
const records = files.map((path) => ({
  path,
  sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
}));
const sourceSha256 = createHash("sha256")
  .update(records.map((r) => r.path + ":" + r.sha256).join("\n"))
  .digest("hex");
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[a-zA-Z0-9]{24,}/,
  /\bghp_[a-zA-Z0-9]{30,}/,
];
const findings = [];
for (const path of files) {
  const text = readFileSync(path, "utf8");
  if (secretPatterns.some((p) => p.test(text))) findings.push(path);
}
writeFileSync(
  "evidence/source-manifest.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceSha256,
      runtime: process.version,
      files: records,
      scope:
        "Runtime source/config/tests only; excludes data, test credentials, evidence and mutable status docs.",
    },
    null,
    2,
  ),
);
writeFileSync(
  "evidence/source-secret-scan.json",
  JSON.stringify(
    {
      result: findings.length ? "fail" : "pass",
      scannedFiles: files.length,
      patternFindings: findings,
      limitation: "有限模式扫描，不是完整安全或秘密审计。",
    },
    null,
    2,
  ),
);
console.log(
  "Runtime source fingerprint recorded; finite secret pattern findings: " +
    findings.length,
);
