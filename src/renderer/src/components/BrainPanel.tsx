import React, { useState, useEffect, useCallback } from 'react'

interface BrainEntry {
  text: string
  category: string
}

interface BrainPanelProps {
  workspacePath: string | null
  workspaceName: string
  isOpen: boolean
  onClose: () => void
  proposedEntries?: BrainEntry[]
  isExtracting?: boolean
  extractionMessage?: string | null
}

const DEFAULT_CATEGORIES = ['Tech Stack', 'Architecture', 'Conventions', 'Gotchas']

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    width: '380px',
    minWidth: '380px',
    height: '100%',
    backgroundColor: 'var(--bg-secondary)',
    borderLeft: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative'
  },
  collapseButton: {
    position: 'absolute' as const,
    left: '-1px',
    top: '50%',
    transform: 'translateX(-50%) translateY(-50%)',
    width: '20px',
    height: '48px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px 0 0 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 201,
    padding: 0,
    color: 'var(--text-secondary)',
    fontSize: '14px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid var(--border-color)',
    flexShrink: 0
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-bright)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  headerMeta: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontWeight: 400
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px'
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
    marginTop: '16px'
  },
  proposedCard: {
    backgroundColor: 'rgba(0, 120, 212, 0.08)',
    border: '1px solid rgba(0, 120, 212, 0.2)',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '8px'
  },
  entryCard: {
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '8px 10px',
    marginBottom: '6px'
  },
  entryText: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.4',
    marginBottom: '6px'
  },
  entryInput: {
    width: '100%',
    fontSize: '13px',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    padding: '6px 8px',
    marginBottom: '6px',
    lineHeight: '1.4',
    resize: 'vertical' as const,
    minHeight: '32px',
    fontFamily: 'inherit'
  },
  entryActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  categorySelect: {
    fontSize: '11px',
    padding: '3px 6px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '3px',
    flex: 1,
    cursor: 'pointer'
  },
  approveButton: {
    fontSize: '11px',
    padding: '3px 10px',
    backgroundColor: 'rgba(152, 195, 121, 0.15)',
    color: '#98c379',
    border: '1px solid rgba(152, 195, 121, 0.3)',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  deleteButton: {
    fontSize: '11px',
    padding: '3px 10px',
    backgroundColor: 'rgba(224, 108, 117, 0.1)',
    color: '#e06c75',
    border: '1px solid rgba(224, 108, 117, 0.2)',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  editButton: {
    fontSize: '11px',
    padding: '3px 8px',
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color)',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  saveButton: {
    fontSize: '11px',
    padding: '3px 10px',
    backgroundColor: 'rgba(0, 120, 212, 0.15)',
    color: 'var(--accent-hover)',
    border: '1px solid rgba(0, 120, 212, 0.3)',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  addButton: {
    width: '100%',
    padding: '8px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: '1px dashed var(--border-color)',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '8px'
  },
  categoryHeading: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--accent-hover)',
    marginTop: '14px',
    marginBottom: '6px',
    paddingBottom: '4px',
    borderBottom: '1px solid var(--border-color)'
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '32px 16px',
    color: 'var(--text-secondary)',
    fontSize: '13px'
  },
  extractingState: {
    textAlign: 'center' as const,
    padding: '20px 16px',
    color: 'var(--accent-hover)',
    fontSize: '13px'
  },
  warning: {
    padding: '8px 12px',
    margin: '0 0 12px 0',
    backgroundColor: 'rgba(229, 192, 123, 0.1)',
    border: '1px solid rgba(229, 192, 123, 0.3)',
    borderRadius: '6px',
    fontSize: '11px',
    color: '#e5c07b'
  },
  newCategoryInput: {
    fontSize: '11px',
    padding: '3px 6px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--accent-color)',
    borderRadius: '3px',
    flex: 1
  }
}

function CategoryDropdown({
  value,
  categories,
  onChange
}: {
  value: string
  categories: string[]
  onChange: (category: string) => void
}): React.JSX.Element {
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])]

  if (isCreatingNew) {
    return (
      <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
        <input
          style={styles.newCategoryInput}
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="New category..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newCategory.trim()) {
              onChange(newCategory.trim())
              setIsCreatingNew(false)
              setNewCategory('')
            }
            if (e.key === 'Escape') {
              setIsCreatingNew(false)
              setNewCategory('')
            }
          }}
        />
        <button
          style={{ ...styles.saveButton, padding: '2px 6px' }}
          onClick={() => {
            if (newCategory.trim()) {
              onChange(newCategory.trim())
              setIsCreatingNew(false)
              setNewCategory('')
            }
          }}
        >
          OK
        </button>
      </div>
    )
  }

  return (
    <select
      style={styles.categorySelect}
      value={value}
      onChange={(e) => {
        if (e.target.value === '__new__') {
          setIsCreatingNew(true)
        } else {
          onChange(e.target.value)
        }
      }}
    >
      {allCategories.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
      <option value="__new__">+ New category...</option>
    </select>
  )
}

function BrainPanel({
  workspacePath,
  workspaceName,
  isOpen,
  onClose,
  proposedEntries = [],
  isExtracting = false,
  extractionMessage = null
}: BrainPanelProps): React.JSX.Element | null {
  const [entries, setEntries] = useState<BrainEntry[]>([])
  const [tokenEstimate, setTokenEstimate] = useState(0)
  const [threshold, setThreshold] = useState(2000)
  const [proposed, setProposed] = useState<BrainEntry[]>([])
  const [editingIndex, setEditingIndex] = useState(-1)
  const [editText, setEditText] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newText, setNewText] = useState('')
  const [newCategory, setNewCategory] = useState('General')

  const existingCategories = [...new Set(entries.map((e) => e.category))]

  const loadBrain = useCallback(async () => {
    if (!workspacePath) return
    try {
      const data = await window.electronAPI.brainRead(workspacePath)
      setEntries(data.entries)
      setTokenEstimate(data.tokenEstimate)
      const t = await window.electronAPI.brainTokenThreshold()
      setThreshold(t)
    } catch (err) {
      console.error('Failed to load brain:', err)
    }
  }, [workspacePath])

  useEffect(() => {
    if (isOpen) {
      loadBrain()
    }
  }, [isOpen, loadBrain])

  useEffect(() => {
    setProposed(proposedEntries.map((e) => ({ ...e })))
  }, [proposedEntries])

  const handleApproveProposed = useCallback(
    async (index: number) => {
      if (!workspacePath) return
      const entry = proposed[index]
      try {
        await window.electronAPI.brainAppend(workspacePath, [entry])
        setProposed((prev) => prev.filter((_, i) => i !== index))
        await loadBrain()
      } catch (err) {
        console.error('Failed to approve entry:', err)
      }
    },
    [workspacePath, proposed, loadBrain]
  )

  const handleApproveAll = useCallback(async () => {
    if (!workspacePath || proposed.length === 0) return
    try {
      await window.electronAPI.brainAppend(workspacePath, proposed)
      setProposed([])
      await loadBrain()
    } catch (err) {
      console.error('Failed to approve all entries:', err)
    }
  }, [workspacePath, proposed, loadBrain])

  const handleDeleteProposed = useCallback((index: number) => {
    setProposed((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleUpdateProposedText = useCallback((index: number, text: string) => {
    setProposed((prev) => prev.map((e, i) => (i === index ? { ...e, text } : e)))
  }, [])

  const handleUpdateProposedCategory = useCallback((index: number, category: string) => {
    setProposed((prev) => prev.map((e, i) => (i === index ? { ...e, category } : e)))
  }, [])

  const handleDeleteEntry = useCallback(
    async (index: number) => {
      if (!workspacePath) return
      try {
        await window.electronAPI.brainRemove(workspacePath, index)
        await loadBrain()
      } catch (err) {
        console.error('Failed to delete entry:', err)
      }
    },
    [workspacePath, loadBrain]
  )

  const handleStartEdit = useCallback(
    (index: number) => {
      setEditingIndex(index)
      setEditText(entries[index].text)
      setEditCategory(entries[index].category)
    },
    [entries]
  )

  const handleSaveEdit = useCallback(async () => {
    if (!workspacePath || editingIndex < 0) return
    try {
      await window.electronAPI.brainUpdate(workspacePath, editingIndex, {
        text: editText,
        category: editCategory
      })
      setEditingIndex(-1)
      await loadBrain()
    } catch (err) {
      console.error('Failed to update entry:', err)
    }
  }, [workspacePath, editingIndex, editText, editCategory, loadBrain])

  const handleAddNew = useCallback(async () => {
    if (!workspacePath || !newText.trim()) return
    try {
      await window.electronAPI.brainAppend(workspacePath, [
        { text: newText.trim(), category: newCategory }
      ])
      setNewText('')
      setNewCategory('General')
      setIsAddingNew(false)
      await loadBrain()
    } catch (err) {
      console.error('Failed to add entry:', err)
    }
  }, [workspacePath, newText, newCategory, loadBrain])

  // Group entries by category for display
  const grouped = new Map<string, Array<{ entry: BrainEntry; originalIndex: number }>>()
  entries.forEach((entry, index) => {
    if (!grouped.has(entry.category)) {
      grouped.set(entry.category, [])
    }
    grouped.get(entry.category)!.push({ entry, originalIndex: index })
  })

  const hasProposed = proposed.length > 0 || isExtracting || !!extractionMessage

  return (
    <div style={styles.overlay}>
      {/* Collapse button on dividing line */}
      <button
        style={styles.collapseButton}
        onClick={onClose}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-bright)'
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
        }}
        title="Collapse panel"
      >
        &#x203A;
      </button>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span>&#x1F4D6;</span>
          <span>Learning: {workspaceName}</span>
          <span style={styles.headerMeta}>~{tokenEstimate} tokens</span>
        </div>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Token warning */}
        {tokenEstimate > threshold && (
          <div style={styles.warning}>
            Brain is getting large (~{tokenEstimate} tokens) -- consider pruning older entries
            for faster responses.
          </div>
        )}

        {/* Proposed entries (learning mode) */}
        {hasProposed && (
          <>
            <div style={{ ...styles.sectionTitle, marginTop: '4px' }}>
              {isExtracting ? 'Extracting memories...' : 'Proposed Memories'}
            </div>
            {isExtracting && (
              <div style={styles.extractingState}>Analyzing message...</div>
            )}
            {!isExtracting && extractionMessage && proposed.length === 0 && (
              <div style={{
                padding: '12px 16px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                backgroundColor: 'rgba(229, 192, 123, 0.08)',
                border: '1px solid rgba(229, 192, 123, 0.2)',
                borderRadius: '8px',
                lineHeight: '1.5'
              }}>
                {extractionMessage}
              </div>
            )}
            {proposed.map((entry, i) => (
              <div key={i} style={styles.proposedCard}>
                <textarea
                  style={{ ...styles.entryInput, marginBottom: '6px' }}
                  value={entry.text}
                  onChange={(e) => handleUpdateProposedText(i, e.target.value)}
                  rows={2}
                />
                <div style={styles.entryActions}>
                  <CategoryDropdown
                    value={entry.category}
                    categories={existingCategories}
                    onChange={(cat) => handleUpdateProposedCategory(i, cat)}
                  />
                  <button
                    style={styles.approveButton}
                    onClick={() => handleApproveProposed(i)}
                  >
                    Approve
                  </button>
                  <button
                    style={styles.deleteButton}
                    onClick={() => handleDeleteProposed(i)}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
            {proposed.length > 1 && (
              <button
                style={{
                  ...styles.approveButton,
                  width: '100%',
                  padding: '6px',
                  marginBottom: '8px'
                }}
                onClick={handleApproveAll}
              >
                Approve All ({proposed.length})
              </button>
            )}
          </>
        )}

        {/* Existing entries */}
        <div style={{ ...styles.sectionTitle, marginTop: hasProposed ? '16px' : '4px' }}>
          Existing Memories
        </div>

        {entries.length === 0 && !workspacePath && (
          <div style={styles.emptyState}>
            No workspace selected.
            <br />
            Select a conversation to view its workspace brain.
          </div>
        )}

        {entries.length === 0 && workspacePath && (
          <div style={styles.emptyState}>
            Brain is empty.
            <br />
            Use the brain icon on messages to start learning, or add entries manually.
          </div>
        )}

        {[...grouped.entries()].map(([category, items]) => (
          <div key={category}>
            <div style={styles.categoryHeading}>{category}</div>
            {items.map(({ entry, originalIndex }) =>
              editingIndex === originalIndex ? (
                <div key={originalIndex} style={styles.entryCard}>
                  <textarea
                    style={styles.entryInput}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <div style={styles.entryActions}>
                    <CategoryDropdown
                      value={editCategory}
                      categories={existingCategories}
                      onChange={setEditCategory}
                    />
                    <button style={styles.saveButton} onClick={handleSaveEdit}>
                      Save
                    </button>
                    <button
                      style={styles.editButton}
                      onClick={() => setEditingIndex(-1)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={originalIndex} style={styles.entryCard}>
                  <div style={styles.entryText}>{entry.text}</div>
                  <div style={styles.entryActions}>
                    <button
                      style={styles.editButton}
                      onClick={() => handleStartEdit(originalIndex)}
                    >
                      Edit
                    </button>
                    <button
                      style={styles.deleteButton}
                      onClick={() => handleDeleteEntry(originalIndex)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        ))}

        {/* Add new entry */}
        {isAddingNew ? (
          <div style={{ ...styles.proposedCard, marginTop: '12px' }}>
            <textarea
              style={styles.entryInput}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Enter a memory..."
              rows={2}
              autoFocus
            />
            <div style={styles.entryActions}>
              <CategoryDropdown
                value={newCategory}
                categories={existingCategories}
                onChange={setNewCategory}
              />
              <button style={styles.approveButton} onClick={handleAddNew}>
                Add
              </button>
              <button
                style={styles.editButton}
                onClick={() => {
                  setIsAddingNew(false)
                  setNewText('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            style={styles.addButton}
            onClick={() => setIsAddingNew(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-color)'
              e.currentTarget.style.color = 'var(--accent-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            + Add Memory
          </button>
        )}
      </div>
    </div>
  )
}

export default BrainPanel
