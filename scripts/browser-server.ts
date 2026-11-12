import { createApp, createAdmin } from "../server/app.ts";
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
const dir = resolve("tests/runtime/browser-" + Date.now());
const { app, db } = createApp(dir);
const password = randomBytes(24).toString("base64url");
await createAdmin(db, password, true);
writeFileSync(
  "tests/runtime/browser-credential.json",
  JSON.stringify({ password, dir }),
  { mode: 0o600 },
);
const server = app.listen(4181, "127.0.0.1", () =>
  console.log("Virtual-data browser test server ready"),
);
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
