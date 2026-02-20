# Screenshot Report Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a split-button dropdown to "Report Problem" with a "Take Screenshot and Report" option that captures the app window, shows a thumbnail in the modal, and embeds the screenshot path in the Claude message.

**Architecture:** New IPC handler captures the Electron window via `webContents.capturePage()`, saves PNG to userData, returns path + data URL. ConversationView gets split-button UI with dropdown. Report modal conditionally shows thumbnail. App.tsx report handler accepts optional screenshot path.

**Tech Stack:** Electron `capturePage` API, React inline styles (existing pattern), Node `fs/promises`

---

### Task 1: Add `capture-screenshot` IPC handler

**Files:**
- Modify: `src/main/ipc.ts` (add handler after line ~90)

**Step 1: Add the IPC handler**

Add this after the `create-conversation` handler block (~line 90) in `src/main/ipc.ts`:

```typescript
import { app } from 'electron'  // add to existing import on line 1
import { join } from 'path'      // add to existing import on line 2
import { writeFile, mkdir } from 'fs/promises'  // new import

// Inside registerIpcHandlers():
ipcMain.handle('capture-screenshot', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) throw new Error('Could not find browser window')

  const image = await window.webContents.capturePage()
  const pngBuffer = image.toPNG()

  const screenshotsDir = join(app.getPath('userData'), 'screenshots')
  await mkdir(screenshotsDir, { recursive: true })

  const filename = `screenshot-${Date.now()}.png`
  const filePath = join(screenshotsDir, filename)
  await writeFile(filePath, pngBuffer)

  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`
  return { filePath, dataUrl }
})
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(screenshot): add capture-screenshot IPC handler"
```

---

### Task 2: Expose `captureScreenshot` in preload bridge

**Files:**
- Modify: `src/preload/index.ts` (add method before test-only section, ~line 155)

**Step 1: Add the preload method**

Add before the `// Test-only methods` comment in `src/preload/index.ts`:

```typescript
// Screenshot capture
captureScreenshot: (): Promise<{ filePath: string; dataUrl: string }> =>
  ipcRenderer.invoke('capture-screenshot'),
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: No errors

**Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(screenshot): expose captureScreenshot in preload bridge"
```

---

### Task 3: Update `onReportProblem` prop to accept optional screenshot path

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx` (line 24)
- Modify: `src/renderer/src/App.tsx` (lines 311-343)

**Step 1: Update the prop type in ConversationView**

In `src/renderer/src/components/ConversationView.tsx`, change line 24:

```typescript
// Before:
onReportProblem?: (sourceConversationId: number, description: string) => void

// After:
onReportProblem?: (sourceConversationId: number, description: string, screenshotPath?: string) => void
```

**Step 2: Update handleReportProblem in App.tsx**

In `src/renderer/src/App.tsx`, update the callback (lines 311-343):

```typescript
const handleReportProblem = useCallback(
  async (sourceConversationId: number, description: string, screenshotPath?: string) => {
    if (!activeConversation) return
    try {
      const conv = (await window.electronAPI.createConversation(
        activeConversation.workspaceId,
        defaultModel
      )) as {
        id: number
        workspace_id: number
        title: string
        model: string
      }
      setActiveConversation({
        id: conv.id,
        workspaceId: activeConversation.workspaceId,
        title: conv.title,
        model: conv.model,
        workspacePath: activeConversation.workspacePath,
        workspaceName: activeConversation.workspaceName
      })
      setRefreshTrigger((prev) => prev + 1)

      let message: string
      if (screenshotPath) {
        message = `[A screenshot of the application has been saved to ${screenshotPath}. Please use your Read tool to view this screenshot and understand what the user was seeing when they reported this problem.]\n\nCan you please investigate conversation id ${sourceConversationId}: ${description}`
      } else {
        message = `Can you please investigate conversation id ${sourceConversationId}: ${description}`
      }
      await window.electronAPI.sendMessage(conv.id, message, conv.model)
    } catch (err) {
      console.error('Failed to report problem:', err)
    }
  },
  [activeConversation, defaultModel]
)
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx src/renderer/src/App.tsx
git commit -m "feat(screenshot): update report handler to accept optional screenshot path"
```

---

### Task 4: Add split button, dropdown, and screenshot state to ConversationView

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx`

**Step 1: Add new styles**

Add these to the `styles` object (after `reportButton` style, ~line 244):

```typescript
reportButtonMain: {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '8px 12px',
  backgroundColor: '#e8820c',
  color: 'var(--text-bright)',
  fontWeight: 500,
  fontSize: '13px',
  border: 'none',
  borderRadius: '4px 0 0 4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const
},
reportButtonCaret: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 6px',
  backgroundColor: '#e8820c',
  color: 'var(--text-bright)',
  border: 'none',
  borderLeft: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '0 4px 4px 0',
  cursor: 'pointer',
  fontSize: '10px'
},
reportDropdownContainer: {
  position: 'relative' as const,
  alignSelf: 'flex-end',
  display: 'flex'
},
reportDropdown: {
  position: 'absolute' as const,
  bottom: '100%',
  right: 0,
  marginBottom: '4px',
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  zIndex: 100,
  minWidth: '200px',
  overflow: 'hidden'
},
reportDropdownItem: {
  padding: '8px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  border: 'none',
  backgroundColor: 'transparent',
  width: '100%',
  textAlign: 'left' as const,
  display: 'block',
  whiteSpace: 'nowrap' as const
},
screenshotThumbnailContainer: {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '12px',
  padding: '8px',
  backgroundColor: 'var(--bg-primary)',
  borderRadius: '4px',
  border: '1px solid var(--border-color)'
},
screenshotThumbnail: {
  width: '120px',
  borderRadius: '4px',
  border: '1px solid var(--border-color)'
},
screenshotLabel: {
  fontSize: '12px',
  color: 'var(--text-secondary)'
},
```

**Step 2: Add state variables and handlers**

Add after `const reportTextareaRef` (~line 344):

```typescript
const [showReportDropdown, setShowReportDropdown] = useState(false)
const [screenshotData, setScreenshotData] = useState<{ filePath: string; dataUrl: string } | null>(null)
```

Update `openReportModal` to accept optional screenshot data:

```typescript
const openReportModal = useCallback((screenshot?: { filePath: string; dataUrl: string } | null) => {
  setReportDescription('')
  setScreenshotData(screenshot ?? null)
  setShowReportModal(true)
  setTimeout(() => reportTextareaRef.current?.focus(), 50)
}, [])
```

Update `closeReportModal` to clear screenshot:

```typescript
const closeReportModal = useCallback(() => {
  setShowReportModal(false)
  setReportDescription('')
  setScreenshotData(null)
}, [])
```

Update `handleSendReport` to pass screenshot path:

```typescript
const handleSendReport = useCallback(() => {
  const trimmed = reportDescription.trim()
  if (!trimmed || !onReportProblem) return
  onReportProblem(conversationId, trimmed, screenshotData?.filePath)
  closeReportModal()
}, [reportDescription, conversationId, onReportProblem, closeReportModal, screenshotData])
```

Add new handler for screenshot + report:

```typescript
const handleScreenshotAndReport = useCallback(async () => {
  setShowReportDropdown(false)
  try {
    const result = await (window as any).electronAPI.captureScreenshot()
    openReportModal(result)
  } catch (err) {
    console.error('Failed to capture screenshot:', err)
    openReportModal()
  }
}, [openReportModal])
```

Add click-outside handler for dropdown (after the Escape key effect):

```typescript
useEffect(() => {
  if (!showReportDropdown) return
  const handler = (e: MouseEvent): void => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-report-dropdown]')) {
      setShowReportDropdown(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [showReportDropdown])
```

**Step 3: Replace the report button JSX**

Replace the current report button (lines 1073-1090) with:

```tsx
<div style={styles.reportDropdownContainer} data-report-dropdown>
  <button
    style={styles.reportButtonMain}
    onClick={() => openReportModal()}
    title="Report Problem"
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = '#f59b2e'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = '#e8820c'
    }}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    Report Problem
  </button>
  <button
    style={styles.reportButtonCaret}
    onClick={() => setShowReportDropdown((prev) => !prev)}
    title="More report options"
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = '#f59b2e'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = '#e8820c'
    }}
  >
    ▾
  </button>
  {showReportDropdown && (
    <div style={styles.reportDropdown}>
      <button
        style={styles.reportDropdownItem}
        onClick={handleScreenshotAndReport}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        Take Screenshot and Report
      </button>
    </div>
  )}
</div>
```

**Step 4: Add screenshot thumbnail to the report modal**

In the report modal, add after the textarea (after line ~1116) and before modalActions:

```tsx
{screenshotData && (
  <div style={styles.screenshotThumbnailContainer}>
    <img
      src={screenshotData.dataUrl}
      alt="Screenshot"
      style={styles.screenshotThumbnail}
    />
    <span style={styles.screenshotLabel}>Screenshot attached</span>
  </div>
)}
```

**Step 5: Remove old `reportButton` style**

Delete the `reportButton` style (lines 230-244) as it's replaced by `reportButtonMain` + `reportButtonCaret`.

**Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx
git commit -m "feat(screenshot): add split button dropdown and screenshot thumbnail in report modal"
```

---

### Task 5: Manual smoke test

**Step 1: Build and launch**

Run: `npm run dev`

**Step 2: Verify split button**

- "Report Problem" main area opens the modal (no screenshot)
- Down caret opens a dropdown with "Take Screenshot and Report"
- Clicking outside closes the dropdown

**Step 3: Verify screenshot flow**

- Click "Take Screenshot and Report" from dropdown
- Modal opens with a thumbnail of the app screenshot
- "Screenshot attached" label is visible
- Enter a description and click Send Report
- New conversation is created with the screenshot path in the message
- Claude can read the screenshot using its Read tool

**Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix(screenshot): address smoke test issues"
```
