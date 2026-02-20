import React, { useState, useEffect, useCallback } from 'react'
import ModelSelector from './ModelSelector'

interface Workspace {
  id: number
  name: string
  path: string
  created_at: string
}

interface Conversation {
  id: number
  workspace_id: number
  title: string
  model: string
  created_at: string
  message_count?: number
  needs_review?: number
  awaiting_response?: number
  last_message_role?: string
}

interface SidebarProps {
  activeConversationId: number | null
  onSelectConversation: (conversation: Conversation & { workspacePath: string; workspaceName: string }) => void
  onNewConversation: (workspaceId: number, workspacePath: string, workspaceName: string) => void
  onDeleteConversation: (conversationId: number) => void
  refreshTrigger: number
  defaultModel: string
  onDefaultModelChange: (model: string) => void
  streamingConversationId: number | null
  onOpenBrain?: (workspacePath: string, workspaceName: string) => void
}

function SpinnerIcon(): React.JSX.Element {
  const [rotation, setRotation] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setRotation((r) => (r + 45) % 360), 100)
    return () => clearInterval(interval)
  }, [])
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        fontSize: '11px',
        lineHeight: '12px',
        textAlign: 'center',
        flexShrink: 0,
        transform: `rotate(${rotation}deg)`,
        color: 'var(--accent-color)'
      }}
    >
      &#10227;
    </span>
  )
}

function CheckIcon(): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        fontSize: '11px',
        lineHeight: '12px',
        textAlign: 'center',
        flexShrink: 0,
        color: '#98c379'
      }}
    >
      &#10003;
    </span>
  )
}

function NeedsReviewIcon(): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        fontSize: '11px',
        lineHeight: '12px',
        textAlign: 'center',
        flexShrink: 0,
        color: '#e06c75',
        fontWeight: 700
      }}
    >
      !
    </span>
  )
}

function AwaitingResponseIcon(): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '12px',
        height: '12px',
        fontSize: '11px',
        lineHeight: '12px',
        textAlign: 'center',
        flexShrink: 0,
        color: '#e5c07b',
        fontWeight: 700
      }}
    >
      ?
    </span>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '100%',
    backgroundColor: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden'
  },
  dragRegion: {
    height: '38px',
    flexShrink: 0,
    WebkitAppRegion: 'drag'
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px 8px 12px',
    flexShrink: 0
  },
  headerLabel: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)'
  },
  addButton: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    padding: '2px 6px'
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 0 8px 0'
  },
  workspaceRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    gap: '4px'
  },
  workspaceName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  toggle: {
    fontSize: '10px',
    width: '16px',
    textAlign: 'center',
    color: 'var(--text-secondary)',
    flexShrink: 0
  },
  newConvButton: {
    fontSize: '16px',
    color: 'var(--text-secondary)',
    padding: '0 4px',
    lineHeight: '1',
    flexShrink: 0
  },
  menuButton: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    padding: '0 2px',
    lineHeight: '1',
    flexShrink: 0,
    letterSpacing: '1px'
  },
  menuContainer: {
    position: 'relative' as const
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    marginTop: '2px',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    padding: '4px 0',
    zIndex: 100,
    minWidth: '150px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '6px 12px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    textAlign: 'left' as const,
    cursor: 'pointer'
  },
  conversationRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 12px 4px 24px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    gap: '4px'
  },
  conversationActive: {
    backgroundColor: 'var(--bg-active)',
    color: 'var(--text-bright)'
  },
  conversationTitle: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  headerButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  gearButton: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    padding: '2px 4px',
    lineHeight: '1'
  },
  settingsPanel: {
    borderTop: '1px solid var(--border-color)',
    padding: '12px',
    flexShrink: 0,
    backgroundColor: 'var(--bg-tertiary)'
  },
  settingsTitle: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    marginBottom: '10px'
  },
  settingsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '6px'
  },
  settingsLabel: {
    fontSize: '12px',
    color: 'var(--text-primary)'
  }
}

function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  refreshTrigger,
  defaultModel,
  onDefaultModelChange,
  streamingConversationId,
  onOpenBrain
}: SidebarProps): React.JSX.Element {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [conversations, setConversations] = useState<Record<number, Conversation[]>>({})
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<number>>(new Set())
  const [menuOpenForWorkspace, setMenuOpenForWorkspace] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [convContextMenu, setConvContextMenu] = useState<{
    conversationId: number
    x: number
    y: number
  } | null>(null)
  const [deletedPanelWorkspaceId, setDeletedPanelWorkspaceId] = useState<number | null>(null)
  const [deletedConversations, setDeletedConversations] = useState<Conversation[]>([])
  const [whisperStatus, setWhisperStatus] = useState<{
    modelDownloaded: boolean
    modelPath: string | null
    isDownloading: boolean
  }>({ modelDownloaded: false, modelPath: null, isDownloading: false })
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [confirmRemoveWorkspaceId, setConfirmRemoveWorkspaceId] = useState<number | null>(null)
  const [executionMode, setExecutionMode] = useState<string>('ask')

  // Load whisper status when settings panel opens
  useEffect(() => {
    if (!settingsOpen) return
    async function loadWhisperStatus(): Promise<void> {
      try {
        const status = await window.electronAPI.getWhisperStatus()
        setWhisperStatus(status)
      } catch {
        // ignore
      }
    }
    loadWhisperStatus()

    // Load execution mode preference
    window.electronAPI.getSetting('execution_mode_preference', 'ask').then((val) => {
      if (val) setExecutionMode(val)
    })

    window.electronAPI.onWhisperDownloadProgress((data) => {
      setDownloadProgress(data.progress)
    })
    return () => {
      window.electronAPI.removeWhisperDownloadListener()
    }
  }, [settingsOpen])

  const handleDownloadModel = useCallback(async () => {
    try {
      setDownloadProgress(0)
      await window.electronAPI.downloadWhisperModel()
      setDownloadProgress(null)
      const status = await window.electronAPI.getWhisperStatus()
      setWhisperStatus(status)
    } catch (err) {
      console.error('Failed to download whisper model:', err)
      setDownloadProgress(null)
    }
  }, [])

  const handleExecutionModeChange = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setExecutionMode(value)
    await window.electronAPI.setSetting('execution_mode_preference', value)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const ws = (await window.electronAPI.getWorkspaces()) as Workspace[]
      setWorkspaces(ws)

      // Expand all workspaces by default
      setExpandedWorkspaces((prev) => {
        const next = new Set(prev)
        for (const w of ws) {
          next.add(w.id)
        }
        return next
      })

      // Load conversations for each workspace
      const convMap: Record<number, Conversation[]> = {}
      for (const w of ws) {
        const convs = (await window.electronAPI.getConversations(w.id)) as Conversation[]
        convMap[w.id] = convs
      }
      setConversations(convMap)
    } catch (err) {
      console.error('Failed to load sidebar data:', err)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, refreshTrigger])

  const handleAddWorkspace = useCallback(async () => {
    try {
      const ws = await window.electronAPI.addWorkspace()
      if (ws) {
        await loadData()
      }
    } catch (err) {
      console.error('Failed to add workspace:', err)
    }
  }, [loadData])

  const toggleWorkspace = useCallback((workspaceId: number) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(workspaceId)) {
        next.delete(workspaceId)
      } else {
        next.add(workspaceId)
      }
      return next
    })
  }, [])

  const handleNewConversation = useCallback(
    (e: React.MouseEvent, workspace: Workspace) => {
      e.stopPropagation()
      onNewConversation(workspace.id, workspace.path, workspace.name)
    },
    [onNewConversation]
  )

  const handleRemoveWorkspace = useCallback(
    (e: React.MouseEvent, workspaceId: number) => {
      e.stopPropagation()
      setMenuOpenForWorkspace(null)
      setConfirmRemoveWorkspaceId(workspaceId)
    },
    []
  )

  const handleConfirmRemoveWorkspace = useCallback(async () => {
    if (confirmRemoveWorkspaceId === null) return
    try {
      await window.electronAPI.deleteWorkspace(confirmRemoveWorkspaceId)
      await loadData()
    } catch (err) {
      console.error('Failed to remove workspace:', err)
    } finally {
      setConfirmRemoveWorkspaceId(null)
    }
  }, [confirmRemoveWorkspaceId, loadData])

  const toggleMenu = useCallback((e: React.MouseEvent, workspaceId: number) => {
    e.stopPropagation()
    setMenuOpenForWorkspace((prev) => (prev === workspaceId ? null : workspaceId))
  }, [])

  const handleViewDeleted = useCallback(
    async (e: React.MouseEvent, workspaceId: number) => {
      e.stopPropagation()
      setMenuOpenForWorkspace(null)
      try {
        const deleted = (await window.electronAPI.getDeletedConversations(
          workspaceId
        )) as Conversation[]
        setDeletedConversations(deleted)
        setDeletedPanelWorkspaceId(workspaceId)
      } catch (err) {
        console.error('Failed to load deleted conversations:', err)
      }
    },
    []
  )

  const handleRestoreConversation = useCallback(
    async (conversationId: number) => {
      try {
        await window.electronAPI.restoreConversation(conversationId)
        if (deletedPanelWorkspaceId !== null) {
          const deleted = (await window.electronAPI.getDeletedConversations(
            deletedPanelWorkspaceId
          )) as Conversation[]
          setDeletedConversations(deleted)
          if (deleted.length === 0) setDeletedPanelWorkspaceId(null)
        }
        await loadData()
      } catch (err) {
        console.error('Failed to restore conversation:', err)
      }
    },
    [deletedPanelWorkspaceId, loadData]
  )

  const handlePermanentlyDelete = useCallback(
    async (conversationId: number) => {
      try {
        await window.electronAPI.permanentlyDeleteConversation(conversationId)
        if (deletedPanelWorkspaceId !== null) {
          const deleted = (await window.electronAPI.getDeletedConversations(
            deletedPanelWorkspaceId
          )) as Conversation[]
          setDeletedConversations(deleted)
          if (deleted.length === 0) setDeletedPanelWorkspaceId(null)
        }
      } catch (err) {
        console.error('Failed to permanently delete conversation:', err)
      }
    },
    [deletedPanelWorkspaceId]
  )

  const handleConvContextMenu = useCallback((e: React.MouseEvent, conversationId: number) => {
    e.preventDefault()
    e.stopPropagation()
    setConvContextMenu({ conversationId, x: e.clientX, y: e.clientY })
  }, [])

  const handleConvContextMenuDelete = useCallback(async () => {
    if (!convContextMenu) return
    const id = convContextMenu.conversationId
    setConvContextMenu(null)
    try {
      await window.electronAPI.deleteConversation(id)
      onDeleteConversation(id)
      await loadData()
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }, [convContextMenu, loadData, onDeleteConversation])

  const handleConvContextMenuToggleReview = useCallback(async () => {
    if (!convContextMenu) return
    const id = convContextMenu.conversationId
    // Find the conversation to check its current needs_review status
    const conv = Object.values(conversations)
      .flat()
      .find((c) => c.id === id)
    const currentlyNeedsReview = conv?.needs_review ?? 0
    setConvContextMenu(null)
    try {
      await window.electronAPI.setConversationNeedsReview(id, !currentlyNeedsReview)
      await loadData()
    } catch (err) {
      console.error('Failed to toggle needs review:', err)
    }
  }, [convContextMenu, conversations, loadData])

  const handleConvContextMenuCopyId = useCallback(() => {
    if (!convContextMenu) return
    navigator.clipboard.writeText(String(convContextMenu.conversationId))
    setConvContextMenu(null)
  }, [convContextMenu])

  // Close menus on outside click
  useEffect(() => {
    if (menuOpenForWorkspace === null && convContextMenu === null) return
    const handleClick = (): void => {
      setMenuOpenForWorkspace(null)
      setConvContextMenu(null)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [menuOpenForWorkspace, convContextMenu])

  return (
    <div style={styles.sidebar}>
      {/* Drag region for macOS title bar */}
      <div style={styles.dragRegion} />

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>Workspaces</span>
        <div style={styles.headerButtons}>
          <button style={styles.addButton} onClick={handleAddWorkspace}>
            + Add
          </button>
          <button
            style={{
              ...styles.gearButton,
              ...(settingsOpen ? { color: 'var(--text-bright)' } : {})
            }}
            onClick={() => setSettingsOpen((prev) => !prev)}
            title="Settings"
          >
            &#9881;
          </button>
        </div>
      </div>

      {/* Workspace list */}
      <div style={styles.list}>
        {workspaces.map((workspace) => {
          const isExpanded = expandedWorkspaces.has(workspace.id)
          const wsConversations = conversations[workspace.id] || []

          return (
            <div key={workspace.id}>
              {/* Workspace row */}
              <div
                style={styles.workspaceRow}
                onClick={() => toggleWorkspace(workspace.id)}
                title={workspace.path}
              >
                <span style={styles.toggle}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
                <span style={styles.workspaceName}>{workspace.name}</span>
                <button
                  style={styles.newConvButton}
                  onClick={(e) => handleNewConversation(e, workspace)}
                  title="New conversation"
                >
                  +
                </button>
                <div style={styles.menuContainer}>
                  <button
                    style={styles.menuButton}
                    onClick={(e) => toggleMenu(e, workspace.id)}
                    title="Workspace options"
                  >
                    ⋮
                  </button>
                  {menuOpenForWorkspace === workspace.id && (
                    <div style={styles.dropdown}>
                      <button
                        style={styles.dropdownItem}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(workspace.path)
                          setMenuOpenForWorkspace(null)
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = 'var(--bg-active)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'transparent')
                        }
                      >
                        Copy Path
                      </button>
                      <button
                        style={styles.dropdownItem}
                        onClick={(e) => handleViewDeleted(e, workspace.id)}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = 'var(--bg-active)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'transparent')
                        }
                      >
                        View Completed Conversations
                      </button>
                      {onOpenBrain && (
                        <button
                          style={styles.dropdownItem}
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenForWorkspace(null)
                            onOpenBrain(workspace.path, workspace.name)
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor = 'var(--bg-active)')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = 'transparent')
                          }
                        >
                          View Learning
                        </button>
                      )}
                      <button
                        style={styles.dropdownItem}
                        onClick={(e) => handleRemoveWorkspace(e, workspace.id)}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = 'var(--bg-active)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'transparent')
                        }
                      >
                        Remove Workspace
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Conversation list */}
              {isExpanded &&
                wsConversations.map((conv) => {
                  const isActive = conv.id === activeConversationId
                  const isStreamingConv = conv.id === streamingConversationId
                  return (
                    <div
                      key={conv.id}
                      style={{
                        ...styles.conversationRow,
                        ...(isActive ? styles.conversationActive : {})
                      }}
                      onClick={() => onSelectConversation({ ...conv, workspacePath: workspace.path, workspaceName: workspace.name })}
                      onContextMenu={(e) => handleConvContextMenu(e, conv.id)}
                      title={conv.title}
                    >
                      {isStreamingConv || conv.last_message_role === 'user' ? (
                        <SpinnerIcon />
                      ) : conv.awaiting_response ? (
                        <AwaitingResponseIcon />
                      ) : conv.needs_review ? (
                        <NeedsReviewIcon />
                      ) : (conv.message_count ?? 0) > 0 ? (
                        <CheckIcon />
                      ) : null}
                      <span style={styles.conversationTitle}>{conv.title}</span>
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>

      {/* Settings panel */}
      {settingsOpen && (
        <div style={styles.settingsPanel}>
          <div style={styles.settingsTitle}>Settings</div>
          <div style={styles.settingsRow}>
            <span style={styles.settingsLabel}>Default model</span>
            <ModelSelector value={defaultModel} onChange={onDefaultModelChange} />
          </div>
          <div style={styles.settingsRow}>
            <span style={styles.settingsLabel}>Execution mode</span>
            <select
              value={executionMode}
              onChange={handleExecutionModeChange}
              style={{
                fontSize: '12px',
                padding: '3px 6px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ask">Ask each time</option>
              <option value="subagent">Always Subagent-Driven</option>
              <option value="parallel">Always Parallel Session</option>
            </select>
          </div>
          <div style={{ ...styles.settingsRow, flexDirection: 'column', alignItems: 'stretch' }}>
            <span style={styles.settingsLabel}>Voice transcription</span>
            {whisperStatus.modelDownloaded ? (
              <span style={{ fontSize: '11px', color: '#98c379' }}>
                &#10003; Model ready
              </span>
            ) : downloadProgress !== null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div
                  style={{
                    height: '4px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${downloadProgress}%`,
                      backgroundColor: 'var(--accent-color)',
                      transition: 'width 0.2s'
                    }}
                  />
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  Downloading model... {downloadProgress}%
                </span>
              </div>
            ) : (
              <button
                onClick={handleDownloadModel}
                style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  backgroundColor: 'var(--accent-color)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Download Model (142 MB)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Conversation context menu */}
      {convContextMenu && (
        <div
          style={{
            ...styles.dropdown,
            position: 'fixed',
            top: convContextMenu.y,
            left: convContextMenu.x,
            width: 'max-content'
          }}
        >
          <button
            style={styles.dropdownItem}
            onClick={handleConvContextMenuCopyId}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--bg-active)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'transparent')
            }
          >
            Copy Conversation ID
          </button>
          <button
            style={styles.dropdownItem}
            onClick={handleConvContextMenuToggleReview}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--bg-active)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'transparent')
            }
          >
            {(() => {
              const conv = Object.values(conversations)
                .flat()
                .find((c) => c.id === convContextMenu.conversationId)
              return conv?.needs_review ? 'Review Completed' : 'Needs Review'
            })()}
          </button>
          <button
            style={{ ...styles.dropdownItem, color: '#e06c75' }}
            onClick={handleConvContextMenuDelete}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--bg-active)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'transparent')
            }
          >
            Mark Completed
          </button>
        </div>
      )}

      {/* Remove workspace confirmation dialog */}
      {confirmRemoveWorkspaceId !== null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setConfirmRemoveWorkspaceId(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '20px',
              width: '340px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-bright)',
                marginBottom: '8px'
              }}
            >
              Remove Workspace
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: '1.5',
                marginBottom: '20px'
              }}
            >
              Are you sure? All conversations in this workspace will be permanently deleted.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                style={{
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  padding: '6px 14px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'transparent'
                }}
                onClick={() => setConfirmRemoveWorkspaceId(null)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                Cancel
              </button>
              <button
                style={{
                  fontSize: '12px',
                  color: '#fff',
                  padding: '6px 14px',
                  border: '1px solid #e06c75',
                  borderRadius: '4px',
                  backgroundColor: '#e06c75'
                }}
                onClick={handleConfirmRemoveWorkspace}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = '#c75a63')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = '#e06c75')
                }
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deleted conversations panel */}
      {deletedPanelWorkspaceId !== null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setDeletedPanelWorkspaceId(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '16px',
              width: '400px',
              maxHeight: '60vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}
              >
                Deleted Conversations
              </span>
              <button
                style={{
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  padding: '2px 6px'
                }}
                onClick={() => setDeletedPanelWorkspaceId(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {deletedConversations.length === 0 ? (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    padding: '20px 0'
                  }}
                >
                  No deleted conversations
                </div>
              ) : (
                deletedConversations.map((conv) => (
                  <div
                    key={conv.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px',
                      borderBottom: '1px solid var(--border-color)',
                      gap: '8px'
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={`ID: ${conv.id} — ${conv.title}`}
                    >
                      {conv.title}
                    </span>
                    <button
                      style={{
                        fontSize: '11px',
                        color: '#98c379',
                        padding: '2px 8px',
                        border: '1px solid #98c379',
                        borderRadius: '3px',
                        flexShrink: 0
                      }}
                      onClick={() => handleRestoreConversation(conv.id)}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'rgba(152, 195, 121, 0.15)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = 'transparent')
                      }
                    >
                      Restore
                    </button>
                    <button
                      style={{
                        fontSize: '11px',
                        color: '#e06c75',
                        padding: '2px 8px',
                        border: '1px solid #e06c75',
                        borderRadius: '3px',
                        flexShrink: 0
                      }}
                      onClick={() => handlePermanentlyDelete(conv.id)}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'rgba(224, 108, 117, 0.15)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = 'transparent')
                      }
                    >
                      Delete Forever
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Sidebar
