import { resolve } from "node:path";
import { createApp } from "./app.ts";
const port = Number(process.env.PORT ?? 4180);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("端口无效");
const { app, db } = createApp(resolve(process.env.DATA_DIR ?? "data"));
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`FDE 本机工作台 http://127.0.0.1:${port}`),
);
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
