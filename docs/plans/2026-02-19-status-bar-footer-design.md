# Status Bar Footer Design

## Overview

Add a thin, full-width status bar footer to the bottom of the app window (VS Code style). Displays four items: workspace path, git branch, current model, and Claude API usage percentage. Usage data is fetched via a lightweight API call every 5 minutes from the main process.

## Architecture

### Approach: Dedicated IPC Polling

A new main-process module makes a lightweight Anthropic API call every 5 minutes, reads rate-limit response headers, caches the result, and exposes it via IPC. Git branch info is fetched by running `git rev-parse` in the workspace directory. The renderer polls via IPC on mount and on a 5-minute interval.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Title Bar (38px)                                             │
├────────┬─────────────────────────────────────┬───────────────┤
│        │                                     │               │
│Sidebar │        Content Area                 │  Brain Panel  │
│        │                                     │  (optional)   │
│        │                                     │               │
├────────┴─────────────────────────────────────┴───────────────┤
│ ~/Projects/myapp   main        sonnet-4           Usage: 35% │
└──────────────────────────────────────────────────────────────┘
```

- **Height:** ~24px (padding: 4px 12px, font-size: 11px)
- **Background:** `var(--bg-secondary)` with `border-top: 1px solid var(--border-color)`
- **Left side:** Workspace path (shortened) + git branch
- **Right side:** Model name + usage percentage

## Data Items

| Item | Source | Update Trigger |
|------|--------|---------------|
| Workspace path | Current workspace selection | Workspace change |
| Git branch | `git rev-parse --abbrev-ref HEAD` in workspace dir | Workspace change, 5-min poll |
| Model name | Current conversation's model | Conversation change |
| Usage % | Anthropic API rate-limit headers | 5-minute interval |

## Usage % Fetch Strategy

### Main Process (`src/main/usage.ts`)

1. On app start and every 5 minutes, call `anthropic.messages.countTokens()` with a minimal payload
2. Read response headers: `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`
3. Calculate: `usedPercent = ((limit - remaining) / limit) * 100`
4. Cache the result: `{ usedPercent, resetAt, lastChecked }`
5. Expose via IPC handler: `get-usage-data`

### Color Coding

- **0-60%:** Green (`#4ec9b0`)
- **61-85%:** Yellow (`#dcdcaa`)
- **86-100%:** Red (`var(--error-color)`)

## New Files

- `src/main/usage.ts` — Usage data fetching and caching
- `src/renderer/src/components/StatusBar.tsx` — Footer component

## Modified Files

- `src/main/ipc.ts` — Add `get-usage-data` and `get-git-branch` handlers
- `src/preload/index.ts` — Expose `getUsageData()` and `getGitBranch()` to renderer
- `src/renderer/src/App.tsx` — Add `<StatusBar />` after the main layout div

## IPC Channels

### `get-usage-data`
- **Direction:** Renderer → Main
- **Params:** None
- **Returns:** `{ usedPercent: number | null, resetAt: string | null, lastChecked: string | null }`

### `get-git-branch`
- **Direction:** Renderer → Main
- **Params:** `workspacePath: string`
- **Returns:** `string | null` (branch name or null if not a git repo)

## Error Handling

- API key missing or call fails: display `Usage: --`
- Workspace has no git repo: hide branch segment
- No workspace selected: hide workspace path and branch
- Network errors on usage fetch: keep showing last known value, retry on next interval

## Component Props

```typescript
interface StatusBarProps {
  workspacePath: string | null
  currentModel: string | null
}
```

The component manages its own state for `usageData` and `gitBranch` via `useEffect` hooks and IPC calls.
