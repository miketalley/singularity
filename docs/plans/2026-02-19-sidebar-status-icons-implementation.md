# Sidebar Status Icons Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a loading spinner in the sidebar for conversations where the last message is from the user (awaiting AI response), instead of a green check.

**Architecture:** Add a `last_message_role` computed column to the `getConversationsByWorkspace` SQL query, thread it through the `Conversation` interface, and update the sidebar icon cascade.

**Tech Stack:** SQLite (better-sqlite3), React, TypeScript, Vitest

---

### Task 1: Add failing tests for `last_message_role` computed column

**Files:**
- Modify: `tests/unit/main/database.test.ts` (inside `describe('getConversationsByWorkspace computed columns')` block, after the existing `awaiting_response` tests around line 575)

**Step 1: Write the failing tests**

Add these tests after the `[QUESTION_BLOCK]` test (line 575):

```typescript
  it('returns last_message_role = null when conversation has no messages', () => {
    createConversation(workspaceId, 'Empty', 'gpt-4')
    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].last_message_role).toBeNull()
  })

  it('returns last_message_role = "user" when last message is from user', () => {
    const conv = createConversation(workspaceId, 'User Last', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].last_message_role).toBe('user')
  })

  it('returns last_message_role = "assistant" when last message is from assistant', () => {
    const conv = createConversation(workspaceId, 'Asst Last', 'gpt-4')
    addMessage(conv.id, 'user', 'hello')
    addMessage(conv.id, 'assistant', 'Hi there!')

    const convs = getConversationsByWorkspace(workspaceId)
    expect(convs[0].last_message_role).toBe('assistant')
  })
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --reporter verbose 2>&1 | grep -E "last_message_role|FAIL|PASS"`
Expected: 3 new tests FAIL (property is `undefined`)

**Step 3: Commit**

```bash
git add tests/unit/main/database.test.ts
git commit -m "test: add failing tests for last_message_role computed column"
```

---

### Task 2: Add `last_message_role` to the SQL query

**Files:**
- Modify: `src/main/database.ts:115-131` — the `getConversationsByWorkspace` function
- Modify: `tests/unit/main/database.test.ts:56-76` — the test helper copy of the same query

**Step 1: Update the production query**

In `src/main/database.ts`, inside `getConversationsByWorkspace`, add a new subquery after the `awaiting_response` subquery (after line 127, before `FROM conversations c`):

```sql
         (SELECT role FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message_role
```

The full query becomes:

```sql
SELECT c.*,
  (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
  (SELECT CASE
    WHEN lm.role = 'assistant' AND (
      RTRIM(TRIM(lm.content), '*_`') LIKE '%?'
      OR lm.content LIKE '%[QUESTION_BLOCK]%'
    ) THEN 1
    ELSE 0
  END
  FROM messages lm
  WHERE lm.conversation_id = c.id
  ORDER BY lm.id DESC
  LIMIT 1) as awaiting_response,
  (SELECT role FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message_role
FROM conversations c
WHERE c.workspace_id = ? AND c.deleted_at IS NULL
ORDER BY c.updated_at DESC
```

**Step 2: Update the test helper query**

In `tests/unit/main/database.test.ts`, the `getConversationsByWorkspace` helper function (line 56-76) has a duplicate of this query. Add the same subquery there too.

**Step 3: Run tests to verify they pass**

Run: `npm run test:unit -- --reporter verbose 2>&1 | grep -E "last_message_role|FAIL|PASS"`
Expected: All 3 new tests PASS, no regressions

**Step 4: Commit**

```bash
git add src/main/database.ts tests/unit/main/database.test.ts
git commit -m "feat: add last_message_role computed column to getConversationsByWorkspace"
```

---

### Task 3: Update Sidebar icon logic

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx:11-20` — add `last_message_role` to `Conversation` interface
- Modify: `src/renderer/src/components/Sidebar.tsx:675-683` — update icon cascade

**Step 1: Add field to Conversation interface**

In `Sidebar.tsx`, add `last_message_role?: string` to the `Conversation` interface (after line 19):

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
  last_message_role?: string
}
```

**Step 2: Update the icon cascade**

Replace lines 675-683 with:

```tsx
{isStreamingConv || conv.last_message_role === 'user' ? (
  <SpinnerIcon />
) : conv.awaiting_response ? (
  <AwaitingResponseIcon />
) : conv.needs_review ? (
  <NeedsReviewIcon />
) : (conv.message_count ?? 0) > 0 ? (
  <CheckIcon />
) : null}
```

**Step 3: Run full test suite**

Run: `npm run test:unit`
Expected: All tests pass, no regressions

**Step 4: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: show spinner in sidebar when last message is from user"
```
