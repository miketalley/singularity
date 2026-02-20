# Session Auto-Restore Design

## Problem

When Singularity restarts, the user loses their place. There's no way to resume where you left off — you have to manually navigate back to your workspace and conversation.

## Solution

Persist the active workspace, conversation, and input drafts using the existing `settings` table. On launch, automatically restore the last session state.

## Approach: Existing `settings` Table

The `settings` table already exists as a key-value store with `getSetting()` / `setSetting()` helpers. No schema changes needed.

### Persisted State

| Key | Value Type | When Written |
|-----|-----------|-------------|
| `last_workspace_id` | `string` (number as string) | On workspace switch |
| `last_conversation_id` | `string` (number as string) | On conversation switch |
| `drafts` | `JSON string: {"42": "unsent text", ...}` | On input change, debounced 1s |

### Startup Restore Flow

1. App launches, renderer mounts
2. Read `last_workspace_id` and `last_conversation_id` from settings via IPC
3. Validate both still exist in DB (conversation not soft-deleted, workspace not removed)
4. If valid: set as active workspace + conversation, load messages, scroll to bottom
5. If invalid: fall back to current behavior (no conversation selected)
6. Read `drafts` setting: populate the `drafts` state map for conversations with unsent text

### Write Flow

- **Workspace/conversation switch**: Write to settings immediately via IPC
- **Draft text changes**: Debounce writes to 1 second to avoid excessive DB writes

### Components Touched

1. **`database.ts`** — No changes. `getSetting()` / `setSetting()` already exist.
2. **`ipc.ts`** — Add `get-setting` and `set-setting` IPC handlers to expose DB settings to renderer.
3. **`preload/index.ts`** + **`preload/index.d.ts`** — Expose `getSetting()` / `setSetting()` on `window.electronAPI`.
4. **`App.tsx`** — On mount: read last state and restore. On workspace/conversation switch: persist. Debounce draft persistence.

### Edge Cases

- **Deleted conversation**: Gracefully fall back to no selection
- **Deleted workspace**: Fall back to no selection
- **First launch** (no settings yet): Normal fresh start, no errors
- **Multiple windows** (future): Last writer wins, acceptable for now
