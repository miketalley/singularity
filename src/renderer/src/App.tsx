import React, { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import ConversationView from './components/ConversationView'
import WelcomeView from './components/WelcomeView'
import ApiKeyMissing from './components/ApiKeyMissing'
import BrainPanel from './components/BrainPanel'
import StatusBar from './components/StatusBar'

interface ActiveConversation {
  id: number
  workspaceId: number
  workspacePath: string
  workspaceName: string
  title: string
  model: string
}

const styles: Record<string, React.CSSProperties> = {
  titleBar: {
    WebkitAppRegion: 'drag',
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-color)',
    flexShrink: 0,
    userSelect: 'none',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em'
  } as React.CSSProperties,
  layout: {
    display: 'flex',
    width: '100%',
    flex: 1,
    overflow: 'hidden'
  },
  content: {
    flex: 1,
    minWidth: 0,
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
  const [streamingConversationId, setStreamingConversationId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const isResizing = useRef(false)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!isResizing.current) return
      const maxWidth = Math.floor(window.innerWidth * 0.5)
      const newWidth = Math.min(Math.max(e.clientX, 160), maxWidth)
      setSidebarWidth(newWidth)
    }
    const handleMouseUp = (): void => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // Brain panel state
  const [brainPanelOpen, setBrainPanelOpen] = useState(false)
  const [brainProposedEntries, setBrainProposedEntries] = useState<
    Array<{ text: string; category: string }>
  >([])
  const [brainIsExtracting, setBrainIsExtracting] = useState(false)
  const [brainExtractionMessage, setBrainExtractionMessage] = useState<string | null>(null)
  const [brainWorkspacePath, setBrainWorkspacePath] = useState<string | null>(null)
  const [brainWorkspaceName, setBrainWorkspaceName] = useState('No workspace')

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
      window.electronAPI.removeTitleListener()
    }
  }, [])

  const handleSelectConversation = useCallback(
    (conversation: {
      id: number
      workspace_id: number
      title: string
      model: string
      workspacePath: string
      workspaceName: string
    }) => {
      setActiveConversation({
        id: conversation.id,
        workspaceId: conversation.workspace_id,
        title: conversation.title,
        model: conversation.model,
        workspacePath: conversation.workspacePath,
        workspaceName: conversation.workspaceName
      })
    },
    []
  )

  const handleNewConversation = useCallback(
    async (workspaceId: number, workspacePath: string, workspaceName: string) => {
      try {
        const conv = (await window.electronAPI.createConversation(
          workspaceId,
          defaultModel
        )) as {
          id: number
          workspace_id: number
          title: string
          model: string
        }
        setActiveConversation({
          id: conv.id,
          workspaceId: conv.workspace_id,
          title: conv.title,
          model: conv.model,
          workspacePath,
          workspaceName
        })
        setRefreshTrigger((prev) => prev + 1)
      } catch (err) {
        console.error('Failed to create conversation:', err)
      }
    },
    [defaultModel]
  )

  const handleDeleteConversation = useCallback((conversationId: number) => {
    setActiveConversation((prev) => {
      if (prev && prev.id === conversationId) {
        return null
      }
      return prev
    })
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const handleDefaultModelChange = useCallback(async (model: string) => {
    setDefaultModel(model)
    try {
      await window.electronAPI.setSetting('default_model', model)
    } catch (err) {
      console.error('Failed to save default model:', err)
    }
  }, [])

  const handleStreamingStateChange = useCallback((convId: number, streaming: boolean) => {
    if (streaming) {
      setStreamingConversationId(convId)
    } else {
      setStreamingConversationId((prev) => (prev === convId ? null : prev))
      // Refresh sidebar so awaiting_response / status indicators update from DB
      setRefreshTrigger((prev) => prev + 1)
    }
  }, [])

  const handleDraftChange = useCallback((convId: number, text: string) => {
    setDrafts((prev) => {
      if (text) {
        return { ...prev, [convId]: text }
      }
      const next = { ...prev }
      delete next[convId]
      return next
    })
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

  // Brain: "Learn from this" / "Learn what to avoid" handler
  const handleLearnFromThis = useCallback(async (content: string, sentiment: 'positive' | 'negative') => {
    setBrainWorkspacePath(activeConversation?.workspacePath ?? null)
    setBrainWorkspaceName(activeConversation?.workspaceName ?? 'No workspace')
    setBrainPanelOpen(true)
    setBrainIsExtracting(true)
    setBrainProposedEntries([])
    setBrainExtractionMessage(null)
    try {
      const extracted = await window.electronAPI.brainExtractMemories(content, sentiment)
      setBrainProposedEntries(extracted)
      if (extracted.length === 0) {
        setBrainExtractionMessage(
          sentiment === 'positive'
            ? 'No learnable memories found in this message. Try a message with project-specific details like architecture decisions, conventions, or gotchas.'
            : 'No anti-patterns found in this message. Try a message that contains mistakes or approaches to avoid.'
        )
      }
    } catch (err) {
      console.error('Failed to extract memories:', err)
      setBrainExtractionMessage('Failed to extract memories. Check your API key and try again.')
    } finally {
      setBrainIsExtracting(false)
    }
  }, [activeConversation])

  // Report Problem: create new conversation with bug report message
  const handleReportProblem = useCallback(
    async (sourceConversationId: number, description: string) => {
      if (!activeConversation) return
      try {
        const conv = (await window.electronAPI.createConversation(
          activeConversation.workspaceId,
          defaultModel
        )) as {
          id: number
          workspace_id: number
          title: string
          model: string
        }
        // Navigate to the new conversation
        setActiveConversation({
          id: conv.id,
          workspaceId: activeConversation.workspaceId,
          title: conv.title,
          model: conv.model,
          workspacePath: activeConversation.workspacePath,
          workspaceName: activeConversation.workspaceName
        })
        setRefreshTrigger((prev) => prev + 1)
        // Auto-send the bug report message
        const message = `Can you please investigate conversation id ${sourceConversationId}: ${description}`
        await window.electronAPI.sendMessage(conv.id, message, conv.model)
      } catch (err) {
        console.error('Failed to report problem:', err)
      }
    },
    [activeConversation, defaultModel]
  )

  // Brain: open browse mode from sidebar
  const handleOpenBrainBrowse = useCallback((workspacePath: string, workspaceName: string) => {
    setBrainWorkspacePath(workspacePath)
    setBrainWorkspaceName(workspaceName)
    setBrainProposedEntries([])
    setBrainIsExtracting(false)
    setBrainExtractionMessage(null)
    setBrainPanelOpen(true)
  }, [])

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
    <>
      <div style={styles.titleBar}>singularity</div>
      <div style={styles.layout}>
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth, flexShrink: 0 }}>
          <Sidebar
            activeConversationId={activeConversation?.id ?? null}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
            refreshTrigger={refreshTrigger}
            defaultModel={defaultModel}
            onDefaultModelChange={handleDefaultModelChange}
            streamingConversationId={streamingConversationId}
            onOpenBrain={handleOpenBrainBrowse}
          />
        </div>
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleResizeStart}
        />
        <div style={styles.content}>
          {activeConversation ? (
            <ConversationView
              key={activeConversation.id}
              conversationId={activeConversation.id}
              initialModel={activeConversation.model}
              onModelChange={handleModelChange}
              onStreamingStateChange={handleStreamingStateChange}
              draft={drafts[activeConversation.id] ?? ''}
              onDraftChange={handleDraftChange}
              onLearnFromThis={handleLearnFromThis}
              onReportProblem={handleReportProblem}
            />
          ) : (
            <WelcomeView />
          )}
        </div>
        <div className={`brain-panel-wrapper ${brainPanelOpen ? 'brain-panel-wrapper--open' : ''}`}>
          <BrainPanel
            workspacePath={brainWorkspacePath ?? activeConversation?.workspacePath ?? null}
            workspaceName={brainWorkspaceName ?? activeConversation?.workspaceName ?? 'No workspace'}
            isOpen={brainPanelOpen}
            onClose={() => {
              setBrainPanelOpen(false)
              setBrainWorkspacePath(null)
              setBrainWorkspaceName('No workspace')
            }}
            proposedEntries={brainProposedEntries}
            isExtracting={brainIsExtracting}
            extractionMessage={brainExtractionMessage}
          />
        </div>
      </div>
      <StatusBar
        workspacePath={activeConversation?.workspacePath ?? null}
        currentModel={activeConversation?.model ?? null}
      />
    </>
  )
}

export default App
