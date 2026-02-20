# Ephemeral Narration Streaming

## Problem

When Claude performs multi-step investigation (reading files, searching code), the narration text between tool calls ("Let me investigate...", "Now let me check...") gets concatenated into a single growing MessageBubble without line breaks. This produces an unreadable wall of text.

## Solution

Treat narration text (text blocks that precede tool calls) as ephemeral activity indicators. Only the final text block (after all tool calls complete) persists as a permanent MessageBubble.

## Architecture: Buffered Classification

We can't know if a text block is narration or final response when it starts — we don't know if a tool call will follow. So we **buffer text and classify retroactively**.

### Event Flow

```
Text block starts → buffer it
  ↓
Tool use arrives → flush buffer as `stream-narration`, clear buffer
  ↓
Another text block → buffer it
  ↓
Stream completes → flush buffer as `stream-delta` (this is the real answer)
```

### IPC Events

| Event | Purpose | Renderer behavior |
|---|---|---|
| `stream-narration` | Ephemeral thinking text | Replaces previous narration indicator |
| `stream-delta` | Final response text | Accumulates into MessageBubble |
| `stream-tool-activity` | Tool status (unchanged) | Shows as ToolActivityIndicator |
| `stream-complete` | Stream finished (unchanged) | Clears all ephemeral state, reloads from DB |

## Changes by File

### `src/main/claude-cli.ts`

- Add a `textBuffer` string that accumulates text from `text_delta` events
- On `content_block_start` (text): reset buffer for new segment
- On `content_block_delta` (text_delta): append to buffer (no IPC yet)
- On tool_use detection (in `assistant` event handler): flush buffer as `stream-narration`, clear buffer
- On stream complete / result: flush buffer as `stream-delta`
- `fullResponse` still accumulates everything for DB storage (unchanged)

### `src/preload/index.ts` + `src/preload/index.d.ts`

- Add `onStreamNarration` listener
- Add cleanup in `removeStreamListeners`

### `src/renderer/src/components/ConversationView.tsx`

- Add `narrationContent` state (string)
- Register `onStreamNarration` listener — sets `narrationContent` (replaces, not appends)
- Update rendering priority during streaming:
  1. `streamingContent` non-empty → MessageBubble (final response)
  2. `narrationContent` non-empty → NarrationIndicator (activity-style)
  3. `toolActivity` non-empty → ThinkingIndicator + ToolActivityIndicator
  4. Else → ThinkingIndicator (dots)
- On `stream-complete`: clear `narrationContent`

### `src/renderer/src/components/NarrationIndicator.tsx` (new)

- Similar to ToolActivityIndicator but for narration text
- Compact, monospace, dimmed styling
- Truncates to ~200 chars with ellipsis
- Shows elapsed time

## Edge Cases

1. **No tool calls** — buffer accumulates, flushed as `stream-delta` on complete. Behaves like today.
2. **Multiple consecutive text blocks** — accumulate in buffer until a tool use or complete event.
3. **Very long narration** — truncated in display (ephemeral anyway).
4. **Stream error/abort** — buffer is discarded with all other ephemeral state.

## What Stays the Same

- `stream-tool-activity` event and ToolActivityIndicator component
- `stream-complete` event
- DB storage (fullResponse from result event)
- MessageBubble component
- ThinkingIndicator component
