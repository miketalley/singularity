export async function persistSessionState(
  workspaceId: number,
  conversationId: number
): Promise<void> {
  await window.electronAPI.setSetting('last_workspace_id', String(workspaceId))
  await window.electronAPI.setSetting('last_conversation_id', String(conversationId))
}
