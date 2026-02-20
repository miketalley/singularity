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
  setConversationNeedsReview: (id: number, needsReview: boolean) => Promise<boolean>
  getDeletedConversations: (workspaceId: number) => Promise<unknown[]>
  restoreConversation: (id: number) => Promise<boolean>
  permanentlyDeleteConversation: (id: number) => Promise<boolean>

  // Message methods
  getMessages: (conversationId: number) => Promise<unknown[]>
  sendMessage: (conversationId: number, content: string, model: string) => Promise<string>
  deleteMessage: (messageId: number) => Promise<boolean>
  getStreamingState: (conversationId: number) => Promise<string | null>
  isProcessActive: (conversationId: number) => Promise<boolean>
  cancelMessage: (conversationId: number) => Promise<void>

  // API key status
  getApiKeyStatus: () => Promise<boolean>

  // Settings
  getSetting: (key: string, defaultValue?: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<boolean>

  // Whisper transcription
  transcribeAudio: (wavData: ArrayBuffer) => Promise<string>
  getWhisperStatus: () => Promise<{
    modelDownloaded: boolean
    modelPath: string | null
    isDownloading: boolean
  }>
  downloadWhisperModel: () => Promise<boolean>
  onWhisperDownloadProgress: (
    callback: (data: { progress: number; downloadedBytes: number; totalBytes: number }) => void
  ) => void
  removeWhisperDownloadListener: () => void

  // Brain methods
  brainRead: (workspacePath: string) => Promise<{
    entries: Array<{ text: string; category: string }>
    raw: string
    tokenEstimate: number
  }>
  brainWrite: (
    workspacePath: string,
    entries: Array<{ text: string; category: string }>
  ) => Promise<boolean>
  brainAppend: (
    workspacePath: string,
    entries: Array<{ text: string; category: string }>
  ) => Promise<boolean>
  brainRemove: (workspacePath: string, index: number) => Promise<boolean>
  brainUpdate: (
    workspacePath: string,
    index: number,
    entry: { text: string; category: string }
  ) => Promise<boolean>
  brainCategories: (workspacePath: string) => Promise<string[]>
  brainExists: (workspacePath: string) => Promise<boolean>
  brainScan: (workspacePath: string) => Promise<{
    entries: Array<{ text: string; category: string }>
    raw: string
    tokenEstimate: number
  }>
  brainExtractMemories: (
    messageContent: string,
    sentiment: 'positive' | 'negative'
  ) => Promise<Array<{ text: string; category: string }>>
  brainTokenThreshold: () => Promise<number>

  // Event listeners
  onStreamDelta: (
    callback: (data: { conversationId: number; text: string }) => void
  ) => void
  onStreamComplete: (callback: (data: { conversationId: number }) => void) => void
  onToolActivity: (
    callback: (data: { conversationId: number; activity: string }) => void
  ) => void
  onConversationTitleUpdated: (
    callback: (data: { conversationId: number; title: string }) => void
  ) => void
  removeStreamListeners: () => void
  removeTitleListener: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
