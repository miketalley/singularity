# Optimistic Streaming Indicator

## Problem

When navigating into a conversation that has an active Claude process, there's an async gap where `isStreaming` is `false` while `getStreamingState()` resolves. During that window, unanswered user messages show the "Message never got a response" retry bar instead of the thinking dots, creating confusion about whether work is pending.

## Approach: Optimistic Streaming Assumption

After messages load, if the last message is from the user (unanswered), immediately set `isStreaming = true` before the async `getStreamingState`/`isProcessActive` checks. The async checks then either confirm (no-op) or deny (flip `isStreaming` to `false`, revealing the retry bar).

### Before
```
messages load → isStreaming stays false → retry bar flickers → async check → dots appear
```

### After
```
messages load → last msg is user? → set isStreaming=true → dots appear immediately
                                  → async check confirms or denies
```

## Change Scope

**ConversationView.tsx** — mount/load `useEffect` only. After `setMessages(msgs)`, check if the last message is from the user and if so, set `isStreaming(true)` optimistically.

## Edge Case

If the process already exited (genuine failure), the user sees dots for ~50ms while `getStreamingState` + `isProcessActive` resolve, then the retry bar appears. This is imperceptible and far less confusing than the current opposite flicker.
