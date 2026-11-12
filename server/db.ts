import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
export function openDatabase(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const db = new DatabaseSync(join(resolve(dir), "intake.sqlite"), {
    timeout: 3000,
  });
  chmodSync(join(resolve(dir), "intake.sqlite"), 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
 INSERT OR IGNORE INTO schema_version VALUES(1);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,password TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS intakes(id TEXT PRIMARY KEY,cap_hash TEXT UNIQUE,create_key TEXT UNIQUE NOT NULL,source TEXT NOT NULL,actor TEXT NOT NULL,answers TEXT NOT NULL,mode TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,stage TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,intake_id TEXT NOT NULL REFERENCES intakes(id),version INTEGER NOT NULL,request_key TEXT UNIQUE NOT NULL,answers TEXT NOT NULL,mode TEXT NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(intake_id,version));
 CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,intake_id TEXT NOT NULL REFERENCES intakes(id),body TEXT NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS summaries(intake_id TEXT PRIMARY KEY REFERENCES intakes(id),source_revision INTEGER NOT NULL,rule_version TEXT NOT NULL,result TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,resource TEXT NOT NULL,created TEXT NOT NULL);
 `);
  return db;
}
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = fn();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
