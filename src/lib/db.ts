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

let dbInstance: Database.Database | null = null;

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

  const adminCount = db
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
    .get() as { count: number };

  if (adminCount.count === 0) {
    const username = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
    const rawPassword = process.env.INITIAL_ADMIN_PASSWORD ?? "admin123";
    const password = bcrypt.hashSync(rawPassword, 10);

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
  const hash = bcrypt.hashSync(password, 10);
  const res = getDb()
    .prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)")
    .run(username, hash, role);
  return getUserById(Number(res.lastInsertRowid));
}

export function deleteUserById(id: number) {
  return getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}
