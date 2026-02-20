# Smart Scroll During Streaming — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to scroll up independently during streaming without being yanked to the bottom, and provide a "scroll to bottom" button when scrolled away.

**Architecture:** Add scroll-position tracking to `ConversationView.tsx` via an `onScroll` handler. A `userHasScrolledUpRef` controls whether auto-scroll fires. A `showScrollButton` state toggles a floating button.

**Tech Stack:** React (useState, useRef, useCallback), inline styles (matching existing pattern)

---

### Task 1: Add new refs and state

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx:147-165`

**Step 1: Add the new ref and state declarations**

After the existing `const audioChunksRef` line (line 165), add:

```tsx
const messagesContainerRef = useRef<HTMLDivElement>(null)
const userHasScrolledUpRef = useRef(false)
```

After the existing `const [isTranscribing, setIsTranscribing]` line (line 155), add:

```tsx
const [showScrollButton, setShowScrollButton] = useState(false)
```

**Step 2: Verify it compiles**

Run: `cd /Users/mikemini/Repos/singularity && npx tsc --noEmit`
Expected: No new errors

---

### Task 2: Replace `scrollToBottom` and add `handleScroll`

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx:167-169` (scrollToBottom)

**Step 1: Replace `scrollToBottom` to use container ref**

Replace the existing `scrollToBottom` callback (lines 167-169):

```tsx
const scrollToBottom = useCallback(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [])
```

With:

```tsx
const scrollToBottom = useCallback(() => {
  const el = messagesContainerRef.current
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}, [])
```

**Step 2: Add `handleScroll` callback**

Add immediately after `scrollToBottom`:

```tsx
const handleScroll = useCallback(() => {
  const el = messagesContainerRef.current
  if (!el) return
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  userHasScrolledUpRef.current = !isNearBottom
  setShowScrollButton(!isNearBottom)
}, [])
```

**Step 3: Verify it compiles**

Run: `cd /Users/mikemini/Repos/singularity && npx tsc --noEmit`
Expected: No new errors

---

### Task 3: Guard auto-scroll effect and add resets

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx`

**Step 1: Guard the auto-scroll effect (lines 219-222)**

Replace:

```tsx
// Auto-scroll on new messages or streaming content
useEffect(() => {
  scrollToBottom()
}, [messages, streamingContent, scrollToBottom])
```

With:

```tsx
// Auto-scroll on new messages or streaming content (only if user hasn't scrolled up)
useEffect(() => {
  if (!userHasScrolledUpRef.current) {
    scrollToBottom()
  }
}, [messages, streamingContent, scrollToBottom])
```

**Step 2: Reset scroll state on conversation switch (inside the existing useEffect at line 172)**

After the line `pendingMessagesRef.current = []` (line 186), add:

```tsx
userHasScrolledUpRef.current = false
setShowScrollButton(false)
```

**Step 3: Reset scroll state when user sends a message**

In `handleSend`, after the line `setError(null)` (line 393), add:

```tsx
userHasScrolledUpRef.current = false
setShowScrollButton(false)
```

**Step 4: Verify it compiles**

Run: `cd /Users/mikemini/Repos/singularity && npx tsc --noEmit`
Expected: No new errors

---

### Task 4: Wire up the DOM — container ref, onScroll, and button

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx`

**Step 1: Add `messagesAreaWrapper` style to the styles object**

Add to the `styles` object (after the `messagesArea` entry):

```tsx
messagesAreaWrapper: {
  position: 'relative' as const,
  flex: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden'
},
```

Update `messagesArea` — remove `flex: 1` since the wrapper now handles it:

```tsx
messagesArea: {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 0'
},
```

Actually `messagesArea` already has `flex: 1` and `overflowY: 'auto'` — keep it as-is. The wrapper just needs `position: relative`, `flex: 1`, `overflow: hidden`, and `display: flex` / `flexDirection: column`.

**Step 2: Add `scrollToBottomButton` style**

Add to the `styles` object:

```tsx
scrollToBottomButton: {
  position: 'absolute' as const,
  bottom: '16px',
  left: '50%',
  transform: 'translateX(-50%)',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  backgroundColor: 'rgba(60, 60, 60, 0.9)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-bright)',
  fontSize: '18px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
  zIndex: 10
},
```

**Step 3: Wrap the messages area in the positioned wrapper and add the button**

Replace the messages area JSX (lines 441-498):

```tsx
{/* Messages area */}
<div style={styles.messagesArea}>
  ...
  <div ref={messagesEndRef} />
</div>
```

With:

```tsx
{/* Messages area */}
<div style={styles.messagesAreaWrapper}>
  <div
    ref={messagesContainerRef}
    style={styles.messagesArea}
    onScroll={handleScroll}
  >
    {(() => {
      // ... existing message rendering logic (unchanged) ...
    })()}
    {error && <div style={styles.error}>{error}</div>}
    <div ref={messagesEndRef} />
  </div>
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
</div>
```

**Step 4: Verify it compiles**

Run: `cd /Users/mikemini/Repos/singularity && npx tsc --noEmit`
Expected: No new errors

---

### Task 5: Manual testing and commit

**Step 1: Build the app**

Run: `cd /Users/mikemini/Repos/singularity && npm run build`
Expected: Build succeeds

**Step 2: Manual smoke test**

Launch with `npm run dev`, then verify:
- Send a message and let it stream — should auto-scroll as before
- Scroll up during streaming — should stay where you are
- See the "↓" button appear at bottom-center
- Click the button — should jump to bottom and resume auto-scroll
- Scroll back near the bottom manually — button disappears, auto-scroll resumes
- Switch conversations — auto-scroll resets
- Send a new message while scrolled up — should jump to bottom

**Step 3: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx
git commit -m "feat: smart scroll — independent scrolling during streaming with scroll-to-bottom button"
```
