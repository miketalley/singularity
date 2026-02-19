# Singularity MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a macOS Electron app that lets users chat with Claude AI, organized by local code workspaces.

**Architecture:** Electron main process handles SQLite DB, Anthropic API streaming, and IPC. React renderer handles all UI (sidebar workspace tree + chat view). Communication via contextBridge preload script.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, better-sqlite3, @anthropic-ai/sdk, react-markdown, remark-gfm, react-syntax-highlighter

---

### Task 1: Scaffold the Electron + React + TypeScript project

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`

**Step 1: Scaffold using electron-vite**

Run:
```bash
cd /Users/mikemini/Repos/singularity
npm create @quick-start/electron@latest . -- --template react-ts
```

When prompted, select defaults. If it asks about overwriting, allow it.

**Step 2: Verify the scaffold works**

Run:
```bash
cd /Users/mikemini/Repos/singularity
npm install
npm run dev
```

Expected: An Electron window opens with the default electron-vite React template. Close the window.

**Step 3: Install project dependencies**

Run:
```bash
npm install better-sqlite3 @anthropic-ai/sdk react-markdown remark-gfm react-syntax-highlighter
npm install -D @types/better-sqlite3 @types/react-syntax-highlighter
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron + React + TypeScript project with dependencies"
```

---

### Task 2: Set up the SQLite database layer

**Files:**
- Create: `src/main/database.ts`

**Step 1: Write the database module**

Create `src/main/database.ts`:

```typescript
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

let db: Database.Database

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'singularity.db')
  db = new Database(dbPath)
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
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

export function getDatabase(): Database.Database {
  return db
}

// --- Workspace queries ---

export function getAllWorkspaces() {
  return db.prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all()
}

export function createWorkspace(name: string, folderPath: string) {
  const stmt = db.prepare('INSERT INTO workspaces (name, path) VALUES (?, ?)')
  const result = stmt.run(name, folderPath)
  return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid)
}

export function deleteWorkspace(id: number) {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

// --- Conversation queries ---

export function getConversationsByWorkspace(workspaceId: number) {
  return db
    .prepare('SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC')
    .all(workspaceId)
}

export function createConversation(workspaceId: number, title: string, model: string) {
  const stmt = db.prepare(
    'INSERT INTO conversations (workspace_id, title, model) VALUES (?, ?, ?)'
  )
  const result = stmt.run(workspaceId, title, model)
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid)
}

export function updateConversationTitle(id: number, title: string) {
  db.prepare('UPDATE conversations SET title = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    title,
    id
  )
}

export function updateConversationModel(id: number, model: string) {
  db.prepare('UPDATE conversations SET model = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    model,
    id
  )
}

export function deleteConversation(id: number) {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

// --- Message queries ---

export function getMessagesByConversation(conversationId: number) {
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId)
}

export function addMessage(conversationId: number, role: string, content: string) {
  const stmt = db.prepare(
    'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
  )
  const result = stmt.run(conversationId, role, content)
  // Also update the conversation's updated_at
  db.prepare('UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?').run(
    conversationId
  )
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid)
}
```

**Step 2: Verify it compiles**

Run:
```bash
cd /Users/mikemini/Repos/singularity
npx tsc --noEmit --project tsconfig.node.json
```

Expected: No errors (or only unrelated scaffold warnings).

**Step 3: Commit**

```bash
git add src/main/database.ts
git commit -m "feat: add SQLite database layer with workspace, conversation, and message queries"
```

---

### Task 3: Set up the Anthropic client with streaming

**Files:**
- Create: `src/main/anthropic.ts`

**Step 1: Write the Anthropic module**

Create `src/main/anthropic.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { BrowserWindow } from 'electron'

let client: Anthropic | null = null

export function initAnthropicClient(): boolean {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return false
  }
  client = new Anthropic({ apiKey })
  return true
}

export function getClient(): Anthropic {
  if (!client) {
    throw new Error('Anthropic client not initialized')
  }
  return client
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function streamChatResponse(
  messages: ChatMessage[],
  model: string,
  conversationId: number,
  window: BrowserWindow
): Promise<string> {
  const anthropic = getClient()
  let fullResponse = ''

  const stream = anthropic.messages.stream({
    model,
    max_tokens: 4096,
    messages: messages.map((m) => ({ role: m.role, content: m.content }))
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullResponse += event.delta.text
      window.webContents.send('stream-delta', {
        conversationId,
        text: event.delta.text
      })
    }
  }

  window.webContents.send('stream-complete', { conversationId })

  return fullResponse
}

export async function generateTitle(userMessage: string): Promise<string> {
  const anthropic = getClient()
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 30,
    messages: [
      {
        role: 'user',
        content: `Summarize this message as a short conversation title (5 words max, no quotes): ${userMessage}`
      }
    ]
  })
  const textBlock = response.content.find((block) => block.type === 'text')
  return textBlock?.text?.trim() || 'New Conversation'
}
```

**Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit --project tsconfig.node.json
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/main/anthropic.ts
git commit -m "feat: add Anthropic client with streaming and title generation"
```

---

### Task 4: Set up IPC handlers

**Files:**
- Create: `src/main/ipc.ts`

**Step 1: Write the IPC module**

Create `src/main/ipc.ts`:

```typescript
import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import {
  getAllWorkspaces,
  createWorkspace,
  deleteWorkspace,
  getConversationsByWorkspace,
  createConversation,
  updateConversationTitle,
  updateConversationModel,
  deleteConversation,
  getMessagesByConversation,
  addMessage
} from './database'
import { streamChatResponse, generateTitle, ChatMessage } from './anthropic'

export function registerIpcHandlers(): void {
  // --- Workspace handlers ---
  ipcMain.handle('get-workspaces', () => {
    return getAllWorkspaces()
  })

  ipcMain.handle('add-workspace', async () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select Workspace Folder'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]
    const name = path.basename(folderPath)
    return createWorkspace(name, folderPath)
  })

  ipcMain.handle('delete-workspace', (_event, id: number) => {
    deleteWorkspace(id)
    return true
  })

  // --- Conversation handlers ---
  ipcMain.handle('get-conversations', (_event, workspaceId: number) => {
    return getConversationsByWorkspace(workspaceId)
  })

  ipcMain.handle(
    'create-conversation',
    (_event, workspaceId: number, model: string) => {
      return createConversation(workspaceId, 'New Conversation', model)
    }
  )

  ipcMain.handle('update-conversation-title', (_event, id: number, title: string) => {
    updateConversationTitle(id, title)
    return true
  })

  ipcMain.handle('update-conversation-model', (_event, id: number, model: string) => {
    updateConversationModel(id, model)
    return true
  })

  ipcMain.handle('delete-conversation', (_event, id: number) => {
    deleteConversation(id)
    return true
  })

  // --- Message handlers ---
  ipcMain.handle('get-messages', (_event, conversationId: number) => {
    return getMessagesByConversation(conversationId)
  })

  ipcMain.handle(
    'send-message',
    async (
      event,
      conversationId: number,
      content: string,
      model: string
    ) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) throw new Error('No window found')

      // Save user message
      addMessage(conversationId, 'user', content)

      // Load full conversation history
      const allMessages = getMessagesByConversation(conversationId) as {
        role: string
        content: string
      }[]
      const chatMessages: ChatMessage[] = allMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

      // Stream the response
      const fullResponse = await streamChatResponse(chatMessages, model, conversationId, window)

      // Save assistant message
      addMessage(conversationId, 'assistant', fullResponse)

      // Generate title if this is the first message (only 1 user message)
      const userMessages = allMessages.filter((m) => m.role === 'user')
      if (userMessages.length === 1) {
        const title = await generateTitle(content)
        updateConversationTitle(conversationId, title)
        window.webContents.send('conversation-title-updated', {
          conversationId,
          title
        })
      }

      return fullResponse
    }
  )
}
```

**Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit --project tsconfig.node.json
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat: add IPC handlers for workspaces, conversations, and messages"
```

---

### Task 5: Set up the preload script

**Files:**
- Modify: `src/preload/index.ts`

**Step 1: Write the preload script**

Replace the contents of `src/preload/index.ts` with:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  // Workspaces
  getWorkspaces: () => Promise<any[]>
  addWorkspace: () => Promise<any | null>
  deleteWorkspace: (id: number) => Promise<boolean>
  // Conversations
  getConversations: (workspaceId: number) => Promise<any[]>
  createConversation: (workspaceId: number, model: string) => Promise<any>
  updateConversationTitle: (id: number, title: string) => Promise<boolean>
  updateConversationModel: (id: number, model: string) => Promise<boolean>
  deleteConversation: (id: number) => Promise<boolean>
  // Messages
  getMessages: (conversationId: number) => Promise<any[]>
  sendMessage: (conversationId: number, content: string, model: string) => Promise<string>
  // Streaming events
  onStreamDelta: (callback: (data: { conversationId: number; text: string }) => void) => void
  onStreamComplete: (callback: (data: { conversationId: number }) => void) => void
  onConversationTitleUpdated: (
    callback: (data: { conversationId: number; title: string }) => void
  ) => void
  removeStreamListeners: () => void
}

const api: ElectronAPI = {
  // Workspaces
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
  addWorkspace: () => ipcRenderer.invoke('add-workspace'),
  deleteWorkspace: (id) => ipcRenderer.invoke('delete-workspace', id),
  // Conversations
  getConversations: (workspaceId) => ipcRenderer.invoke('get-conversations', workspaceId),
  createConversation: (workspaceId, model) =>
    ipcRenderer.invoke('create-conversation', workspaceId, model),
  updateConversationTitle: (id, title) =>
    ipcRenderer.invoke('update-conversation-title', id, title),
  updateConversationModel: (id, model) =>
    ipcRenderer.invoke('update-conversation-model', id, model),
  deleteConversation: (id) => ipcRenderer.invoke('delete-conversation', id),
  // Messages
  getMessages: (conversationId) => ipcRenderer.invoke('get-messages', conversationId),
  sendMessage: (conversationId, content, model) =>
    ipcRenderer.invoke('send-message', conversationId, content, model),
  // Streaming events
  onStreamDelta: (callback) => {
    ipcRenderer.on('stream-delta', (_event, data) => callback(data))
  },
  onStreamComplete: (callback) => {
    ipcRenderer.on('stream-complete', (_event, data) => callback(data))
  },
  onConversationTitleUpdated: (callback) => {
    ipcRenderer.on('conversation-title-updated', (_event, data) => callback(data))
  },
  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('stream-delta')
    ipcRenderer.removeAllListeners('stream-complete')
    ipcRenderer.removeAllListeners('conversation-title-updated')
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
```

**Step 2: Create the type declaration for the renderer**

Create `src/preload/index.d.ts`:

```typescript
import { ElectronAPI } from './index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

**Step 3: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: set up preload script with contextBridge API"
```

---

### Task 6: Wire up the Electron main process entry

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Rewrite the main process entry**

Replace `src/main/index.ts` with:

```typescript
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './database'
import { initAnthropicClient } from './anthropic'
import { registerIpcHandlers } from './ipc'

let hasApiKey = false

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.singularity')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  initDatabase()

  // Check API key
  hasApiKey = initAnthropicClient()

  // Register IPC handlers (they'll work even without API key for workspace management)
  registerIpcHandlers()

  // Expose the API key status to the renderer
  const { ipcMain } = require('electron')
  ipcMain.handle('get-api-key-status', () => hasApiKey)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

**Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit --project tsconfig.node.json
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire up main process with database, API client, and IPC initialization"
```

---

### Task 7: Add the API key status check to preload

**Files:**
- Modify: `src/preload/index.ts`

**Step 1: Add the API key status check**

Add to the `ElectronAPI` interface and the `api` object in `src/preload/index.ts`:

In the interface, add:
```typescript
getApiKeyStatus: () => Promise<boolean>
```

In the api object, add:
```typescript
getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
```

**Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose API key status check to renderer"
```

---

### Task 8: Build the React UI - Global styles

**Files:**
- Create: `src/renderer/src/styles/global.css`

**Step 1: Write global dark-theme CSS**

Create `src/renderer/src/styles/global.css` (note: electron-vite scaffold puts renderer source in `src/renderer/src/`):

```css
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d2d;
  --bg-hover: #37373d;
  --bg-active: #094771;
  --text-primary: #cccccc;
  --text-secondary: #969696;
  --text-bright: #ffffff;
  --border-color: #3c3c3c;
  --accent-color: #0078d4;
  --accent-hover: #1a8ae8;
  --user-bubble: #2b5278;
  --assistant-bubble: #2d2d2d;
  --error-color: #f14c4c;
  --success-color: #4ec9b0;
  --scrollbar-track: #1e1e1e;
  --scrollbar-thumb: #424242;
  --sidebar-width: 260px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
}

#root {
  height: 100vh;
  display: flex;
}

::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

button {
  cursor: pointer;
  border: none;
  background: none;
  color: var(--text-primary);
  font-family: inherit;
}

input, textarea {
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 12px;
  outline: none;
}

input:focus, textarea:focus {
  border-color: var(--accent-color);
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/styles/global.css
git commit -m "feat: add global dark theme CSS"
```

---

### Task 9: Build the React UI - ApiKeyMissing component

**Files:**
- Create: `src/renderer/src/components/ApiKeyMissing.tsx`

**Step 1: Write the component**

```tsx
function ApiKeyMissing(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        padding: '40px',
        textAlign: 'center'
      }}
    >
      <h1 style={{ fontSize: '28px', color: 'var(--text-bright)', marginBottom: '16px' }}>
        API Key Required
      </h1>
      <p style={{ fontSize: '16px', maxWidth: '500px', lineHeight: '1.6', marginBottom: '24px' }}>
        Singularity needs your Anthropic API key to work. Set the{' '}
        <code
          style={{
            background: 'var(--bg-tertiary)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        >
          ANTHROPIC_API_KEY
        </code>{' '}
        environment variable, then restart the app.
      </p>
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '20px',
          maxWidth: '500px',
          textAlign: 'left',
          width: '100%'
        }}
      >
        <p style={{ fontWeight: 600, color: 'var(--text-bright)', marginBottom: '12px' }}>
          Add to your ~/.zshrc or ~/.bash_profile:
        </p>
        <pre
          style={{
            background: 'var(--bg-primary)',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '13px',
            overflowX: 'auto'
          }}
        >
          {`export ANTHROPIC_API_KEY="sk-ant-...your-key-here"`}
        </pre>
        <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Then run <code style={{ background: 'var(--bg-primary)', padding: '2px 4px', borderRadius: '3px' }}>source ~/.zshrc</code> and restart Singularity.
        </p>
      </div>
    </div>
  )
}

export default ApiKeyMissing
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/ApiKeyMissing.tsx
git commit -m "feat: add ApiKeyMissing component"
```

---

### Task 10: Build the React UI - ModelSelector component

**Files:**
- Create: `src/renderer/src/components/ModelSelector.tsx`

**Step 1: Write the component**

```tsx
const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' }
]

interface ModelSelectorProps {
  value: string
  onChange: (model: string) => void
  disabled?: boolean
}

function ModelSelector({ value, onChange, disabled }: ModelSelectorProps): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '6px 10px',
        fontSize: '13px',
        cursor: 'pointer'
      }}
    >
      {MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  )
}

export default ModelSelector
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/ModelSelector.tsx
git commit -m "feat: add ModelSelector component"
```

---

### Task 11: Build the React UI - MessageBubble component

**Files:**
- Create: `src/renderer/src/components/MessageBubble.tsx`

**Step 1: Write the component**

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
}

function MessageBubble({ role, content }: MessageBubbleProps): JSX.Element {
  const isUser = role === 'user'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '16px',
        padding: '0 16px'
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          padding: '12px 16px',
          borderRadius: '12px',
          background: isUser ? 'var(--user-bubble)' : 'var(--assistant-bubble)',
          border: isUser ? 'none' : '1px solid var(--border-color)',
          fontSize: '14px',
          lineHeight: '1.6'
        }}
      >
        {isUser ? (
          <p style={{ whiteSpace: 'pre-wrap' }}>{content}</p>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                const codeString = String(children).replace(/\n$/, '')
                if (match) {
                  return (
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                    >
                      {codeString}
                    </SyntaxHighlighter>
                  )
                }
                return (
                  <code
                    style={{
                      background: 'var(--bg-primary)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '13px'
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                )
              }
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}

export default MessageBubble
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "feat: add MessageBubble component with markdown rendering"
```

---

### Task 12: Build the React UI - WelcomeView component

**Files:**
- Create: `src/renderer/src/components/WelcomeView.tsx`

**Step 1: Write the component**

```tsx
function WelcomeView(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-secondary)',
        padding: '40px'
      }}
    >
      <h2 style={{ fontSize: '24px', color: 'var(--text-bright)', marginBottom: '12px' }}>
        Welcome to Singularity
      </h2>
      <p style={{ fontSize: '14px', textAlign: 'center', maxWidth: '400px', lineHeight: '1.6' }}>
        Add a workspace from the sidebar to get started, then begin a new conversation.
      </p>
    </div>
  )
}

export default WelcomeView
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/WelcomeView.tsx
git commit -m "feat: add WelcomeView empty state component"
```

---

### Task 13: Build the React UI - ConversationView component

**Files:**
- Create: `src/renderer/src/components/ConversationView.tsx`

**Step 1: Write the component**

```tsx
import { useState, useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import ModelSelector from './ModelSelector'

interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface ConversationViewProps {
  conversationId: number
  initialModel: string
  onModelChange: (model: string) => void
}

function ConversationView({
  conversationId,
  initialModel,
  onModelChange
}: ConversationViewProps): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [model, setModel] = useState(initialModel)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages()
  }, [conversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  useEffect(() => {
    const api = window.electronAPI

    api.onStreamDelta((data) => {
      if (data.conversationId === conversationId) {
        setStreamingContent((prev) => prev + data.text)
      }
    })

    api.onStreamComplete((data) => {
      if (data.conversationId === conversationId) {
        setIsStreaming(false)
        setStreamingContent('')
        loadMessages()
      }
    })

    return () => {
      api.removeStreamListeners()
    }
  }, [conversationId])

  async function loadMessages(): Promise<void> {
    const msgs = await window.electronAPI.getMessages(conversationId)
    setMessages(msgs)
  }

  async function handleSend(): Promise<void> {
    if (!input.trim() || isStreaming) return
    const content = input.trim()
    setInput('')
    setError(null)
    setIsStreaming(true)
    setStreamingContent('')

    // Optimistically add user message
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        conversation_id: conversationId,
        role: 'user',
        content,
        created_at: new Date().toISOString()
      }
    ])

    try {
      await window.electronAPI.sendMessage(conversationId, content, model)
    } catch (err: any) {
      setError(err.message || 'Failed to send message')
      setIsStreaming(false)
      setStreamingContent('')
      loadMessages()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleModelChange(newModel: string): void {
    setModel(newModel)
    onModelChange(newModel)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Model:</span>
        <ModelSelector value={model} onChange={handleModelChange} disabled={isStreaming} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {isStreaming && streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} />
        )}
        {error && (
          <div
            style={{
              padding: '8px 16px',
              margin: '8px 16px',
              background: 'rgba(241, 76, 76, 0.1)',
              border: '1px solid var(--error-color)',
              borderRadius: '8px',
              color: 'var(--error-color)',
              fontSize: '13px'
            }}
          >
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          gap: '8px'
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          disabled={isStreaming}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            minHeight: '40px',
            maxHeight: '120px',
            padding: '10px 12px',
            fontSize: '14px'
          }}
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          style={{
            background: 'var(--accent-color)',
            color: 'var(--text-bright)',
            padding: '8px 20px',
            borderRadius: '6px',
            fontSize: '14px',
            opacity: isStreaming || !input.trim() ? 0.5 : 1
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default ConversationView
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx
git commit -m "feat: add ConversationView with streaming and message history"
```

---

### Task 14: Build the React UI - Sidebar component

**Files:**
- Create: `src/renderer/src/components/Sidebar.tsx`

**Step 1: Write the component**

```tsx
import { useState, useEffect } from 'react'

interface Workspace {
  id: number
  name: string
  path: string
  created_at: string
}

interface Conversation {
  id: number
  workspace_id: number
  title: string
  model: string
  created_at: string
  updated_at: string
}

interface SidebarProps {
  activeConversationId: number | null
  onSelectConversation: (conversation: Conversation) => void
  onNewConversation: (workspaceId: number) => void
  refreshTrigger: number
}

function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  refreshTrigger
}: SidebarProps): JSX.Element {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [conversations, setConversations] = useState<Record<number, Conversation[]>>({})
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<number>>(new Set())

  useEffect(() => {
    loadWorkspaces()
  }, [refreshTrigger])

  async function loadWorkspaces(): Promise<void> {
    const ws = await window.electronAPI.getWorkspaces()
    setWorkspaces(ws)
    // Load conversations for each workspace
    const convos: Record<number, Conversation[]> = {}
    for (const w of ws) {
      convos[w.id] = await window.electronAPI.getConversations(w.id)
    }
    setConversations(convos)
    // Expand all by default
    setExpandedWorkspaces(new Set(ws.map((w: Workspace) => w.id)))
  }

  async function handleAddWorkspace(): Promise<void> {
    const workspace = await window.electronAPI.addWorkspace()
    if (workspace) {
      await loadWorkspaces()
    }
  }

  function toggleWorkspace(id: number): void {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        WebkitAppRegion: 'drag' as any
      }}
    >
      {/* Header area with drag region */}
      <div style={{ height: '38px', WebkitAppRegion: 'drag' as any } as any} />

      {/* Workspaces header */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          WebkitAppRegion: 'no-drag' as any
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--text-secondary)'
          }}
        >
          Workspaces
        </span>
        <button
          onClick={handleAddWorkspace}
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'var(--bg-tertiary)'
          }}
          title="Add workspace"
        >
          + Add
        </button>
      </div>

      {/* Workspace list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitAppRegion: 'no-drag' as any
        }}
      >
        {workspaces.map((ws) => (
          <div key={ws.id}>
            {/* Workspace row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-bright)'
              }}
            >
              <span
                onClick={() => toggleWorkspace(ws.id)}
                style={{ marginRight: '4px', fontSize: '10px', userSelect: 'none', width: '14px' }}
              >
                {expandedWorkspaces.has(ws.id) ? '\u25BC' : '\u25B6'}
              </span>
              <span
                onClick={() => toggleWorkspace(ws.id)}
                style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={ws.path}
              >
                {ws.name}
              </span>
              <button
                onClick={() => onNewConversation(ws.id)}
                style={{
                  fontSize: '16px',
                  color: 'var(--text-secondary)',
                  padding: '0 4px',
                  lineHeight: 1
                }}
                title="New conversation"
              >
                +
              </button>
            </div>

            {/* Conversations */}
            {expandedWorkspaces.has(ws.id) &&
              (conversations[ws.id] || []).map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  style={{
                    padding: '5px 12px 5px 30px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color:
                      activeConversationId === conv.id
                        ? 'var(--text-bright)'
                        : 'var(--text-secondary)',
                    background:
                      activeConversationId === conv.id ? 'var(--bg-active)' : 'transparent',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={conv.title}
                >
                  {conv.title}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Sidebar
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: add Sidebar component with collapsible workspace tree"
```

---

### Task 15: Build the React UI - App component (main layout)

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Step 1: Rewrite App.tsx**

Replace `src/renderer/src/App.tsx`:

```tsx
import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ConversationView from './components/ConversationView'
import WelcomeView from './components/WelcomeView'
import ApiKeyMissing from './components/ApiKeyMissing'

interface Conversation {
  id: number
  workspace_id: number
  title: string
  model: string
  created_at: string
  updated_at: string
}

function App(): JSX.Element {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    window.electronAPI.getApiKeyStatus().then(setHasApiKey)
  }, [])

  useEffect(() => {
    window.electronAPI.onConversationTitleUpdated((data) => {
      if (activeConversation && activeConversation.id === data.conversationId) {
        setActiveConversation((prev) => (prev ? { ...prev, title: data.title } : null))
      }
      setRefreshTrigger((prev) => prev + 1)
    })

    return () => {
      window.electronAPI.removeStreamListeners()
    }
  }, [activeConversation])

  // Loading state
  if (hasApiKey === null) {
    return <div />
  }

  // No API key
  if (!hasApiKey) {
    return <ApiKeyMissing />
  }

  async function handleNewConversation(workspaceId: number): Promise<void> {
    const conversation = await window.electronAPI.createConversation(
      workspaceId,
      'claude-sonnet-4-6'
    )
    setActiveConversation(conversation)
    setRefreshTrigger((prev) => prev + 1)
  }

  function handleSelectConversation(conversation: Conversation): void {
    setActiveConversation(conversation)
  }

  async function handleModelChange(model: string): Promise<void> {
    if (activeConversation) {
      await window.electronAPI.updateConversationModel(activeConversation.id, model)
      setActiveConversation((prev) => (prev ? { ...prev, model } : null))
    }
  }

  return (
    <>
      <Sidebar
        activeConversationId={activeConversation?.id ?? null}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        refreshTrigger={refreshTrigger}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeConversation ? (
          <ConversationView
            key={activeConversation.id}
            conversationId={activeConversation.id}
            initialModel={activeConversation.model}
            onModelChange={handleModelChange}
          />
        ) : (
          <WelcomeView />
        )}
      </div>
    </>
  )
}

export default App
```

**Step 2: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: build App component with sidebar + conversation layout"
```

---

### Task 16: Wire up the renderer entry point

**Files:**
- Modify: `src/renderer/src/main.tsx` (or `src/renderer/src/main.ts`)
- Modify: `src/renderer/index.html`

**Step 1: Update the renderer entry**

Ensure `src/renderer/src/main.tsx` renders the App:

```tsx
import './styles/global.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 2: Commit**

```bash
git add src/renderer/src/main.tsx
git commit -m "feat: wire up renderer entry point with global styles"
```

---

### Task 17: Integration test - run the full app

**Step 1: Run the app in dev mode**

Run:
```bash
cd /Users/mikemini/Repos/singularity
npm run dev
```

**Step 2: Manual verification checklist**

- [ ] App opens without crashing
- [ ] If ANTHROPIC_API_KEY is not set, the "API Key Required" screen shows
- [ ] If ANTHROPIC_API_KEY is set, the main layout with sidebar shows
- [ ] "Welcome to Singularity" message appears in the content area
- [ ] Clicking "+ Add" opens a native folder picker
- [ ] After selecting a folder, the workspace appears in the sidebar
- [ ] Clicking "+" next to a workspace creates a new conversation
- [ ] The conversation view shows with model selector and input
- [ ] Typing a message and pressing Enter sends it
- [ ] Claude's response streams in token-by-token
- [ ] The conversation title auto-generates after the first message
- [ ] Clicking a conversation in the sidebar loads its messages
- [ ] Model selector dropdown works (Opus 4.6, Sonnet 4.6, Haiku 4.5)

**Step 3: Fix any issues found**

Address any compilation errors, runtime errors, or UI issues.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: integration fixes from manual testing"
```

---

### Task 18: Final cleanup and .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Ensure .gitignore covers Electron artifacts**

Verify `.gitignore` includes:
```
node_modules/
dist/
out/
*.db
.env
```

**Step 2: Final commit**

```bash
git add -A
git commit -m "chore: finalize .gitignore and clean up scaffold artifacts"
```

---

## Notes for the implementing engineer

- The electron-vite scaffold may put renderer source files at `src/renderer/src/` rather than `src/renderer/`. Check the actual scaffold output and adjust paths in tasks 8-16 accordingly.
- `better-sqlite3` is a native Node module. If it fails to install, you may need to rebuild it for Electron: `npx electron-rebuild -f -w better-sqlite3`.
- The `WebkitAppRegion: 'drag'` CSS is for the macOS hidden title bar (set via `titleBarStyle: 'hiddenInset'`). The top 38px of the sidebar is the drag region.
- Model IDs used: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`. These are the current aliases — no date suffixes needed.
- The streaming uses `client.messages.stream()` which returns an async iterable. The `content_block_delta` events with `text_delta` type contain the incremental text.
