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
}

interface SidebarProps {
  activeConversationId: number | null
  onSelectConversation: (conversation: Conversation) => void
  onNewConversation: (workspaceId: number) => void
  onDeleteConversation: (conversationId: number) => void
  refreshTrigger: number
  defaultModel: string
  onDefaultModelChange: (model: string) => void
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-width)',
    minWidth: 'var(--sidebar-width)',
    backgroundColor: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border-color)',
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
    padding: '4px 12px 4px 32px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
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
  deleteConvButton: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    padding: '0 4px',
    lineHeight: '1',
    flexShrink: 0,
    opacity: 0.5
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
  onDefaultModelChange
}: SidebarProps): React.JSX.Element {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [conversations, setConversations] = useState<Record<number, Conversation[]>>({})
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<number>>(new Set())
  const [menuOpenForWorkspace, setMenuOpenForWorkspace] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
    (e: React.MouseEvent, workspaceId: number) => {
      e.stopPropagation()
      onNewConversation(workspaceId)
    },
    [onNewConversation]
  )

  const handleRemoveWorkspace = useCallback(
    async (e: React.MouseEvent, workspaceId: number) => {
      e.stopPropagation()
      setMenuOpenForWorkspace(null)
      try {
        await window.electronAPI.deleteWorkspace(workspaceId)
        await loadData()
      } catch (err) {
        console.error('Failed to remove workspace:', err)
      }
    },
    [loadData]
  )

  const handleDeleteConversation = useCallback(
    async (e: React.MouseEvent, conversationId: number) => {
      e.stopPropagation()
      try {
        await window.electronAPI.deleteConversation(conversationId)
        onDeleteConversation(conversationId)
        await loadData()
      } catch (err) {
        console.error('Failed to delete conversation:', err)
      }
    },
    [loadData, onDeleteConversation]
  )

  const toggleMenu = useCallback((e: React.MouseEvent, workspaceId: number) => {
    e.stopPropagation()
    setMenuOpenForWorkspace((prev) => (prev === workspaceId ? null : workspaceId))
  }, [])

  // Close menu on outside click
  useEffect(() => {
    if (menuOpenForWorkspace === null) return
    const handleClick = (): void => setMenuOpenForWorkspace(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [menuOpenForWorkspace])

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
                  onClick={(e) => handleNewConversation(e, workspace.id)}
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
                  return (
                    <div
                      key={conv.id}
                      style={{
                        ...styles.conversationRow,
                        ...(isActive ? styles.conversationActive : {})
                      }}
                      onClick={() => onSelectConversation(conv)}
                      title={conv.title}
                    >
                      <span style={styles.conversationTitle}>{conv.title}</span>
                      <button
                        style={styles.deleteConvButton}
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
                        title="Delete conversation"
                      >
                        ✕
                      </button>
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
        </div>
      )}
    </div>
  )
}

export default Sidebar
