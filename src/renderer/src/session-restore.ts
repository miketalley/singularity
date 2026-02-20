export async function persistSessionState(
  workspaceId: number,
  conversationId: number
): Promise<void> {
  await window.electronAPI.setSetting('last_workspace_id', String(workspaceId))
  await window.electronAPI.setSetting('last_conversation_id', String(conversationId))
}

export interface RestoredSession {
  workspaceId: number
  conversationId: number
  drafts: Record<string, string>
}

export async function restoreSessionState(): Promise<RestoredSession | null> {
  const workspaceIdStr = await window.electronAPI.getSetting('last_workspace_id')
  const conversationIdStr = await window.electronAPI.getSetting('last_conversation_id')

  if (!workspaceIdStr || !conversationIdStr) return null

  const workspaceId = parseInt(workspaceIdStr, 10)
  const conversationId = parseInt(conversationIdStr, 10)

  if (isNaN(workspaceId) || isNaN(conversationId)) return null

  let drafts: Record<string, string> = {}
  try {
    const draftsJson = await window.electronAPI.getSetting('drafts')
    if (draftsJson) {
      drafts = JSON.parse(draftsJson)
    }
  } catch {
    // Invalid JSON, ignore
  }

  return { workspaceId, conversationId, drafts }
}

let draftTimer: ReturnType<typeof setTimeout> | null = null

export function persistDrafts(drafts: Record<number, string>): void {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    const serializable: Record<string, string> = {}
    for (const [k, v] of Object.entries(drafts)) {
      if (v) serializable[k] = v
    }
    window.electronAPI.setSetting('drafts', JSON.stringify(serializable))
  }, 1000)
}
