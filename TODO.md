# Singularity - Top 10 Features Roadmap

> Inspired by Google Antigravity's agent-first paradigm, but designed around Singularity's
> unique strength: being a **mission control center** for developers orchestrating multiple
> AI coding sessions across repositories simultaneously.

---

## 1. Mission Control Dashboard

**Priority:** Critical | **Complexity:** High

The defining feature. A real-time dashboard that monitors and manages multiple active
Claude sessions across different repositories simultaneously. This is the feature that
turns Singularity from "a chat app" into "a developer's command center."

**What it does:**
- Grid/kanban view showing all active sessions with live status (idle, streaming, waiting for input, error)
- Progress indicators showing what each agent is working on (e.g., "Implementing auth middleware - 3/7 tasks complete")
- Quick-switch between sessions without losing context
- Notification system when a session needs attention (agent hit a blocker, task completed, error occurred)
- Session health metrics: token usage, elapsed time, messages sent
- Ability to spawn new sessions from the dashboard with one click
- Drag-and-drop reordering and grouping of sessions by project, priority, or status

**Why it matters:**
The user already works this way -- opening multiple Claude Code terminals across repos. Singularity
should formalize and supercharge this workflow rather than forcing serial conversation.

**Antigravity parallel:** Multi-Agent Orchestration / Agent Manager dashboard.
**Our twist:** We're not running agents inside our IDE -- we're orchestrating sessions that may include
Claude Code CLI, API calls, or hybrid approaches. Think "air traffic control" not "puppet master."

---

## 2. Workspace File Explorer with Context Injection

**Priority:** Critical | **Complexity:** Medium

Bridge the gap between "this conversation is about /my/project" and actually using the project's files.

**What it does:**
- Collapsible file tree panel showing the workspace directory structure
- Click-to-preview files with syntax highlighting (read-only Monaco editor)
- Drag files (or select via checkbox) into the chat input to attach them as context
- Smart context suggestions: "This conversation mentions `auth.ts` -- attach it?"
- `.gitignore`-aware filtering (don't show `node_modules/`, `dist/`, etc.)
- File change watcher: detect when files are modified externally and offer to re-inject updated context
- Support for partial file injection (select specific functions/classes to include, not the whole file)

**Why it matters:**
Currently the app knows the workspace *path* but can't *see* its files. Developers constantly
copy-paste code into Claude -- this eliminates that friction entirely.

**Antigravity parallel:** Editor Surface with direct file access.
**Our twist:** Non-destructive by default. We show and inject context but don't write to the
filesystem without explicit action (see Feature #4).

---

## 3. Visual Diff & One-Click Code Apply

**Priority:** Critical | **Complexity:** Medium-High

When Claude suggests code changes, render them as reviewable diffs with the ability to apply
them directly to workspace files.

**What it does:**
- Detect code blocks in Claude's responses and parse them as potential file changes
- Render side-by-side or unified diffs (like GitHub PR review) instead of raw code blocks
- "Apply" button that writes the change to the actual file in the workspace
- "Apply All" for multi-file suggestions
- Undo stack: every applied change can be reverted with one click
- Git-aware: show a warning if applying changes to a dirty working tree
- Conflict detection: if the file has changed since the suggestion was made, show a merge view

**Why it matters:**
The #1 friction point with AI coding assistants is the copy-paste-edit loop. Singularity should
make "Claude suggested it, I reviewed it, it's in my code" a three-second workflow.

**Antigravity parallel:** Artifacts system with tangible deliverables.
**Our twist:** Git-aware safety net. Every apply is tracked and reversible. We don't auto-apply
anything -- the developer is always the gatekeeper.

---

## 4. Integrated Terminal Surface

**Priority:** High | **Complexity:** High

Embed a terminal in the app so conversations can reference command output, and (optionally)
Claude can execute commands with user approval.

**What it does:**
- Split-pane terminal (xterm.js) anchored to the active workspace's directory
- "Run this" buttons on code blocks that contain shell commands
- Terminal output can be injected back into conversation context ("Share output with Claude")
- Permission-gated agent execution: Claude can *propose* commands, user clicks to approve/run
- Command history tied to conversation (see what was run during this chat)
- Multiple terminal tabs per workspace

**Why it matters:**
Developers constantly context-switch between their AI chat and terminal. Build errors, test output,
and `git status` are the most common things pasted into AI conversations. Eliminate the switch.

**Antigravity parallel:** Terminal Surface with direct shell access.
**Our twist:** Always permission-gated. We never auto-execute. The terminal is a collaboration
surface, not an autonomous agent tool. The developer stays in control.

---

## 5. Persistent Project Memory ("Brain")

**Priority:** High | **Complexity:** Medium

A per-workspace knowledge store that accumulates architectural decisions, preferences, and patterns
across conversations. New conversations start *smarter* because they inherit project context.

**What it does:**
- `.singularity/` directory in each workspace root (gitignore-able)
- Auto-extracts key decisions from conversations: "User decided to use Prisma over Drizzle"
- Stores: tech stack, coding conventions, architectural decisions, common gotchas
- System prompt augmentation: new conversations auto-include relevant brain entries
- User can pin/unpin brain entries, edit them, or manually add notes
- Brain viewer panel in the sidebar showing what the AI "knows" about this project
- Cross-conversation deduplication (don't store the same decision 5 times)

**Why it matters:**
Every new conversation starts from zero. Developers repeat the same context ("we use TypeScript,
we use Prisma, the API is in /src/api...") in every chat. The brain eliminates this repetition.

**Antigravity parallel:** `.gemini/antigravity/brain/` persistent context system.
**Our twist:** Transparent and editable. The developer can see exactly what the AI "remembers"
and correct it. No black-box memory -- full developer control over accumulated context.

---

## 6. Plan Mode with Artifact Review

**Priority:** High | **Complexity:** Medium

A structured planning workflow where Claude generates an implementation plan before writing code,
and the developer can review, comment, and approve before execution begins.

**What it does:**
- Toggle between "Plan Mode" and "Direct Mode" per conversation
- In Plan Mode, Claude responds with structured artifacts: task breakdowns, file change lists,
  dependency graphs, risk assessments
- Artifacts render as interactive cards (not just markdown) with approve/reject/comment actions
- Approved plans generate a checklist that tracks implementation progress
- Plan history: see how the plan evolved through review iterations
- Plan templates for common workflows (new feature, bug fix, refactor, migration)

**Why it matters:**
For complex tasks, "just start coding" leads to rework. A plan-review-execute cycle catches
architectural mistakes early and gives the developer confidence in the AI's approach. This is
especially valuable when managing multiple sessions -- you can review plans from several
agents before any of them start executing.

**Antigravity parallel:** Plan Mode with reviewable artifacts.
**Our twist:** Plans are first-class objects, not just chat messages. They can be saved, shared,
exported, and reused. A plan from one project can seed a plan in another.

---

## 7. Cross-Session Knowledge Search

**Priority:** Medium-High | **Complexity:** Medium

Full-text search across all conversations in all workspaces, with semantic understanding.

**What it does:**
- Global search bar (Cmd+K) that searches across all conversation history
- Filter by workspace, date range, model used, or conversation status
- Semantic search: "How did I handle authentication?" finds relevant discussions even if the
  exact word "authentication" wasn't used (via local embeddings)
- Search results show conversation snippets with jump-to-message links
- Tag system: manually tag conversations (#bug, #feature, #architecture, #deployment)
- "Related conversations" suggestions when starting a new chat
- Export search results as a knowledge document

**Why it matters:**
After weeks of using Singularity across many projects, you'll have hundreds of conversations
containing solutions, decisions, and debugging breakthroughs. Without search, that knowledge
is effectively lost. This turns conversation history into a searchable knowledge base.

**Antigravity parallel:** No direct equivalent -- this goes beyond what Antigravity offers.
**Our twist:** This is a Singularity original. Because we're a centralized hub for ALL your
AI conversations across ALL projects, we're uniquely positioned to be a developer knowledge base.

---

## 8. Conversation Templates & Custom System Prompts

**Priority:** Medium | **Complexity:** Low-Medium

Pre-configured conversation types with tailored system prompts, context injection, and
interaction patterns for common developer workflows.

**What it does:**
- Built-in templates: Code Review, Bug Investigation, Feature Implementation, Architecture
  Discussion, Documentation Writer, Test Generator, Migration Planner
- Each template includes: a system prompt, suggested model, default context files to attach,
  and a starter message template
- Custom template creation: save any conversation setup as a reusable template
- Per-workspace template overrides (your React projects might need different templates than
  your Python projects)
- Template marketplace: share and discover community templates (future)
- Quick-launch: right-click a workspace → "New Code Review" starts a pre-configured session

**Why it matters:**
Different tasks need different AI personalities. A code review needs a critical, thorough Claude.
A brainstorm needs a creative, expansive Claude. System prompts are the lever, but most developers
don't bother writing them. Templates make expert-level prompting accessible.

**Antigravity parallel:** Skills system (specialized knowledge packages loaded on demand).
**Our twist:** User-visible and user-editable. No magic -- developers see exactly what system
prompt is being used and can tweak it. Templates are the skill system for non-agent workflows.

---

## 9. Session Handoff & Context Bridging

**Priority:** Medium | **Complexity:** Medium-High

Transfer context, decisions, and conversation summaries between sessions -- across conversations
within a workspace or even across different workspaces.

**What it does:**
- "Summarize & Handoff" button: generates a structured summary of the current conversation's
  decisions, code changes, and open questions, then injects it into a new conversation
- Cross-workspace bridging: "I solved this auth problem in Project A, apply the same approach
  to Project B" -- pulls relevant context from one workspace into another
- Conversation forking: branch a conversation at any point to explore alternative approaches
  without losing the original thread
- Session resume: if a conversation times out or errors, seamlessly resume with full context
- Merge conversations: combine insights from two separate conversations into one summary

**Why it matters:**
When managing multiple sessions, insights from one session frequently need to inform another.
Currently, developers manually copy-paste between conversations. This automates the
cross-pollination of knowledge across your entire development workflow.

**Antigravity parallel:** No direct equivalent -- Antigravity's agents work in isolation.
**Our twist:** Another Singularity original. As a multi-session hub, we can do something no
single-IDE tool can: connect the dots between separate AI conversations.

---

## 10. Multi-Provider Model Support with Side-by-Side Comparison

**Priority:** Medium | **Complexity:** Medium

Support multiple AI providers and enable comparing responses from different models on the
same prompt.

**What it does:**
- Provider integrations: Anthropic (Claude), OpenAI (GPT), Google (Gemini), local models
  (Ollama, LM Studio, llama.cpp)
- Per-conversation or per-message model selection across providers
- "Compare Mode": send the same message to 2-3 models simultaneously and see responses
  side-by-side
- Model performance tracking: response time, token usage, and (subjective) quality ratings
  per model per task type
- Cost estimation: show estimated cost per message/conversation based on token counts
- Fallback chains: if primary model is down/rate-limited, auto-fallback to secondary
- Model recommendations: "For code review tasks, Claude Opus has been your most-used model
  with highest ratings"

**Why it matters:**
No single model is best at everything. GPT might be better for certain languages, Claude for
architecture discussions, Gemini for multimodal tasks, and local models for quick/private queries.
Developers shouldn't be locked into one provider -- and they should be able to discover which
model works best for which task through actual usage data.

**Antigravity parallel:** Multi-model support (Gemini, Claude, GPT-OSS).
**Our twist:** Provider-agnostic from the ground up with comparison tooling. Antigravity is
Gemini-first with others bolted on. We treat all models as first-class citizens and help
developers make data-driven model choices.

---

## Implementation Priority Matrix

| # | Feature | Impact | Effort | Priority |
|---|---------|--------|--------|----------|
| 1 | Mission Control Dashboard | Very High | High | P0 |
| 2 | Workspace File Explorer | Very High | Medium | P0 |
| 3 | Visual Diff & Code Apply | Very High | Medium-High | P0 |
| 4 | Integrated Terminal | High | High | P1 |
| 5 | Persistent Project Memory | High | Medium | P1 |
| 6 | Plan Mode & Artifacts | High | Medium | P1 |
| 7 | Cross-Session Search | Medium-High | Medium | P2 |
| 8 | Templates & System Prompts | Medium | Low-Medium | P2 |
| 9 | Session Handoff & Bridging | Medium | Medium-High | P2 |
| 10 | Multi-Provider Models | Medium | Medium | P2 |

**Suggested implementation order:** 2 → 3 → 8 → 5 → 1 → 4 → 6 → 7 → 9 → 10

> Start with File Explorer (#2) and Diff/Apply (#3) because they deliver the most immediate
> developer value with moderate effort. Templates (#8) and Memory (#5) are low-hanging fruit
> that dramatically improve conversation quality. Mission Control (#1) and Terminal (#4) are
> the "wow" features but require more architecture work. The P2 features build on everything
> else and complete the vision.
