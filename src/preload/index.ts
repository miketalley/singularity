import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // Workspace methods
  getWorkspaces: (): Promise<unknown[]> => ipcRenderer.invoke('get-workspaces'),
  addWorkspace: (): Promise<unknown> => ipcRenderer.invoke('add-workspace'),
  deleteWorkspace: (id: number): Promise<boolean> => ipcRenderer.invoke('delete-workspace', id),

  // Conversation methods
  getConversations: (workspaceId: number): Promise<unknown[]> =>
    ipcRenderer.invoke('get-conversations', workspaceId),
  createConversation: (workspaceId: number, model: string): Promise<unknown> =>
    ipcRenderer.invoke('create-conversation', workspaceId, model),
  updateConversationTitle: (id: number, title: string): Promise<boolean> =>
    ipcRenderer.invoke('update-conversation-title', id, title),
  updateConversationModel: (id: number, model: string): Promise<boolean> =>
    ipcRenderer.invoke('update-conversation-model', id, model),
  deleteConversation: (id: number): Promise<boolean> =>
    ipcRenderer.invoke('delete-conversation', id),

  // Message methods
  getMessages: (conversationId: number): Promise<unknown[]> =>
    ipcRenderer.invoke('get-messages', conversationId),
  sendMessage: (conversationId: number, content: string, model: string): Promise<string> =>
    ipcRenderer.invoke('send-message', conversationId, content, model),

  // API key status
  getApiKeyStatus: (): Promise<boolean> => ipcRenderer.invoke('get-api-key-status'),

  // Event listeners
  onStreamDelta: (
    callback: (data: { conversationId: number; text: string }) => void
  ): void => {
    ipcRenderer.on('stream-delta', (_event, data) => callback(data))
  },

  onStreamComplete: (callback: (data: { conversationId: number }) => void): void => {
    ipcRenderer.on('stream-complete', (_event, data) => callback(data))
  },

  onConversationTitleUpdated: (
    callback: (data: { conversationId: number; title: string }) => void
  ): void => {
    ipcRenderer.on('conversation-title-updated', (_event, data) => callback(data))
  },

  removeStreamListeners: (): void => {
    ipcRenderer.removeAllListeners('stream-delta')
    ipcRenderer.removeAllListeners('stream-complete')
    ipcRenderer.removeAllListeners('conversation-title-updated')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
