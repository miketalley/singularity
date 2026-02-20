# Brain Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Persistent Project Memory ("Brain") -- per-workspace `.singularity/brain/BRAIN.md` files with hover brain icons on message bubbles, a dual-purpose side panel, auto-detection on first message, and context injection into Claude CLI sessions.

**Architecture:** Main process manages brain files on disk (read/write/scan/extract). Renderer shows hover action bars on message bubbles and a slide-out Brain panel. Brain context is injected into Claude CLI via `--append-system-prompt` on the first message of each conversation. Haiku extracts memories from messages when "Learn from this" is clicked.

**Tech Stack:** Electron IPC, Node.js `fs`, Anthropic SDK (Haiku for extraction), React (BrainPanel component)

---

### Task 1: Brain File Manager (Main Process)

**Files:**
- Create: `src/main/brain.ts`

**Step 1: Create the brain module with types and constants**

```typescript
// src/main/brain.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { log } from './logger'

export interface BrainEntry {
  text: string
  category: string
}

const BRAIN_DIR = '.singularity/brain'
const BRAIN_FILE = 'BRAIN.md'
const TOKEN_WARNING_THRESHOLD = 2000

function brainPath(workspacePath: string): string {
  return join(workspacePath, BRAIN_DIR, BRAIN_FILE)
}

function brainDir(workspacePath: string): string {
  return join(workspacePath, BRAIN_DIR)
}
```

**Step 2: Add parseBrainMd and serializeBrainMd**

Parse BRAIN.md from categorized markdown into structured entries, and serialize back.

```typescript
export function parseBrainMd(content: string): BrainEntry[] {
  const entries: BrainEntry[] = []
  let currentCategory = 'General'

  for (const line of content.split('\n')) {
    const headingMatch = line.match(/^## (.+)$/)
    if (headingMatch) {
      currentCategory = headingMatch[1].trim()
      continue
    }
    const entryMatch = line.match(/^- (.+)$/)
    if (entryMatch) {
      entries.push({ text: entryMatch[1].trim(), category: currentCategory })
    }
  }

  return entries
}

export function serializeBrainMd(entries: BrainEntry[]): string {
  const categories = new Map<string, string[]>()

  for (const entry of entries) {
    if (!categories.has(entry.category)) {
      categories.set(entry.category, [])
    }
    categories.get(entry.category)!.push(entry.text)
  }

  let md = '# Singularity Brain\n'
  for (const [category, items] of categories) {
    md += `\n## ${category}\n`
    for (const item of items) {
      md += `- ${item}\n`
    }
  }

  return md
}
```

**Step 3: Add CRUD functions**

```typescript
export function readBrain(workspacePath: string): { entries: BrainEntry[]; raw: string; tokenEstimate: number } {
  const path = brainPath(workspacePath)
  if (!existsSync(path)) {
    return { entries: [], raw: '', tokenEstimate: 0 }
  }
  const raw = readFileSync(path, 'utf-8')
  const entries = parseBrainMd(raw)
  const tokenEstimate = Math.ceil(raw.length / 4) // rough estimate
  return { entries, raw, tokenEstimate }
}

export function writeBrain(workspacePath: string, entries: BrainEntry[]): void {
  const dir = brainDir(workspacePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const content = serializeBrainMd(entries)
  writeFileSync(brainPath(workspacePath), content, 'utf-8')
  log('brain', 'Brain file written', { workspacePath, entryCount: entries.length })
}

export function appendEntries(workspacePath: string, newEntries: BrainEntry[]): void {
  const { entries } = readBrain(workspacePath)
  writeBrain(workspacePath, [...entries, ...newEntries])
}

export function removeEntry(workspacePath: string, index: number): void {
  const { entries } = readBrain(workspacePath)
  entries.splice(index, 1)
  writeBrain(workspacePath, entries)
}

export function updateEntry(workspacePath: string, index: number, updated: BrainEntry): void {
  const { entries } = readBrain(workspacePath)
  if (index >= 0 && index < entries.length) {
    entries[index] = updated
    writeBrain(workspacePath, entries)
  }
}

export function getCategories(workspacePath: string): string[] {
  const { entries } = readBrain(workspacePath)
  return [...new Set(entries.map((e) => e.category))]
}

export function brainExists(workspacePath: string): boolean {
  return existsSync(brainPath(workspacePath))
}

export function getTokenWarningThreshold(): number {
  return TOKEN_WARNING_THRESHOLD
}
```

**Step 4: Add workspace scanner**

Scans config files and generates initial brain entries.

```typescript
export function scanWorkspace(workspacePath: string): BrainEntry[] {
  const entries: BrainEntry[] = []

  // package.json
  const pkgPath = join(workspacePath, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.dependencies) {
        const deps = Object.keys(pkg.dependencies)
        const notable = deps.filter((d) =>
          ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'express', 'fastify',
           'electron', 'prisma', '@prisma/client', 'drizzle-orm', 'tailwindcss',
           'typescript', '@anthropic-ai/sdk', 'openai'].includes(d)
        )
        for (const dep of notable) {
          entries.push({ text: `${dep} ${pkg.dependencies[dep]}`, category: 'Tech Stack' })
        }
      }
      if (pkg.type === 'module') {
        entries.push({ text: 'ES Modules (package.json type: module)', category: 'Tech Stack' })
      }
    } catch { /* ignore parse errors */ }
  }

  // tsconfig.json
  const tsPath = join(workspacePath, 'tsconfig.json')
  if (existsSync(tsPath)) {
    entries.push({ text: 'TypeScript project', category: 'Tech Stack' })
  }

  // Cargo.toml
  if (existsSync(join(workspacePath, 'Cargo.toml'))) {
    entries.push({ text: 'Rust project (Cargo)', category: 'Tech Stack' })
  }

  // pyproject.toml or requirements.txt
  if (existsSync(join(workspacePath, 'pyproject.toml'))) {
    entries.push({ text: 'Python project (pyproject.toml)', category: 'Tech Stack' })
  } else if (existsSync(join(workspacePath, 'requirements.txt'))) {
    entries.push({ text: 'Python project (requirements.txt)', category: 'Tech Stack' })
  }

  // go.mod
  if (existsSync(join(workspacePath, 'go.mod'))) {
    entries.push({ text: 'Go project (go.mod)', category: 'Tech Stack' })
  }

  // Docker
  if (existsSync(join(workspacePath, 'Dockerfile'))) {
    entries.push({ text: 'Docker support', category: 'Tech Stack' })
  }
  if (existsSync(join(workspacePath, 'docker-compose.yml')) ||
      existsSync(join(workspacePath, 'docker-compose.yaml'))) {
    entries.push({ text: 'Docker Compose', category: 'Tech Stack' })
  }

  log('brain', 'Workspace scanned', { workspacePath, entriesFound: entries.length })
  return entries
}
```

**Step 5: Commit**

```bash
git add src/main/brain.ts
git commit -m "feat(brain): add brain file manager with CRUD and workspace scanner"
```

---

### Task 2: Memory Extraction via Anthropic API

**Files:**
- Modify: `src/main/anthropic.ts`

**Step 1: Add extractMemories function**

```typescript
export async function extractMemories(messageContent: string): Promise<Array<{ text: string; category: string }>> {
  const anthropic = getClient()

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Extract concise, actionable memory entries from the following message.
Each entry should be a single fact, decision, convention, or gotcha about the project.
Return as JSON array only, no other text:

[{"text": "...", "category": "Tech Stack | Architecture | Conventions | Gotchas"}]

Only extract information that would be useful to remember across future conversations about this project.
Skip generic knowledge that any developer would know. Be specific to THIS project.
If nothing is worth remembering, return an empty array: []

Message:
${messageContent}`
      }
    ]
  })

  const block = response.content[0]
  if (block.type !== 'text') return []

  try {
    const parsed = JSON.parse(block.text)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e: unknown) =>
        typeof e === 'object' && e !== null &&
        typeof (e as Record<string, unknown>).text === 'string' &&
        typeof (e as Record<string, unknown>).category === 'string'
    )
  } catch {
    return []
  }
}
```

**Step 2: Commit**

```bash
git add src/main/anthropic.ts
git commit -m "feat(brain): add memory extraction via Haiku"
```

---

### Task 3: IPC Handlers for Brain Operations

**Files:**
- Modify: `src/main/ipc.ts`

**Step 1: Add brain IPC handlers**

Add at the top of `ipc.ts` with imports:
```typescript
import {
  readBrain,
  writeBrain,
  appendEntries,
  removeEntry,
  updateEntry,
  getCategories,
  brainExists,
  scanWorkspace,
  getTokenWarningThreshold
} from './brain'
import type { BrainEntry } from './brain'
import { extractMemories } from './anthropic'
```

Add handlers inside `registerIpcHandlers()`:
```typescript
  // Brain handlers
  ipcMain.handle('brain-read', (_event, workspacePath: string) => {
    return readBrain(workspacePath)
  })

  ipcMain.handle('brain-write', (_event, workspacePath: string, entries: BrainEntry[]) => {
    writeBrain(workspacePath, entries)
    return true
  })

  ipcMain.handle('brain-append', (_event, workspacePath: string, entries: BrainEntry[]) => {
    appendEntries(workspacePath, entries)
    return true
  })

  ipcMain.handle('brain-remove', (_event, workspacePath: string, index: number) => {
    removeEntry(workspacePath, index)
    return true
  })

  ipcMain.handle('brain-update', (_event, workspacePath: string, index: number, entry: BrainEntry) => {
    updateEntry(workspacePath, index, entry)
    return true
  })

  ipcMain.handle('brain-categories', (_event, workspacePath: string) => {
    return getCategories(workspacePath)
  })

  ipcMain.handle('brain-exists', (_event, workspacePath: string) => {
    return brainExists(workspacePath)
  })

  ipcMain.handle('brain-scan', (_event, workspacePath: string) => {
    const entries = scanWorkspace(workspacePath)
    if (entries.length > 0) {
      writeBrain(workspacePath, entries)
    }
    return readBrain(workspacePath)
  })

  ipcMain.handle('brain-extract-memories', async (_event, messageContent: string) => {
    return extractMemories(messageContent)
  })

  ipcMain.handle('brain-token-threshold', () => {
    return getTokenWarningThreshold()
  })
```

**Step 2: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(brain): add IPC handlers for brain operations"
```

---

### Task 4: Preload Bridge for Brain API

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Step 1: Add brain methods to preload bridge**

In `src/preload/index.ts`, add inside `electronAPI`:
```typescript
  // Brain methods
  brainRead: (workspacePath: string): Promise<{ entries: Array<{ text: string; category: string }>; raw: string; tokenEstimate: number }> =>
    ipcRenderer.invoke('brain-read', workspacePath),
  brainWrite: (workspacePath: string, entries: Array<{ text: string; category: string }>): Promise<boolean> =>
    ipcRenderer.invoke('brain-write', workspacePath, entries),
  brainAppend: (workspacePath: string, entries: Array<{ text: string; category: string }>): Promise<boolean> =>
    ipcRenderer.invoke('brain-append', workspacePath, entries),
  brainRemove: (workspacePath: string, index: number): Promise<boolean> =>
    ipcRenderer.invoke('brain-remove', workspacePath, index),
  brainUpdate: (workspacePath: string, index: number, entry: { text: string; category: string }): Promise<boolean> =>
    ipcRenderer.invoke('brain-update', workspacePath, index, entry),
  brainCategories: (workspacePath: string): Promise<string[]> =>
    ipcRenderer.invoke('brain-categories', workspacePath),
  brainExists: (workspacePath: string): Promise<boolean> =>
    ipcRenderer.invoke('brain-exists', workspacePath),
  brainScan: (workspacePath: string): Promise<{ entries: Array<{ text: string; category: string }>; raw: string; tokenEstimate: number }> =>
    ipcRenderer.invoke('brain-scan', workspacePath),
  brainExtractMemories: (messageContent: string): Promise<Array<{ text: string; category: string }>> =>
    ipcRenderer.invoke('brain-extract-memories', messageContent),
  brainTokenThreshold: (): Promise<number> =>
    ipcRenderer.invoke('brain-token-threshold'),
```

**Step 2: Add types to preload type declarations**

In `src/preload/index.d.ts`, add inside `ElectronAPI`:
```typescript
  // Brain methods
  brainRead: (workspacePath: string) => Promise<{ entries: Array<{ text: string; category: string }>; raw: string; tokenEstimate: number }>
  brainWrite: (workspacePath: string, entries: Array<{ text: string; category: string }>) => Promise<boolean>
  brainAppend: (workspacePath: string, entries: Array<{ text: string; category: string }>) => Promise<boolean>
  brainRemove: (workspacePath: string, index: number) => Promise<boolean>
  brainUpdate: (workspacePath: string, index: number, entry: { text: string; category: string }) => Promise<boolean>
  brainCategories: (workspacePath: string) => Promise<string[]>
  brainExists: (workspacePath: string) => Promise<boolean>
  brainScan: (workspacePath: string) => Promise<{ entries: Array<{ text: string; category: string }>; raw: string; tokenEstimate: number }>
  brainExtractMemories: (messageContent: string) => Promise<Array<{ text: string; category: string }>>
  brainTokenThreshold: () => Promise<number>
```

**Step 3: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(brain): add preload bridge for brain API"
```

---

### Task 5: Brain Icon Hover Action Bar on Message Bubbles

**Files:**
- Modify: `src/renderer/src/components/MessageBubble.tsx`

**Step 1: Add hover state and brain icon action bar**

Add `onLearnFromThis` callback prop to MessageBubbleProps:
```typescript
interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  status?: 'pending' | 'queued'
  onLearnFromThis?: (content: string) => void
}
```

Add hover state inside the component:
```typescript
const [isHovered, setIsHovered] = useState(false)
```

Add styles for the action bar:
```typescript
  actionBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '2px 0 0 0',
    opacity: 0,
    transition: 'opacity 0.15s ease',
    height: '24px'
  },
  actionBarVisible: {
    opacity: 1
  },
  brainButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    transition: 'color 0.15s ease, background-color 0.15s ease'
  }
```

Wrap each bubble row in a container div with `onMouseEnter`/`onMouseLeave`, and add the action bar below the bubble:

For user messages:
```tsx
<div
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
>
  <div style={styles.userRow}>
    <div style={styles.userBubble}>
      {content}
      {/* status indicators */}
    </div>
  </div>
  {onLearnFromThis && (
    <div style={{ ...styles.actionBar, ...(isHovered ? styles.actionBarVisible : {}), justifyContent: 'flex-end', paddingRight: '24px' }}>
      <button
        style={styles.brainButton}
        onClick={() => onLearnFromThis(content)}
        title="Learn from this"
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-color)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        &#129504;
      </button>
    </div>
  )}
</div>
```

Same pattern for assistant messages, but with `justifyContent: 'flex-start'` and `paddingLeft: '24px'`.

**Step 2: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "feat(brain): add hover brain icon action bar on message bubbles"
```

---

### Task 6: BrainPanel Component

**Files:**
- Create: `src/renderer/src/components/BrainPanel.tsx`

**Step 1: Create the BrainPanel component**

This is a slide-out panel from the right side. It supports two modes:
- **Learning mode**: Shows proposed entries from a message + existing entries below
- **Browse mode**: Shows existing entries only

Key elements:
- Header with workspace name, token count, close button
- Proposed entries section (learning mode only) with editable text, category dropdown, approve/delete buttons
- Existing entries section with inline editing, category change, delete
- "Add Entry" button in browse mode
- Soft warning when token estimate > threshold

The component receives props:
```typescript
interface BrainPanelProps {
  workspacePath: string
  workspaceName: string
  isOpen: boolean
  onClose: () => void
  proposedEntries?: Array<{ text: string; category: string }>
  isExtracting?: boolean
}
```

State management:
- `entries`: current brain entries loaded from file
- `proposed`: editable proposed entries (from extraction)
- `editingIndex`: which existing entry is being edited (-1 for none)
- `tokenEstimate`: current size
- `threshold`: warning threshold
- `isAddingNew`: whether the "add new" form is visible

The panel is ~350px wide, dark themed to match the app, slides in from the right.

See full component implementation in the code (too long for plan, but the structure is clear).

**Step 2: Commit**

```bash
git add src/renderer/src/components/BrainPanel.tsx
git commit -m "feat(brain): add BrainPanel side panel component"
```

---

### Task 7: Integrate BrainPanel into App Layout

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/ConversationView.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`

**Step 1: Add brain state to App.tsx**

Add state:
```typescript
const [brainPanelOpen, setBrainPanelOpen] = useState(false)
const [brainProposedEntries, setBrainProposedEntries] = useState<Array<{ text: string; category: string }>>([])
const [brainIsExtracting, setBrainIsExtracting] = useState(false)
```

Add handler for "Learn from this":
```typescript
const handleLearnFromThis = useCallback(async (content: string) => {
  setBrainPanelOpen(true)
  setBrainIsExtracting(true)
  setBrainProposedEntries([])
  try {
    const extracted = await window.electronAPI.brainExtractMemories(content)
    setBrainProposedEntries(extracted)
  } catch (err) {
    console.error('Failed to extract memories:', err)
  } finally {
    setBrainIsExtracting(false)
  }
}, [])
```

Add handler for opening browse mode (from sidebar brain icon):
```typescript
const handleOpenBrainBrowse = useCallback(() => {
  setBrainProposedEntries([])
  setBrainIsExtracting(false)
  setBrainPanelOpen(true)
}, [])
```

**Step 2: Pass onLearnFromThis through ConversationView to MessageBubble**

In `ConversationView.tsx`, add `onLearnFromThis` prop and pass it to each `<MessageBubble>`.

In `App.tsx`, pass `onLearnFromThis={handleLearnFromThis}` to `<ConversationView>`.

**Step 3: Add brain icon to Sidebar header**

In `Sidebar.tsx`, add a brain icon button next to the gear icon in the header. When clicked, it calls `onOpenBrain()` prop which maps to `handleOpenBrainBrowse` in App.

**Step 4: Render BrainPanel in App layout**

```tsx
<BrainPanel
  workspacePath={activeWorkspacePath}
  workspaceName={activeWorkspaceName}
  isOpen={brainPanelOpen}
  onClose={() => setBrainPanelOpen(false)}
  proposedEntries={brainProposedEntries}
  isExtracting={brainIsExtracting}
/>
```

The BrainPanel renders as a fixed-position panel on the right side, overlaying content.

**Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/ConversationView.tsx src/renderer/src/components/Sidebar.tsx
git commit -m "feat(brain): integrate BrainPanel into app layout with sidebar access"
```

---

### Task 8: Auto-Scan on First Message & Context Injection

**Files:**
- Modify: `src/main/ipc.ts` (send-message handler)
- Modify: `src/main/claude-cli.ts` (add system prompt injection)

**Step 1: Add brain context to send-message handler**

In the `send-message` IPC handler in `ipc.ts`, after looking up the workspace, add:

```typescript
// Auto-scan brain if first time
if (!brainExists(workspace.path)) {
  const scanned = scanWorkspace(workspace.path)
  if (scanned.length > 0) {
    writeBrain(workspace.path, scanned)
    log('brain', 'Auto-scanned workspace on first message', {
      workspacePath: workspace.path,
      entriesFound: scanned.length
    })
  }
}

// Read brain context for injection
const brain = readBrain(workspace.path)
const brainContext = brain.raw || null
```

**Step 2: Pass brain context to sendClaudeMessage**

Add `brainContext` parameter to `sendClaudeMessage`:
```typescript
const responseText = await sendClaudeMessage(
  conversationId,
  sessionId,
  content,
  workspace.path,
  model,
  window,
  isFirstMessage,
  brainContext  // new param
)
```

**Step 3: Inject brain context in claude-cli.ts**

In `sendClaudeMessage`, accept the new parameter:
```typescript
export async function sendClaudeMessage(
  conversationId: number,
  sessionId: string,
  message: string,
  workspacePath: string,
  model: string,
  window: BrowserWindow,
  isFirstMessage: boolean,
  brainContext?: string | null
): Promise<string> {
```

If `isFirstMessage` and `brainContext` exists, add `--append-system-prompt` to args:
```typescript
if (isFirstMessage && brainContext) {
  args.push(
    '--append-system-prompt',
    `The following is known context about this project:\n\n${brainContext}\n\nUse this context to inform your responses.`
  )
}
```

**Step 4: Commit**

```bash
git add src/main/ipc.ts src/main/claude-cli.ts
git commit -m "feat(brain): auto-scan on first message and inject context into Claude CLI"
```

---

### Task 9: Typecheck and Verify

**Step 1: Run typecheck**

```bash
npm run typecheck
```

Fix any type errors.

**Step 2: Run dev server**

```bash
npm run dev
```

Verify the app launches, brain icon appears on hover, panel opens, etc.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(brain): fix any remaining type errors and polish"
```
