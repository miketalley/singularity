# Report Problem Button Design

## Summary

Add an orange "Report Problem" button with a bug icon to the right of the Send button. Clicking it opens a modal where the developer can describe a bug. On submit, a new conversation is created in the same workspace with the message `"Can you please investigate conversation id <id>: <description>"`, and the UI navigates to that new conversation.

## UI Components

### Report Problem Button
- Placed to the right of the Send button in the input bar
- Orange background (#e8820c, hover #f59b2e)
- Contains an inline SVG bug icon + "Report Problem" text
- Always enabled (unlike Send which depends on input)

### Modal Overlay
- Semi-transparent dark backdrop covering viewport
- Centered card with:
  - Title: "Report Problem"
  - Subtitle: "Conversation #<id>"
  - Textarea for bug description
  - Cancel (secondary) and Send Report (orange primary) buttons
- Dismissible via backdrop click, Cancel button, or Escape key

## Data Flow

1. User clicks Report Problem button -> modal opens with current conversationId displayed
2. User types description and clicks Send Report
3. Frontend calls `window.electronAPI.createConversation(workspaceId, defaultModel)` to create new conversation
4. Modal closes, UI navigates to new conversation via existing `onSelectConversation` callback
5. Message is auto-sent to the new conversation: `"Can you please investigate conversation id <original-id>: <user-description>"`

## Files Changed

- `src/renderer/src/components/ConversationView.tsx` — button, modal state, modal JSX, styles
- `src/renderer/src/App.tsx` — pass `onReportProblem` callback prop that creates conversation, navigates, and sends

## Styling

Inline React.CSSProperties matching existing codebase patterns, using CSS variables from global.css.
