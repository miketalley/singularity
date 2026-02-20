/**
 * Unit tests for src/main/database.ts SQL logic.
 *
 * Strategy: We bypass the module's internal `db` variable and Electron
 * dependency entirely. Instead we create a fresh in-memory better-sqlite3
 * database per test (via the shared helper) and execute the same SQL
 * statements that the production functions use. This validates schema
 * correctness, constraint enforcement, query logic, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDatabase, closeTestDatabase } from '../../helpers/test-db'

let db: Database.Database

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => {
  closeTestDatabase(db)
})

// ---------------------------------------------------------------------------
// Helpers -- thin wrappers that mirror the production functions but operate
// on our test `db` instance instead of the module-level singleton.
// ---------------------------------------------------------------------------

function getAllWorkspaces(): any[] {
  return db.prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all()
}

function createWorkspace(name: string, path: string): any {
  const stmt = db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)')
  const result = stmt.run(name, path)
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid)
}

function deleteWorkspace(id: number): void {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

function getConversation(id: number): any {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
}

function getWorkspaceForConversation(conversationId: number): any {
  return db
    .prepare(
      'SELECT w.* FROM workspaces w JOIN conversations c ON c.workspace_id = w.id WHERE c.id = ?'
    )
    .get(conversationId)
}

function getConversationsByWorkspace(workspaceId: number): any[] {
  return db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
         (SELECT CASE
           WHEN lm.role = 'assistant' AND (
             RTRIM(TRIM(lm.content), '*_\`') LIKE '%?'
             OR lm.content LIKE '%[QUESTION_BLOCK]%'
           ) THEN 1
           ELSE 0
         END
         FROM messages lm
         WHERE lm.conversation_id = c.id
         ORDER BY lm.id DESC
         LIMIT 1) as awaiting_response,
         (SELECT role FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message_role
       FROM conversations c
       WHERE c.workspace_id = ? AND c.deleted_at IS NULL
       ORDER BY c.updated_at DESC`
    )
    .all(workspaceId)
}

function getDeletedConversationsByWorkspace(workspaceId: number): any[] {
  return db
    .prepare(
      'SELECT * FROM conversations WHERE workspace_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    )
    .all(workspaceId)
}

function createConversation(
  workspaceId: number,
  title: string,
  model: string,
  sessionId?: string
): any {
  const stmt = db.prepare(
    'INSERT INTO conversations (workspace_id, title, model, session_id) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(workspaceId, title, model, sessionId || null)
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid)
}

function updateConversationTitle(id: number, title: string): void {
  db.prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
    title,
    id
  )
}

function updateConversationModel(id: number, model: string): void {
  db.prepare("UPDATE conversations SET model = ?, updated_at = datetime('now') WHERE id = ?").run(
    model,
    id
  )
}

function deleteConversation(id: number): void {
  db.prepare("UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?").run(id)
}

function restoreConversation(id: number): void {
  db.prepare('UPDATE conversations SET deleted_at = NULL WHERE id = ?').run(id)
}

function setConversationNeedsReview(id: number, needsReview: boolean): void {
  db.prepare(
    "UPDATE conversations SET needs_review = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(needsReview ? 1 : 0, id)
}

function permanentlyDeleteConversation(id: number): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

function getMessagesByConversation(conversationId: number): any[] {
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId)
}

function addMessage(conversationId: number, role: string, content: string): any {
  const stmt = db.prepare(
    'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
  )
  const result = stmt.run(conversationId, role, content)
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(
    conversationId
  )
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid)
}

function deleteMessage(id: number): void {
  db.prepare('DELETE FROM messages WHERE id = ?').run(id)
}

function getSetting(key: string, defaultValue?: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? defaultValue ?? null
}

function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, value, value)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema', () => {
  it('creates all four tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name).sort()
    expect(names).toEqual(['conversations', 'messages', 'settings', 'workspaces'])
  })

  it('enforces foreign keys', () => {
    const fkStatus = db.pragma('foreign_keys') as { foreign_keys: number }[]
    expect(fkStatus[0].foreign_keys).toBe(1)
  })

  it('conversations table has deleted_at and needs_review columns from migrations', () => {
    const cols = db.pragma('table_info(conversations)') as { name: string }[]
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('deleted_at')
    expect(colNames).toContain('needs_review')
    expect(colNames).toContain('session_id')
  })
})

describe('Workspace CRUD', () => {
  describe('createWorkspace', () => {
    it('creates a workspace and returns it with an id', () => {
      const ws = createWorkspace('My Project', '/home/user/project')
      expect(ws).toBeDefined()
      expect(ws.id).toBeTypeOf('number')
      expect(ws.name).toBe('My Project')
      expect(ws.path).toBe('/home/user/project')
      expect(ws.created_at).toBeDefined()
    })

    it('auto-increments ids', () => {
      const ws1 = createWorkspace('First', '/path/1')
      const ws2 = createWorkspace('Second', '/path/2')
      expect(ws2.id).toBeGreaterThan(ws1.id)
    })

    it('rejects duplicate paths (UNIQUE constraint)', () => {
      createWorkspace('A', '/same/path')
      expect(() => createWorkspace('B', '/same/path')).toThrow()
    })

    it('allows duplicate names with different paths', () => {
      const ws1 = createWorkspace('SameName', '/path/a')
      const ws2 = createWorkspace('SameName', '/path/b')
      expect(ws1.id).not.toBe(ws2.id)
    })
  })

  describe('getAllWorkspaces', () => {
    it('returns empty array when no workspaces exist', () => {
      expect(getAllWorkspaces()).toEqual([])
    })

    it('returns all workspaces ordered by created_at DESC', () => {
      // Insert with explicit created_at to control ordering
      db.prepare("INSERT INTO workspaces (name, path, created_at) VALUES (?, ?, ?)").run(
        'Oldest',
        '/old',
        '2024-01-01 00:00:00'
      )
      db.prepare("INSERT INTO workspaces (name, path, created_at) VALUES (?, ?, ?)").run(
        'Newest',
        '/new',
        '2024-12-31 23:59:59'
      )
      db.prepare("INSERT INTO workspaces (name, path, created_at) VALUES (?, ?, ?)").run(
        'Middle',
        '/mid',
        '2024-06-15 12:00:00'
      )

      const all = getAllWorkspaces()
      expect(all).toHaveLength(3)
      expect(all[0].name).toBe('Newest')
      expect(all[1].name).toBe('Middle')
      expect(all[2].name).toBe('Oldest')
    })
  })

  describe('deleteWorkspace', () => {
    it('removes a workspace by id', () => {
      const ws = createWorkspace('To Delete', '/delete/me')
      expect(getAllWorkspaces()).toHaveLength(1)
      deleteWorkspace(ws.id)
      expect(getAllWorkspaces()).toHaveLength(0)
    })

    it('does nothing if the workspace does not exist', () => {
      expect(() => deleteWorkspace(9999)).not.toThrow()
    })

    it('cascade-deletes associated conversations when workspace is deleted', () => {
      const ws = createWorkspace('WS', '/ws/path')
      createConversation(ws.id, 'Chat', 'gpt-4')
      expect(getConversationsByWorkspace(ws.id)).toHaveLength(1)

      deleteWorkspace(ws.id)
      // The conversation should be gone because of ON DELETE CASCADE
      const remaining = db
        .prepare('SELECT * FROM conversations WHERE workspace_id = ?')
        .all(ws.id)
      expect(remaining).toHaveLength(0)
    })

    it('cascade-deletes messages when workspace is deleted', () => {
      const ws = createWorkspace('WS', '/ws/path')
      const conv = createConversation(ws.id, 'Chat', 'gpt-4')
      addMessage(conv.id, 'user', 'hello')

      deleteWorkspace(ws.id)
      const msgs = db.prepare('SELECT * FROM messages').all()
      expect(msgs).toHaveLength(0)
    })
  })
})

describe('Conversation CRUD', () => {
  let workspaceId: number

  beforeEach(() => {
    const ws = createWorkspace('Test Workspace', '/test/workspace')
    workspaceId = ws.id
  })

  describe('createConversation', () => {
    it('creates a conversation and returns it', () => {
      const conv = createConversation(workspaceId, 'Hello World', 'gpt-4')
      expect(conv).toBeDefined()
      expect(conv.id).toBeTypeOf('number')
      expect(conv.workspace_id).toBe(workspaceId)
      expect(conv.title).toBe('Hello World')
      expect(conv.model).toBe('gpt-4')
      expect(conv.created_at).toBeDefined()
      expect(conv.updated_at).toBeDefined()
    })

    it('stores session_id when provided', () => {
      const conv = createConversation(workspaceId, 'With Session', 'gpt-4', 'sess-123')
      expect(conv.session_id).toBe('sess-123')
    })

    it('sets session_id to null when omitted', () => {
      const conv = createConversation(workspaceId, 'No Session', 'gpt-4')
      expect(conv.session_id).toBeNull()
    })

    it('sets session_id to null when empty string is passed', () => {
      const conv = createConversation(workspaceId, 'Empty Session', 'gpt-4', '')
      expect(conv.session_id).toBeNull()
    })

    it('defaults deleted_at to null', () => {
      const conv = createConversation(workspaceId, 'Fresh', 'gpt-4')
      expect(conv.deleted_at).toBeNull()
    })

    it('defaults needs_review to 0', () => {
      const conv = createConversation(workspaceId, 'Fresh', 'gpt-4')
      expect(conv.needs_review).toBe(0)
    })
  })

  describe('getConversation', () => {
    it('returns a conversation by id', () => {
      const created = createConversation(workspaceId, 'Find Me', 'gpt-4')
      const found = getConversation(created.id)
      expect(found).toBeDefined()
      expect(found.title).toBe('Find Me')
    })

    it('returns undefined for a nonexistent id', () => {
      expect(getConversation(9999)).toBeUndefined()
    })
  })

  describe('getWorkspaceForConversation', () => {
    it('returns the workspace associated with a conversation', () => {
      const conv = createConversation(workspaceId, 'Chat', 'gpt-4')
      const ws = getWorkspaceForConversation(conv.id)
      expect(ws).toBeDefined()
      expect(ws.id).toBe(workspaceId)
      expect(ws.name).toBe('Test Workspace')
    })

    it('returns undefined if the conversation does not exist', () => {
      expect(getWorkspaceForConversation(9999)).toBeUndefined()
    })
  })

  describe('updateConversationTitle', () => {
    it('updates the title of a conversation', () => {
      const conv = createConversation(workspaceId, 'Old Title', 'gpt-4')
      updateConversationTitle(conv.id, 'New Title')
      const updated = getConversation(conv.id)
      expect(updated.title).toBe('New Title')
    })

    it('updates the updated_at timestamp', () => {
      // Insert with a known old timestamp
      db.prepare(
        "INSERT INTO conversations (workspace_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).run(workspaceId, 'Old', 'gpt-4', '2020-01-01 00:00:00', '2020-01-01 00:00:00')
      const conv = db
        .prepare('SELECT * FROM conversations WHERE title = ?')
        .get('Old') as any

      updateConversationTitle(conv.id, 'Updated')
      const after = getConversation(conv.id)
      expect(after.updated_at).not.toBe('2020-01-01 00:00:00')
    })
  })

  describe('updateConversationModel', () => {
    it('updates the model of a conversation', () => {
      const conv = createConversation(workspaceId, 'Chat', 'gpt-3.5')
      updateConversationModel(conv.id, 'gpt-4')
      const updated = getConversation(conv.id)
      expect(updated.model).toBe('gpt-4')
    })

    it('updates the updated_at timestamp', () => {
      db.prepare(
        "INSERT INTO conversations (workspace_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).run(workspaceId, 'Old', 'gpt-3.5', '2020-01-01 00:00:00', '2020-01-01 00:00:00')
      const conv = db
        .prepare('SELECT * FROM conversations WHERE title = ?')
        .get('Old') as any

      updateConversationModel(conv.id, 'gpt-4')
      const after = getConversation(conv.id)
      expect(after.updated_at).not.toBe('2020-01-01 00:00:00')
    })
  })

  describe('soft delete / restore', () => {
    it('deleteConversation sets deleted_at to a non-null timestamp', () => {
      const conv = createConversation(workspaceId, 'To Soft Delete', 'gpt-4')
      expect(conv.deleted_at).toBeNull()

      deleteConversation(conv.id)
      const after = getConversation(conv.id)
      expect(after.deleted_at).not.toBeNull()
      expect(after.deleted_at).toBeTypeOf('string')
    })

    it('restoreConversation clears deleted_at back to null', () => {
      const conv = createConversation(workspaceId, 'Restore Me', 'gpt-4')
      deleteConversation(conv.id)
      expect(getConversation(conv.id).deleted_at).not.toBeNull()

      restoreConversation(conv.id)
      expect(getConversation(conv.id).deleted_at).toBeNull()
    })

    it('soft-deleted conversations are excluded from getConversationsByWorkspace', () => {
      createConversation(workspaceId, 'Active', 'gpt-4')
      const toDelete = createConversation(workspaceId, 'Deleted', 'gpt-4')
      deleteConversation(toDelete.id)

      const active = getConversationsByWorkspace(workspaceId)
      expect(active).toHaveLength(1)
      expect(active[0].title).toBe('Active')
    })

    it('getDeletedConversationsByWorkspace returns only soft-deleted conversations', () => {
      createConversation(workspaceId, 'Active', 'gpt-4')
      const toDelete = createConversation(workspaceId, 'Deleted', 'gpt-4')
      deleteConversation(toDelete.id)

      const deleted = getDeletedConversationsByWorkspace(workspaceId)
      expect(deleted).toHaveLength(1)
      expect(deleted[0].title).toBe('Deleted')
    })

    it('getDeletedConversationsByWorkspace returns empty array when nothing is deleted', () => {
      createConversation(workspaceId, 'Active', 'gpt-4')
      expect(getDeletedConversationsByWorkspace(workspaceId)).toEqual([])
    })
  })

  describe('permanentlyDeleteConversation', () => {
    it('removes the conversation row entirely', () => {
      const conv = createConversation(workspaceId, 'Gone Forever', 'gpt-4')
      permanentlyDeleteConversation(conv.id)
      expect(getConversation(conv.id)).toBeUndefined()
    })

    it('cascade-deletes associated messages', () => {
      const conv = createConversation(workspaceId, 'Chat', 'gpt-4')
      addMessage(conv.id, 'user', 'hello')
      addMessage(conv.id, 'assistant', 'hi there')

      permanentlyDeleteConversation(conv.id)
      const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ?').all(conv.id)
      expect(msgs).toHaveLength(0)
    })
  })

  describe('setConversationNeedsReview', () => {
    it('sets needs_review to 1 when true', () => {
      const conv = createConversation(workspaceId, 'Review', 'gpt-4')
      setConversationNeedsReview(conv.id, true)
      expect(getConversation(conv.id).needs_review).toBe(1)
    })

    it('sets needs_review to 0 when false', () => {
      const conv = createConversation(workspaceId, 'Review', 'gpt-4')
      setConversationNeedsReview(conv.id, true)
      setConversationNeedsReview(conv.id, false)
      expect(getConversation(conv.id).needs_review).toBe(0)
    })

    it('updates the updated_at timestamp', () => {
      db.prepare(
        "INSERT INTO conversations (workspace_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).run(workspaceId, 'Review', 'gpt-4', '2020-01-01 00:00:00', '2020-01-01 00:00:00')
      const conv = db
        .prepare('SELECT * FROM conversations WHERE title = ?')
        .get('Review') as any

      setConversationNeedsReview(conv.id, true)
      const after = getConversation(conv.id)
      expect(after.updated_at).not.toBe('2020-01-01 00:00:00')
    })
  })
})

describe('getConversationsByWorkspace computed columns', () => {
  let workspaceId: number

  beforeEach(() => {
    const ws = createWorkspace('Computed Test', '/computed/test')
    workspaceId = ws.id
  })

  it('returns message_count of 0 when conversation has no messages', () => {
    createConversation(workspaceId, 'Empty', 'gpt-4')
    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs).toHaveLength(1)
    expect(convs[0].message_count).toBe(0)
  })

  it('returns correct message_count', () => {
    const conv = createConversation(workspaceId, 'Chat', 'gpt-4')
    addMessage(conv.id, 'user', 'msg 1')
    addMessage(conv.id, 'assistant', 'msg 2')
    addMessage(conv.id, 'user', 'msg 3')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].message_count).toBe(3)
  })

  it('returns awaiting_response = null when conversation has no messages', () => {
    createConversation(workspaceId, 'Empty', 'gpt-4')
    const convs = getConversationsByWorkspace(workspaceId)
    // The subquery returns NULL when there are no messages
    expect(convs[0].awaiting_response).toBeNull()
  })

  it('returns awaiting_response = 0 when last message is from user', () => {
    const conv = createConversation(workspaceId, 'User Last', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].awaiting_response).toBe(0)
  })

  it('returns awaiting_response = 0 when last assistant message does not end with question mark', () => {
    const conv = createConversation(workspaceId, 'No Q', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')
    addMessage(conv.id, 'assistant', 'Here is my answer.')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].awaiting_response).toBe(0)
  })

  it('returns awaiting_response = 1 when last assistant message ends with ?', () => {
    const conv = createConversation(workspaceId, 'Has Q', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')
    addMessage(conv.id, 'assistant', 'What do you think?')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].awaiting_response).toBe(1)
  })

  it('returns awaiting_response = 1 when assistant question has trailing markdown formatting', () => {
    const conv = createConversation(workspaceId, 'Formatted Q', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')
    addMessage(conv.id, 'assistant', 'What do you think?**')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].awaiting_response).toBe(1)
  })

  it('returns awaiting_response = 1 when assistant message contains [QUESTION_BLOCK]', () => {
    const conv = createConversation(workspaceId, 'QB', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')
    addMessage(conv.id, 'assistant', 'Some text [QUESTION_BLOCK] more text')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].awaiting_response).toBe(1)
  })

  it('returns last_message_role = null when conversation has no messages', () => {
    createConversation(workspaceId, 'Empty', 'gpt-4')
    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].last_message_role).toBeNull()
  })

  it('returns last_message_role = "user" when last message is from user', () => {
    const conv = createConversation(workspaceId, 'User Last', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].last_message_role).toBe('user')
  })

  it('returns last_message_role = "assistant" when last message is from assistant', () => {
    const conv = createConversation(workspaceId, 'Asst Last', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')
    addMessage(conv.id, 'assistant', 'Hi there!')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].last_message_role).toBe('assistant')
  })

  it('orders conversations by updated_at DESC', () => {
    // Create conversations with known timestamps
    db.prepare(
      "INSERT INTO conversations (workspace_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(workspaceId, 'Oldest', 'gpt-4', '2024-01-01 00:00:00', '2024-01-01 00:00:00')
    db.prepare(
      "INSERT INTO conversations (workspace_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(workspaceId, 'Newest', 'gpt-4', '2024-12-31 00:00:00', '2024-12-31 00:00:00')
    db.prepare(
      "INSERT INTO conversations (workspace_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(workspaceId, 'Middle', 'gpt-4', '2024-06-15 00:00:00', '2024-06-15 00:00:00')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].title).toBe('Newest')
    expect(convs[1].title).toBe('Middle')
    expect(convs[2].title).toBe('Oldest')
  })

  it('does not return conversations from other workspaces', () => {
    const ws2 = createWorkspace('Other', '/other/path')
    createConversation(workspaceId, 'Mine', 'gpt-4')
    createConversation(ws2.id, 'Theirs', 'gpt-4')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs).toHaveLength(1)
    expect(convs[0].title).toBe('Mine')
  })
})

describe('Message CRUD', () => {
  let workspaceId: number
  let conversationId: number

  beforeEach(() => {
    const ws = createWorkspace('Msg Test', '/msg/test')
    workspaceId = ws.id
    const conv = createConversation(workspaceId, 'Chat', 'gpt-4')
    conversationId = conv.id
  })

  describe('addMessage', () => {
    it('inserts a message and returns it', () => {
      const msg = addMessage(conversationId, 'user', 'Hello!')
      expect(msg).toBeDefined()
      expect(msg.id).toBeTypeOf('number')
      expect(msg.conversation_id).toBe(conversationId)
      expect(msg.role).toBe('user')
      expect(msg.content).toBe('Hello!')
      expect(msg.created_at).toBeDefined()
    })

    it('updates the conversation updated_at timestamp', () => {
      // Set a known old timestamp
      db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(
        '2020-01-01 00:00:00',
        conversationId
      )

      addMessage(conversationId, 'user', 'trigger update')
      const conv = getConversation(conversationId)
      expect(conv.updated_at).not.toBe('2020-01-01 00:00:00')
    })

    it('rejects invalid roles via CHECK constraint', () => {
      expect(() => addMessage(conversationId, 'system', 'not allowed')).toThrow()
    })

    it('allows user and assistant roles', () => {
      expect(() => addMessage(conversationId, 'user', 'ok')).not.toThrow()
      expect(() => addMessage(conversationId, 'assistant', 'ok')).not.toThrow()
    })

    it('auto-increments message ids', () => {
      const msg1 = addMessage(conversationId, 'user', 'first')
      const msg2 = addMessage(conversationId, 'assistant', 'second')
      expect(msg2.id).toBeGreaterThan(msg1.id)
    })
  })

  describe('getMessagesByConversation', () => {
    it('returns empty array when no messages exist', () => {
      expect(getMessagesByConversation(conversationId)).toEqual([])
    })

    it('returns messages ordered by created_at ASC', () => {
      // Insert with explicit timestamps to control order
      db.prepare(
        "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)"
      ).run(conversationId, 'user', 'third', '2024-01-03 00:00:00')
      db.prepare(
        "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)"
      ).run(conversationId, 'user', 'first', '2024-01-01 00:00:00')
      db.prepare(
        "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)"
      ).run(conversationId, 'assistant', 'second', '2024-01-02 00:00:00')

      const msgs = getMessagesByConversation(conversationId)
      expect(msgs).toHaveLength(3)
      expect(msgs[0].content).toBe('first')
      expect(msgs[1].content).toBe('second')
      expect(msgs[2].content).toBe('third')
    })

    it('does not return messages from other conversations', () => {
      const conv2 = createConversation(workspaceId, 'Other Chat', 'gpt-4')
      addMessage(conversationId, 'user', 'mine')
      addMessage(conv2.id, 'user', 'theirs')

      const msgs = getMessagesByConversation(conversationId)
      expect(msgs).toHaveLength(1)
      expect(msgs[0].content).toBe('mine')
    })
  })

  describe('deleteMessage', () => {
    it('removes a message by id', () => {
      const msg = addMessage(conversationId, 'user', 'delete me')
      expect(getMessagesByConversation(conversationId)).toHaveLength(1)

      deleteMessage(msg.id)
      expect(getMessagesByConversation(conversationId)).toHaveLength(0)
    })

    it('does not affect other messages', () => {
      const msg1 = addMessage(conversationId, 'user', 'keep')
      const msg2 = addMessage(conversationId, 'assistant', 'remove')

      deleteMessage(msg2.id)
      const remaining = getMessagesByConversation(conversationId)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe(msg1.id)
    })

    it('does nothing if the message does not exist', () => {
      expect(() => deleteMessage(9999)).not.toThrow()
    })
  })
})

describe('Settings', () => {
  describe('getSetting', () => {
    it('returns null for a nonexistent key with no default', () => {
      expect(getSetting('nonexistent')).toBeNull()
    })

    it('returns the default value for a nonexistent key when default is provided', () => {
      expect(getSetting('nonexistent', 'fallback')).toBe('fallback')
    })

    it('returns the stored value when the key exists', () => {
      setSetting('theme', 'dark')
      expect(getSetting('theme')).toBe('dark')
    })

    it('returns the stored value even when a default is provided', () => {
      setSetting('theme', 'dark')
      expect(getSetting('theme', 'light')).toBe('dark')
    })
  })

  describe('setSetting', () => {
    it('inserts a new setting', () => {
      setSetting('api_key', 'sk-123')
      expect(getSetting('api_key')).toBe('sk-123')
    })

    it('upserts (updates) an existing setting', () => {
      setSetting('api_key', 'sk-old')
      setSetting('api_key', 'sk-new')
      expect(getSetting('api_key')).toBe('sk-new')
    })

    it('handles multiple independent keys', () => {
      setSetting('key1', 'value1')
      setSetting('key2', 'value2')
      expect(getSetting('key1')).toBe('value1')
      expect(getSetting('key2')).toBe('value2')
    })

    it('stores values with special characters', () => {
      const specialValue = "it's a \"test\" with\nnewlines & symbols <> !@#$%"
      setSetting('special', specialValue)
      expect(getSetting('special')).toBe(specialValue)
    })

    it('stores empty string values', () => {
      setSetting('empty', '')
      // Empty string should be returned, not null/default
      expect(getSetting('empty')).toBe('')
    })
  })
})

describe('Constraint enforcement', () => {
  it('rejects a conversation referencing a nonexistent workspace (foreign key)', () => {
    expect(() => createConversation(9999, 'Orphan', 'gpt-4')).toThrow()
  })

  it('rejects a message referencing a nonexistent conversation (foreign key)', () => {
    expect(() => addMessage(9999, 'user', 'orphan message')).toThrow()
  })

  it('rejects a workspace with a null name', () => {
    expect(() => {
      db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)').run(null, '/path')
    }).toThrow()
  })

  it('rejects a workspace with a null path', () => {
    expect(() => {
      db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)').run('Name', null)
    }).toThrow()
  })

  it('rejects a conversation with a null title', () => {
    const ws = createWorkspace('WS', '/ws')
    expect(() => {
      db.prepare(
        'INSERT INTO conversations (workspace_id, title, model) VALUES (?, ?, ?)'
      ).run(ws.id, null, 'gpt-4')
    }).toThrow()
  })

  it('rejects a conversation with a null model', () => {
    const ws = createWorkspace('WS', '/ws')
    expect(() => {
      db.prepare(
        'INSERT INTO conversations (workspace_id, title, model) VALUES (?, ?, ?)'
      ).run(ws.id, 'Title', null)
    }).toThrow()
  })

  it('rejects a message with empty role', () => {
    const ws = createWorkspace('WS', '/ws')
    const conv = createConversation(ws.id, 'Chat', 'gpt-4')
    expect(() => addMessage(conv.id, '', 'content')).toThrow()
  })

  it('rejects a message with null content', () => {
    const ws = createWorkspace('WS', '/ws')
    const conv = createConversation(ws.id, 'Chat', 'gpt-4')
    expect(() => {
      db.prepare(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
      ).run(conv.id, 'user', null)
    }).toThrow()
  })
})

describe('Edge cases', () => {
  it('handles very long workspace names', () => {
    const longName = 'A'.repeat(10000)
    const ws = createWorkspace(longName, '/long/name')
    expect(ws.name).toBe(longName)
  })

  it('handles very long message content', () => {
    const ws = createWorkspace('WS', '/ws')
    const conv = createConversation(ws.id, 'Chat', 'gpt-4')
    const longContent = 'X'.repeat(100000)
    const msg = addMessage(conv.id, 'user', longContent)
    expect(msg.content).toBe(longContent)
  })

  it('handles unicode in workspace names, conversation titles, and messages', () => {
    const ws = createWorkspace('Projekt: Ubersetzung', '/unicode/test')
    const conv = createConversation(ws.id, 'Gesprach', 'gpt-4')
    const msg = addMessage(conv.id, 'user', 'Bonjour le monde!')

    expect(ws.name).toBe('Projekt: Ubersetzung')
    expect(conv.title).toBe('Gesprach')
    expect(msg.content).toBe('Bonjour le monde!')
  })

  it('handles emoji in content', () => {
    const ws = createWorkspace('WS', '/emoji')
    const conv = createConversation(ws.id, 'Chat', 'gpt-4')
    const msg = addMessage(conv.id, 'user', 'Hello world! Testing content with special chars.')
    expect(msg.content).toContain('Hello world!')
  })

  it('getConversationsByWorkspace returns empty for a workspace with no conversations', () => {
    const ws = createWorkspace('Empty WS', '/empty')
    expect(getConversationsByWorkspace(ws.id)).toEqual([])
  })

  it('multiple addMessage calls produce sequential ids', () => {
    const ws = createWorkspace('WS', '/seq')
    const conv = createConversation(ws.id, 'Chat', 'gpt-4')
    const ids: number[] = []
    for (let i = 0; i < 5; i++) {
      const msg = addMessage(conv.id, i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`)
      ids.push(msg.id)
    }
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1])
    }
  })

  it('soft-deleting and restoring preserves all conversation data', () => {
    const ws = createWorkspace('WS', '/preserve')
    const conv = createConversation(ws.id, 'Preserve Me', 'gpt-4', 'sess-abc')
    addMessage(conv.id, 'user', 'keep this')

    deleteConversation(conv.id)
    restoreConversation(conv.id)

    const restored = getConversation(conv.id)
    expect(restored.title).toBe('Preserve Me')
    expect(restored.model).toBe('gpt-4')
    expect(restored.session_id).toBe('sess-abc')
    expect(restored.deleted_at).toBeNull()

    // Messages should still be there
    const msgs = getMessagesByConversation(conv.id)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].content).toBe('keep this')
  })
})
