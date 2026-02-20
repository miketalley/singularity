# Testing Infrastructure Design

## Summary

Add full-stack testing to Singularity using **Vitest** for unit tests and **Playwright Electron** for end-to-end tests. Claude AI responses are mocked using captured real JSONL fixtures for deterministic, realistic test data.

## Approach

**Vitest + Playwright Electron** was chosen over alternatives (Playwright Component Testing, Vitest-only) because it provides real full-stack coverage with both tools the team wants, and Vitest is native to the existing Vite/electron-vite build stack.

## Dependencies

### Dev dependencies to add

| Package | Purpose |
|---------|---------|
| `vitest` | Unit test runner |
| `@vitest/coverage-v8` | Code coverage via V8 |
| `@playwright/test` | E2E test runner (includes Electron support) |
| `@testing-library/react` | React component test utilities |
| `@testing-library/jest-dom` | DOM assertion matchers |
| `jsdom` | DOM environment for Vitest renderer tests |
| `electron-playwright-helpers` | Electron-specific Playwright utilities |

## Directory Structure

```
tests/
├── unit/                        # Vitest unit tests
│   ├── main/                    # Main process tests
│   │   ├── database.test.ts
│   │   ├── brain.test.ts
│   │   ├── claude-cli.test.ts
│   │   ├── anthropic.test.ts
│   │   ├── whisper.test.ts
│   │   └── logger.test.ts
│   └── renderer/                # React component tests
│       ├── MessageBubble.test.tsx
│       ├── ConversationView.test.tsx
│       ├── Sidebar.test.tsx
│       ├── BrainPanel.test.tsx
│       └── App.test.tsx
├── e2e/                         # Playwright e2e tests
│   ├── app-launch.spec.ts
│   ├── workspace-flow.spec.ts
│   ├── conversation-flow.spec.ts
│   ├── brain-panel.spec.ts
│   └── settings.spec.ts
├── fixtures/                    # Captured real Claude responses
│   ├── claude-stream-simple.jsonl
│   ├── claude-stream-with-tools.jsonl
│   ├── claude-stream-with-questions.jsonl
│   └── README.md
└── helpers/
    ├── mock-claude-cli.ts       # Fake claude binary for e2e
    └── test-db.ts               # In-memory SQLite factory
```

## npm Scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:unit": "vitest run tests/unit",
"test:e2e": "npx playwright test",
"test:coverage": "vitest run --coverage",
"test:capture-fixtures": "node tests/helpers/capture-fixtures.ts"
```

## Unit Test Strategy (Vitest)

### Config

`vitest.config.ts` at project root. Uses workspace feature to split main process (Node env) and renderer (jsdom env) tests.

### Main Process Tests (Node environment)

| Module | Mock Strategy | Key Test Cases |
|--------|--------------|----------------|
| `database.ts` | In-memory SQLite (`:memory:`) | Schema creation, CRUD for all 4 tables, migrations, soft deletes, computed columns (message count, awaiting_response) |
| `brain.ts` | Mock `fs` for file I/O, real parsing logic | `parseBrainMd()` / `serializeBrainMd()` round-trips, `scanWorkspace()` with fixture package.json, category extraction |
| `claude-cli.ts` | Mock `child_process.spawn`, replay fixture JSONL | Stream event parsing, text delta accumulation, tool activity formatting, cancellation, partial response handling |
| `anthropic.ts` | Mock `@anthropic-ai/sdk` | `generateTitle()` prompt + response parsing, `extractMemories()` JSON extraction, error fallbacks |
| `whisper.ts` | Mock native module + fs | Status checking, download progress, transcription call shape |
| `logger.ts` | Mock `fs.appendFileSync` | Timestamp formatting, JSON serialization |

### Renderer Tests (jsdom environment)

| Component | Mock Strategy | Key Test Cases |
|-----------|--------------|----------------|
| `MessageBubble` | Mock `window.electronAPI` | Markdown rendering, code blocks, question block parsing, numbered options, Learn/Avoid buttons |
| `ConversationView` | Mock IPC | Message sending, streaming state display, model selector, draft saving |
| `Sidebar` | Mock workspace/conversation data | Workspace switching, conversation list, search, delete/restore |
| `BrainPanel` | Mock brain API calls | Entry display, add/edit/delete, category filtering |
| `App` | Integration-style with mocked IPC | State flow between components, sidebar resize |

## E2E Test Strategy (Playwright Electron)

### Config

`playwright.config.ts` at project root. Uses `_electron.launch()` to start the built app.

### Pre-requisite

`electron-vite build` before running e2e tests, handled by a `globalSetup` script.

### Mock Claude CLI

A Node.js script (`tests/helpers/mock-claude-cli.ts`) acts as a fake `claude` binary:
1. Reads prompt from stdin/args
2. Matches against fixture patterns
3. Streams back corresponding captured JSONL with realistic timing

Injected via `PATH` override in the Playwright Electron launch config so the app calls our mock instead of the real CLI.

### Test Suites

| Suite | Coverage |
|-------|----------|
| `app-launch.spec.ts` | App starts, window appears, welcome screen renders, sidebar visible |
| `workspace-flow.spec.ts` | Create workspace, rename, switch between workspaces, delete workspace |
| `conversation-flow.spec.ts` | Start new conversation, send message (mocked stream), message bubbles render, conversation in sidebar, title auto-generates |
| `brain-panel.spec.ts` | Open brain panel, add entry, edit entry, delete entry, category filtering |
| `settings.spec.ts` | Open settings, change model, verify persistence across restart |

### Fixture Capture Workflow

1. Run `npm run test:capture-fixtures`
2. Script sends predefined prompts to real Claude CLI
3. Raw JSONL stream output saved to `tests/fixtures/`
4. Fixtures committed to repo (deterministic, reviewable)

## Playwright Config Details

- `testDir: './tests/e2e'`
- `timeout: 30000` (Electron apps are slower to boot)
- `use: { trace: 'on-first-retry' }` for debugging failures
- Global setup builds the app
- Global teardown cleans up temp data

## References

- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [electron-playwright-helpers](https://www.npmjs.com/package/electron-playwright-helpers)
- [Electron Automated Testing Docs](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
