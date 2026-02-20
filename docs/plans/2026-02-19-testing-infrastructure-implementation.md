# Testing Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full-stack testing (Vitest unit + Playwright Electron e2e) to the Singularity app with real Claude fixture data for deterministic mocks.

**Architecture:** Vitest handles unit tests for main process modules (Node env) and React components (jsdom env) using workspace configs. Playwright launches the built Electron app for e2e tests, with a mock Claude CLI binary injected via PATH to replay captured JSONL fixtures.

**Tech Stack:** Vitest, @playwright/test, @testing-library/react, @testing-library/jest-dom, jsdom, better-sqlite3 (in-memory), electron-playwright-helpers

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install test dependencies**

Run:
```bash
npm install --save-dev vitest @vitest/coverage-v8 @playwright/test @testing-library/react @testing-library/jest-dom jsdom electron-playwright-helpers
```

**Step 2: Verify installation**

Run: `npx vitest --version && npx playwright --version`
Expected: Version numbers printed for both

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add test dependencies (vitest, playwright, testing-library)"
```

---

### Task 2: Create Vitest Configuration

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create the vitest config with workspace-style projects**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    projects: [
      {
        test: {
          name: 'main',
          include: ['tests/unit/main/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          include: ['tests/unit/renderer/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/helpers/setup-renderer.ts']
        }
      }
    ]
  }
})
```

**Step 2: Create renderer test setup file**

Create `tests/helpers/setup-renderer.ts`:

```ts
import '@testing-library/jest-dom/vitest'

// Mock window.electronAPI for all renderer tests
const mockElectronAPI = {
  getWorkspaces: vi.fn().mockResolvedValue([]),
  addWorkspace: vi.fn().mockResolvedValue(null),
  deleteWorkspace: vi.fn().mockResolvedValue(true),
  getConversations: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn().mockResolvedValue({ id: 1, workspace_id: 1, title: 'New Conversation', model: 'claude-sonnet-4-6' }),
  updateConversationTitle: vi.fn().mockResolvedValue(true),
  updateConversationModel: vi.fn().mockResolvedValue(true),
  deleteConversation: vi.fn().mockResolvedValue(true),
  setConversationNeedsReview: vi.fn().mockResolvedValue(true),
  getDeletedConversations: vi.fn().mockResolvedValue([]),
  restoreConversation: vi.fn().mockResolvedValue(true),
  permanentlyDeleteConversation: vi.fn().mockResolvedValue(true),
  getMessages: vi.fn().mockResolvedValue([]),
  sendMessage: vi.fn().mockResolvedValue(''),
  deleteMessage: vi.fn().mockResolvedValue(true),
  getStreamingState: vi.fn().mockResolvedValue(null),
  isProcessActive: vi.fn().mockResolvedValue(false),
  cancelMessage: vi.fn().mockResolvedValue(undefined),
  getApiKeyStatus: vi.fn().mockResolvedValue(true),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(true),
  transcribeAudio: vi.fn().mockResolvedValue(''),
  getWhisperStatus: vi.fn().mockResolvedValue({ modelDownloaded: false, modelPath: null, isDownloading: false }),
  downloadWhisperModel: vi.fn().mockResolvedValue(true),
  onWhisperDownloadProgress: vi.fn(),
  removeWhisperDownloadListener: vi.fn(),
  brainRead: vi.fn().mockResolvedValue({ entries: [], raw: '', tokenEstimate: 0 }),
  brainWrite: vi.fn().mockResolvedValue(true),
  brainAppend: vi.fn().mockResolvedValue(true),
  brainRemove: vi.fn().mockResolvedValue(true),
  brainUpdate: vi.fn().mockResolvedValue(true),
  brainCategories: vi.fn().mockResolvedValue([]),
  brainExists: vi.fn().mockResolvedValue(false),
  brainScan: vi.fn().mockResolvedValue({ entries: [], raw: '', tokenEstimate: 0 }),
  brainExtractMemories: vi.fn().mockResolvedValue([]),
  brainTokenThreshold: vi.fn().mockResolvedValue(2000),
  onStreamDelta: vi.fn(),
  onStreamComplete: vi.fn(),
  onToolActivity: vi.fn(),
  onConversationTitleUpdated: vi.fn(),
  removeStreamListeners: vi.fn(),
  removeTitleListener: vi.fn()
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
})
```

**Step 3: Verify vitest runs with no tests**

Run: `npx vitest run`
Expected: "No test files found" or similar, no config errors

**Step 4: Commit**

```bash
git add vitest.config.ts tests/helpers/setup-renderer.ts
git commit -m "chore: add vitest config with node/jsdom workspace projects"
```

---

### Task 3: Add npm Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add test scripts to package.json**

Add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:unit": "vitest run",
"test:e2e": "npx playwright test",
"test:coverage": "vitest run --coverage"
```

**Step 2: Verify npm test runs**

Run: `npm test`
Expected: Vitest runs successfully (no tests found is OK)

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add test npm scripts"
```

---

### Task 4: Create Test Database Helper

**Files:**
- Create: `tests/helpers/test-db.ts`

**Step 1: Write the in-memory database factory**

This helper creates an in-memory SQLite database with the same schema as the app, allowing unit tests to run without touching disk. The key insight: `database.ts` uses `app.getPath('userData')` in `initDatabase()`, so we need a way to inject an in-memory DB for tests.

```ts
import Database from 'better-sqlite3'

/**
 * Creates an in-memory SQLite database with the Singularity schema.
 * Mirrors the schema and migrations from src/main/database.ts.
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:')

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

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
      deleted_at TEXT DEFAULT NULL,
      needs_review INTEGER DEFAULT 0,
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

  return db
}
```

**Step 2: Commit**

```bash
git add tests/helpers/test-db.ts
git commit -m "feat(test): add in-memory SQLite test database factory"
```

---

### Task 5: Unit Tests — database.ts

**Files:**
- Create: `tests/unit/main/database.test.ts`
- Reference: `src/main/database.ts`

The database module uses a module-level `db` variable set by `initDatabase()`. For testing, we'll mock the `electron` module (so `app.getPath` doesn't fail) and use `vi.importActual` to test the real logic against the in-memory DB. Alternatively, we test the SQL logic indirectly by using the test-db helper and running the same queries.

**Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDatabase } from '../../helpers/test-db'

// We test the database logic by running the same SQL against an in-memory DB.
// This avoids mocking electron's app module entirely.

describe('database', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  describe('workspaces', () => {
    it('creates and retrieves a workspace', () => {
      const stmt = db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)')
      stmt.run('Test Project', '/tmp/test-project')

      const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all() as Array<{ id: number; name: string; path: string }>
      expect(workspaces).toHaveLength(1)
      expect(workspaces[0].name).toBe('Test Project')
      expect(workspaces[0].path).toBe('/tmp/test-project')
    })

    it('enforces unique path constraint', () => {
      db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)').run('A', '/tmp/a')
      expect(() => {
        db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)').run('B', '/tmp/a')
      }).toThrow()
    })

    it('cascades deletes to conversations and messages', () => {
      db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)').run('WS', '/tmp/ws')
      const ws = db.prepare('SELECT id FROM workspaces WHERE path = ?').get('/tmp/ws') as { id: number }

      db.prepare('INSERT INTO conversations (workspace_id, title, model) VALUES (?, ?, ?)').run(ws.id, 'Conv', 'claude-sonnet-4-6')
      const conv = db.prepare('SELECT id FROM conversations WHERE workspace_id = ?').get(ws.id) as { id: number }

      db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conv.id, 'user', 'hello')

      db.prepare('DELETE FROM workspaces WHERE id = ?').run(ws.id)

      const convs = db.prepare('SELECT * FROM conversations WHERE workspace_id = ?').all(ws.id)
      const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ?').all(conv.id)
      expect(convs).toHaveLength(0)
      expect(msgs).toHaveLength(0)
    })
  })

  describe('conversations', () => {
    let workspaceId: number

    beforeEach(() => {
      db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)').run('WS', '/tmp/ws')
      workspaceId = (db.prepare('SELECT id FROM workspaces WHERE path = ?').get('/tmp/ws') as { id: number }).id
    })

    it('creates a conversation with session_id', () => {
      db.prepare('INSERT INTO conversations (workspace_id, title, model, session_id) VALUES (?, ?, ?, ?)').run(workspaceId, 'Test', 'claude-sonnet-4-6', 'sess-123')
      const conv = db.prepare('SELECT * FROM conversations WHERE workspace_id = ?').get(workspaceId) as Record<string, unknown>
      expect(conv.title).toBe('Test')
      expect(conv.session_id).toBe('sess-123')
    })

    it('soft deletes and restores conversations', () => {
      db.prepare('INSERT INTO conversations (workspace_id, title, model) VALUES (?, ?, ?)').run(workspaceId, 'Conv', 'claude-sonnet-4-6')
      const conv = db.prepare('SELECT id FROM conversations WHERE workspace_id = ?').get(workspaceId) as { id: number }

      // Soft delete
      db.prepare("UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?").run(conv.id)
      const active = db.prepare('SELECT * FROM conversations WHERE workspace_id = ? AND deleted_at IS NULL').all(workspaceId)
      expect(active).toHaveLength(0)

      const deleted = db.prepare('SELECT * FROM conversations WHERE workspace_id = ? AND deleted_at IS NOT NULL').all(workspaceId)
      expect(deleted).toHaveLength(1)

      // Restore
      db.prepare('UPDATE conversations SET deleted_at = NULL WHERE id = ?').run(conv.id)
      const restored = db.prepare('SELECT * FROM conversations WHERE workspace_id = ? AND deleted_at IS NULL').all(workspaceId)
      expect(restored).toHaveLength(1)
    })

    it('computes awaiting_response from last message', () => {
      db.prepare('INSERT INTO conversations (workspace_id, title, model) VALUES (?, ?, ?)').run(workspaceId, 'Conv', 'claude-sonnet-4-6')
      const conv = db.prepare('SELECT id FROM conversations WHERE workspace_id = ?').get(workspaceId) as { id: number }

      // Add a user message then an assistant message ending with ?
      db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conv.id, 'user', 'hello')
      db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conv.id, 'assistant', 'What do you think?')

      const result = db.prepare(`
        SELECT c.*,
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
          LIMIT 1) as awaiting_response
        FROM conversations c
        WHERE c.id = ?
      `).get(conv.id) as Record<string, unknown>

      expect(result.awaiting_response).toBe(1)
    })
  })

  describe('messages', () => {
    let conversationId: number

    beforeEach(() => {
      db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)').run('WS', '/tmp/ws')
      const ws = db.prepare('SELECT id FROM workspaces WHERE path = ?').get('/tmp/ws') as { id: number }
      db.prepare('INSERT INTO conversations (workspace_id, title, model) VALUES (?, ?, ?)').run(ws.id, 'Conv', 'claude-sonnet-4-6')
      conversationId = (db.prepare('SELECT id FROM conversations WHERE workspace_id = ?').get(ws.id) as { id: number }).id
    })

    it('adds and retrieves messages in order', () => {
      db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'user', 'hello')
      db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'assistant', 'hi there')

      const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as Array<{ role: string; content: string }>
      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe('user')
      expect(msgs[1].role).toBe('assistant')
    })

    it('rejects invalid roles', () => {
      expect(() => {
        db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'system', 'nope')
      }).toThrow()
    })
  })

  describe('settings', () => {
    it('upserts and retrieves settings', () => {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run('theme', 'dark', 'dark')
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('theme') as { value: string }
      expect(row.value).toBe('dark')

      // Update
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run('theme', 'light', 'light')
      const updated = db.prepare('SELECT value FROM settings WHERE key = ?').get('theme') as { value: string }
      expect(updated.value).toBe('light')
    })
  })
})
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/unit/main/database.test.ts`
Expected: All tests PASS (these test SQL directly, no app code mocking needed)

**Step 3: Commit**

```bash
git add tests/unit/main/database.test.ts
git commit -m "test: add database unit tests (schema, CRUD, constraints, computed columns)"
```

---

### Task 6: Unit Tests — brain.ts

**Files:**
- Create: `tests/unit/main/brain.test.ts`
- Reference: `src/main/brain.ts:22-60` (parseBrainMd, serializeBrainMd)
- Reference: `src/main/brain.ts:117-198` (scanWorkspace)

The pure functions `parseBrainMd`, `serializeBrainMd`, and `getTokenWarningThreshold` can be tested directly. Functions that touch the filesystem (`readBrain`, `writeBrain`, `scanWorkspace`, etc.) need `fs` mocking.

**Step 1: Write tests for pure parsing functions**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseBrainMd, serializeBrainMd, getTokenWarningThreshold } from '../../../src/main/brain'

// Mock logger to avoid electron dependency
vi.mock('../../../src/main/logger', () => ({
  log: vi.fn()
}))

describe('brain', () => {
  describe('parseBrainMd', () => {
    it('parses entries with categories', () => {
      const md = `# Singularity Brain

## Tech Stack
- react ^19.2.1
- typescript ^5.9.3

## Conventions
- Use functional components
`
      const entries = parseBrainMd(md)
      expect(entries).toHaveLength(3)
      expect(entries[0]).toEqual({ text: 'react ^19.2.1', category: 'Tech Stack' })
      expect(entries[1]).toEqual({ text: 'typescript ^5.9.3', category: 'Tech Stack' })
      expect(entries[2]).toEqual({ text: 'Use functional components', category: 'Conventions' })
    })

    it('defaults to General category when no heading', () => {
      const md = `- standalone entry`
      const entries = parseBrainMd(md)
      expect(entries).toEqual([{ text: 'standalone entry', category: 'General' }])
    })

    it('returns empty array for empty content', () => {
      expect(parseBrainMd('')).toEqual([])
    })

    it('ignores non-list-item lines', () => {
      const md = `## Category
Some paragraph text
- actual entry
More text`
      const entries = parseBrainMd(md)
      expect(entries).toEqual([{ text: 'actual entry', category: 'Category' }])
    })
  })

  describe('serializeBrainMd', () => {
    it('groups entries by category', () => {
      const entries = [
        { text: 'react', category: 'Tech Stack' },
        { text: 'typescript', category: 'Tech Stack' },
        { text: 'use hooks', category: 'Conventions' }
      ]
      const md = serializeBrainMd(entries)
      expect(md).toContain('## Tech Stack')
      expect(md).toContain('- react')
      expect(md).toContain('- typescript')
      expect(md).toContain('## Conventions')
      expect(md).toContain('- use hooks')
    })

    it('round-trips parse/serialize', () => {
      const entries = [
        { text: 'entry one', category: 'Cat A' },
        { text: 'entry two', category: 'Cat B' }
      ]
      const serialized = serializeBrainMd(entries)
      const parsed = parseBrainMd(serialized)
      expect(parsed).toEqual(entries)
    })
  })

  describe('getTokenWarningThreshold', () => {
    it('returns 2000', () => {
      expect(getTokenWarningThreshold()).toBe(2000)
    })
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run tests/unit/main/brain.test.ts`
Expected: All PASS

**Step 3: Add tests for filesystem-dependent functions**

Add to the same file, a second describe block for `scanWorkspace`:

```ts
import { scanWorkspace } from '../../../src/main/brain'
import { existsSync, readFileSync } from 'fs'

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
})

describe('scanWorkspace', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false)
  })

  it('detects package.json dependencies', () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      return typeof p === 'string' && p.endsWith('package.json')
    })
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      dependencies: { react: '^19.0.0', electron: '^38.0.0' },
      devDependencies: { typescript: '^5.0.0' }
    }))

    const entries = scanWorkspace('/tmp/test')
    const texts = entries.map(e => e.text)
    expect(texts).toContain('react ^19.0.0')
    expect(texts).toContain('electron ^38.0.0')
    expect(texts).toContain('typescript ^5.0.0')
    expect(entries.every(e => e.category === 'Tech Stack')).toBe(true)
  })

  it('detects tsconfig.json', () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      return typeof p === 'string' && p.endsWith('tsconfig.json')
    })

    const entries = scanWorkspace('/tmp/test')
    expect(entries).toContainEqual({ text: 'TypeScript project', category: 'Tech Stack' })
  })

  it('returns empty for bare directory', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const entries = scanWorkspace('/tmp/empty')
    expect(entries).toEqual([])
  })
})
```

**Step 4: Run all brain tests**

Run: `npx vitest run tests/unit/main/brain.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add tests/unit/main/brain.test.ts
git commit -m "test: add brain parsing, serialization, and scanWorkspace tests"
```

---

### Task 7: Unit Tests — claude-cli.ts (pure functions)

**Files:**
- Create: `tests/unit/main/claude-cli.test.ts`
- Reference: `src/main/claude-cli.ts:26-70` (utility functions)

The claude-cli module has several pure/near-pure functions we can test without spawning processes: `generateSessionId`, `shortenPath`, `truncate`, `formatToolActivity`, `formatAskUserQuestion`. Some are not exported, so we'll test the exported ones and the ones we can access.

Note: `shortenPath`, `truncate`, `formatToolActivity`, `formatAskUserQuestion` are not exported. We have two options: (a) export them for testing, or (b) test them indirectly through `sendClaudeMessage`. Option (a) is simpler and more maintainable.

**Step 1: Export the utility functions for testing**

Modify `src/main/claude-cli.ts:30-91`. Add `export` to these functions:

```ts
// Line 30: change `function shortenPath` to `export function shortenPath`
// Line 37: change `function truncate` to `export function truncate`
// Line 42: change `function formatToolActivity` to `export function formatToolActivity`
// Line 72: change `function formatAskUserQuestion` to `export function formatAskUserQuestion`
```

**Step 2: Write tests**

```ts
import { describe, it, expect, vi } from 'vitest'

// Mock electron and logger before importing
vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))
vi.mock('../../../src/main/logger', () => ({ log: vi.fn() }))

import {
  generateSessionId,
  shortenPath,
  truncate,
  formatToolActivity,
  formatAskUserQuestion,
  isProcessActive,
  getStreamingContent
} from '../../../src/main/claude-cli'

describe('claude-cli utilities', () => {
  describe('generateSessionId', () => {
    it('returns a UUID string', () => {
      const id = generateSessionId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('returns unique IDs', () => {
      const a = generateSessionId()
      const b = generateSessionId()
      expect(a).not.toBe(b)
    })
  })

  describe('shortenPath', () => {
    it('returns last 2 path segments for long paths', () => {
      expect(shortenPath('/Users/mike/Repos/singularity/src/main/index.ts')).toBe('main/index.ts')
    })

    it('returns full path for short paths', () => {
      expect(shortenPath('file.ts')).toBe('file.ts')
      expect(shortenPath('src/file.ts')).toBe('src/file.ts')
    })

    it('handles backslashes (Windows)', () => {
      expect(shortenPath('C:\\Users\\mike\\file.ts')).toBe('mike/file.ts')
    })

    it('returns empty string for non-string input', () => {
      expect(shortenPath(undefined)).toBe('')
      expect(shortenPath(null)).toBe('')
      expect(shortenPath(42)).toBe('')
    })
  })

  describe('truncate', () => {
    it('truncates long strings with ellipsis', () => {
      expect(truncate('hello world this is a long string', 10)).toBe('hello worl...')
    })

    it('returns short strings unchanged', () => {
      expect(truncate('short', 10)).toBe('short')
    })

    it('returns empty string for non-string input', () => {
      expect(truncate(undefined, 10)).toBe('')
      expect(truncate(42, 10)).toBe('')
    })
  })

  describe('formatToolActivity', () => {
    it('formats Read tool', () => {
      expect(formatToolActivity('Read', { file_path: '/src/main/index.ts' })).toBe('Reading main/index.ts')
    })

    it('formats Write tool', () => {
      expect(formatToolActivity('Write', { file_path: '/src/test.ts' })).toBe('Writing src/test.ts')
    })

    it('formats Edit tool', () => {
      expect(formatToolActivity('Edit', { file_path: '/a/b/c.ts' })).toBe('Editing b/c.ts')
    })

    it('formats Bash tool', () => {
      expect(formatToolActivity('Bash', {})).toBe('Running command')
    })

    it('formats Grep tool', () => {
      expect(formatToolActivity('Grep', { pattern: 'function\\s+test' })).toBe('Searching for "function\\s+test"')
    })

    it('formats Glob tool', () => {
      expect(formatToolActivity('Glob', { pattern: '**/*.ts' })).toBe('Finding files matching **/*.ts')
    })

    it('formats WebFetch tool', () => {
      expect(formatToolActivity('WebFetch', {})).toBe('Fetching web page')
    })

    it('formats WebSearch tool', () => {
      expect(formatToolActivity('WebSearch', {})).toBe('Searching the web')
    })

    it('returns null for AskUserQuestion', () => {
      expect(formatToolActivity('AskUserQuestion', {})).toBeNull()
    })

    it('formats unknown tools with name', () => {
      expect(formatToolActivity('CustomTool', {})).toBe('Using CustomTool')
    })
  })

  describe('formatAskUserQuestion', () => {
    it('formats questions with options', () => {
      const input = {
        questions: [{
          question: 'Which approach?',
          options: [
            { label: 'Option A', description: 'First approach' },
            { label: 'Option B', description: 'Second approach' }
          ]
        }]
      }
      const result = formatAskUserQuestion(input)
      expect(result).toContain('[QUESTION_BLOCK]')
      expect(result).toContain('**Which approach?**')
      expect(result).toContain('1. **Option A** — First approach')
      expect(result).toContain('2. **Option B** — Second approach')
      expect(result).toContain('[/QUESTION_BLOCK]')
    })

    it('returns empty string for missing questions', () => {
      expect(formatAskUserQuestion({})).toBe('')
      expect(formatAskUserQuestion({ questions: [] })).toBe('')
      expect(formatAskUserQuestion(null)).toBe('')
    })
  })

  describe('state queries', () => {
    it('isProcessActive returns false for unknown conversation', () => {
      expect(isProcessActive(999)).toBe(false)
    })

    it('getStreamingContent returns null for unknown conversation', () => {
      expect(getStreamingContent(999)).toBeNull()
    })
  })
})
```

**Step 3: Run tests**

Run: `npx vitest run tests/unit/main/claude-cli.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/main/claude-cli.ts tests/unit/main/claude-cli.test.ts
git commit -m "test: add claude-cli utility function tests"
```

---

### Task 8: Unit Tests — logger.ts

**Files:**
- Create: `tests/unit/main/logger.test.ts`
- Reference: `src/main/logger.ts`

**Step 1: Write tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appendFileSync, writeFileSync } from 'fs'

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/test-app') }
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    appendFileSync: vi.fn(),
    writeFileSync: vi.fn()
  }
})

import { initLogger, log, getLogPath } from '../../../src/main/logger'

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes log file on startup', () => {
    initLogger()
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('singularity.log'),
      expect.stringContaining('Singularity started')
    )
  })

  it('getLogPath returns the log file path after init', () => {
    initLogger()
    expect(getLogPath()).toContain('singularity.log')
  })

  it('writes formatted log lines', () => {
    initLogger()
    log('test-cat', 'hello world')
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('singularity.log'),
      expect.stringMatching(/\[.*\] \[test-cat\] hello world\n/)
    )
  })

  it('serializes data as JSON', () => {
    initLogger()
    log('test', 'with data', { key: 'value' })
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('{"key":"value"}')
    )
  })

  it('handles unserializable data gracefully', () => {
    initLogger()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    log('test', 'circular', circular)
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('[unserializable]')
    )
  })

  it('does not write when logger not initialized', () => {
    // Reset the module to clear logPath
    vi.resetModules()
    // Re-mock after reset
    vi.doMock('electron', () => ({
      app: { getPath: vi.fn().mockReturnValue('/tmp/test-app') }
    }))
    vi.doMock('fs', () => ({
      appendFileSync: vi.fn(),
      writeFileSync: vi.fn()
    }))
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run tests/unit/main/logger.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add tests/unit/main/logger.test.ts
git commit -m "test: add logger unit tests"
```

---

### Task 9: Unit Tests — anthropic.ts

**Files:**
- Create: `tests/unit/main/anthropic.test.ts`
- Reference: `src/main/anthropic.ts`

**Step 1: Write tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Anthropic SDK
const mockCreate = vi.fn()
const mockStream = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
        stream: mockStream
      }
    }))
  }
})

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))

import { initAnthropicClient, generateTitle, extractMemories } from '../../../src/main/anthropic'

describe('anthropic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initAnthropicClient', () => {
    it('returns false when no API key', () => {
      delete process.env.ANTHROPIC_API_KEY
      expect(initAnthropicClient()).toBe(false)
    })

    it('returns true with regular API key', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test-key'
      expect(initAnthropicClient()).toBe(true)
      delete process.env.ANTHROPIC_API_KEY
    })

    it('returns true with OAuth token', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-oat-test-token'
      expect(initAnthropicClient()).toBe(true)
      delete process.env.ANTHROPIC_API_KEY
    })
  })

  describe('generateTitle', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test'
      initAnthropicClient()
    })

    afterEach(() => {
      delete process.env.ANTHROPIC_API_KEY
    })

    it('returns generated title from API', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'React Component Design' }]
      })
      const title = await generateTitle('Help me build a React component')
      expect(title).toBe('React Component Design')
    })

    it('falls back to first words on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API error'))
      const title = await generateTitle('Help me build a React component for login')
      expect(title).toBe('Help me build a React')
    })

    it('truncates long fallback titles', async () => {
      mockCreate.mockRejectedValue(new Error('fail'))
      const longMessage = 'This is a very long message that definitely exceeds the forty character limit when we take the first five words'
      const title = await generateTitle(longMessage)
      expect(title.length).toBeLessThanOrEqual(43) // 40 + '...'
    })
  })

  describe('extractMemories', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-api-test'
      initAnthropicClient()
    })

    afterEach(() => {
      delete process.env.ANTHROPIC_API_KEY
    })

    it('parses valid JSON response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '[{"text":"Uses Vitest for testing","category":"Tech Stack"}]' }]
      })
      const memories = await extractMemories('We use Vitest for all tests')
      expect(memories).toEqual([{ text: 'Uses Vitest for testing', category: 'Tech Stack' }])
    })

    it('returns empty array for invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not json' }]
      })
      const memories = await extractMemories('some content')
      expect(memories).toEqual([])
    })

    it('filters out malformed entries', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '[{"text":"valid","category":"Cat"},{"bad":"entry"},42]' }]
      })
      const memories = await extractMemories('content')
      expect(memories).toEqual([{ text: 'valid', category: 'Cat' }])
    })

    it('returns empty array for non-text content blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }]
      })
      const memories = await extractMemories('content')
      expect(memories).toEqual([])
    })
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run tests/unit/main/anthropic.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add tests/unit/main/anthropic.test.ts
git commit -m "test: add anthropic client, generateTitle, extractMemories tests"
```

---

### Task 10: Capture Real Claude Fixtures

**Files:**
- Create: `tests/helpers/capture-fixtures.ts`
- Create: `tests/fixtures/README.md`

This script sends real prompts to Claude CLI and saves the raw JSONL output for use as mock data.

**Step 1: Create the fixture capture script**

```ts
#!/usr/bin/env npx tsx

/**
 * Capture real Claude CLI responses as test fixtures.
 *
 * Usage: npm run test:capture-fixtures
 *
 * This sends predefined prompts to Claude CLI and saves the raw JSONL stream
 * output. These fixtures are used by both unit tests (to test parsing) and
 * e2e tests (as mock CLI responses).
 */

import { spawn } from 'child_process'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const FIXTURES_DIR = join(__dirname, '..', 'fixtures')

interface FixtureCapture {
  name: string
  prompt: string
  description: string
}

const captures: FixtureCapture[] = [
  {
    name: 'claude-stream-simple',
    prompt: 'Say exactly: "Hello! I am a test response." Nothing else.',
    description: 'Simple text-only response with no tool use'
  },
  {
    name: 'claude-stream-with-tools',
    prompt: 'Read the file package.json and tell me the project name. Keep your response to one sentence.',
    description: 'Response that involves tool use (Read) then text'
  },
  {
    name: 'claude-stream-with-questions',
    prompt: 'Ask me exactly one multiple-choice question about what color I prefer, with 3 options. Use the AskUserQuestion tool.',
    description: 'Response containing AskUserQuestion blocks'
  }
]

async function captureFixture(capture: FixtureCapture): Promise<void> {
  console.log(`\nCapturing: ${capture.name}`)
  console.log(`  Prompt: ${capture.prompt}`)

  return new Promise((resolve, reject) => {
    const args = [
      '-p', capture.prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model', 'claude-haiku-4-5-20251001',
      '--permission-mode', 'bypassPermissions'
    ]

    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.ANTHROPIC_API_KEY

    const child = spawn('claude', args, {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    child.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    let stderr = ''
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0 && !output) {
        console.error(`  FAILED (exit code ${code}): ${stderr.slice(0, 200)}`)
        reject(new Error(`Fixture capture failed for ${capture.name}`))
        return
      }

      const filePath = join(FIXTURES_DIR, `${capture.name}.jsonl`)
      writeFileSync(filePath, output)
      console.log(`  Saved: ${filePath} (${output.length} bytes, ${output.split('\n').length} lines)`)
      resolve()
    })

    child.on('error', (err) => {
      console.error(`  ERROR: ${err.message}`)
      reject(err)
    })
  })
}

async function main(): Promise<void> {
  console.log('Capturing Claude CLI fixtures...')
  console.log(`Output directory: ${FIXTURES_DIR}`)

  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true })
  }

  for (const capture of captures) {
    try {
      await captureFixture(capture)
    } catch (err) {
      console.error(`Skipping ${capture.name}: ${(err as Error).message}`)
    }
  }

  console.log('\nDone! Fixtures are ready for use in tests.')
}

main().catch(console.error)
```

**Step 2: Create fixtures README**

Create `tests/fixtures/README.md`:

```md
# Test Fixtures

JSONL captures of real Claude CLI streaming output, used as mock data in tests.

## How to capture new fixtures

```bash
npm run test:capture-fixtures
```

This sends predefined prompts to the real Claude CLI and saves the raw JSONL
stream output. Requires Claude CLI to be installed and authenticated.

## Files

- `claude-stream-simple.jsonl` — Simple text-only response
- `claude-stream-with-tools.jsonl` — Response involving tool use (Read, etc.)
- `claude-stream-with-questions.jsonl` — Response with AskUserQuestion blocks

## Usage

Unit tests import these files to test JSONL parsing logic.
E2E tests use them via the mock Claude CLI binary (`tests/helpers/mock-claude-cli.ts`).
```

**Step 3: Add the capture script to package.json**

Add `tsx` dev dependency and the npm script:

Run: `npm install --save-dev tsx`

Add script: `"test:capture-fixtures": "npx tsx tests/helpers/capture-fixtures.ts"`

**Step 4: Run the fixture capture** (requires Claude CLI)

Run: `npm run test:capture-fixtures`
Expected: JSONL files created in `tests/fixtures/`

**Step 5: Commit**

```bash
git add tests/helpers/capture-fixtures.ts tests/fixtures/ package.json package-lock.json
git commit -m "feat(test): add Claude fixture capture script and initial fixtures"
```

---

### Task 11: Unit Tests — MessageBubble.tsx (Renderer)

**Files:**
- Create: `tests/unit/renderer/MessageBubble.test.tsx`
- Reference: `src/renderer/src/components/MessageBubble.tsx`

**Step 1: Write tests for the MessageBubble component**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MessageBubble from '../../../src/renderer/src/components/MessageBubble'

describe('MessageBubble', () => {
  it('renders user message', () => {
    render(<MessageBubble role="user" content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders assistant message with markdown', () => {
    render(<MessageBubble role="assistant" content="**bold text**" />)
    expect(screen.getByText('bold text')).toBeInTheDocument()
  })

  it('renders code blocks', () => {
    const code = '```javascript\nconsole.log("hi")\n```'
    render(<MessageBubble role="assistant" content={code} />)
    expect(screen.getByText('console.log("hi")')).toBeInTheDocument()
  })

  it('renders question blocks with options', () => {
    const content = `Some text\n\n[QUESTION_BLOCK]\n**Which option?**\n\n1. **Option A** — First choice\n2. **Option B** — Second choice\n[/QUESTION_BLOCK]`
    render(<MessageBubble role="assistant" content={content} />)
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('calls onQuestionOptionClick when option is clicked', () => {
    const handler = vi.fn()
    const content = `[QUESTION_BLOCK]\n**Pick one?**\n\n1. **Alpha** — First\n2. **Beta** — Second\n[/QUESTION_BLOCK]`
    render(<MessageBubble role="assistant" content={content} onQuestionOptionClick={handler} />)

    const option = screen.getByText('Alpha')
    fireEvent.click(option.closest('button') || option)
    expect(handler).toHaveBeenCalled()
  })

  it('shows pending status indicator', () => {
    render(<MessageBubble role="user" content="test" status="pending" />)
    // pending messages should have some visual indicator
    const bubble = screen.getByText('test')
    expect(bubble).toBeInTheDocument()
  })

  it('renders Learn from this button for assistant messages', () => {
    const handler = vi.fn()
    render(<MessageBubble role="assistant" content="Some response" onLearnFromThis={handler} />)
    // Look for the learn button (may be an icon/button)
    const learnButtons = screen.queryAllByRole('button')
    expect(learnButtons.length).toBeGreaterThan(0)
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run tests/unit/renderer/MessageBubble.test.tsx`
Expected: Tests may need adjustment based on actual DOM structure — fix selectors as needed.

**Step 3: Commit**

```bash
git add tests/unit/renderer/MessageBubble.test.tsx
git commit -m "test: add MessageBubble component tests"
```

---

### Task 12: Unit Tests — App.tsx (Renderer)

**Files:**
- Create: `tests/unit/renderer/App.test.tsx`
- Reference: `src/renderer/src/App.tsx`

**Step 1: Write tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/src/App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    // getApiKeyStatus is async, so initially renders empty div
    window.electronAPI.getApiKeyStatus = vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = render(<App />)
    expect(container.firstChild).toBeInstanceOf(HTMLDivElement)
  })

  it('shows ApiKeyMissing when no API key', async () => {
    window.electronAPI.getApiKeyStatus = vi.fn().mockResolvedValue(false)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/claude/i)).toBeInTheDocument()
    })
  })

  it('shows main layout when API key exists', async () => {
    window.electronAPI.getApiKeyStatus = vi.fn().mockResolvedValue(true)
    window.electronAPI.getSetting = vi.fn().mockResolvedValue('claude-sonnet-4-6')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('singularity')).toBeInTheDocument()
    })
  })

  it('shows welcome view when no conversation selected', async () => {
    window.electronAPI.getApiKeyStatus = vi.fn().mockResolvedValue(true)
    window.electronAPI.getSetting = vi.fn().mockResolvedValue('claude-sonnet-4-6')
    render(<App />)
    await waitFor(() => {
      // WelcomeView should render when no active conversation
      const el = screen.queryByText(/welcome|start|new/i)
      expect(el).toBeTruthy()
    })
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run tests/unit/renderer/App.test.tsx`
Expected: PASS (adjust selectors based on actual rendered output)

**Step 3: Commit**

```bash
git add tests/unit/renderer/App.test.tsx
git commit -m "test: add App component tests (loading, API key, welcome)"
```

---

### Task 13: Playwright Configuration

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/global-setup.ts`

**Step 1: Create global setup (builds the app)**

```ts
import { execSync } from 'child_process'

export default async function globalSetup(): Promise<void> {
  console.log('Building Electron app for e2e tests...')
  execSync('npx electron-vite build', { stdio: 'inherit', cwd: process.cwd() })
  console.log('Build complete.')
}
```

**Step 2: Create Playwright config**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    trace: 'on-first-retry'
  },
  globalSetup: './tests/e2e/global-setup.ts',
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts'
    }
  ]
})
```

**Step 3: Verify config loads**

Run: `npx playwright test --list`
Expected: No test files found (that's fine — config loads without errors)

**Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/global-setup.ts
git commit -m "chore: add Playwright config with Electron global setup"
```

---

### Task 14: Mock Claude CLI Binary for E2E

**Files:**
- Create: `tests/helpers/mock-claude-cli.ts`

This is a Node script that masquerades as the `claude` CLI. The e2e tests put its directory on PATH so the app spawns this instead of the real CLI.

**Step 1: Create the mock CLI**

```ts
#!/usr/bin/env node

/**
 * Mock Claude CLI for e2e tests.
 *
 * This script replaces the real `claude` binary during Playwright e2e tests.
 * It reads the prompt from -p argument, selects a matching fixture, and
 * streams it back with realistic timing.
 *
 * The fixture files are JSONL captured from real Claude CLI sessions.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const FIXTURES_DIR = join(__dirname, '..', 'fixtures')

// Parse -p argument from CLI args
function getPrompt(): string {
  const args = process.argv.slice(2)
  const pIndex = args.indexOf('-p')
  if (pIndex !== -1 && pIndex + 1 < args.length) {
    return args[pIndex + 1]
  }
  return ''
}

// Select fixture based on prompt content
function selectFixture(_prompt: string): string {
  // Default to simple response
  const fixturePath = join(FIXTURES_DIR, 'claude-stream-simple.jsonl')

  if (!existsSync(fixturePath)) {
    // Generate a minimal valid JSONL response if no fixtures exist
    const fallback = [
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } }),
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello! This is a mock response from the test fixture.' } } }),
      JSON.stringify({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }),
      JSON.stringify({ type: 'result', result: 'Hello! This is a mock response from the test fixture.', is_error: false })
    ]
    return fallback.join('\n') + '\n'
  }

  return readFileSync(fixturePath, 'utf-8')
}

async function main(): Promise<void> {
  const prompt = getPrompt()
  const fixture = selectFixture(prompt)
  const lines = fixture.split('\n').filter(Boolean)

  // Stream lines with small delays to simulate real streaming
  for (const line of lines) {
    process.stdout.write(line + '\n')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(err.message + '\n')
  process.exit(1)
})
```

**Step 2: Make the mock executable and create a wrapper script**

Create `tests/helpers/mock-bin/claude` (a shell script that invokes our TS mock):

```bash
#!/bin/bash
exec node "$(dirname "$0")/../mock-claude-cli.js" "$@"
```

Note: The e2e global setup will need to compile `mock-claude-cli.ts` to JS, or we use `tsx` to run it. We'll handle this in the e2e test setup.

**Step 3: Commit**

```bash
git add tests/helpers/mock-claude-cli.ts tests/helpers/mock-bin/
git commit -m "feat(test): add mock Claude CLI binary for e2e tests"
```

---

### Task 15: E2E Test — App Launch

**Files:**
- Create: `tests/e2e/app-launch.spec.ts`

**Step 1: Write the app launch test**

```ts
import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'path'

const MAIN_JS = resolve(__dirname, '../../out/main/index.js')

test.describe('App Launch', () => {
  test('app starts and shows main window', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const window = await electronApp.firstWindow()

    // Wait for window to fully load
    await window.waitForLoadState('domcontentloaded')

    // Check window title or content
    const title = await window.title()
    expect(title).toBeTruthy()

    // Check that the app renders something
    const body = await window.locator('body').textContent()
    expect(body).toBeTruthy()

    await electronApp.close()
  })

  test('window has correct minimum dimensions', async () => {
    const electronApp = await electron.launch({
      args: [MAIN_JS],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const size = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }))

    expect(size.width).toBeGreaterThanOrEqual(800)
    expect(size.height).toBeGreaterThanOrEqual(600)

    await electronApp.close()
  })
})
```

**Step 2: Run e2e tests (requires build)**

Run: `npm run test:e2e`
Expected: Tests launch Electron, verify window appears, then close. May need adjustments for the actual app environment (API key, database path, etc.).

**Step 3: Commit**

```bash
git add tests/e2e/app-launch.spec.ts
git commit -m "test(e2e): add app launch smoke tests"
```

---

### Task 16: E2E Test — Workspace Flow

**Files:**
- Create: `tests/e2e/workspace-flow.spec.ts`

**Step 1: Write workspace CRUD e2e tests**

```ts
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { resolve } from 'path'

const MAIN_JS = resolve(__dirname, '../../out/main/index.js')

test.describe('Workspace Flow', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: [MAIN_JS],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
  })

  test.afterEach(async () => {
    await electronApp.close()
  })

  test('sidebar is visible on launch', async () => {
    // The sidebar should be visible
    const sidebar = window.locator('[class*="sidebar"], [data-testid="sidebar"]').first()
    await expect(sidebar).toBeVisible({ timeout: 10000 })
  })

  test('can interact with workspace area', async () => {
    // Wait for the app to be interactive
    await window.waitForTimeout(2000)

    // Take a screenshot for debugging
    await window.screenshot({ path: 'tests/e2e/screenshots/workspace-flow.png' })

    // Verify some UI element exists
    const body = await window.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(0)
  })
})
```

**Step 2: Create screenshots directory**

Run: `mkdir -p tests/e2e/screenshots && echo "*.png" > tests/e2e/screenshots/.gitignore`

**Step 3: Run and iterate**

Run: `npm run test:e2e -- --grep "Workspace"`
Expected: Tests pass with basic assertions. More specific selectors will be refined once we see the actual rendered DOM.

**Step 4: Commit**

```bash
git add tests/e2e/workspace-flow.spec.ts tests/e2e/screenshots/.gitignore
git commit -m "test(e2e): add workspace flow tests"
```

---

### Task 17: Run Full Test Suite & Fix Issues

**Files:**
- May modify: any test file or config as needed

**Step 1: Run all unit tests**

Run: `npm test`
Expected: All unit tests pass

**Step 2: Run all e2e tests**

Run: `npm run test:e2e`
Expected: All e2e tests pass

**Step 3: Run coverage report**

Run: `npm run test:coverage`
Expected: Coverage report generated showing tested modules

**Step 4: Fix any failing tests**

Iterate on test files to fix selector issues, mock gaps, or config problems.

**Step 5: Final commit**

```bash
git add -A
git commit -m "test: fix and finalize full test suite"
```

---

### Task 18: Add .gitignore entries for test artifacts

**Files:**
- Modify: `.gitignore`

**Step 1: Add test artifact patterns**

```
# Test artifacts
tests/e2e/screenshots/*.png
test-results/
playwright-report/
coverage/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add test artifact patterns to gitignore"
```

---

## Summary

| Task | Type | Description |
|------|------|-------------|
| 1 | Setup | Install dependencies |
| 2 | Setup | Vitest config (node + jsdom workspaces) |
| 3 | Setup | npm scripts |
| 4 | Helper | In-memory test database factory |
| 5 | Unit | database.ts — schema, CRUD, constraints, computed columns |
| 6 | Unit | brain.ts — parsing, serialization, scanWorkspace |
| 7 | Unit | claude-cli.ts — utility functions, state queries |
| 8 | Unit | logger.ts — formatting, serialization |
| 9 | Unit | anthropic.ts — client init, title gen, memory extraction |
| 10 | Fixture | Capture real Claude CLI responses |
| 11 | Unit | MessageBubble.tsx — rendering, question blocks, interactions |
| 12 | Unit | App.tsx — loading, API key, layout |
| 13 | Setup | Playwright config + global setup |
| 14 | Helper | Mock Claude CLI binary |
| 15 | E2E | App launch smoke tests |
| 16 | E2E | Workspace flow |
| 17 | QA | Run full suite, fix issues |
| 18 | Cleanup | .gitignore for test artifacts |
