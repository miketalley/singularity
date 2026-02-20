# Persistent Project Memory ("Brain") - Design Spec

## Summary

A per-workspace knowledge store that accumulates project context across conversations.
Memories live as `.singularity/brain/BRAIN.md` files on disk -- one per workspace -- and
are injected into conversation context so Claude gives better answers from the first message.

---

## Core Concepts

### Storage

- Each workspace gets its own `BRAIN.md` at `<workspace-path>/.singularity/brain/BRAIN.md`
- Plain markdown file, git-trackable, readable by other AI tools
- Organized into categorized sections (headings)

### File Format

```markdown
# Singularity Brain

## Tech Stack
- TypeScript with strict mode enabled
- React 19 with functional components only
- Prisma ORM with PostgreSQL
- Vite for bundling

## Architecture
- API routes follow REST conventions at /api/v1
- Auth uses JWT with refresh tokens in httpOnly cookies
- State management via React Context, no Redux

## Conventions
- Use named exports, no default exports
- Error responses follow { error: string, code: number } shape
- Tests colocated with source files as *.test.ts

## Gotchas
- The legacy /auth endpoint still expects session cookies -- do not migrate yet
- PostgreSQL JSONB columns require explicit casting for array queries
```

Categories are user-defined. The AI suggests a category during extraction, but the
user can pick from existing categories or type a new one.

---

## Interaction Model

### 1. Auto-Detection on First Message (Per-Workspace)

**Trigger:** User sends the first message in a workspace that has no BRAIN.md.

**Flow:**
1. User types message, hits Send
2. System checks: does `<workspace>/.singularity/brain/BRAIN.md` exist?
3. If no: scan the workspace for config files:
   - `package.json` (dependencies, scripts, type)
   - `tsconfig.json` (strict mode, target, paths)
   - `Cargo.toml`, `pyproject.toml`, `go.mod`, `Gemfile`, etc.
   - `.nvmrc`, `.node-version`, `.python-version`
   - `docker-compose.yml`, `Dockerfile`
   - Directory structure (src/, tests/, etc.)
4. Generate initial BRAIN.md with a `## Tech Stack` section from detected config
5. Write the file to disk
6. Inject brain contents into the system prompt
7. Send the message to Claude with enriched context
8. Show a subtle indicator: "Project scanned -- Brain initialized"

**Performance:** Scanning reads a handful of small config files. Should complete in <200ms.
No deep directory traversal -- just known config file paths in the workspace root.

### 2. Per-Bubble "Learn from This"

**Trigger:** User clicks the Brain icon below a chat bubble.

**UI -- Hover Action Bar:**
- On hover over any message bubble (user or assistant), a small icon bar fades in
  below-right of the bubble
- Contains a Brain icon (e.g., a simple brain/lightbulb SVG)
- Tooltip on hover: "Learn from this"
- Clicking opens the Brain side panel in "learning mode"

**Flow:**
1. User clicks Brain icon on a specific message bubble
2. Brain side panel slides open from the right
3. The message content is sent to Claude with a system prompt asking it to extract
   concise, actionable memory entries (tech decisions, patterns, conventions, gotchas)
4. Panel shows **proposed entries** at the top:
   - Each entry is an editable text field
   - Each entry has a category dropdown:
     - Populated with existing categories from the workspace's BRAIN.md
     - Option to type a new category name
   - Each entry has Approve and Delete buttons
5. Below the proposed entries: the **existing brain contents** for reference
6. User reviews, edits categories/text, approves or deletes each entry
7. Approved entries are appended to the appropriate section in BRAIN.md
8. If a new category was created, a new `## Section` heading is added to the file

### 3. Brain Panel (Browse Mode)

**Trigger:** Brain icon in the sidebar or conversation header.

**Opens the same side panel but without proposed entries:**
- Shows all existing memories grouped by category section
- Each entry is editable inline (click to edit text)
- Category can be changed via the same dropdown
- Delete button per entry
- "Add Entry" button to manually create a new memory
- All edits write directly to BRAIN.md on save

---

## Brain Panel UI

```
+------------------------------------------+
|  Brain: <workspace-name>           [X]   |
+------------------------------------------+
|                                          |
|  -- LEARNING MODE ONLY --               |
|  Proposed from message:                  |
|  +------------------------------------+  |
|  | "Uses JWT with httpOnly cookies"   |  |
|  | Category: [Architecture  v]        |  |
|  | [Approve]  [Delete]               |  |
|  +------------------------------------+  |
|  +------------------------------------+  |
|  | "Prisma ORM with PostgreSQL"       |  |
|  | Category: [Tech Stack  v]          |  |
|  | [Approve]  [Delete]               |  |
|  +------------------------------------+  |
|                                          |
|  ----------------------------------------|
|                                          |
|  Existing Memories:                      |
|                                          |
|  ## Tech Stack                           |
|  - TypeScript strict mode          [x]   |
|  - React 19, functional only       [x]   |
|  - Vite bundler                    [x]   |
|                                          |
|  ## Architecture                         |
|  - REST API at /api/v1             [x]   |
|  - Context for state mgmt         [x]   |
|                                          |
|  ## Conventions                          |
|  - Named exports only             [x]   |
|                                          |
+------------------------------------------+
```

---

## Context Injection

**On every message send:**
1. Read `<workspace>/.singularity/brain/BRAIN.md`
2. If it exists and is non-empty, prepend its contents to the system prompt:
   ```
   The following is known context about this project:

   <contents of BRAIN.md>

   Use this context to inform your responses.
   ```
3. Send the message with enriched context

**Token budget awareness:**
- Track the approximate token count of BRAIN.md
- Show a soft warning in the Brain panel when it exceeds a threshold
  (e.g., "Brain is getting large (~2000 tokens) -- consider pruning older entries")
- Never auto-delete or truncate -- the user decides what to keep

---

## Extraction Prompt

When "Learn from this" is clicked, the message content is sent to Claude with:

```
Extract concise, actionable memory entries from the following message.
Each entry should be a single fact, decision, convention, or gotcha about
the project. Return as JSON:

[
  { "text": "...", "category": "Tech Stack | Architecture | Conventions | Gotchas | ..." }
]

Only extract information that would be useful to remember across future
conversations about this project. Skip generic knowledge that any developer
would know. Be specific to THIS project.

Message:
<message content>
```

The extraction uses a fast model (Haiku or Flash) to keep latency low and costs minimal.

---

## File System Structure

```
my-project/
  .singularity/
    brain/
      BRAIN.md          # The brain file
  src/
  package.json
  ...
```

The `.singularity/` directory should be added to the workspace's `.gitignore` by default
(with a prompt asking the user on first creation), OR the user can choose to commit it
for team-shared knowledge.

---

## Size Management

- Display approximate token count in the Brain panel header
- Soft warning at a configurable threshold (default: ~2000 tokens)
- Warning text: "Brain is getting large -- consider pruning older entries for faster responses"
- No automatic deletion or summarization
- User manages size via the Brain panel's edit/delete controls
