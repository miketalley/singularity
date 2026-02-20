# Status Bar Footer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a thin, full-width status bar footer displaying workspace path, git branch, current model, and Claude API usage percentage.

**Architecture:** New main-process module (`usage.ts`) polls Anthropic rate-limit headers every 5 minutes via a lightweight `messages.create` call with `withResponse()`. A new IPC handler for git branch runs `git rev-parse` in the workspace directory. A new `StatusBar` React component in the renderer consumes both via IPC.

**Tech Stack:** Electron IPC, @anthropic-ai/sdk (existing), React inline styles (matches codebase pattern), `child_process.execFile` for git.

---

### Task 1: Create Usage Data Module (`src/main/usage.ts`)

**Files:**
- Create: `src/main/usage.ts`
- Reference: `src/main/anthropic.ts:1-33` (client initialization pattern)

**Step 1: Create the usage module**

```typescript
// src/main/usage.ts
import { getClient } from './anthropic'

interface UsageData {
  usedPercent: number | null
  resetAt: string | null
  lastChecked: string | null
}

let cachedUsage: UsageData = {
  usedPercent: null,
  resetAt: null,
  lastChecked: null
}

let pollInterval: ReturnType<typeof setInterval> | null = null

export async function fetchUsageData(): Promise<UsageData> {
  try {
    const client = getClient()

    // Make a minimal API call to read rate-limit headers.
    // countTokens is the cheapest option — no token cost.
    const response = await client.messages.countTokens({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: 'hi' }]
    }).withResponse()

    const headers = response.response.headers
    const limitTokens = headers.get('anthropic-ratelimit-tokens-limit')
      || headers.get('x-ratelimit-limit-tokens')
    const remainingTokens = headers.get('anthropic-ratelimit-tokens-remaining')
      || headers.get('x-ratelimit-remaining-tokens')
    const resetAt = headers.get('anthropic-ratelimit-tokens-reset')
      || headers.get('x-ratelimit-reset-tokens')

    if (limitTokens && remainingTokens) {
      const limit = parseInt(limitTokens, 10)
      const remaining = parseInt(remainingTokens, 10)
      if (limit > 0) {
        cachedUsage = {
          usedPercent: Math.round(((limit - remaining) / limit) * 100),
          resetAt: resetAt || null,
          lastChecked: new Date().toISOString()
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch usage data:', err)
    // Keep the last cached value; only null out lastChecked on first failure
    if (cachedUsage.lastChecked === null) {
      cachedUsage = { usedPercent: null, resetAt: null, lastChecked: null }
    }
  }

  return cachedUsage
}

export function getCachedUsage(): UsageData {
  return cachedUsage
}

export function startUsagePolling(): void {
  // Fetch immediately on start
  fetchUsageData()

  // Poll every 5 minutes
  pollInterval = setInterval(fetchUsageData, 5 * 60 * 1000)
}

export function stopUsagePolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
```

**Step 2: Verify the file was created correctly**

Run: `npx tsc --noEmit src/main/usage.ts 2>&1 | head -20`
Expected: May show import errors (that's fine — we'll integrate next)

**Step 3: Commit**

```bash
git add src/main/usage.ts
git commit -m "feat: add usage data polling module for status bar"
```

---

### Task 2: Add IPC Handlers for Usage and Git Branch

**Files:**
- Modify: `src/main/ipc.ts:1-48` (imports) and end of `registerIpcHandlers` (add new handlers)
- Reference: `src/main/ipc.ts:128-130` (pattern for simple handlers)

**Step 1: Add imports to ipc.ts**

At the top of `src/main/ipc.ts`, after the existing imports (line 47), add:

```typescript
import { fetchUsageData, getCachedUsage } from './usage'
import { execFile } from 'child_process'
```

**Step 2: Add the `get-usage-data` handler**

At the end of `registerIpcHandlers()`, before the closing `}` (after line 364), add:

```typescript
  // Status bar handlers
  ipcMain.handle('get-usage-data', async () => {
    return fetchUsageData()
  })

  ipcMain.handle('get-cached-usage', () => {
    return getCachedUsage()
  })

  ipcMain.handle('get-git-branch', (_event, workspacePath: string) => {
    return new Promise<string | null>((resolve) => {
      execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspacePath }, (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        resolve(stdout.trim() || null)
      })
    })
  })
```

**Step 3: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat: add IPC handlers for usage data and git branch"
```

---

### Task 3: Start Usage Polling on App Launch

**Files:**
- Modify: `src/main/index.ts` (add polling start after app ready)
- Reference: `src/main/index.ts` (find where `registerIpcHandlers()` is called)

**Step 1: Read `src/main/index.ts` to find the app-ready section**

Find where `registerIpcHandlers()` is called.

**Step 2: Import and start polling**

Add import at top of `src/main/index.ts`:

```typescript
import { startUsagePolling, stopUsagePolling } from './usage'
```

After `registerIpcHandlers()` is called (in the app-ready handler), add:

```typescript
startUsagePolling()
```

In the `app.on('will-quit')` handler (or `window-all-closed`), add:

```typescript
stopUsagePolling()
```

**Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: start usage polling on app launch"
```

---

### Task 4: Expose New IPC Methods in Preload

**Files:**
- Modify: `src/preload/index.ts:1-146`

**Step 1: Add methods to the `electronAPI` object**

After the `brainTokenThreshold` line (line 110) and before `// Event listeners` (line 112), add:

```typescript
  // Status bar
  getUsageData: (): Promise<{
    usedPercent: number | null
    resetAt: string | null
    lastChecked: string | null
  }> => ipcRenderer.invoke('get-usage-data'),
  getCachedUsage: (): Promise<{
    usedPercent: number | null
    resetAt: string | null
    lastChecked: string | null
  }> => ipcRenderer.invoke('get-cached-usage'),
  getGitBranch: (workspacePath: string): Promise<string | null> =>
    ipcRenderer.invoke('get-git-branch', workspacePath),
```

**Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose usage and git branch IPC methods in preload"
```

---

### Task 5: Create the StatusBar Component

**Files:**
- Create: `src/renderer/src/components/StatusBar.tsx`
- Reference: `src/renderer/src/App.tsx:17-46` (inline styles pattern)
- Reference: `src/renderer/src/styles/global.css` (CSS variable names)

**Step 1: Create the StatusBar component**

```tsx
// src/renderer/src/components/StatusBar.tsx
import React, { useState, useEffect, useRef } from 'react'

interface StatusBarProps {
  workspacePath: string | null
  workspaceName: string | null
  currentModel: string | null
}

function getUsageColor(percent: number): string {
  if (percent <= 60) return '#4ec9b0'
  if (percent <= 85) return '#dcdcaa'
  return 'var(--error-color)'
}

function shortenPath(fullPath: string): string {
  const home = fullPath.replace(/^\/Users\/[^/]+/, '~')
  return home
}

function shortenModel(model: string): string {
  // "claude-sonnet-4-6" → "sonnet-4-6", "claude-haiku-4-5-20251001" → "haiku-4-5"
  return model
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    height: 24,
    backgroundColor: 'var(--bg-secondary)',
    borderTop: '1px solid var(--border-color)',
    flexShrink: 0,
    fontSize: 11,
    color: 'var(--text-secondary)',
    userSelect: 'none',
    gap: 16
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden'
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0
  },
  item: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  }
}

export default function StatusBar({
  workspacePath,
  workspaceName,
  currentModel
}: StatusBarProps): React.JSX.Element {
  const [usagePercent, setUsagePercent] = useState<number | null>(null)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch usage data on mount and every 5 minutes
  useEffect(() => {
    async function fetchUsage(): Promise<void> {
      try {
        const data = await window.electronAPI.getCachedUsage()
        setUsagePercent(data.usedPercent)
      } catch {
        // ignore
      }
    }

    fetchUsage()
    intervalRef.current = setInterval(fetchUsage, 5 * 60 * 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Fetch git branch when workspace changes
  useEffect(() => {
    if (!workspacePath) {
      setGitBranch(null)
      return
    }

    async function fetchBranch(): Promise<void> {
      try {
        const branch = await window.electronAPI.getGitBranch(workspacePath!)
        setGitBranch(branch)
      } catch {
        setGitBranch(null)
      }
    }

    fetchBranch()
  }, [workspacePath])

  const usageDisplay =
    usagePercent !== null ? `${usagePercent}%` : '--'
  const usageColor =
    usagePercent !== null ? getUsageColor(usagePercent) : 'var(--text-secondary)'

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        {workspacePath && (
          <span style={styles.item} title={workspacePath}>
            {shortenPath(workspacePath)}
          </span>
        )}
        {gitBranch && (
          <span style={styles.item} title={`Branch: ${gitBranch}`}>
            ⎇ {gitBranch}
          </span>
        )}
      </div>
      <div style={styles.right}>
        {currentModel && (
          <span style={styles.item}>
            {shortenModel(currentModel)}
          </span>
        )}
        <span style={{ ...styles.item, color: usageColor }}>
          Usage: {usageDisplay}
        </span>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/StatusBar.tsx
git commit -m "feat: create StatusBar component for app footer"
```

---

### Task 6: Integrate StatusBar into App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx:1-7` (imports), `src/renderer/src/App.tsx:321-376` (render)

**Step 1: Add import**

At the top of `App.tsx`, after the existing component imports (line 6), add:

```typescript
import StatusBar from './components/StatusBar'
```

**Step 2: Add StatusBar to the render**

In the main layout return block, after the closing `</div>` of `styles.layout` (line 374) and before the closing `</>` (line 375), add:

```tsx
      <StatusBar
        workspacePath={activeConversation?.workspacePath ?? null}
        workspaceName={activeConversation?.workspaceName ?? null}
        currentModel={activeConversation?.model ?? defaultModel}
      />
```

The JSX should look like:
```tsx
  return (
    <>
      <div style={styles.titleBar}>singularity</div>
      <div style={styles.layout}>
        {/* ... existing sidebar, content, brain panel ... */}
      </div>
      <StatusBar
        workspacePath={activeConversation?.workspacePath ?? null}
        workspaceName={activeConversation?.workspaceName ?? null}
        currentModel={activeConversation?.model ?? defaultModel}
      />
    </>
  )
```

**Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: integrate StatusBar footer into app layout"
```

---

### Task 7: Add TypeScript Declarations for New electronAPI Methods

**Files:**
- Reference: Search for existing `electronAPI` type declarations (may be in a `.d.ts` file or inline)

**Step 1: Find where `window.electronAPI` is typed**

Search for `electronAPI` type declarations in the renderer. If there's an existing `electron.d.ts` or similar file, add the new methods there. If components use `(window as any).electronAPI` or there's a global type, add:

```typescript
getUsageData(): Promise<{
  usedPercent: number | null
  resetAt: string | null
  lastChecked: string | null
}>
getCachedUsage(): Promise<{
  usedPercent: number | null
  resetAt: string | null
  lastChecked: string | null
}>
getGitBranch(workspacePath: string): Promise<string | null>
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add TypeScript declarations for status bar IPC methods"
```

---

### Task 8: Build and Manual Test

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run the dev build**

Run: `npm run dev` (or the project's dev command)
Expected: App launches with a thin footer bar at the bottom showing:
- Left: workspace path + git branch (if applicable)
- Right: model name + usage percentage
- Usage shows `--` initially, then updates after the first API call completes

**Step 3: Verify 5-minute polling**

Check the terminal/console for the `countTokens` API call being made. After 5 minutes, the usage percentage should update.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address build issues for status bar footer"
```
