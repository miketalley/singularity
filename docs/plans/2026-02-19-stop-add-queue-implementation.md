# Stop/Add/Queue Buttons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Stop, Add, and Queue buttons to the input bar so users can interrupt AI responses and send follow-up messages during streaming.

**Architecture:** Wire the existing `cancelClaudeProcess()` in `claude-cli.ts` through IPC to the renderer. Modify the cancel flow to resolve cleanly (not as an error) so the partial response can be saved normally. Change the input bar buttons based on streaming state and input content.

**Tech Stack:** Electron IPC, React, TypeScript

---

### Task 1: Make cancel resolve cleanly instead of erroring

Currently, killing the CLI process with SIGTERM produces a non-zero exit code, which causes `sendClaudeMessage` to append an error marker to the response or reject entirely. For voluntary cancellation, we want a clean resolve with just the partial content.

**Files:**
- Modify: `src/main/claude-cli.ts:382-388` (cancelClaudeProcess)
- Modify: `src/main/claude-cli.ts:318-370` (child.on close handler)

**Step 1: Add a cancelled-conversations tracker and update cancelClaudeProcess**

In `src/main/claude-cli.ts`, add a Set to track voluntarily cancelled conversations, and update `cancelClaudeProcess` to mark before killing:

```typescript
// Add after line 12 (after streamingState declaration):
const cancelledConversations = new Set<number>()
```

Replace `cancelClaudeProcess` (lines 382-388) with:

```typescript
export function cancelClaudeProcess(conversationId: number): void {
  const proc = activeProcesses.get(conversationId)
  if (proc) {
    cancelledConversations.add(conversationId)
    proc.kill('SIGTERM')
    activeProcesses.delete(conversationId)
  }
}
```

**Step 2: Update the close handler to resolve cleanly on cancel**

In `src/main/claude-cli.ts`, modify the `child.on('close')` handler (lines 318-371). Replace the exit-code logic (lines 359-370) with:

```typescript
      // Check if this was a voluntary cancellation
      const wasCancelled = cancelledConversations.delete(conversationId)

      if (wasCancelled) {
        // Voluntary cancel — resolve with whatever partial content we have
        resolve(fullResponse)
      } else if (code !== 0 && !fullResponse) {
        reject(new Error(stderrOutput || `Claude CLI exited with code ${code}`))
      } else if (code !== 0 && fullResponse) {
        log('cli', 'Process exited with non-zero code but had partial response', {
          code,
          responseLength: fullResponse.length,
          stderr: stderrOutput.slice(0, 500)
        })
        resolve(fullResponse + '\n\n---\n*[Response interrupted — Claude CLI exited with code ' + code + ']*')
      } else {
        resolve(fullResponse)
      }
```

**Step 3: Skip saving empty assistant responses in IPC handler**

In `src/main/ipc.ts`, modify the send-message handler (line 268). Replace:

```typescript
        // Save the assistant response
        addMessage(conversationId, 'assistant', responseText)
```

With:

```typescript
        // Save the assistant response (skip if empty, e.g. cancelled before any content)
        if (responseText) {
          addMessage(conversationId, 'assistant', responseText)
        }
```

**Step 4: Verify**

Build the app with `npm run build` and confirm no TypeScript errors.

**Step 5: Commit**

```bash
git add src/main/claude-cli.ts src/main/ipc.ts
git commit -m "feat: make cancel resolve cleanly for stop/add flow"
```

---

### Task 2: Add cancel-message IPC handler and preload API

**Files:**
- Modify: `src/main/ipc.ts:39-44` (imports)
- Modify: `src/main/ipc.ts` (add handler after line 160)
- Modify: `src/preload/index.ts` (add cancelMessage method)
- Modify: `src/preload/index.d.ts` (add type declaration)

**Step 1: Import cancelClaudeProcess in ipc.ts**

In `src/main/ipc.ts`, add `cancelClaudeProcess` to the import from `./claude-cli` (line 39-44):

```typescript
import {
  sendClaudeMessage,
  cancelClaudeProcess,
  generateSessionId,
  isClaudeAvailable,
  getStreamingContent,
  isProcessActive
} from './claude-cli'
```

**Step 2: Add the IPC handler**

In `src/main/ipc.ts`, add after the `is-process-active` handler (after line 160):

```typescript
  ipcMain.handle('cancel-message', (_event, conversationId: number) => {
    cancelClaudeProcess(conversationId)
    return true
  })
```

**Step 3: Add cancelMessage to preload API**

In `src/preload/index.ts`, add after line 39 (after `isProcessActive`):

```typescript
  cancelMessage: (conversationId: number): Promise<boolean> =>
    ipcRenderer.invoke('cancel-message', conversationId),
```

**Step 4: Add type declaration**

In `src/preload/index.d.ts`, add after line 23 (after `isProcessActive`):

```typescript
  cancelMessage: (conversationId: number) => Promise<boolean>
```

**Step 5: Verify**

Build with `npm run build` and confirm no TypeScript errors.

**Step 6: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose cancelMessage IPC for stop/add buttons"
```

---

### Task 3: Add Stop/Add/Queue buttons to ConversationView

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx`

**Step 1: Add handleStop callback**

In `ConversationView.tsx`, add after `handleSend` (after line 657):

```typescript
  const handleStop = useCallback(() => {
    window.electronAPI.cancelMessage(conversationId)
  }, [conversationId])
```

**Step 2: Add handleAdd callback**

Add after `handleStop`:

```typescript
  const handleAdd = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    setInput('')
    onDraftChange?.(conversationId, '')

    // Queue the follow-up message, then cancel the current response.
    // When the cancel resolves sendClaudeMessage, processQueue's while loop
    // will pick up this message next.
    sendDirectMessage(trimmed)
    window.electronAPI.cancelMessage(conversationId)
  }, [input, conversationId, sendDirectMessage, onDraftChange])
```

**Step 3: Add handleQueue callback**

Add after `handleAdd`:

```typescript
  const handleQueue = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    setInput('')
    onDraftChange?.(conversationId, '')

    // Queue without cancelling — processQueue's while loop will send it
    // after the current response completes.
    sendDirectMessage(trimmed)
  }, [input, conversationId, sendDirectMessage, onDraftChange])
```

**Step 4: Add button styles**

Add to the `styles` object (after `sendButtonHover` around line 147):

```typescript
  stopButton: {
    alignSelf: 'flex-end',
    padding: '8px 16px',
    backgroundColor: 'var(--error-color)',
    color: 'var(--text-bright)',
    borderRadius: '4px',
    fontWeight: 500,
    fontSize: '13px'
  },
  addButton: {
    alignSelf: 'flex-end',
    padding: '8px 16px',
    backgroundColor: 'var(--accent-color)',
    color: 'var(--text-bright)',
    borderRadius: '4px',
    fontWeight: 500,
    fontSize: '13px'
  },
  queueButton: {
    alignSelf: 'flex-end',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    borderRadius: '4px',
    fontWeight: 500,
    fontSize: '13px'
  },
```

**Step 5: Replace Send button and update placeholder**

Replace the textarea and Send button section (lines 948-964) with:

```tsx
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          value={input}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? 'Add to your thought...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
          rows={1}
        />
        {isStreaming ? (
          input.trim() ? (
            <>
              <button
                style={styles.addButton}
                onClick={handleAdd}
                title="Stop current response and send this message"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-color)'
                }}
              >
                Add
              </button>
              <button
                style={styles.queueButton}
                onClick={handleQueue}
                title="Send after current response finishes"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--text-secondary)'
                  e.currentTarget.style.color = 'var(--text-bright)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                Queue
              </button>
            </>
          ) : (
            <button
              style={styles.stopButton}
              onClick={handleStop}
              title="Stop AI response"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#d13438'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--error-color)'
              }}
            >
              Stop
            </button>
          )
        ) : (
          <button
            style={styles.sendButton}
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </button>
        )}
```

**Step 6: Update handleKeyDown for streaming state**

Replace `handleKeyDown` (lines 688-696) so that Enter during streaming triggers Add instead of Send:

```typescript
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (isStreaming) {
          handleAdd()
        } else {
          handleSend()
        }
      }
    },
    [handleSend, handleAdd, isStreaming]
  )
```

**Step 7: Verify**

Build with `npm run build`. Launch the app, send a message, and verify:
- While streaming with empty input: Stop button appears (red)
- While streaming after typing: Add and Queue buttons appear
- Stop kills the response and returns to idle
- Add kills the response and immediately sends the follow-up
- Queue lets the response finish, then sends the follow-up
- When not streaming: normal Send button

**Step 8: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx
git commit -m "feat: add Stop/Add/Queue buttons to input bar during streaming"
```
