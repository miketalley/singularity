export interface ElectronAPI {
  // Workspace methods
  getWorkspaces: () => Promise<unknown[]>
  addWorkspace: () => Promise<unknown>
  deleteWorkspace: (id: number) => Promise<boolean>

  // Conversation methods
  getConversations: (workspaceId: number) => Promise<unknown[]>
  createConversation: (workspaceId: number, model: string) => Promise<unknown>
  updateConversationTitle: (id: number, title: string) => Promise<boolean>
  updateConversationModel: (id: number, model: string) => Promise<boolean>
  deleteConversation: (id: number) => Promise<boolean>

  // Message methods
  getMessages: (conversationId: number) => Promise<unknown[]>
  sendMessage: (conversationId: number, content: string, model: string) => Promise<string>

  // API key status
  getApiKeyStatus: () => Promise<boolean>

  // Event listeners
  onStreamDelta: (
    callback: (data: { conversationId: number; text: string }) => void
  ) => void
  onStreamComplete: (callback: (data: { conversationId: number }) => void) => void
  onConversationTitleUpdated: (
    callback: (data: { conversationId: number; title: string }) => void
  ) => void
  removeStreamListeners: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
