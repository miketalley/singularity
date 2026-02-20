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
  setConversationNeedsReview: (id: number, needsReview: boolean): Promise<boolean> =>
    ipcRenderer.invoke('set-conversation-needs-review', id, needsReview),
  getDeletedConversations: (workspaceId: number): Promise<unknown[]> =>
    ipcRenderer.invoke('get-deleted-conversations', workspaceId),
  restoreConversation: (id: number): Promise<boolean> =>
    ipcRenderer.invoke('restore-conversation', id),
  permanentlyDeleteConversation: (id: number): Promise<boolean> =>
    ipcRenderer.invoke('permanently-delete-conversation', id),

  // Message methods
  getMessages: (conversationId: number): Promise<unknown[]> =>
    ipcRenderer.invoke('get-messages', conversationId),
  sendMessage: (conversationId: number, content: string, model: string): Promise<string> =>
    ipcRenderer.invoke('send-message', conversationId, content, model),
  deleteMessage: (messageId: number): Promise<boolean> =>
    ipcRenderer.invoke('delete-message', messageId),
  getStreamingState: (conversationId: number): Promise<string | null> =>
    ipcRenderer.invoke('get-streaming-state', conversationId),
  isProcessActive: (conversationId: number): Promise<boolean> =>
    ipcRenderer.invoke('is-process-active', conversationId),

  // API key status
  getApiKeyStatus: (): Promise<boolean> => ipcRenderer.invoke('get-api-key-status'),

  // Settings
  getSetting: (key: string, defaultValue?: string): Promise<string | null> =>
    ipcRenderer.invoke('get-setting', key, defaultValue),
  setSetting: (key: string, value: string): Promise<boolean> =>
    ipcRenderer.invoke('set-setting', key, value),

  // Whisper transcription
  transcribeAudio: (wavData: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('transcribe-audio', new Uint8Array(wavData)),
  getWhisperStatus: (): Promise<{
    modelDownloaded: boolean
    modelPath: string | null
    isDownloading: boolean
  }> => ipcRenderer.invoke('get-whisper-status'),
  downloadWhisperModel: (): Promise<boolean> => ipcRenderer.invoke('download-whisper-model'),
  onWhisperDownloadProgress: (
    callback: (data: { progress: number; downloadedBytes: number; totalBytes: number }) => void
  ): void => {
    ipcRenderer.on('whisper-download-progress', (_event, data) => callback(data))
  },
  removeWhisperDownloadListener: (): void => {
    ipcRenderer.removeAllListeners('whisper-download-progress')
  },

  // Brain methods
  brainRead: (
    workspacePath: string
  ): Promise<{
    entries: Array<{ text: string; category: string }>
    raw: string
    tokenEstimate: number
  }> => ipcRenderer.invoke('brain-read', workspacePath),
  brainWrite: (
    workspacePath: string,
    entries: Array<{ text: string; category: string }>
  ): Promise<boolean> => ipcRenderer.invoke('brain-write', workspacePath, entries),
  brainAppend: (
    workspacePath: string,
    entries: Array<{ text: string; category: string }>
  ): Promise<boolean> => ipcRenderer.invoke('brain-append', workspacePath, entries),
  brainRemove: (workspacePath: string, index: number): Promise<boolean> =>
    ipcRenderer.invoke('brain-remove', workspacePath, index),
  brainUpdate: (
    workspacePath: string,
    index: number,
    entry: { text: string; category: string }
  ): Promise<boolean> => ipcRenderer.invoke('brain-update', workspacePath, index, entry),
  brainCategories: (workspacePath: string): Promise<string[]> =>
    ipcRenderer.invoke('brain-categories', workspacePath),
  brainExists: (workspacePath: string): Promise<boolean> =>
    ipcRenderer.invoke('brain-exists', workspacePath),
  brainScan: (
    workspacePath: string
  ): Promise<{
    entries: Array<{ text: string; category: string }>
    raw: string
    tokenEstimate: number
  }> => ipcRenderer.invoke('brain-scan', workspacePath),
  brainExtractMemories: (
    messageContent: string,
    sentiment: 'positive' | 'negative'
  ): Promise<Array<{ text: string; category: string }>> =>
    ipcRenderer.invoke('brain-extract-memories', messageContent, sentiment),
  brainTokenThreshold: (): Promise<number> =>
    ipcRenderer.invoke('brain-token-threshold'),

  // Event listeners
  onStreamDelta: (
    callback: (data: { conversationId: number; text: string }) => void
  ): void => {
    ipcRenderer.on('stream-delta', (_event, data) => callback(data))
  },

  onStreamComplete: (callback: (data: { conversationId: number }) => void): void => {
    ipcRenderer.on('stream-complete', (_event, data) => callback(data))
  },

  onToolActivity: (
    callback: (data: { conversationId: number; activity: string }) => void
  ): void => {
    ipcRenderer.on('stream-tool-activity', (_event, data) => callback(data))
  },

  onConversationTitleUpdated: (
    callback: (data: { conversationId: number; title: string }) => void
  ): void => {
    ipcRenderer.on('conversation-title-updated', (_event, data) => callback(data))
  },

  removeStreamListeners: (): void => {
    ipcRenderer.removeAllListeners('stream-delta')
    ipcRenderer.removeAllListeners('stream-complete')
    ipcRenderer.removeAllListeners('stream-tool-activity')
  },

  removeTitleListener: (): void => {
    ipcRenderer.removeAllListeners('conversation-title-updated')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
