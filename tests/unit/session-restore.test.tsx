// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupMockElectronAPI, type MockElectronAPI } from '../helpers/mock-electron-api'

describe('Session restore - persistence', () => {
  let mockAPI: MockElectronAPI

  beforeEach(() => {
    mockAPI = setupMockElectronAPI()
  })

  it('persists last_workspace_id and last_conversation_id when conversation is selected', async () => {
    const { persistSessionState } = await import('../../src/renderer/src/session-restore')

    await persistSessionState(5, 42)

    expect(mockAPI.setSetting).toHaveBeenCalledWith('last_workspace_id', '5')
    expect(mockAPI.setSetting).toHaveBeenCalledWith('last_conversation_id', '42')
  })
})

describe('Session restore - restoration', () => {
  let mockAPI: MockElectronAPI

  beforeEach(() => {
    vi.resetModules()
    mockAPI = setupMockElectronAPI()
  })

  it('restores last workspace and conversation from settings', async () => {
    mockAPI.getSetting.mockImplementation((key: string) => {
      if (key === 'last_workspace_id') return Promise.resolve('5')
      if (key === 'last_conversation_id') return Promise.resolve('42')
      if (key === 'drafts') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    const { restoreSessionState } = await import('../../src/renderer/src/session-restore')
    const result = await restoreSessionState()

    expect(result).toEqual({
      workspaceId: 5,
      conversationId: 42,
      drafts: {}
    })
  })

  it('returns null when no saved state exists', async () => {
    mockAPI.getSetting.mockResolvedValue(null)

    const { restoreSessionState } = await import('../../src/renderer/src/session-restore')
    const result = await restoreSessionState()

    expect(result).toBeNull()
  })

  it('restores drafts from settings', async () => {
    mockAPI.getSetting.mockImplementation((key: string) => {
      if (key === 'last_workspace_id') return Promise.resolve('5')
      if (key === 'last_conversation_id') return Promise.resolve('42')
      if (key === 'drafts') return Promise.resolve('{"42":"hello world"}')
      return Promise.resolve(null)
    })

    const { restoreSessionState } = await import('../../src/renderer/src/session-restore')
    const result = await restoreSessionState()

    expect(result).toEqual({
      workspaceId: 5,
      conversationId: 42,
      drafts: { '42': 'hello world' }
    })
  })
})
