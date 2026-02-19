import React, { useState, useEffect } from 'react'

interface ThinkingIndicatorProps {
  elapsed: number
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '4px 16px'
  },
  bubble: {
    backgroundColor: 'var(--assistant-bubble)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    padding: '10px 14px',
    borderRadius: '12px 12px 12px 2px',
    fontSize: '14px',
    lineHeight: '1.5',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  dotsContainer: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center'
  },
  elapsed: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    opacity: 0.7
  }
}

function ThinkingIndicator({ elapsed }: ThinkingIndicatorProps): React.JSX.Element {
  const [dotPhase, setDotPhase] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setDotPhase((prev) => (prev + 1) % 3)
    }, 400)
    return () => clearInterval(interval)
  }, [])

  const formatElapsed = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div style={styles.row}>
      <div style={styles.bubble}>
        <div style={styles.dotsContainer}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                fontSize: '18px',
                opacity: i === dotPhase ? 1 : 0.3,
                transition: 'opacity 0.2s ease'
              }}
            >
              ●
            </span>
          ))}
        </div>
        {elapsed >= 3 && <span style={styles.elapsed}>{formatElapsed(elapsed)}</span>}
      </div>
    </div>
  )
}

export default ThinkingIndicator
