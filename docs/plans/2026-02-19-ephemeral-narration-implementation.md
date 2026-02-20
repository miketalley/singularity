# Ephemeral Narration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make streaming narration text ("Let me investigate...", "Now let me check...") ephemeral — shown briefly during streaming, cleared when tool activity starts, with the final DB message (properly paragraph-separated) replacing everything on completion.

**Architecture:** A minimal 2-change solution. (1) Stop sending the `\n\n` separator as `stream-delta` — it only needs to go into `fullResponse` for DB storage. (2) When tool activity fires, clear `streamingContent` so the narration MessageBubble disappears and the ToolActivityIndicator shows. The existing rendering priority (`streamingContent` > `toolActivity` > ThinkingIndicator) handles transitions naturally. On stream-complete, the full message loads from DB with proper `\n\n` paragraph separators.

**Tech Stack:** Electron IPC, React state management

---

### Task 1: Stop sending separator as stream-delta

**Files:**
- Modify: `src/main/claude-cli.ts:180-189`

**Step 1: Simplify content_block_start handler**

The handler currently sends a `\n\n` separator via `stream-delta`. This should only go to `fullResponse` for DB storage — the renderer handles segment separation by clearing `streamingContent` on tool activity (Task 2).

Change lines 180-189 from:

```typescript
if (block?.type === 'text' && fullResponse.length > 0) {
  const separator = '\n\n'
  fullResponse += separator
  streamingState.set(conversationId, fullResponse)
  window.webContents.send('stream-delta', {
    conversationId,
    text: separator
  })
}
```

To:

```typescript
if (block?.type === 'text' && fullResponse.length > 0) {
  fullResponse += '\n\n'
  streamingState.set(conversationId, fullResponse)
}
```

**Step 2: Commit**

```bash
git add src/main/claude-cli.ts
git commit -m "fix: stop sending separator as stream-delta to renderer"
```

---

### Task 2: Clear streaming content on tool activity

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx:276-280`

**Step 1: Add streamingContent clear in onToolActivity handler**

When tool activity fires, any text in `streamingContent` was narration and should be discarded.

Change the handler from:

```typescript
window.electronAPI.onToolActivity((data) => {
  if (data.conversationId === conversationId) {
    setToolActivity(data.activity)
  }
})
```

To:

```typescript
window.electronAPI.onToolActivity((data) => {
  if (data.conversationId === conversationId) {
    setToolActivity(data.activity)
    setStreamingContent('')
  }
})
```

The existing rendering priority at lines 621-641 already handles the rest:
- `streamingContent` non-empty → MessageBubble (takes priority)
- `toolActivity` non-empty → ThinkingIndicator + ToolActivityIndicator
- Else → ThinkingIndicator

With `setStreamingContent('')`, when tool activity fires the MessageBubble disappears and ToolActivityIndicator shows. When new text starts streaming, `streamingContent` becomes non-empty again and takes priority over the stale `toolActivity`.

**Step 2: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx
git commit -m "feat: clear streaming narration on tool activity"
```

---

### Task 3: Manual testing

**Test 1: Multi-step investigation**
1. Send a message that triggers tool use (e.g., "Look at the code in src/main/index.ts and tell me what it does")
2. Verify: narration appears briefly as MessageBubble → tool activity replaces it → cycle repeats → final message loads from DB with paragraph separation

**Test 2: Text-only response**
1. Send a simple question (e.g., "What is 2+2?")
2. Verify: text streams progressively as a growing MessageBubble (unchanged behavior)

**Test 3: Final answer after tools**
1. Send a question triggering investigation then answer
2. Verify: final text block streams as MessageBubble, then DB message loads with full content

---

## Behavior Summary

| Phase | User sees |
|---|---|
| Text streaming (narration) | Growing MessageBubble with current text segment |
| Tool activity starts | MessageBubble vanishes, ToolActivityIndicator appears |
| More narration | New MessageBubble with new text segment |
| More tools | MessageBubble vanishes, new ToolActivityIndicator |
| Final response text | Growing MessageBubble |
| Stream complete | Full message from DB with paragraph-separated text |
