# Session Auto-Restore Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist and restore the active workspace, conversation, and input drafts across app restarts.

**Architecture:** Use the existing `settings` key-value table (already has IPC handlers + preload bridge) to store `last_workspace_id`, `last_conversation_id`, and `drafts` as JSON. On mount, `App.tsx` reads these values, validates they still exist, and restores the UI state. On workspace/conversation switch, the values are written immediately. Drafts are debounce-persisted every 1 second.

**Tech Stack:** React (App.tsx), Electron IPC (already wired), SQLite settings table (already exists)

---

### Task 1: Write failing test — session state is persisted on conversation switch

**Files:**
- Create: `tests/unit/session-restore.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { setupMockElectronAPI, type MockElectronAPI } from '../helpers/mock-electron-api'

describe('Session restore - persistence', () => {
  let mockAPI: MockElectronAPI

  beforeEach(() => {
    mockAPI = setupMockElectronAPI()
  })

  it('persists last_workspace_id and last_conversation_id when conversation is selected', async () => {
    // We'll test the persistence logic extracted to a helper function
    const { persistSessionState } = await import('../../src/renderer/src/session-restore')

    await persistSessionState(5, 42)

    expect(mockAPI.setSetting).toHaveBeenCalledWith('last_workspace_id', '5')
    expect(mockAPI.setSetting).toHaveBeenCalledWith('last_conversation_id', '42')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/session-restore.test.tsx`
Expected: FAIL — module `session-restore` does not exist

### Task 2: Implement session persistence helper

**Files:**
- Create: `src/renderer/src/session-restore.ts`

**Step 3: Write minimal implementation**

```ts
export async function persistSessionState(
  workspaceId: number,
  conversationId: number
): Promise<void> {
  await window.electronAPI.setSetting('last_workspace_id', String(workspaceId))
  await window.electronAPI.setSetting('last_conversation_id', String(conversationId))
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/session-restore.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/unit/session-restore.test.tsx src/renderer/src/session-restore.ts
git commit -m "feat(session-restore): add persistence helper with test"
```

---

### Task 3: Write failing test — session state is restored on mount

**Files:**
- Modify: `tests/unit/session-restore.test.tsx`

**Step 6: Write the failing test**

```tsx
describe('Session restore - restoration', () => {
  let mockAPI: MockElectronAPI

  beforeEach(() => {
    mockAPI = setupMockElectronAPI()
  })

  it('restores last workspace and conversation from settings', async () => {
    mockAPI.getSetting.mockImplementation((key: string) => {
      if (key === 'last_workspace_id') return Promise.resolve('5')
      if (key === 'last_conversation_id') return Promise.resolve('42')
      if (key === 'drafts') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    const { restoreSessionState } = await import('../../src/renderer/src/session-restore')

    const result = await restoreSessionState()

    expect(result).toEqual({
      workspaceId: 5,
      conversationId: 42,
      drafts: {}
    })
  })

  it('returns null when no saved state exists', async () => {
    mockAPI.getSetting.mockResolvedValue(null)

    const { restoreSessionState } = await import('../../src/renderer/src/session-restore')

    const result = await restoreSessionState()

    expect(result).toBeNull()
  })

  it('restores drafts from settings', async () => {
    mockAPI.getSetting.mockImplementation((key: string) => {
      if (key === 'last_workspace_id') return Promise.resolve('5')
      if (key === 'last_conversation_id') return Promise.resolve('42')
      if (key === 'drafts') return Promise.resolve('{"42":"hello world"}')
      return Promise.resolve(null)
    })

    const { restoreSessionState } = await import('../../src/renderer/src/session-restore')

    const result = await restoreSessionState()

    expect(result).toEqual({
      workspaceId: 5,
      conversationId: 42,
      drafts: { '42': 'hello world' }
    })
  })
})
```

**Step 7: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/session-restore.test.tsx`
Expected: FAIL — `restoreSessionState` is not exported

### Task 4: Implement session restoration helper

**Files:**
- Modify: `src/renderer/src/session-restore.ts`

**Step 8: Add restoreSessionState to session-restore.ts**

```ts
export interface RestoredSession {
  workspaceId: number
  conversationId: number
  drafts: Record<string, string>
}

export async function restoreSessionState(): Promise<RestoredSession | null> {
  const workspaceIdStr = await window.electronAPI.getSetting('last_workspace_id')
  const conversationIdStr = await window.electronAPI.getSetting('last_conversation_id')

  if (!workspaceIdStr || !conversationIdStr) return null

  const workspaceId = parseInt(workspaceIdStr, 10)
  const conversationId = parseInt(conversationIdStr, 10)

  if (isNaN(workspaceId) || isNaN(conversationId)) return null

  let drafts: Record<string, string> = {}
  try {
    const draftsJson = await window.electronAPI.getSetting('drafts')
    if (draftsJson) {
      drafts = JSON.parse(draftsJson)
    }
  } catch {
    // Invalid JSON, ignore
  }

  return { workspaceId, conversationId, drafts }
}
```

**Step 9: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/session-restore.test.tsx`
Expected: PASS

**Step 10: Commit**

```bash
git add tests/unit/session-restore.test.tsx src/renderer/src/session-restore.ts
git commit -m "feat(session-restore): add restoration helper with tests"
```

---

### Task 5: Write failing test — draft persistence with debounce

**Files:**
- Modify: `tests/unit/session-restore.test.tsx`

**Step 11: Write the failing test**

```tsx
import { vi } from 'vitest'

describe('Session restore - draft persistence', () => {
  let mockAPI: MockElectronAPI

  beforeEach(() => {
    mockAPI = setupMockElectronAPI()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces draft writes to 1 second', async () => {
    const { persistDrafts } = await import('../../src/renderer/src/session-restore')

    persistDrafts({ 42: 'hello' })
    persistDrafts({ 42: 'hello w' })
    persistDrafts({ 42: 'hello world' })

    // Not written yet (debounced)
    expect(mockAPI.setSetting).not.toHaveBeenCalledWith('drafts', expect.anything())

    // Advance past debounce
    vi.advanceTimersByTime(1000)

    expect(mockAPI.setSetting).toHaveBeenCalledWith('drafts', '{"42":"hello world"}')
    expect(mockAPI.setSetting).toHaveBeenCalledTimes(1)
  })
})
```

**Step 12: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/session-restore.test.tsx`
Expected: FAIL — `persistDrafts` is not exported

### Task 6: Implement debounced draft persistence

**Files:**
- Modify: `src/renderer/src/session-restore.ts`

**Step 13: Add persistDrafts to session-restore.ts**

```ts
let draftTimer: ReturnType<typeof setTimeout> | null = null

export function persistDrafts(drafts: Record<number, string>): void {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    const serializable: Record<string, string> = {}
    for (const [k, v] of Object.entries(drafts)) {
      if (v) serializable[k] = v
    }
    window.electronAPI.setSetting('drafts', JSON.stringify(serializable))
  }, 1000)
}
```

**Step 14: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/session-restore.test.tsx`
Expected: PASS

**Step 15: Commit**

```bash
git add tests/unit/session-restore.test.tsx src/renderer/src/session-restore.ts
git commit -m "feat(session-restore): add debounced draft persistence"
```

---

### Task 7: Integrate session restore into App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx:1-2` (add import)
- Modify: `src/renderer/src/App.tsx:100-120` (init useEffect)
- Modify: `src/renderer/src/App.tsx:139-158` (handleSelectConversation)
- Modify: `src/renderer/src/App.tsx:160-186` (handleNewConversation)
- Modify: `src/renderer/src/App.tsx:217-226` (handleDraftChange)

**Step 16: Add import at top of App.tsx**

At line 1, add:
```tsx
import { persistSessionState, restoreSessionState, persistDrafts } from './session-restore'
```

**Step 17: Add restore logic to the init useEffect (lines 101-120)**

Replace the existing `init()` function body inside the `useEffect` at line 101 to also restore session state. After loading the default model, call `restoreSessionState()` and if a valid session is returned, look up the workspace and conversation to rebuild `ActiveConversation`:

```tsx
useEffect(() => {
  async function init(): Promise<void> {
    try {
      const status = await window.electronAPI.getApiKeyStatus()
      setHasApiKey(status)
    } catch {
      setHasApiKey(false)
    }
    try {
      const savedModel = await window.electronAPI.getSetting(
        'default_model',
        'claude-sonnet-4-6'
      )
      if (savedModel) setDefaultModel(savedModel)
    } catch {
      // Use default
    }

    // Restore last session
    try {
      const session = await restoreSessionState()
      if (session) {
        // Validate workspace and conversation still exist
        const workspaces = (await window.electronAPI.getWorkspaces()) as Array<{
          id: number
          name: string
          path: string
        }>
        const workspace = workspaces.find((w) => w.id === session.workspaceId)
        if (workspace) {
          const convs = (await window.electronAPI.getConversations(
            session.workspaceId
          )) as Array<{ id: number; workspace_id: number; title: string; model: string }>
          const conv = convs.find((c) => c.id === session.conversationId)
          if (conv) {
            setActiveConversation({
              id: conv.id,
              workspaceId: conv.workspace_id,
              title: conv.title,
              model: conv.model,
              workspacePath: workspace.path,
              workspaceName: workspace.name
            })
          }
        }
        // Restore drafts regardless of conversation validity
        if (Object.keys(session.drafts).length > 0) {
          const numericDrafts: Record<number, string> = {}
          for (const [k, v] of Object.entries(session.drafts)) {
            numericDrafts[parseInt(k, 10)] = v
          }
          setDrafts(numericDrafts)
        }
      }
    } catch {
      // Restore failed, continue with fresh state
    }
  }
  init()
}, [])
```

**Step 18: Add persistence to handleSelectConversation (line 139)**

After `setActiveConversation(...)` inside the callback, add:

```tsx
persistSessionState(conversation.workspace_id, conversation.id)
```

**Step 19: Add persistence to handleNewConversation (line 160)**

After `setActiveConversation(...)` inside the callback, add:

```tsx
persistSessionState(conv.workspace_id, conv.id)
```

**Step 20: Add debounced draft persistence to handleDraftChange (line 217)**

After the existing `setDrafts(...)` call, add:

```tsx
setDrafts((prev) => {
  // ... existing logic stays the same ...
  const next = text ? { ...prev, [convId]: text } : (() => { const n = { ...prev }; delete n[convId]; return n })()
  persistDrafts(next)
  return next
})
```

Actually, since we need the updated drafts value, restructure slightly — compute the new drafts, persist, and return:

```tsx
const handleDraftChange = useCallback((convId: number, text: string) => {
  setDrafts((prev) => {
    let next: Record<number, string>
    if (text) {
      next = { ...prev, [convId]: text }
    } else {
      next = { ...prev }
      delete next[convId]
    }
    persistDrafts(next)
    return next
  })
}, [])
```

**Step 21: Clear persisted state on conversation delete**

In `handleDeleteConversation` (line 188), when the active conversation is being deleted, clear the persisted conversation:

```tsx
const handleDeleteConversation = useCallback((conversationId: number) => {
  setActiveConversation((prev) => {
    if (prev && prev.id === conversationId) {
      persistSessionState(prev.workspaceId, -1) // Clear saved conversation
      return null
    }
    return prev
  })
  setRefreshTrigger((prev) => prev + 1)
}, [])
```

**Step 22: Run all unit tests**

Run: `npm run test:unit`
Expected: All tests pass

**Step 23: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/session-restore.ts
git commit -m "feat(session-restore): integrate restore on mount and persist on switch"
```

---

### Task 8: Manual smoke test

**Step 24: Build and launch the app**

Run: `npm run dev`

Test these scenarios:
1. Select a workspace and conversation, type some draft text, quit and relaunch → should restore
2. Delete the restored conversation, quit and relaunch → should start fresh
3. Fresh install (no settings) → should start normally
4. Type draft text, wait 2 seconds, quit → draft should be restored on relaunch

**Step 25: Run full test suite**

Run: `npm test`
Expected: All unit + e2e tests pass

**Step 26: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "feat(session-restore): polish and cleanup"
```
