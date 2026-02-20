# Stop/Add/Queue Buttons Design

## Problem

When a user accidentally sends a message prematurely, there's no way to stop the AI response and send a correction. The app needs controls to interrupt streaming and send follow-up messages during active generation.

## Design

### Input Bar States

**Idle** — single Send button (existing behavior):
```
┌──────────────────────────────┐ ┌──────┐
│ Type a message...            │ │ Send │
└──────────────────────────────┘ └──────┘
```

**Streaming, empty input** — single Stop button:
```
┌──────────────────────────────┐ ┌──────┐
│ Add to your thought...       │ │ Stop │
└──────────────────────────────┘ └──────┘
```

**Streaming, text entered** — Add and Queue buttons:
```
┌──────────────────────────────┐ ┌─────┐ ┌───────┐
│ I meant to say...            │ │ Add │ │ Queue │
└──────────────────────────────┘ └─────┘ └───────┘
```

### Button Behaviors

| Button | Condition | Action |
|--------|-----------|--------|
| **Send** | Not streaming, has text | Normal send (existing) |
| **Stop** | Streaming, no text | Kill subprocess, save partial response to DB, return to idle |
| **Add** | Streaming, has text | Kill subprocess, save partial response, immediately send new message |
| **Queue** | Streaming, has text | Append message to queue, AI finishes current response then processes it |

### Partial Response Handling

When Stop or Add is pressed, the partial streaming response is saved to the database as-is. No special marker or indicator — it appears as a normal assistant message. The `--resume` session flag ensures Claude sees the full conversation history including the partial response.

### Data Flow: Stop

1. User clicks Stop
2. Renderer calls `window.electronAPI.cancelMessage(conversationId)`
3. IPC handler calls `cancelClaudeProcess(conversationId)` (already exists in `claude-cli.ts`)
4. SIGTERM kills the child process
5. `child.on('close')` fires, triggering `stream-complete` event
6. Partial response (from `streamingState`) is saved to DB
7. UI returns to idle state

### Data Flow: Add

1. User types text and clicks Add
2. `cancelClaudeProcess(conversationId)` called via IPC
3. Wait for `stream-complete` event (partial response saved)
4. Immediately call `sendMessage(conversationId, newText, model)` via existing flow
5. Claude receives follow-up via `--resume`, sees full context including partial response

### Data Flow: Queue

1. User types text and clicks Queue
2. Message pushed to existing `messageQueueRef`
3. AI continues streaming current response
4. When `stream-complete` fires, `processQueue()` picks up the queued message
5. Normal send flow proceeds

### Wiring Changes

1. **claude-cli.ts** — Added `cancelledConversations` Set so cancel resolves cleanly (not as error). `cancelClaudeProcess()` marks the conversation before killing, and the `close` handler checks the flag to resolve with partial content instead of rejecting.
2. **preload/index.ts** + **index.d.ts** — Exposed `cancelMessage(conversationId)` in `electronAPI`
3. **ipc.ts** — Added `cancel-message` IPC handler. Modified `send-message` to skip saving empty responses (from cancel with no partial content).
4. **ConversationView.tsx** — Added `handleStop`, `handleAdd`, `handleQueue` callbacks. Button rendering swaps based on `isStreaming` and input state. Enter key maps to `handleAdd` during streaming. Placeholder text changes during streaming. Inline styles for Stop (red) and Queue (outline) buttons.

### Placeholder Text

- Idle: "Type a message..."
- Streaming: "Add to your thought..."

### Keyboard Shortcuts

- **Enter** during streaming: Add (cancel + send follow-up)
- **Shift+Enter**: Newline (unchanged)
