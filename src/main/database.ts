import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'singularity.db')
  db = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL')
  // Enable foreign key constraint enforcement
  db.pragma('foreign_keys = ON')

  // Create tables
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

  // Migration: add session_id column if it doesn't exist (for existing databases)
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
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function getAllWorkspaces(): unknown[] {
  const database = getDatabase()
  return database.prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all()
}

export function createWorkspace(name: string, path: string): unknown {
  const database = getDatabase()
  const stmt = database.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)')
  const result = stmt.run(name, path)
  return database.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid)
}

export function deleteWorkspace(id: number): void {
  const database = getDatabase()
  database.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

export function getConversation(id: number): unknown {
  const database = getDatabase()
  return database.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
}

export function getWorkspaceForConversation(conversationId: number): unknown {
  const database = getDatabase()
  return database
    .prepare(
      'SELECT w.* FROM workspaces w JOIN conversations c ON c.workspace_id = w.id WHERE c.id = ?'
    )
    .get(conversationId)
}

export function getConversationsByWorkspace(workspaceId: number): unknown[] {
  const database = getDatabase()
  return database
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
         (SELECT CASE
           WHEN lm.role = 'assistant' AND (
             TRIM(lm.content) LIKE '%?'
             OR lm.content LIKE '%[QUESTION_BLOCK]%'
           ) THEN 1
           ELSE 0
         END
         FROM messages lm
         WHERE lm.conversation_id = c.id
         ORDER BY lm.id DESC
         LIMIT 1) as awaiting_response
       FROM conversations c
       WHERE c.workspace_id = ? AND c.deleted_at IS NULL
       ORDER BY c.updated_at DESC`
    )
    .all(workspaceId)
}

export function getDeletedConversationsByWorkspace(workspaceId: number): unknown[] {
  const database = getDatabase()
  return database
    .prepare(
      'SELECT * FROM conversations WHERE workspace_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    )
    .all(workspaceId)
}

export function createConversation(
  workspaceId: number,
  title: string,
  model: string,
  sessionId?: string
): unknown {
  const database = getDatabase()
  const stmt = database.prepare(
    'INSERT INTO conversations (workspace_id, title, model, session_id) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(workspaceId, title, model, sessionId || null)
  return database
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(result.lastInsertRowid)
}

export function updateConversationTitle(id: number, title: string): void {
  const database = getDatabase()
  database
    .prepare('UPDATE conversations SET title = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(title, id)
}

export function updateConversationModel(id: number, model: string): void {
  const database = getDatabase()
  database
    .prepare('UPDATE conversations SET model = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(model, id)
}

export function deleteConversation(id: number): void {
  const database = getDatabase()
  database
    .prepare("UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?")
    .run(id)
}

export function restoreConversation(id: number): void {
  const database = getDatabase()
  database.prepare('UPDATE conversations SET deleted_at = NULL WHERE id = ?').run(id)
}

export function setConversationNeedsReview(id: number, needsReview: boolean): void {
  const database = getDatabase()
  database
    .prepare('UPDATE conversations SET needs_review = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(needsReview ? 1 : 0, id)
}

export function permanentlyDeleteConversation(id: number): void {
  const database = getDatabase()
  database.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function getMessagesByConversation(conversationId: number): unknown[] {
  const database = getDatabase()
  return database
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId)
}

export function addMessage(
  conversationId: number,
  role: string,
  content: string
): unknown {
  const database = getDatabase()
  const stmt = database.prepare(
    'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
  )
  const result = stmt.run(conversationId, role, content)

  // Update the conversation's updated_at timestamp
  database
    .prepare('UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?')
    .run(conversationId)

  return database.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid)
}

export function deleteMessage(id: number): void {
  const database = getDatabase()
  database.prepare('DELETE FROM messages WHERE id = ?').run(id)
}

export function getSetting(key: string, defaultValue?: string): string | null {
  const database = getDatabase()
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? defaultValue ?? null
}

export function setSetting(key: string, value: string): void {
  const database = getDatabase()
  database
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(key, value, value)
}
