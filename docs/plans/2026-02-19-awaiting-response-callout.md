# Awaiting Response Callout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make AI questions visually prominent so users know when a response is required — both in-bubble (callout card) and in the sidebar (red ? icon).

**Architecture:** Pure client-side detection. The DB query computes an `awaiting_response` flag via subquery (no schema change). The renderer extracts trailing question paragraphs and renders them in a styled callout card. The sidebar shows a red `?` icon when a conversation is awaiting response.

**Tech Stack:** React, better-sqlite3 (query change only), existing CSS variables

---

### Task 1: Add `awaiting_response` computed field to DB query

**Files:**
- Modify: `src/main/database.ts:111-121` (`getConversationsByWorkspace`)

**Step 1: Update the SQL query**

Add a subquery that checks if the last message is from `assistant` and its content ends with `?` or contains `[QUESTION_BLOCK]`:

```typescript
export function getConversationsByWorkspace(workspaceId: number): unknown[] {
  const database = getDatabase()
  return database
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
         (SELECT CASE
           WHEN lm.role = 'assistant' AND (
             TRIM(lm.content) LIKE '%?'
             OR lm.content LIKE '%[QUESTION_BLOCK]%'
           ) THEN 1
           ELSE 0
         END
         FROM messages lm
         WHERE lm.conversation_id = c.id
         ORDER BY lm.id DESC
         LIMIT 1) as awaiting_response
       FROM conversations c
       WHERE c.workspace_id = ? AND c.deleted_at IS NULL
       ORDER c.updated_at DESC`
    )
    .all(workspaceId)
}
```

**Step 2: Verify the app still builds**

Run: `npm run build`
Expected: Build succeeds (this is a backend-only query change, no frontend impact yet)

**Step 3: Commit**

```bash
git add src/main/database.ts
git commit -m "feat: add awaiting_response computed field to conversation query"
```

---

### Task 2: Add `AwaitingResponseIcon` to Sidebar and wire up icon priority

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`

**Step 1: Add the `awaiting_response` field to the Conversation interface**

In `Sidebar.tsx`, update the interface:

```typescript
interface Conversation {
  id: number
  workspace_id: number
  title: string
  model: string
  created_at: string
  message_count?: number
  needs_review?: number
  awaiting_response?: number
}
```

**Step 2: Add the `AwaitingResponseIcon` component**

Add after `NeedsReviewIcon`:

```typescript
function AwaitingResponseIcon(): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        fontSize: '11px',
        lineHeight: '12px',
        textAlign: 'center',
        flexShrink: 0,
        color: '#e5c07b',
        fontWeight: 700
      }}
    >
      ?
    </span>
  )
}
```

**Step 3: Update the icon priority in the conversation row**

Replace the existing icon logic (around line 646) with:

```tsx
{isStreamingConv ? (
  <SpinnerIcon />
) : conv.awaiting_response ? (
  <AwaitingResponseIcon />
) : conv.needs_review ? (
  <NeedsReviewIcon />
) : (conv.message_count ?? 0) > 0 ? (
  <CheckIcon />
) : null}
```

Icon priority: Spinner > Awaiting Response (?) > Needs Review (!) > Check

**Step 4: Verify the app builds and icon appears**

Run: `npm run build`
Manual check: Open the app, find a conversation where the last AI message ends with a question. The sidebar should show a yellow `?` instead of a green check.

**Step 5: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: add awaiting-response icon to sidebar conversations"
```

---

### Task 3: Add `extractTrailingQuestion()` function to MessageBubble

**Files:**
- Modify: `src/renderer/src/components/MessageBubble.tsx`

**Step 1: Add the extraction function**

Add after the existing `parseQuestionOptions` function:

```typescript
function extractTrailingQuestion(content: string): {
  body: string
  trailingQuestion: string | null
} {
  // Don't extract from content that already has QUESTION_BLOCKs
  if (content.includes('[QUESTION_BLOCK]')) {
    return { body: content, trailingQuestion: null }
  }

  const paragraphs = content.split(/\n\n+/)

  // Walk backwards collecting paragraphs that end with '?'
  let questionStart = paragraphs.length
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const trimmed = paragraphs[i].trim()
    if (!trimmed) continue
    if (trimmed.endsWith('?')) {
      questionStart = i
    } else {
      break
    }
  }

  if (questionStart >= paragraphs.length) {
    return { body: content, trailingQuestion: null }
  }

  const body = paragraphs.slice(0, questionStart).join('\n\n')
  const trailingQuestion = paragraphs.slice(questionStart).join('\n\n')

  return { body, trailingQuestion }
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "feat: add extractTrailingQuestion utility for plain-text question detection"
```

---

### Task 4: Render trailing question callout card in MessageBubble

**Files:**
- Modify: `src/renderer/src/components/MessageBubble.tsx`

**Step 1: Add the `trailingQuestionCard` style**

Add to the `styles` object:

```typescript
trailingQuestionCard: {
  backgroundColor: 'rgba(229, 192, 123, 0.08)',
  border: '1px solid rgba(229, 192, 123, 0.2)',
  borderLeft: '3px solid #e5c07b',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '12px 0 4px 0'
},
trailingQuestionHeader: {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '8px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  color: '#e5c07b'
}
```

**Step 2: Update the assistant message rendering**

In the assistant message return block, replace the segment rendering logic. For `text` type segments, apply `extractTrailingQuestion` and wrap the trailing question in the callout card:

```tsx
if (seg.type === 'text') {
  const { body, trailingQuestion } = extractTrailingQuestion(seg.text)
  return (
    <React.Fragment key={i}>
      {body && (
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {normalizeMarkdown(body)}
        </Markdown>
      )}
      {trailingQuestion && (
        <div style={styles.trailingQuestionCard}>
          <div style={styles.trailingQuestionHeader}>? Response Needed</div>
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {normalizeMarkdown(trailingQuestion)}
          </Markdown>
        </div>
      )}
    </React.Fragment>
  )
}
```

This replaces the existing plain text rendering at the bottom of the `segments.map` callback (around line 505-509).

**Step 3: Verify the app builds and callout renders**

Run: `npm run build`
Manual check: Open a conversation where the AI asked a trailing question. The question paragraph should appear in a yellow-accented callout card with a "? Response Needed" header.

**Step 4: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "feat: render trailing AI questions in visual callout card"
```

---

### Summary

| Task | File | What |
|------|------|------|
| 1 | `database.ts` | Add `awaiting_response` subquery to conversation list |
| 2 | `Sidebar.tsx` | Add `AwaitingResponseIcon`, update icon priority |
| 3 | `MessageBubble.tsx` | Add `extractTrailingQuestion()` function |
| 4 | `MessageBubble.tsx` | Render callout card for trailing questions |

No schema migrations. No new IPC handlers. No preload changes.
