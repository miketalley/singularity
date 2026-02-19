# Singularity MVP Design

## Overview

Singularity is a macOS desktop application for conversing with Claude AI in the context of local code workspaces. Users bring their own Anthropic API key and can organize conversations by workspace (a folder/repo on their machine).

The long-term vision includes embedding a VS Code-like editor, supporting multiple AI providers, and providing rich code context. This MVP focuses on the core chat experience with workspace organization.

## Technology Stack

- **Electron** (desktop shell, chosen for future VS Code/Monaco embedding)
- **React 19 + TypeScript** (renderer UI)
- **Vite via electron-vite** (build tooling)
- **better-sqlite3** (local conversation storage)
- **@anthropic-ai/sdk** (Anthropic API with streaming)
- **react-markdown + remark-gfm + react-syntax-highlighter** (message rendering)
- **Plain CSS** with dark theme (upgradeable to Tailwind later)

## Architecture

```
Main Process (Node.js)
  - SQLite database (better-sqlite3)
  - Anthropic SDK (streaming API calls)
  - IPC handlers for CRUD + chat operations
  - API key stays in main process only

Renderer Process (Chromium)
  - React app (Vite)
  - Sidebar: workspace tree with nested conversations
  - Content area: conversation view with messages + input
  - Communicates with main process via IPC (contextBridge)
```

## Data Model

```sql
workspaces
  id          INTEGER PRIMARY KEY
  name        TEXT NOT NULL
  path        TEXT NOT NULL UNIQUE
  created_at  TEXT NOT NULL  -- ISO 8601

conversations
  id            INTEGER PRIMARY KEY
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id)
  title         TEXT NOT NULL
  model         TEXT NOT NULL  -- e.g. "claude-opus-4-6"
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL

messages
  id              INTEGER PRIMARY KEY
  conversation_id INTEGER NOT NULL REFERENCES conversations(id)
  role            TEXT NOT NULL  -- "user" or "assistant"
  content         TEXT NOT NULL
  created_at      TEXT NOT NULL
```

## Startup Flow

1. App launches, main process checks `process.env.ANTHROPIC_API_KEY`
2. If missing: show centered window explaining how to set the key, then restart
3. If present: show main application window

## UI Layout

### Sidebar (left, ~250px)
- "WORKSPACES" header with "+ Add" button
- Each workspace is collapsible (triangle toggle)
- [+] button next to each workspace name to create new conversation
- Conversations listed nested under their workspace
- Active conversation highlighted

### Content Area (right)
- Empty state: welcome message prompting user to add a workspace
- Conversation view: model selector dropdown at top, scrollable message list, input bar at bottom
- New conversation: just the input bar + model selector (no messages yet)

### Messages
- User messages: right-aligned or distinct background
- Assistant messages: left-aligned, rendered as markdown with syntax-highlighted code blocks
- Streaming: tokens appear incrementally

## API Integration

- Anthropic SDK in main process with streaming (`stream: true`)
- Flow: renderer sends IPC `send-message` -> main process loads history from SQLite -> calls API with full conversation -> streams deltas back via IPC -> saves complete message to SQLite on finish
- Models available: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001
- Title generation: after first message, call Haiku to generate a 5-word-max title

## Project Structure

```
singularity/
  package.json
  tsconfig.json
  electron.vite.config.ts
  src/
    main/
      index.ts          # App entry, window creation, API key check
      ipc.ts            # IPC handlers
      database.ts       # SQLite setup + queries
      anthropic.ts      # Anthropic client + streaming
    preload/
      index.ts          # contextBridge API
    renderer/
      index.html
      main.tsx          # React entry
      App.tsx           # Main layout
      components/
        Sidebar.tsx
        ConversationView.tsx
        MessageBubble.tsx
        ModelSelector.tsx
        WelcomeView.tsx
        ApiKeyMissing.tsx
      styles/
        global.css
  resources/            # App icon
  electron-builder.yml  # Build config
```

## Error Handling

- API errors (rate limits, auth failures): inline error message in chat
- Network errors: inline with retry option
- Missing API key: dedicated screen with setup instructions
