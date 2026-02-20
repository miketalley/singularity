import React, { useState, useEffect, useRef } from 'react'

interface StatusBarProps {
  workspacePath: string | null
  currentModel: string | null
}

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

function shortenPath(fullPath: string): string {
  const home = fullPath.replace(/^\/Users\/[^/]+/, '~')
  return home
}

function getUsageColor(percent: number): string {
  if (percent <= 60) return '#4ec9b0'
  if (percent <= 85) return '#dcdcaa'
  return 'var(--error-color)'
}

function shortenModel(model: string): string {
  // e.g. "claude-sonnet-4-6" -> "sonnet-4-6"
  //      "claude-haiku-4-5-20251001" -> "haiku-4-5"
  return model
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '3px 12px',
    borderTop: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    flexShrink: 0,
    fontSize: 11,
    color: 'var(--text-secondary)',
    height: 24,
    gap: 16
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    overflow: 'hidden'
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0
  },
  item: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  separator: {
    color: 'var(--border-color)'
  }
}

export default function StatusBar({ workspacePath, currentModel }: StatusBarProps): React.JSX.Element {
  const [usagePercent, setUsagePercent] = useState<number | null>(null)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch usage data on mount and every 5 minutes
  useEffect(() => {
    const fetchUsage = async (): Promise<void> => {
      try {
        const data = await window.electronAPI.getUsageData()
        setUsagePercent(data.usedPercent)
      } catch {
        // Keep last known value
      }
    }

    fetchUsage()
    intervalRef.current = setInterval(fetchUsage, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Fetch git branch when workspace changes
  useEffect(() => {
    if (!workspacePath) {
      setGitBranch(null)
      return
    }

    const fetchBranch = async (): Promise<void> => {
      try {
        const branch = await window.electronAPI.getGitBranch(workspacePath)
        setGitBranch(branch)
      } catch {
        setGitBranch(null)
      }
    }

    fetchBranch()
  }, [workspacePath])

  const usageDisplay = usagePercent !== null ? `${usagePercent}%` : '--'
  const usageColor = usagePercent !== null ? getUsageColor(usagePercent) : 'var(--text-secondary)'

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        {workspacePath && (
          <span style={styles.item} title={workspacePath}>
            {shortenPath(workspacePath)}
          </span>
        )}
        {gitBranch && (
          <>
            <span style={styles.separator}>|</span>
            <span style={styles.item} title={`Branch: ${gitBranch}`}>
              {gitBranch}
            </span>
          </>
        )}
      </div>
      <div style={styles.right}>
        {currentModel && (
          <>
            <span style={styles.item}>
              {shortenModel(currentModel)}
            </span>
            <span style={styles.separator}>|</span>
          </>
        )}
        <span style={{ ...styles.item, color: usageColor }}>
          Usage: {usageDisplay}
        </span>
      </div>
    </div>
  )
}
