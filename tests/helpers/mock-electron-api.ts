/**
 * Mock window.electronAPI factory for renderer component tests.
 *
 * Every method is a vitest mock function (vi.fn()) so tests can set up
 * return values with e.g. mockAPI.getWorkspaces.mockResolvedValue([...]).
 *
 * The shape matches the real preload API defined in
 *   src/preload/index.ts
 *   src/preload/index.d.ts
 */

import { vi } from 'vitest'
import type { Mock } from 'vitest'

/** The type of the object returned by createMockElectronAPI(). */
export type MockElectronAPI = {
  // Workspace methods
  getWorkspaces: Mock
  addWorkspace: Mock
  deleteWorkspace: Mock

  // Conversation methods
  getConversations: Mock
  createConversation: Mock
  updateConversationTitle: Mock
  updateConversationModel: Mock
  deleteConversation: Mock
  setConversationNeedsReview: Mock
  getDeletedConversations: Mock
  restoreConversation: Mock
  permanentlyDeleteConversation: Mock

  // Message methods
  getMessages: Mock
  sendMessage: Mock
  deleteMessage: Mock
  getStreamingState: Mock
  isProcessActive: Mock
  cancelMessage: Mock

  // API key status
  getApiKeyStatus: Mock

  // Settings
  getSetting: Mock
  setSetting: Mock

  // Whisper transcription
  transcribeAudio: Mock
  getWhisperStatus: Mock
  downloadWhisperModel: Mock
  onWhisperDownloadProgress: Mock
  removeWhisperDownloadListener: Mock

  // Brain methods
  brainRead: Mock
  brainWrite: Mock
  brainAppend: Mock
  brainRemove: Mock
  brainUpdate: Mock
  brainCategories: Mock
  brainExists: Mock
  brainScan: Mock
  brainExtractMemories: Mock
  brainTokenThreshold: Mock

  // Usage data
  getUsageData: Mock

  // Git branch
  getGitBranch: Mock

  // Event listeners
  onStreamDelta: Mock
  onStreamComplete: Mock
  onToolActivity: Mock
  onConversationTitleUpdated: Mock
  removeStreamListeners: Mock
  removeTitleListener: Mock
}

/**
 * Build a fresh mock electronAPI object. Every method is an independent
 * vi.fn() with sensible default return values (resolved promises that
 * return empty arrays, false, null, etc.) so components can mount without
 * immediately exploding.
 */
export function createMockElectronAPI(): MockElectronAPI {
  return {
    // Workspace methods
    getWorkspaces: vi.fn().mockResolvedValue([]),
    addWorkspace: vi.fn().mockResolvedValue(null),
    deleteWorkspace: vi.fn().mockResolvedValue(true),

    // Conversation methods
    getConversations: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn().mockResolvedValue(null),
    updateConversationTitle: vi.fn().mockResolvedValue(true),
    updateConversationModel: vi.fn().mockResolvedValue(true),
    deleteConversation: vi.fn().mockResolvedValue(true),
    setConversationNeedsReview: vi.fn().mockResolvedValue(true),
    getDeletedConversations: vi.fn().mockResolvedValue([]),
    restoreConversation: vi.fn().mockResolvedValue(true),
    permanentlyDeleteConversation: vi.fn().mockResolvedValue(true),

    // Message methods
    getMessages: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(''),
    deleteMessage: vi.fn().mockResolvedValue(true),
    getStreamingState: vi.fn().mockResolvedValue(null),
    isProcessActive: vi.fn().mockResolvedValue(false),
    cancelMessage: vi.fn().mockResolvedValue(undefined),

    // API key status
    getApiKeyStatus: vi.fn().mockResolvedValue(false),

    // Settings
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(true),

    // Whisper transcription
    transcribeAudio: vi.fn().mockResolvedValue(''),
    getWhisperStatus: vi.fn().mockResolvedValue({
      modelDownloaded: false,
      modelPath: null,
      isDownloading: false
    }),
    downloadWhisperModel: vi.fn().mockResolvedValue(true),
    onWhisperDownloadProgress: vi.fn(),
    removeWhisperDownloadListener: vi.fn(),

    // Brain methods
    brainRead: vi.fn().mockResolvedValue({ entries: [], raw: '', tokenEstimate: 0 }),
    brainWrite: vi.fn().mockResolvedValue(true),
    brainAppend: vi.fn().mockResolvedValue(true),
    brainRemove: vi.fn().mockResolvedValue(true),
    brainUpdate: vi.fn().mockResolvedValue(true),
    brainCategories: vi.fn().mockResolvedValue([]),
    brainExists: vi.fn().mockResolvedValue(false),
    brainScan: vi.fn().mockResolvedValue({ entries: [], raw: '', tokenEstimate: 0 }),
    brainExtractMemories: vi.fn().mockResolvedValue([]),
    brainTokenThreshold: vi.fn().mockResolvedValue(0),

    // Usage data
    getUsageData: vi.fn().mockResolvedValue({
      usedPercent: null,
      resetAt: null,
      lastChecked: null
    }),

    // Git branch
    getGitBranch: vi.fn().mockResolvedValue(null),

    // Event listeners
    onStreamDelta: vi.fn(),
    onStreamComplete: vi.fn(),
    onToolActivity: vi.fn(),
    onConversationTitleUpdated: vi.fn(),
    removeStreamListeners: vi.fn(),
    removeTitleListener: vi.fn()
  }
}

/**
 * Assign a fresh mock electronAPI to window.electronAPI and return it.
 * Convenient for beforeEach blocks in component tests:
 *
 *   let mockAPI: MockElectronAPI
 *   beforeEach(() => {
 *     mockAPI = setupMockElectronAPI()
 *   })
 */
export function setupMockElectronAPI(): MockElectronAPI {
  const mockAPI = createMockElectronAPI()
  ;(window as unknown as Record<string, unknown>).electronAPI = mockAPI
  return mockAPI
}
