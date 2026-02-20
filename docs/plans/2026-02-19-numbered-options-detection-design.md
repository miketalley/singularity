# Numbered Options Detection Design

## Problem

AI responses often contain numbered lists with em-dashes that represent choices (e.g. `1. Subagent-Driven (this session) — I dispatch a fresh subagent per task...`). These should be clickable like the existing QUESTION_BLOCK options, but currently render as plain text.

## Approach

Add a new `parseNumberedOptions` function in `MessageBubble.tsx` that detects numbered em-dash lists when surrounding text contains contextual keywords.

## Detection Rules

1. **Keyword gating:** Text must contain at least one of: `approach`, `option`, `choose`, `prefer`, `select`, `which`, `strategy`, `method` (case-insensitive, word-boundary matched)
2. **Item pattern:** `N. Label — Description` where the separator is em-dash (—), en-dash (–), or hyphen (-) with surrounding spaces
3. **Minimum items:** 2+ matched numbered items required to trigger
4. **Priority:** Only checked when `parseApproachBlocks` returns null (existing parsers take precedence)

## New Function

```typescript
function parseNumberedOptions(text: string): {
  preamble: string
  options: Array<{ number: number; label: string; description: string }>
  postamble: string
} | null
```

## Rendering

- Reuses existing `optionCard`, `optionNumber`, `optionLabel`, `optionDescription` styles
- On click, calls `onQuestionOptionClick` with the full line text (e.g. `"1. Subagent-Driven (this session) — I dispatch a fresh subagent per task..."`)
- Includes the "Other..." custom response input below the options

## Files Changed

- `src/renderer/src/components/MessageBubble.tsx` — add parser function and rendering branch

## What It Won't Match

- Regular numbered lists without em-dashes
- Numbered em-dash lists in text without contextual keywords
- Content inside `[QUESTION_BLOCK]` tags (handled by existing parser first)
