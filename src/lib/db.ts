import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

export type UserRole = "admin" | "user";

export type DbUser = {
  id: number;
  username: string;
  password: string;
  role: UserRole;
  createdAt: string;
};

export type InstanceActionStatus = "requested" | "success" | "failed";

export type InstanceActionLog = {
  id: number;
  instanceId: string;
  region: string | null;
  action: string;
  actorUserId: number | null;
  actorUsername: string | null;
  actorRole: UserRole | null;
  status: InstanceActionStatus;
  message: string | null;
  metadataJson: string | null;
  createdAt: string;
};

let dbInstance: Database.Database | null = null;
const PASSWORD_SALT_ROUNDS = 12;

function getDatabasePath() {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "app.db");
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS instance_action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instanceId TEXT NOT NULL,
      region TEXT,
      action TEXT NOT NULL,
      actorUserId INTEGER,
      actorUsername TEXT,
      actorRole TEXT CHECK(actorRole IN ('admin', 'user')),
      status TEXT NOT NULL CHECK(status IN ('requested', 'success', 'failed')),
      message TEXT,
      metadataJson TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_instance_action_logs_instance_created
    ON instance_action_logs(instanceId, createdAt DESC);
  `);

  const adminCount = db
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
    .get() as { count: number };

  if (adminCount.count === 0) {
    const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
    const rawPassword = process.env.INITIAL_ADMIN_PASSWORD ?? "admin123";
    const password = bcrypt.hashSync(rawPassword, PASSWORD_SALT_ROUNDS);

    db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')").run(
      username,
      password,
    );
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = new Database(getDatabasePath());
  runMigrations(dbInstance);
  return dbInstance;
}

export function getUserByUsername(username: string) {
  return getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as DbUser | undefined;
}

export function getUserById(id: number) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function listUsers() {
  return getDb()
    .prepare("SELECT id, username, role, createdAt FROM users ORDER BY createdAt DESC")
    .all() as Array<Pick<DbUser, "id" | "username" | "role" | "createdAt">>;
}

export function createUser(username: string, password: string, role: UserRole) {
  const hash = bcrypt.hashSync(password, PASSWORD_SALT_ROUNDS);
  const res = getDb()
    .prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)")
    .run(username, hash, role);
  return getUserById(Number(res.lastInsertRowid));
}

export function deleteUserById(id: number) {
  return getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function createInstanceActionLog(input: {
  instanceId: string;
  region?: string | null;
  action: string;
  actorUserId?: number | null;
  actorUsername?: string | null;
  actorRole?: UserRole | null;
  status: InstanceActionStatus;
  message?: string | null;
  metadataJson?: string | null;
}) {
  const res = getDb()
    .prepare(
      `INSERT INTO instance_action_logs (
        instanceId, region, action, actorUserId, actorUsername, actorRole, status, message, metadataJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.instanceId,
      input.region ?? null,
      input.action,
      input.actorUserId ?? null,
      input.actorUsername ?? null,
      input.actorRole ?? null,
      input.status,
      input.message ?? null,
      input.metadataJson ?? null,
    );
  return Number(res.lastInsertRowid);
}

export function listInstanceActionLogs(instanceId: string, region?: string | null, limit = 100) {
  const cap = Math.max(1, Math.min(500, limit));
  if (region) {
    return getDb()
      .prepare(
        `SELECT id, instanceId, region, action, actorUserId, actorUsername, actorRole, status, message, metadataJson, createdAt
         FROM instance_action_logs
         WHERE instanceId = ? AND region = ?
         ORDER BY datetime(createdAt) DESC, id DESC
         LIMIT ?`,
      )
      .all(instanceId, region, cap) as InstanceActionLog[];
  }
  return getDb()
    .prepare(
      `SELECT id, instanceId, region, action, actorUserId, actorUsername, actorRole, status, message, metadataJson, createdAt
       FROM instance_action_logs
       WHERE instanceId = ?
       ORDER BY datetime(createdAt) DESC, id DESC
       LIMIT ?`,
    )
    .all(instanceId, cap) as InstanceActionLog[];
}
