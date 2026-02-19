import React, { useState, useEffect, useCallback } from 'react'

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
  refreshTrigger: number
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
  }
}

function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  refreshTrigger
}: SidebarProps): React.JSX.Element {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [conversations, setConversations] = useState<Record<number, Conversation[]>>({})
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<number>>(new Set())

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

  return (
    <div style={styles.sidebar}>
      {/* Drag region for macOS title bar */}
      <div style={styles.dragRegion} />

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>Workspaces</span>
        <button style={styles.addButton} onClick={handleAddWorkspace}>
          + Add
        </button>
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
                      {conv.title}
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Sidebar
