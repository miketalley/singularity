# Sidebar Conversation Status Icons — Design

**Date**: 2026-02-19

## Problem

Conversations in the sidebar show a green check mark when the last message is from the user (meaning the AI hasn't responded yet). The spinner only appears during active streaming, missing the "waiting for response" state. When the user clicks into such a conversation, the check becomes a spinner — but it should have been a spinner all along.

## Solution

Add a `last_message_role` computed column to the `getConversationsByWorkspace` SQL query, then update the sidebar icon cascade to show a spinner whenever the last message is from the user.

## Changes

### 1. Database query (`src/main/database.ts`)

Add a subquery to `getConversationsByWorkspace`:

```sql
(SELECT role FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message_role
```

### 2. Conversation interface (`Sidebar.tsx`)

Add `last_message_role?: string` to the `Conversation` interface.

### 3. Icon cascade (`Sidebar.tsx`)

Update from:

```
streaming → spinner
awaiting_response → yellow ?
needs_review → red !
message_count > 0 → green check
```

To:

```
streaming OR last_message_role === 'user' → spinner
awaiting_response → yellow ?
needs_review → red !
message_count > 0 → green check
```

## What stays the same

- `awaiting_response` logic (assistant message ends with `?` or contains question block)
- `needs_review` logic (manually flagged)
- `streamingConversationId` prop (still used, combined with the new check)
- All other sidebar behavior
