// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
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
