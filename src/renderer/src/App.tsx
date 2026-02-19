import React, { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ConversationView from './components/ConversationView'
import WelcomeView from './components/WelcomeView'
import ApiKeyMissing from './components/ApiKeyMissing'

interface ActiveConversation {
  id: number
  workspaceId: number
  title: string
  model: string
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    width: '100%',
    height: '100%'
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  }
}

function App(): React.JSX.Element {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)
  const [activeConversation, setActiveConversation] = useState<ActiveConversation | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4-6')

  // Check API key status and load settings on mount
  useEffect(() => {
    async function init(): Promise<void> {
      try {
        const status = await window.electronAPI.getApiKeyStatus()
        setHasApiKey(status)
      } catch {
        setHasApiKey(false)
      }
      try {
        const savedModel = await window.electronAPI.getSetting(
          'default_model',
          'claude-sonnet-4-6'
        )
        if (savedModel) setDefaultModel(savedModel)
      } catch {
        // Use default
      }
    }
    init()
  }, [])

  // Listen for conversation title updates
  useEffect(() => {
    window.electronAPI.onConversationTitleUpdated((data) => {
      setActiveConversation((prev) => {
        if (prev && prev.id === data.conversationId) {
          return { ...prev, title: data.title }
        }
        return prev
      })
      setRefreshTrigger((prev) => prev + 1)
    })

    return () => {
      window.electronAPI.removeStreamListeners()
    }
  }, [])

  const handleSelectConversation = useCallback(
    (conversation: { id: number; workspace_id: number; title: string; model: string }) => {
      setActiveConversation({
        id: conversation.id,
        workspaceId: conversation.workspace_id,
        title: conversation.title,
        model: conversation.model
      })
    },
    []
  )

  const handleNewConversation = useCallback(async (workspaceId: number) => {
    try {
      const conv = (await window.electronAPI.createConversation(workspaceId, defaultModel)) as {
        id: number
        workspace_id: number
        title: string
        model: string
      }
      setActiveConversation({
        id: conv.id,
        workspaceId: conv.workspace_id,
        title: conv.title,
        model: conv.model
      })
      setRefreshTrigger((prev) => prev + 1)
    } catch (err) {
      console.error('Failed to create conversation:', err)
    }
  }, [defaultModel])

  const handleDeleteConversation = useCallback(
    (conversationId: number) => {
      setActiveConversation((prev) => {
        if (prev && prev.id === conversationId) {
          return null
        }
        return prev
      })
      setRefreshTrigger((prev) => prev + 1)
    },
    []
  )

  const handleDefaultModelChange = useCallback(async (model: string) => {
    setDefaultModel(model)
    try {
      await window.electronAPI.setSetting('default_model', model)
    } catch (err) {
      console.error('Failed to save default model:', err)
    }
  }, [])

  const handleModelChange = useCallback(
    async (model: string) => {
      if (!activeConversation) return
      try {
        await window.electronAPI.updateConversationModel(activeConversation.id, model)
        setActiveConversation((prev) => (prev ? { ...prev, model } : null))
      } catch (err) {
        console.error('Failed to update model:', err)
      }
    },
    [activeConversation]
  )

  // Loading state
  if (hasApiKey === null) {
    return <div />
  }

  // No API key
  if (!hasApiKey) {
    return <ApiKeyMissing />
  }

  // Main layout
  return (
    <div style={styles.layout}>
      <Sidebar
        activeConversationId={activeConversation?.id ?? null}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        refreshTrigger={refreshTrigger}
        defaultModel={defaultModel}
        onDefaultModelChange={handleDefaultModelChange}
      />
      <div style={styles.content}>
        {activeConversation ? (
          <ConversationView
            key={activeConversation.id}
            conversationId={activeConversation.id}
            initialModel={activeConversation.model}
            onModelChange={handleModelChange}
          />
        ) : (
          <WelcomeView />
        )}
      </div>
    </div>
  )
}

export default App
