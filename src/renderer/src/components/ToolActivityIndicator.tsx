import React from 'react'

interface ToolActivityIndicatorProps {
  activity: string
  elapsed: number
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '2px 24px 2px 28px'
  },
  indicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    color: 'var(--text-secondary)',
    opacity: 0.8,
    padding: '4px 0'
  },
  bar: {
    display: 'inline-block',
    width: '3px',
    height: '12px',
    backgroundColor: 'var(--accent-color)',
    borderRadius: '1px',
    opacity: 0.6
  },
  elapsed: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    opacity: 0.5,
    marginLeft: '4px'
  }
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ToolActivityIndicator({
  activity,
  elapsed
}: ToolActivityIndicatorProps): React.JSX.Element {
  return (
    <div style={styles.row}>
      <div style={styles.indicator}>
        <span style={styles.bar} />
        <span>{activity}</span>
        {elapsed >= 3 && <span style={styles.elapsed}>{formatElapsed(elapsed)}</span>}
      </div>
    </div>
  )
}

export default ToolActivityIndicator
