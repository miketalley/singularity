// @vitest-environment jsdom
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupMockElectronAPI, type MockElectronAPI } from '../../helpers/mock-electron-api'

// Mock all child components to isolate App logic
vi.mock('../../../src/renderer/src/components/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>
}))
vi.mock('../../../src/renderer/src/components/ConversationView', () => ({
  default: () => <div data-testid="conversation-view">ConversationView</div>
}))
vi.mock('../../../src/renderer/src/components/WelcomeView', () => ({
  default: () => <div data-testid="welcome-view">WelcomeView</div>
}))
vi.mock('../../../src/renderer/src/components/ApiKeyMissing', () => ({
  default: () => <div data-testid="api-key-missing">ApiKeyMissing</div>
}))
vi.mock('../../../src/renderer/src/components/BrainPanel', () => ({
  default: () => <div data-testid="brain-panel">BrainPanel</div>
}))
vi.mock('../../../src/renderer/src/components/StatusBar', () => ({
  default: () => <div data-testid="status-bar">StatusBar</div>
}))

import App from '../../../src/renderer/src/App'

describe('App', () => {
  let mockAPI: MockElectronAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockAPI = setupMockElectronAPI()
  })

  // 1. Shows empty div while loading (hasApiKey === null)
  it('shows empty div while loading', () => {
    // Make getApiKeyStatus never resolve so hasApiKey stays null
    mockAPI.getApiKeyStatus.mockReturnValue(new Promise(() => {}))
    const { container } = render(<App />)
    // Should render just an empty div (the loading state)
    const rootDiv = container.firstChild as HTMLElement
    expect(rootDiv.tagName).toBe('DIV')
    expect(rootDiv.children.length).toBe(0)
    expect(rootDiv.textContent).toBe('')
  })

  // 2. Shows ApiKeyMissing component when API key check returns false
  it('shows ApiKeyMissing when API key check returns false', async () => {
    mockAPI.getApiKeyStatus.mockResolvedValue(false)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('api-key-missing')).toBeTruthy()
    })
  })

  // 3. Shows main layout with "singularity" title bar when API key check returns true
  it('shows main layout with "singularity" title bar when API key is present', async () => {
    mockAPI.getApiKeyStatus.mockResolvedValue(true)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('singularity')).toBeTruthy()
    })
  })

  // 4. Shows WelcomeView when no conversation is selected
  it('shows WelcomeView when no conversation is selected', async () => {
    mockAPI.getApiKeyStatus.mockResolvedValue(true)
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('welcome-view')).toBeTruthy()
    })
  })
})
