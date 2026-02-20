# Execution Mode Detection & Auto-Response

## Problem

Claude frequently presents execution mode choices in this format:

```
Two execution options:

**Subagent-Driven (this session)** — I dispatch fresh subagents per task, review between tasks, fast iteration
**Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints
```

None of the three existing parsers detect this pattern:
- `parseQuestionOptions` — requires `[QUESTION_BLOCK]` tags (from AskUserQuestion tool only)
- `parseApproachBlocks` — requires `Approach A:` / `Option 1:` heading prefixes
- `parseNumberedOptions` — requires `1. Label — Description` numbered format

The bold-label-em-dash format falls through to plain markdown rendering.

## Design

### Part 1: Targeted Parser — `parseExecutionModeOptions`

A narrow parser that only fires when the specific execution mode choice is detected.

**Pattern:** `**Label** — Description` lines via regex `/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/gm`

**Activation gate:** Both conditions must be true:
1. At least 2 bold-label-em-dash items found
2. Among the matched labels, at least one contains "subagent" (case-insensitive) AND at least one contains "parallel" (case-insensitive)

If either condition fails, returns null — no rendering change.

**Output shape:** Same as `parseNumberedOptions`:
```typescript
{ preamble: string, options: Array<{ number: number; label: string; description: string }>, postamble: string }
```

Options are auto-numbered sequentially (1, 2, ...).

**Cascade order** in the render function:
1. `parseApproachBlocks(body)` (existing)
2. `parseNumberedOptions(body)` (existing)
3. `parseExecutionModeOptions(body)` (new — last resort, very targeted)

**Rendering:** Reuses existing `optionCard` UI + "Other..." custom input.

### Part 2: Global Setting — `execution_mode_preference`

**Storage:** Existing `settings` table, key `execution_mode_preference`.

**Values:**
- `"ask"` (default) — show options, let user choose each time
- `"subagent"` — auto-select the subagent-flavored option
- `"parallel"` — auto-select the parallel-session-flavored option

**UI:** New dropdown in the Settings panel (Sidebar.tsx), below "Default model":

```
Execution mode       [Ask each time ▾]
```

Dropdown options:
- Ask each time
- Always Subagent-Driven
- Always Parallel Session

Uses same `settingsRow` / `settingsLabel` styling as the model selector.

### Part 3: Auto-Response Logic

**Location:** `ConversationView.tsx`, in the stream-complete / message-finalization flow.

**Flow:**
1. New assistant message finalized.
2. Read `execution_mode_preference` setting.
3. If `"ask"` — do nothing, render options as normal.
4. If `"subagent"` or `"parallel"` — run option detection on message content.
5. If execution mode options are found, match the preference against option labels:
   - `"subagent"` → find label containing "subagent" (case-insensitive)
   - `"parallel"` → find label containing "parallel" (case-insensitive)
6. If match found, auto-send the formatted option as a user message.
7. Show toast: **"Auto-selected: {label} (from Settings)"** for ~3 seconds.

**Toast:** Simple absolute-positioned div at bottom of conversation view. Fade in/out animation. No external library.

### Part 4: Testing

- `parseBoldLabelOptions` unit tests:
  - Detects the subagent/parallel pattern correctly
  - Returns null for unrelated bold-em-dash text (e.g., definitions, glossaries)
  - Returns null when only one of the two keywords is present
  - Extracts preamble and postamble correctly
- Auto-response matching:
  - Given options + preference `"subagent"`, returns correct option
  - Given options + preference `"ask"`, returns null
  - Given non-execution-mode options + preference `"subagent"`, returns null

## Files Modified

- `src/renderer/src/components/MessageBubble.tsx` — new parser + render cascade
- `src/renderer/src/components/Sidebar.tsx` — settings dropdown
- `src/renderer/src/components/ConversationView.tsx` — auto-response logic + toast
- `tests/unit/renderer/MessageBubble.test.tsx` — parser tests
