# Ephemeral Narration Text Design

## Problem

When Claude writes narration text between tool calls (e.g., "Let me look at the code..."), it briefly flashes in a full MessageBubble, then gets cleared when tool activity starts — replaced by the three-dot ThinkingIndicator. This creates a jarring experience where useful context disappears.

## Desired Behavior

1. Narration text persists as **ephemeral text** (inline, italic, muted — no bubble) until the next update arrives
2. Tool activity indicator continues to show below the ephemeral text
3. Ephemeral text is visually distinct from real messages so users know it's temporary

## Design

### New State: `ephemeralText`

Add one state variable to `ConversationView`:

```ts
const [ephemeralText, setEphemeralText] = useState('')
```

### Updated Event Handler Flow

```
1. Streaming starts, no text yet     → ThinkingIndicator (dots)
2. text_delta arrives                → clear ephemeralText, MessageBubble grows
3. Tool activity arrives             → save streamingContent → ephemeralText,
                                       clear streamingContent,
                                       show EphemeralText + ToolActivityIndicator
4. More text_delta arrives           → clear ephemeralText, MessageBubble grows
5. Another tool call                 → repeat step 3
6. Stream completes                  → clear everything
```

Handler changes in `ConversationView.tsx`:

- `onToolActivity`: before clearing `streamingContent`, save it to `ephemeralText`
- `onStreamDelta`: clear `ephemeralText` (live text takes over)
- `onStreamComplete`: clear `ephemeralText` along with other state

### Updated Render Priority

```
if streamingContent    → MessageBubble (live text being written)
else if ephemeralText  → EphemeralText + ToolActivityIndicator (if active)
else if toolActivity   → ThinkingIndicator + ToolActivityIndicator
else                   → ThinkingIndicator (dots only)
```

### New Component: `EphemeralText`

- No bubble wrapper — freestanding text like a status line
- Italic, muted color (`var(--text-secondary)`), reduced opacity
- Same left-alignment/padding as ThinkingIndicator
- Renders content as plain text

### Styling

```css
{
  padding: '4px 16px',
  fontStyle: 'italic',
  color: 'var(--text-secondary)',
  opacity: 0.7,
  fontSize: '13px',
  lineHeight: '1.5'
}
```

### Edge Cases

- **No narration before first tool call**: `ephemeralText` stays empty → ThinkingIndicator shows as before
- **Multiple tool calls without text in between**: `ephemeralText` retains last narration, tool activity updates
- **Stream completes**: all ephemeral state cleared

## Files Changed

1. `src/renderer/src/components/ConversationView.tsx` — add `ephemeralText` state, update handlers + render
2. `src/renderer/src/components/EphemeralText.tsx` — new component (inline italic/muted text)
