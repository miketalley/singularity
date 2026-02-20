import React from 'react'

interface EphemeralTextProps {
  text: string
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '4px 16px'
  },
  text: {
    fontStyle: 'italic',
    color: 'var(--text-secondary)',
    opacity: 0.7,
    fontSize: '13px',
    lineHeight: '1.5'
  }
}

function EphemeralText({ text }: EphemeralTextProps): React.JSX.Element {
  return (
    <div style={styles.row}>
      <span data-testid="ephemeral-text" style={styles.text}>
        {text}
      </span>
    </div>
  )
}

export default EphemeralText
