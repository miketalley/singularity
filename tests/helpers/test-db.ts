/**
 * In-memory SQLite test database factory.
 *
 * Creates a better-sqlite3 database with the same schema and migrations
 * as the production database in src/main/database.ts, but entirely in
 * memory so tests run fast and leave no artifacts on disk.
 */

import Database from 'better-sqlite3'

/**
 * Create a fresh in-memory database with the full Singularity schema
 * and all migrations applied. Each call returns an independent database
 * so tests never interfere with each other.
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:')

  // Match production pragmas
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create tables -- identical to src/main/database.ts initDatabase()
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Migration: add session_id column (already in CREATE TABLE above, but
  // kept here to mirror the production migration path exactly -- the ALTER
  // will harmlessly fail because the column already exists).
  try {
    db.exec('ALTER TABLE conversations ADD COLUMN session_id TEXT')
  } catch {
    // Column already exists
  }

  // Migration: add deleted_at column for soft-delete
  try {
    db.exec('ALTER TABLE conversations ADD COLUMN deleted_at TEXT DEFAULT NULL')
  } catch {
    // Column already exists
  }

  // Migration: add needs_review column
  try {
    db.exec('ALTER TABLE conversations ADD COLUMN needs_review INTEGER DEFAULT 0')
  } catch {
    // Column already exists
  }

  return db
}

/**
 * Close a test database. Call this in afterEach / afterAll to release
 * the in-memory database and avoid leaking file descriptors.
 */
export function closeTestDatabase(db: Database.Database): void {
  db.close()
}
