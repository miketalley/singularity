# Ephemeral Narration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve narration text as styled ephemeral text (inline, italic, muted) when tool activity starts, instead of replacing it with the three-dot ThinkingIndicator.

**Architecture:** Add an `ephemeralText` state variable to ConversationView that captures `streamingContent` before it's cleared on tool activity. Create a new `EphemeralText` component for the inline/italic/muted display. Update render priority to show ephemeral text where ThinkingIndicator currently appears.

**Tech Stack:** React, Vitest, @testing-library/react

---

### Task 1: Create EphemeralText component with test

**Files:**
- Create: `src/renderer/src/components/EphemeralText.tsx`
- Create: `tests/unit/renderer/EphemeralText.test.tsx`

**Step 1: Write the failing test**

```tsx
// tests/unit/renderer/EphemeralText.test.tsx
// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import EphemeralText from '../../../src/renderer/src/components/EphemeralText'

describe('EphemeralText', () => {
  it('renders the text content', () => {
    render(<EphemeralText text="Let me look at the code..." />)
    expect(screen.getByText('Let me look at the code...')).toBeTruthy()
  })

  it('renders with italic styling', () => {
    const { container } = render(<EphemeralText text="Investigating..." />)
    const textEl = container.querySelector('[data-testid="ephemeral-text"]')
    expect(textEl).toBeTruthy()
    expect(textEl?.style.fontStyle).toBe('italic')
  })

  it('does not render a bubble wrapper', () => {
    const { container } = render(<EphemeralText text="Thinking..." />)
    // No element with assistant-bubble background
    const elements = container.querySelectorAll('*')
    const hasBubble = Array.from(elements).some(
      (el) => (el as HTMLElement).style.backgroundColor === 'var(--assistant-bubble)'
    )
    expect(hasBubble).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/renderer/EphemeralText.test.tsx`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
// src/renderer/src/components/EphemeralText.tsx
import React from 'react'

interface EphemeralTextProps {
  text: string
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '4px 16px'
  },
  text: {
    fontStyle: 'italic',
    color: 'var(--text-secondary)',
    opacity: 0.7,
    fontSize: '13px',
    lineHeight: '1.5'
  }
}

function EphemeralText({ text }: EphemeralTextProps): React.JSX.Element {
  return (
    <div style={styles.row}>
      <span data-testid="ephemeral-text" style={styles.text}>
        {text}
      </span>
    </div>
  )
}

export default EphemeralText
```

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/renderer/EphemeralText.test.tsx`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/renderer/src/components/EphemeralText.tsx tests/unit/renderer/EphemeralText.test.tsx
git commit -m "feat(ephemeral): add EphemeralText component with tests"
```

---

### Task 2: Add ephemeralText state and update event handlers

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx`

**Step 1: Add ephemeralText state declaration**

After line 336 (`const [toolActivity, setToolActivity] = useState('')`), add:

```tsx
const [ephemeralText, setEphemeralText] = useState('')
```

**Step 2: Update onToolActivity handler (lines 424-431)**

Change from:
```tsx
window.electronAPI.onToolActivity((data) => {
  if (data.conversationId === conversationId) {
    setToolActivity(data.activity)
    // Clear narration text so the ToolActivityIndicator shows instead
    // of the growing MessageBubble with "Let me investigate..." text
    setStreamingContent('')
    streamingContentRef.current = ''
  }
})
```

To:
```tsx
window.electronAPI.onToolActivity((data) => {
  if (data.conversationId === conversationId) {
    setToolActivity(data.activity)
    // Preserve narration text as ephemeral before clearing
    if (streamingContentRef.current) {
      setEphemeralText(streamingContentRef.current)
    }
    setStreamingContent('')
    streamingContentRef.current = ''
  }
})
```

**Step 3: Update onStreamDelta handler (lines 414-422)**

Change from:
```tsx
window.electronAPI.onStreamDelta((data) => {
  if (data.conversationId === conversationId) {
    setStreamingContent((prev) => {
      const next = prev + data.text
      streamingContentRef.current = next
      return next
    })
  }
})
```

To:
```tsx
window.electronAPI.onStreamDelta((data) => {
  if (data.conversationId === conversationId) {
    // Clear ephemeral text — live streaming content takes over
    setEphemeralText('')
    setStreamingContent((prev) => {
      const next = prev + data.text
      streamingContentRef.current = next
      return next
    })
  }
})
```

**Step 4: Update onStreamComplete handler (lines 434-448)**

Add `setEphemeralText('')` to the cleanup. Change from:
```tsx
window.electronAPI.onStreamComplete(async (data) => {
  if (data.conversationId === conversationId) {
    setStreamingContent('')
    setToolActivity('')
```

To:
```tsx
window.electronAPI.onStreamComplete(async (data) => {
  if (data.conversationId === conversationId) {
    setStreamingContent('')
    setEphemeralText('')
    setToolActivity('')
```

**Step 5: Update conversation-switch cleanup (line 379)**

After `setToolActivity('')` at line 379, add:
```tsx
setEphemeralText('')
```

**Step 6: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx
git commit -m "feat(ephemeral): add ephemeralText state and update event handlers"
```

---

### Task 3: Update render logic and import EphemeralText

**Files:**
- Modify: `src/renderer/src/components/ConversationView.tsx`

**Step 1: Add import**

After line 5 (`import ToolActivityIndicator from './ToolActivityIndicator'`), add:

```tsx
import EphemeralText from './EphemeralText'
```

**Step 2: Update render priority block (lines 846-868)**

Change from:
```tsx
// Show thinking indicator, tool activity, or streaming content after the active message
if (isUnanswered && index === firstUnansweredIndex && isStreaming) {
  if (streamingContent) {
    items.push(
      <MessageBubble
        key={`stream-${msg.id}`}
        role="assistant"
        content={streamingContent}
      />
    )
  } else if (toolActivity) {
    items.push(
      <React.Fragment key={`tool-${msg.id}`}>
        <ThinkingIndicator elapsed={streamingElapsed} />
        <ToolActivityIndicator activity={toolActivity} elapsed={streamingElapsed} />
      </React.Fragment>
    )
  } else {
    items.push(
      <ThinkingIndicator key={`think-${msg.id}`} elapsed={streamingElapsed} />
    )
  }
}
```

To:
```tsx
// Show streaming content, ephemeral narration, tool activity, or thinking indicator
if (isUnanswered && index === firstUnansweredIndex && isStreaming) {
  if (streamingContent) {
    items.push(
      <MessageBubble
        key={`stream-${msg.id}`}
        role="assistant"
        content={streamingContent}
      />
    )
  } else if (ephemeralText) {
    items.push(
      <React.Fragment key={`ephemeral-${msg.id}`}>
        <EphemeralText text={ephemeralText} />
        {toolActivity && (
          <ToolActivityIndicator activity={toolActivity} elapsed={streamingElapsed} />
        )}
      </React.Fragment>
    )
  } else if (toolActivity) {
    items.push(
      <React.Fragment key={`tool-${msg.id}`}>
        <ThinkingIndicator elapsed={streamingElapsed} />
        <ToolActivityIndicator activity={toolActivity} elapsed={streamingElapsed} />
      </React.Fragment>
    )
  } else {
    items.push(
      <ThinkingIndicator key={`think-${msg.id}`} elapsed={streamingElapsed} />
    )
  }
}
```

**Step 3: Add ephemeralText to auto-scroll dependency (line 461)**

Change from:
```tsx
}, [messages, streamingContent, toolActivity, scrollToBottom])
```

To:
```tsx
}, [messages, streamingContent, ephemeralText, toolActivity, scrollToBottom])
```

**Step 4: Commit**

```bash
git add src/renderer/src/components/ConversationView.tsx
git commit -m "feat(ephemeral): update render logic to show ephemeral narration text"
```

---

### Task 4: Run full test suite

**Step 1: Run unit tests**

Run: `npm run test:unit`
Expected: All tests pass (existing + new EphemeralText tests)

**Step 2: Run e2e tests**

Run: `npm run test:e2e`
Expected: All tests pass

**Step 3: Commit (if any fixes needed)**

---

### Task 5: Manual verification

**Test 1: Multi-step tool investigation**
1. Send: "Look at src/main/index.ts and tell me what it does"
2. Verify: narration text appears as italic/muted inline text (not a MessageBubble) when tool activity starts
3. Verify: ToolActivityIndicator shows below the ephemeral text
4. Verify: when new streaming text arrives, ephemeral text disappears and MessageBubble takes over
5. Verify: final DB message renders normally

**Test 2: No-tool response**
1. Send: "What is 2+2?"
2. Verify: text streams as a growing MessageBubble (unchanged behavior)
3. Verify: no ephemeral text appears

**Test 3: Tool call with no preceding narration**
1. If Claude starts with a tool call immediately (no text first)
2. Verify: ThinkingIndicator (dots) + ToolActivityIndicator shows (unchanged behavior)

---

## Behavior Summary

| Phase | User sees |
|---|---|
| Streaming starts, no text yet | ThinkingIndicator (three dots) |
| Text streaming (narration) | Growing MessageBubble |
| Tool activity starts | Ephemeral italic/muted text + ToolActivityIndicator |
| Tool call with no prior narration | ThinkingIndicator + ToolActivityIndicator |
| More text arrives | MessageBubble replaces ephemeral text |
| Stream completes | Full message from DB |
