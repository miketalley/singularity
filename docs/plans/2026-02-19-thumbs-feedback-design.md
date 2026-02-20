# Thumbs Up / Thumbs Down Feedback Icons

## Summary

Replace the single book icon under chat bubbles with thumbs up and thumbs down icons. Thumbs up extracts positive patterns to remember; thumbs down extracts anti-patterns to avoid. Both use the same BrainPanel review/approve flow.

## UI Changes

- Remove the single book icon (📖) from `BrainActionBar`
- Add two icons: thumbs up (👍) and thumbs down (👎)
- Custom tooltips: "Learn from this" on thumbs up, "Learn what to avoid" on thumbs down
- Same hover visibility behavior as current book icon

## Extraction Prompts

**Thumbs up** (existing prompt, minor refinement):
> Extract concise, actionable memory entries from the following message. Each entry should be a single fact, decision, convention, or pattern worth repeating...

**Thumbs down** (new prompt):
> Find concepts from this text that a user may want to prevent repeating in the future. Each entry should describe a specific anti-pattern, mistake, or approach to avoid. Phrase entries as warnings (e.g., "AVOID: ...").

Both return `Array<{ text: string; category: string }>`. No schema changes.

## Storage

No changes to `BrainEntry` type or BRAIN.md format. Thumbs-down entries are self-describing via their phrasing (e.g., "AVOID: using inline styles for layout") and live in the same categories alongside thumbs-up entries.

## Flow

1. User hovers over message bubble -> thumbs up and thumbs down icons appear
2. User clicks either icon
3. `handleLearnFromThis(content, sentiment)` called with `'positive'` or `'negative'`
4. IPC call to `extractMemories(content, sentiment)` which selects the appropriate prompt
5. BrainPanel opens with "Analyzing message..."
6. Proposed entries appear for review/edit/approve (identical flow for both)

## Files Touched

| File | Change |
|------|--------|
| `src/renderer/src/components/MessageBubble.tsx` | Replace book with two thumb icons in `BrainActionBar` |
| `src/main/anthropic.ts` | Add `sentiment` param to `extractMemories` to switch prompts |
| `src/renderer/src/App.tsx` | Update `handleLearnFromThis` to accept and pass sentiment |
| `src/main/ipc.ts` | Pass sentiment through `brain-extract-memories` handler |
| `src/preload/index.ts` | Update `brainExtractMemories` signature |
| `src/preload/index.d.ts` | Update type declaration |
| `src/renderer/src/components/ConversationView.tsx` | Update `onLearnFromThis` prop type |
