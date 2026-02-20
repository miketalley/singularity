# Execution Mode Detection & Auto-Response Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect the subagent-vs-parallel execution mode choice in assistant messages and render it as clickable option cards, with a global setting to auto-respond.

**Architecture:** New targeted parser `parseExecutionModeOptions` in MessageBubble.tsx fires only when both "subagent" and "parallel" keywords appear in bold-label-em-dash options. Global setting `execution_mode_preference` in the existing settings table controls auto-response. Toast notification in ConversationView.tsx.

**Tech Stack:** React, Vitest, better-sqlite3 (existing settings table)

---

### Task 1: Write failing tests for `parseExecutionModeOptions`

**Files:**
- Modify: `tests/unit/renderer/MessageBubble.test.tsx`

**Step 1: Write the failing tests**

Add these tests after the existing test block (before the closing `})`):

```tsx
// 10. Execution mode options: bold-label em-dash pattern with subagent/parallel detected
it('renders clickable option cards for execution mode bold-label pattern', () => {
  const content = `Two execution options:\n\n**Subagent-Driven (this session)** — I dispatch fresh subagents per task, review between tasks, fast iteration\n**Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints`
  render(<MessageBubble role="assistant" content={content} />)

  expect(screen.getByText('Subagent-Driven (this session)')).toBeTruthy()
  expect(screen.getByText('Parallel Session (separate)')).toBeTruthy()

  // Should render as clickable buttons
  const buttons = screen.getAllByRole('button')
  expect(buttons.length).toBeGreaterThanOrEqual(2)
})

// 11. Clicking execution mode option calls onQuestionOptionClick
it('calls onQuestionOptionClick when execution mode option is clicked', () => {
  const handleClick = vi.fn()
  const content = `Two execution options:\n\n**Subagent-Driven (this session)** — I dispatch fresh subagents per task\n**Parallel Session (separate)** — Open new session with executing-plans`
  render(
    <MessageBubble
      role="assistant"
      content={content}
      onQuestionOptionClick={handleClick}
    />
  )

  const option = screen.getByText('Subagent-Driven (this session)').closest('[role="button"]')!
  fireEvent.click(option)

  expect(handleClick).toHaveBeenCalledTimes(1)
  expect(handleClick).toHaveBeenCalledWith(
    '1. Subagent-Driven (this session) — I dispatch fresh subagents per task'
  )
})

// 12. Bold-label list WITHOUT subagent/parallel keywords is NOT rendered as options
it('does not render option cards for unrelated bold-label em-dash lists', () => {
  const content = `Key concepts:\n\n**Immutability** — Data that cannot be changed after creation\n**Polymorphism** — Objects taking many forms`
  render(<MessageBubble role="assistant" content={content} />)

  // Should render as plain markdown, not as option cards with role="button"
  const buttons = screen.queryAllByRole('button')
  expect(buttons.length).toBe(0)
})

// 13. Bold-label list with only ONE of subagent/parallel is NOT rendered as options
it('does not render option cards when only one execution keyword is present', () => {
  const content = `Two approaches:\n\n**Subagent approach** — Use subagents for everything\n**Manual approach** — Do it by hand`
  render(<MessageBubble role="assistant" content={content} />)

  const buttons = screen.queryAllByRole('button')
  expect(buttons.length).toBe(0)
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --reporter verbose 2>&1 | tail -40`
Expected: 4 new tests FAIL (options not detected, rendered as plain markdown)

**Step 3: Commit**

```bash
git add tests/unit/renderer/MessageBubble.test.tsx
git commit -m "test: add failing tests for execution mode option detection"
```

---

### Task 2: Implement `parseExecutionModeOptions` parser

**Files:**
- Modify: `src/renderer/src/components/MessageBubble.tsx:172` (insert before `parseNumberedOptions`)

**Step 1: Add the parser function**

Insert this function at line 172, right before `parseNumberedOptions`:

```typescript
function parseExecutionModeOptions(text: string): {
  preamble: string
  options: Array<{ number: number; label: string; description: string }>
  postamble: string
} | null {
  const itemRegex = /^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/gm
  const items: Array<{
    index: number
    endIndex: number
    label: string
    description: string
  }> = []
  let match
  while ((match = itemRegex.exec(text)) !== null) {
    items.push({
      index: match.index,
      endIndex: match.index + match[0].length,
      label: match[1].trim(),
      description: match[2].trim()
    })
  }

  if (items.length < 2) return null

  // Only activate when BOTH subagent and parallel keywords are present
  const hasSubagent = items.some((item) => /subagent/i.test(item.label))
  const hasParallel = items.some((item) => /parallel/i.test(item.label))
  if (!hasSubagent || !hasParallel) return null

  const preamble = text.slice(0, items[0].index).trim()
  const postamble = text.slice(items[items.length - 1].endIndex).trim()

  return {
    preamble,
    options: items.map((item, i) => ({
      number: i + 1,
      label: item.label,
      description: item.description
    })),
    postamble
  }
}
```

**Step 2: Add the parser to the render cascade**

In the render section (around line 760, after the `numberedOptions` declaration), add the new parser as a third fallback. Find this line:

```typescript
const numberedOptions = !approachData ? parseNumberedOptions(body) : null
```

Change it to:

```typescript
const numberedOptions = !approachData ? parseNumberedOptions(body) : null
const executionModeOptions = !approachData && !numberedOptions ? parseExecutionModeOptions(body) : null
```

Then in the JSX, after the `numberedOptions` rendering block (after line ~913 `</>`) and before the plain markdown fallback `body ? (`, add:

```tsx
) : executionModeOptions ? (
  <>
    {executionModeOptions.preamble && (
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {normalizeMarkdown(executionModeOptions.preamble)}
      </Markdown>
    )}
    {executionModeOptions.options.map((opt) => (
      <div
        key={opt.number}
        style={styles.optionCard}
        role="button"
        tabIndex={0}
        onClick={() =>
          onQuestionOptionClick?.(
            `${opt.number}. ${opt.label} — ${opt.description}`
          )
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onQuestionOptionClick?.(
              `${opt.number}. ${opt.label} — ${opt.description}`
            )
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            'rgba(0, 120, 212, 0.12)'
          e.currentTarget.style.borderColor = 'var(--accent-color)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor =
            'rgba(255, 255, 255, 0.04)'
          e.currentTarget.style.borderColor =
            'rgba(255, 255, 255, 0.08)'
        }}
      >
        <span style={styles.optionNumber}>{opt.number}</span>
        <div style={styles.optionContent}>
          <div style={styles.optionLabel}>{opt.label}</div>
          <div style={styles.optionDescription}>
            {opt.description}
          </div>
        </div>
      </div>
    ))}
    <div style={styles.customResponseRow}>
      <input
        style={styles.customResponseInput}
        type="text"
        placeholder="Other..."
        value={customResponse}
        onChange={(e) => setCustomResponse(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent-color)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && customResponse.trim()) {
            onQuestionOptionClick?.(customResponse.trim())
            setCustomResponse('')
          }
        }}
      />
      <button
        style={{
          ...styles.customResponseSend,
          ...(customResponse.trim() ? {} : { opacity: 0.4, cursor: 'default' })
        }}
        disabled={!customResponse.trim()}
        onClick={() => {
          if (customResponse.trim()) {
            onQuestionOptionClick?.(customResponse.trim())
            setCustomResponse('')
          }
        }}
        onMouseEnter={(e) => {
          if (customResponse.trim()) {
            e.currentTarget.style.backgroundColor = 'var(--accent-hover)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--accent-color)'
        }}
      >
        Send
      </button>
    </div>
    {executionModeOptions.postamble && (
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {normalizeMarkdown(executionModeOptions.postamble)}
      </Markdown>
    )}
  </>
```

The full ternary chain should read:
```
approachData ? (...) : numberedOptions ? (...) : executionModeOptions ? (...) : body ? (...) : null
```

**Step 3: Run tests to verify they pass**

Run: `npm run test:unit -- --reporter verbose 2>&1 | tail -40`
Expected: All 4 new tests PASS, all existing tests still PASS

**Step 4: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "feat: add execution mode option detection for bold-label em-dash patterns"
```

---

### Task 3: Export `parseExecutionModeOptions` for use in ConversationView

**Files:**
- Modify: `src/renderer/src/components/MessageBubble.tsx`

**Step 1: Export the parser**

The `parseExecutionModeOptions` function needs to be used by ConversationView for auto-response detection. Add `export` before the function definition:

```typescript
export function parseExecutionModeOptions(text: string): {
```

**Step 2: Run tests to verify nothing broke**

Run: `npm run test:unit -- --reporter verbose 2>&1 | tail -40`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "refactor: export parseExecutionModeOptions for auto-response use"
```

---

### Task 4: Add execution mode preference setting to Sidebar

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx:694-747` (settings panel)

**Step 1: Add state for the setting**

Inside the `Sidebar` function, after `const [downloadProgress, setDownloadProgress] = useState<number | null>(null)` (line 307), add:

```typescript
const [executionMode, setExecutionMode] = useState<string>('ask')
```

**Step 2: Load the setting when settings panel opens**

In the existing `useEffect` that fires when `settingsOpen` changes (line 311), add to the `loadWhisperStatus` function body (or alongside it):

```typescript
async function loadWhisperStatus(): Promise<void> {
  try {
    const status = await window.electronAPI.getWhisperStatus()
    setWhisperStatus(status)
  } catch {
    // ignore
  }
}
loadWhisperStatus()

// Load execution mode preference
window.electronAPI.getSetting('execution_mode_preference', 'ask').then((val) => {
  if (val) setExecutionMode(val)
})
```

**Step 3: Add handler for changing the setting**

After `handleDownloadModel` (around line 342), add:

```typescript
const handleExecutionModeChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
  const value = e.target.value
  setExecutionMode(value)
  await window.electronAPI.setSetting('execution_mode_preference', value)
}, [])
```

**Step 4: Add the dropdown to the settings panel UI**

Inside the settings panel JSX (after the "Default model" row, before the "Voice transcription" row), add:

```tsx
<div style={styles.settingsRow}>
  <span style={styles.settingsLabel}>Execution mode</span>
  <select
    value={executionMode}
    onChange={handleExecutionModeChange}
    style={{
      fontSize: '12px',
      padding: '3px 6px',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: '4px',
      outline: 'none',
      cursor: 'pointer'
    }}
  >
    <option value="ask">Ask each time</option>
    <option value="subagent">Always Subagent-Driven</option>
    <option value="parallel">Always Parallel Session</option>
  </select>
</div>
```

**Step 5: Run tests to verify nothing broke**

Run: `npm run test:unit -- --reporter verbose 2>&1 | tail -40`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: add execution mode preference dropdown to settings panel"
```

---

### Task 5: Add auto-response logic and toast to ConversationView

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx`

**Step 1: Import the parser**

At the top of ConversationView.tsx, add the import:

```typescript
import { parseExecutionModeOptions } from './MessageBubble'
```

**Step 2: Add toast state**

Inside the `ConversationView` function, after `const [showReportModal, setShowReportModal] = useState(false)` (line 340), add:

```typescript
const [toastMessage, setToastMessage] = useState<string | null>(null)
```

**Step 3: Add auto-response logic in `onStreamComplete`**

In the `onStreamComplete` handler (line 434), after the messages are reloaded from DB but before the closing `}`, add auto-response detection. Replace the `onStreamComplete` handler with:

```typescript
window.electronAPI.onStreamComplete(async (data) => {
  if (data.conversationId === conversationId) {
    setStreamingContent('')
    setToolActivity('')
    // Only reset streaming if we're not processing a queue
    if (!isProcessingRef.current) {
      setIsStreaming(false)
    }
    try {
      const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
      setMessages([...msgs, ...pendingMessagesRef.current])

      // Auto-response: check if the latest assistant message contains
      // execution mode options and the user has a preference set
      const pref = await window.electronAPI.getSetting('execution_mode_preference', 'ask')
      if (pref && pref !== 'ask') {
        const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
        if (lastAssistant) {
          const detected = parseExecutionModeOptions(lastAssistant.content)
          if (detected) {
            const keyword = pref === 'subagent' ? /subagent/i : /parallel/i
            const matched = detected.options.find((opt) => keyword.test(opt.label))
            if (matched) {
              const formatted = `${matched.number}. ${matched.label} — ${matched.description}`
              setToastMessage(`Auto-selected: ${matched.label} (from Settings)`)
              setTimeout(() => setToastMessage(null), 3000)
              // Small delay so the user sees the message before auto-response
              setTimeout(() => {
                sendDirectMessage(formatted)
              }, 500)
            }
          }
        }
      }
    } catch (err) {
      setError(`Failed to reload messages: ${err}`)
    }
  }
})
```

**Step 4: Add toast UI**

In the JSX, right before the closing `</div>` of the messages area wrapper (after the scroll-to-bottom button, around line 960), add:

```tsx
{toastMessage && (
  <div
    style={{
      position: 'absolute',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      backgroundColor: 'rgba(0, 120, 212, 0.9)',
      color: '#fff',
      fontSize: '13px',
      fontWeight: 500,
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      zIndex: 11,
      whiteSpace: 'nowrap' as const,
      animation: 'fadeIn 0.2s ease'
    }}
  >
    {toastMessage}
  </div>
)}
```

**Step 5: Add `sendDirectMessage` to the useEffect dependency array**

The `onStreamComplete` handler now references `sendDirectMessage`. Since it's defined with `useCallback` and already stable, ensure the stream listener effect (line 413) includes it in its dependency array:

Change `}, [conversationId])` to `}, [conversationId, sendDirectMessage])`.

**Important:** The `sendDirectMessage` function is defined with `useCallback` with `[conversationId, processQueue]` as deps, so it's already stable per-conversation. Adding it to the effect deps just ensures correctness — it won't cause extra re-registrations in practice since conversationId is already there and they change together.

**Step 6: Run tests to verify nothing broke**

Run: `npm run test:unit -- --reporter verbose 2>&1 | tail -40`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx
git commit -m "feat: add auto-response logic and toast for execution mode preference"
```

---

### Task 6: Final verification

**Step 1: Run the full test suite**

Run: `npm run test:unit`
Expected: All tests pass (existing + 4 new)

**Step 2: Build the app**

Run: `npm run build`
Expected: Clean build with no TypeScript errors

**Step 3: Commit any remaining changes**

If there were any fixes needed, commit them.

---

## Summary of changes

| File | Change |
|------|--------|
| `MessageBubble.tsx` | New exported `parseExecutionModeOptions` parser + render cascade integration |
| `Sidebar.tsx` | Execution mode dropdown in settings panel |
| `ConversationView.tsx` | Auto-response logic in `onStreamComplete` + toast notification |
| `MessageBubble.test.tsx` | 4 new tests for detection + false-positive prevention |
