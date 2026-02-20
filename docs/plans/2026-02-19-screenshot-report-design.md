# Screenshot Report Feature — Design

## Overview

Enhance the "Report Problem" button into a split button with a dropdown option to capture a screenshot before reporting. The screenshot is saved to disk, shown as a thumbnail in the report modal, and embedded in the Claude message so the AI can view it.

## Split Button UI

The existing "Report Problem" button becomes a split button:

- **Left side** (main area): info icon + "Report Problem" — opens the report modal directly (unchanged behavior)
- **Right side** (caret area): vertical divider + `▾` — opens a dropdown menu positioned above the button
- Dropdown contains one option: **"Take Screenshot and Report"**
- Clicking outside the dropdown or pressing Escape closes it

## Screenshot Capture

**IPC handler:** `capture-screenshot`

- Main process uses `BrowserWindow.getFocusedWindow().webContents.capturePage()` (Electron native API, no new dependencies)
- Saves PNG to `{app.getPath('userData')}/screenshots/{timestamp}.png`
- Returns `{ filePath: string, dataUrl: string }` to the renderer
  - `filePath`: absolute path for embedding in the Claude CLI message
  - `dataUrl`: base64 data URL for the modal thumbnail preview

**Preload bridge:** `captureScreenshot(): Promise<{ filePath: string, dataUrl: string }>`

## Report Modal (Enhanced)

When triggered via "Take Screenshot and Report":

1. Dropdown closes
2. Screenshot is captured (brief async operation)
3. Modal opens with:
   - Same textarea as before
   - Below textarea: thumbnail preview (~120px wide) with border
   - "Screenshot attached" label beside the thumbnail
4. Cancel discards the screenshot reference; Send proceeds as normal

When triggered via the main "Report Problem" click (no screenshot):

- Modal opens exactly as before — no thumbnail, no screenshot reference

## Message Format

When a screenshot is attached, the auto-sent message becomes:

```
[A screenshot of the application has been saved to {filePath}. Please use your Read tool to view this screenshot and understand what the user was seeing when they reported this problem.]

Can you please investigate conversation id {sourceId}: {description}
```

Without a screenshot (plain report), the message stays as-is:

```
Can you please investigate conversation id {sourceId}: {description}
```

## Files Changed

| File | Change |
|------|--------|
| `src/main/ipc.ts` | Add `capture-screenshot` IPC handler |
| `src/preload/index.ts` | Expose `captureScreenshot()` method |
| `src/renderer/src/components/ConversationView.tsx` | Split button, dropdown, thumbnail in modal |
| `src/renderer/src/App.tsx` | Update `handleReportProblem` to accept optional `screenshotPath` |
