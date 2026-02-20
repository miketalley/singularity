# Numbered Options Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-detect numbered em-dash lists in AI responses when contextual keywords are present, and render them as clickable option cards that auto-submit on click.

**Architecture:** Add a `parseNumberedOptions` function to `MessageBubble.tsx` that scans text segments for `N. Label — Description` patterns gated by keywords like "approach" or "option". Slot it into the existing rendering pipeline as a fallback after `parseApproachBlocks`.

**Tech Stack:** React, TypeScript (existing Electron renderer)

---

### Task 1: Add `parseNumberedOptions` parser function

**Files:**
- Modify: `src/renderer/src/components/MessageBubble.tsx:167` (after `parseApproachBlocks` function)

**Step 1: Add the parser function after `parseApproachBlocks` (line 167)**

Insert this function between `parseApproachBlocks` and `normalizeMarkdown`:

```typescript
function parseNumberedOptions(text: string): {
  preamble: string
  options: Array<{ number: number; label: string; description: string }>
  postamble: string
} | null {
  // Only trigger when surrounding text suggests a choice
  const keywordPattern = /\b(approach|option|choose|prefer|select|which|strategy|method)\b/i
  if (!keywordPattern.test(text)) return null

  const itemRegex = /^(\d+)\.\s+(.+?)\s+[—–-]\s+(.+)$/gm
  const items: Array<{
    index: number
    endIndex: number
    number: number
    label: string
    description: string
  }> = []
  let match
  while ((match = itemRegex.exec(text)) !== null) {
    items.push({
      index: match.index,
      endIndex: match.index + match[0].length,
      number: parseInt(match[1]),
      label: match[2].trim(),
      description: match[3].trim()
    })
  }

  if (items.length < 2) return null

  const preamble = text.slice(0, items[0].index).trim()
  const postamble = text.slice(items[items.length - 1].endIndex).trim()

  return {
    preamble,
    options: items.map((item) => ({
      number: item.number,
      label: item.label,
      description: item.description
    })),
    postamble
  }
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "feat: add parseNumberedOptions parser for keyword-gated em-dash lists"
```

---

### Task 2: Wire parser into rendering pipeline

**Files:**
- Modify: `src/renderer/src/components/MessageBubble.tsx` (the text segment rendering block, around line 706-768)

**Step 1: Add the parser call and rendering branch**

In the text segment rendering (the `else` branch of `if (seg.type === 'question')`), currently the code at line 707 does:

```typescript
const approachData = parseApproachBlocks(body)
```

Change the rendering block to also try `parseNumberedOptions` when `approachData` is null. Replace the section from `const approachData = parseApproachBlocks(body)` through the closing of the ternary (up to `): null}`) with:

```typescript
const approachData = parseApproachBlocks(body)
const numberedOptions = !approachData ? parseNumberedOptions(body) : null
```

Then update the rendering conditional. The current pattern is:

```
{approachData ? ( ... ) : body ? ( <Markdown> ) : null}
```

Change it to:

```
{approachData ? ( ... ) : numberedOptions ? ( ... ) : body ? ( <Markdown> ) : null}
```

The new `numberedOptions` branch renders:

```tsx
numberedOptions ? (
  <>
    {numberedOptions.preamble && (
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {normalizeMarkdown(numberedOptions.preamble)}
      </Markdown>
    )}
    {numberedOptions.options.map((opt) => (
      <div
        key={opt.number}
        style={styles.optionCard}
        role="button"
        tabIndex={0}
        onClick={() =>
          onQuestionOptionClick?.(
            `${opt.number}. ${opt.label} — ${opt.description}`
          )
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onQuestionOptionClick?.(
              `${opt.number}. ${opt.label} — ${opt.description}`
            )
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            'rgba(0, 120, 212, 0.12)'
          e.currentTarget.style.borderColor = 'var(--accent-color)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor =
            'rgba(255, 255, 255, 0.04)'
          e.currentTarget.style.borderColor =
            'rgba(255, 255, 255, 0.08)'
        }}
      >
        <span style={styles.optionNumber}>{opt.number}</span>
        <div style={styles.optionContent}>
          <div style={styles.optionLabel}>{opt.label}</div>
          <div style={styles.optionDescription}>
            {opt.description}
          </div>
        </div>
      </div>
    ))}
    {numberedOptions.postamble && (
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {normalizeMarkdown(numberedOptions.postamble)}
      </Markdown>
    )}
  </>
)
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/MessageBubble.tsx
git commit -m "feat: render keyword-gated numbered options as clickable cards"
```

---

### Task 3: Verify in app

**Step 1: Build and run**

```bash
npm run dev
```

**Step 2: Manual test — positive case**

Send a message that causes the AI to respond with something like:

> Here are two approaches:
>
> 1. Subagent-Driven (this session) — I dispatch a fresh subagent per task
>
> 2. Parallel Session (separate) — Open a new session with executing-plans

Verify: The numbered items render as clickable option cards (same style as QUESTION_BLOCK options). Clicking one auto-submits the full text.

**Step 3: Manual test — negative case (no keywords)**

Verify that a regular numbered list like:

> Steps to follow:
>
> 1. Install dependencies — run npm install
> 2. Start the server — run npm start

Does NOT render as clickable cards (keyword "steps" is not in the keyword list).

**Step 4: Manual test — existing parsers still work**

Verify that `[QUESTION_BLOCK]` options and `Approach A:` headings still render correctly.
