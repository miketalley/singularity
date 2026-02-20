# Smart Scroll During Streaming — Design

## Problem

When the assistant is streaming a response, the `useEffect` on `[messages, streamingContent]` calls `scrollToBottom()` on every delta. If the user scrolls up to re-read earlier messages, they are immediately yanked back to the bottom.

## Solution: Approach A — Scroll-Position Tracking

Track scroll position via an `onScroll` handler on the messages container. Maintain a `userHasScrolledUp` ref. Only auto-scroll when the user is near the bottom. Show a "scroll to bottom" button when they've scrolled away.

## Behavior

1. **Default:** Auto-scroll to bottom on every new message / stream delta (current behavior preserved).
2. **User scrolls up:** Auto-scroll pauses. A "scroll to bottom" button appears.
3. **User scrolls back near bottom (within 50px):** Auto-scroll resumes. Button disappears.
4. **User clicks button:** Scroll to bottom, resume auto-scroll, hide button.
5. **Conversation switch:** Reset — auto-scroll on, button hidden.
6. **User sends a message:** Reset — auto-scroll on, button hidden (user wants to see the response).

## Changes — All in `ConversationView.tsx`

### New refs/state

- `messagesContainerRef = useRef<HTMLDivElement>(null)` — the scrollable div
- `userHasScrolledUpRef = useRef(false)` — tracks scroll intent (ref, not state — no re-renders)
- `showScrollButton` state (`useState(false)`) — drives button visibility

### `handleScroll` callback

```ts
const handleScroll = useCallback(() => {
  const el = messagesContainerRef.current
  if (!el) return
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  userHasScrolledUpRef.current = !isNearBottom
  setShowScrollButton(!isNearBottom)
}, [])
```

Attached to the messages area div via `onScroll={handleScroll}`.

### Modified auto-scroll effect (line 219-222)

```ts
useEffect(() => {
  if (!userHasScrolledUpRef.current) {
    scrollToBottom()
  }
}, [messages, streamingContent, scrollToBottom])
```

### Modified `scrollToBottom`

Use `messagesContainerRef` directly instead of sentinel:

```ts
const scrollToBottom = useCallback(() => {
  const el = messagesContainerRef.current
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}, [])
```

This is instant (no `smooth` behavior) to avoid lag during rapid streaming deltas.

### Reset in conversation-switch effect (line 172-188)

Add:
```ts
userHasScrolledUpRef.current = false
setShowScrollButton(false)
```

### Reset in `handleSend`

Add at the top of `handleSend`:
```ts
userHasScrolledUpRef.current = false
setShowScrollButton(false)
```

### Scroll-to-bottom button

Rendered inside a `position: relative` wrapper around the messages area:

```tsx
{showScrollButton && (
  <button
    onClick={() => {
      scrollToBottom()
      userHasScrolledUpRef.current = false
      setShowScrollButton(false)
    }}
    style={styles.scrollToBottomButton}
    title="Scroll to bottom"
  >
    ↓
  </button>
)}
```

Button style: absolutely positioned at bottom-center of the messages area, circular, semi-transparent dark background, white arrow, subtle box-shadow.

### Messages area wrapper

The messages area div needs `position: relative` added to its style so the absolute button is positioned relative to it.
