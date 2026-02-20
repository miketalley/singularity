# Thumbs Up / Thumbs Down Feedback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single book icon under chat bubbles with thumbs up/down icons that extract positive patterns or anti-patterns from messages.

**Architecture:** Add a `sentiment` parameter (`'positive' | 'negative'`) that flows from the UI through IPC to `extractMemories`, which selects a different prompt based on sentiment. No schema changes to BrainEntry or BRAIN.md.

**Tech Stack:** React (renderer), Electron IPC, Anthropic SDK (claude-haiku-4-5)

---

### Task 1: Add sentiment parameter to extractMemories

**Files:**
- Modify: `src/main/anthropic.ts:93-136`

**Step 1: Update extractMemories signature and add sentiment-aware prompts**

Replace the `extractMemories` function (lines 93-136) with:

```typescript
export async function extractMemories(
  messageContent: string,
  sentiment: 'positive' | 'negative' = 'positive'
): Promise<Array<{ text: string; category: string }>> {
  const anthropic = getClient()

  const positivePrompt = `Extract concise, actionable memory entries from the following message.
Each entry should be a single fact, decision, convention, or pattern worth repeating.
Return as JSON array only, no other text:

[{"text": "...", "category": "Tech Stack | Architecture | Conventions | Gotchas"}]

Only extract information that would be useful to remember across future conversations about this project.
Skip generic knowledge that any developer would know. Be specific to THIS project.
If nothing is worth remembering, return an empty array: []

Message:
${messageContent}`

  const negativePrompt = `Find concepts from this text that a user may want to prevent repeating in the future.
Each entry should describe a specific anti-pattern, mistake, or approach to avoid.
Phrase each entry as a clear warning starting with "AVOID:" (e.g., "AVOID: using inline styles for layout").
Return as JSON array only, no other text:

[{"text": "AVOID: ...", "category": "Tech Stack | Architecture | Conventions | Gotchas"}]

Only extract information that would be useful to remember across future conversations about this project.
Skip generic knowledge that any developer would know. Be specific to THIS project.
If nothing is worth flagging, return an empty array: []

Message:
${messageContent}`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: sentiment === 'positive' ? positivePrompt : negativePrompt
      }
    ]
  })

  const block = response.content[0]
  if (block.type !== 'text') return []

  try {
    const parsed = JSON.parse(block.text)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>).text === 'string' &&
        typeof (e as Record<string, unknown>).category === 'string'
    )
  } catch {
    return []
  }
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit --project tsconfig.node.json`
Expected: No errors

**Step 3: Commit**

```bash
git add src/main/anthropic.ts
git commit -m "feat: add sentiment parameter to extractMemories for positive/negative learning"
```

---

### Task 2: Pass sentiment through IPC bridge

**Files:**
- Modify: `src/main/ipc.ts:348-350`
- Modify: `src/preload/index.ts:102-105`
- Modify: `src/preload/index.d.ts:72-74`

**Step 1: Update IPC handler in ipc.ts**

Replace lines 348-350:

```typescript
  ipcMain.handle('brain-extract-memories', async (_event, messageContent: string, sentiment: 'positive' | 'negative') => {
    return extractMemories(messageContent, sentiment)
  })
```

**Step 2: Update preload bridge in index.ts**

Replace lines 102-105:

```typescript
  brainExtractMemories: (
    messageContent: string,
    sentiment: 'positive' | 'negative'
  ): Promise<Array<{ text: string; category: string }>> =>
    ipcRenderer.invoke('brain-extract-memories', messageContent, sentiment),
```

**Step 3: Update type declaration in index.d.ts**

Replace lines 72-74:

```typescript
  brainExtractMemories: (
    messageContent: string,
    sentiment: 'positive' | 'negative'
  ) => Promise<Array<{ text: string; category: string }>>
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit --project tsconfig.node.json && npx tsc --noEmit --project tsconfig.web.json`
Expected: No errors

**Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: pass sentiment parameter through IPC bridge for brain extraction"
```

---

### Task 3: Update App.tsx handler and prop types

**Files:**
- Modify: `src/renderer/src/App.tsx:238-258,312`
- Modify: `src/renderer/src/components/ConversationView.tsx:22,654`

**Step 1: Update handleLearnFromThis in App.tsx**

Replace the handler at lines 238-258 with:

```typescript
  // Brain: "Learn from this" / "Learn what to avoid" handler
  const handleLearnFromThis = useCallback(async (content: string, sentiment: 'positive' | 'negative') => {
    setBrainWorkspacePath(activeConversation?.workspacePath ?? null)
    setBrainWorkspaceName(activeConversation?.workspaceName ?? 'No workspace')
    setBrainPanelOpen(true)
    setBrainIsExtracting(true)
    setBrainProposedEntries([])
    setBrainExtractionMessage(null)
    try {
      const extracted = await window.electronAPI.brainExtractMemories(content, sentiment)
      setBrainProposedEntries(extracted)
      if (extracted.length === 0) {
        setBrainExtractionMessage(
          sentiment === 'positive'
            ? 'No learnable memories found in this message. Try a message with project-specific details like architecture decisions, conventions, or gotchas.'
            : 'No anti-patterns found in this message. Try a message that contains mistakes or approaches to avoid.'
        )
      }
    } catch (err) {
      console.error('Failed to extract memories:', err)
      setBrainExtractionMessage('Failed to extract memories. Check your API key and try again.')
    } finally {
      setBrainIsExtracting(false)
    }
  }, [activeConversation])
```

**Step 2: Update onLearnFromThis prop type in ConversationView.tsx**

At line 22, change:

```typescript
  onLearnFromThis?: (content: string, sentiment: 'positive' | 'negative') => void
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit --project tsconfig.web.json`
Expected: Errors in MessageBubble.tsx (expected — we fix that in Task 4)

**Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/ConversationView.tsx
git commit -m "feat: update learn handler and prop types to accept sentiment"
```

---

### Task 4: Replace book icon with thumbs up/down in MessageBubble

**Files:**
- Modify: `src/renderer/src/components/MessageBubble.tsx:13-19,266-292,316-378,411-416,577-582`

**Step 1: Update MessageBubbleProps interface**

Replace line 17:

```typescript
  onLearnFromThis?: (content: string, sentiment: 'positive' | 'negative') => void
```

**Step 2: Add feedbackButton style alongside existing brainButton**

Replace the `brainButton` style (lines 278-292) with:

```typescript
  feedbackButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    transition: 'color 0.15s ease, background-color 0.15s ease'
  }
```

**Step 3: Replace BrainActionBar with FeedbackActionBar**

Replace the entire `BrainActionBar` component (lines 316-378) with:

```typescript
function FeedbackButton({
  icon,
  tooltip,
  hoverColor,
  onClick,
  align
}: {
  icon: string
  tooltip: string
  hoverColor: string
  onClick: () => void
  align: 'left' | 'right'
}): React.JSX.Element {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        style={styles.feedbackButton}
        onClick={onClick}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = hoverColor
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          setShowTooltip(true)
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.backgroundColor = 'transparent'
          setShowTooltip(false)
        }}
      >
        {icon}
      </button>
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            ...(align === 'left' ? { left: 0 } : { right: 0 }),
            marginBottom: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: 'var(--text-bright)',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 300
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  )
}

function FeedbackActionBar({
  isVisible,
  align,
  onThumbsUp,
  onThumbsDown
}: {
  isVisible: boolean
  align: 'left' | 'right'
  onThumbsUp: () => void
  onThumbsDown: () => void
}): React.JSX.Element {
  return (
    <div
      style={{
        ...styles.actionBar,
        ...(isVisible ? styles.actionBarVisible : {}),
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start'
      }}
    >
      <FeedbackButton
        icon="&#x1F44D;"
        tooltip="Learn from this"
        hoverColor="#98c379"
        onClick={onThumbsUp}
        align={align}
      />
      <FeedbackButton
        icon="&#x1F44E;"
        tooltip="Learn what to avoid"
        hoverColor="#e06c75"
        onClick={onThumbsDown}
        align={align}
      />
    </div>
  )
}
```

**Step 4: Update usage in user bubble (lines 411-416)**

Replace:

```typescript
          {onLearnFromThis && (
            <BrainActionBar
              isVisible={isHovered}
              align="right"
              onLearnFromThis={() => onLearnFromThis(content)}
            />
          )}
```

With:

```typescript
          {onLearnFromThis && (
            <FeedbackActionBar
              isVisible={isHovered}
              align="right"
              onThumbsUp={() => onLearnFromThis(content, 'positive')}
              onThumbsDown={() => onLearnFromThis(content, 'negative')}
            />
          )}
```

**Step 5: Update usage in assistant bubble (lines 577-582)**

Replace:

```typescript
        {onLearnFromThis && (
          <BrainActionBar
            isVisible={isHovered}
            align="left"
            onLearnFromThis={() => onLearnFromThis(content)}
          />
        )}
```

With:

```typescript
        {onLearnFromThis && (
          <FeedbackActionBar
            isVisible={isHovered}
            align="left"
            onThumbsUp={() => onLearnFromThis(content, 'positive')}
            onThumbsDown={() => onLearnFromThis(content, 'negative')}
          />
        )}
```

**Step 6: Verify full build compiles**

Run: `npx tsc --noEmit --project tsconfig.web.json`
Expected: No errors

**Step 7: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "feat: replace book icon with thumbs up/down feedback icons"
```

---

### Task 5: Verify end-to-end and clean up

**Step 1: Run full type check**

Run: `npx tsc --noEmit --project tsconfig.node.json && npx tsc --noEmit --project tsconfig.web.json`
Expected: No errors

**Step 2: Build the app**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: cleanup after thumbs feedback implementation"
```
