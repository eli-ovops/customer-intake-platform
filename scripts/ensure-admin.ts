import { resolve } from "node:path";
import { openDatabase } from "../server/db.ts";
const db = openDatabase(resolve(process.env.DATA_DIR ?? "data"));
const exists = !!db.prepare("SELECT id FROM users LIMIT 1").get();
db.close();
if (!exists) await import("./init-admin.ts");
