import React from 'react'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100vw',
    padding: '40px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)'
  },
  heading: {
    fontSize: '28px',
    fontWeight: 600,
    color: 'var(--text-bright)',
    marginBottom: '16px'
  },
  text: {
    fontSize: '15px',
    lineHeight: '1.6',
    textAlign: 'center' as const,
    maxWidth: '520px',
    marginBottom: '24px',
    color: 'var(--text-secondary)'
  },
  code: {
    backgroundColor: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '14px',
    color: 'var(--accent-color)'
  },
  box: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '20px 24px',
    maxWidth: '520px',
    width: '100%',
    marginBottom: '20px'
  },
  boxLabel: {
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    color: 'var(--text-secondary)',
    marginBottom: '10px',
    letterSpacing: '0.5px'
  },
  codeBlock: {
    backgroundColor: 'var(--bg-tertiary)',
    padding: '12px 16px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '13px',
    color: 'var(--text-bright)',
    overflowX: 'auto' as const,
    whiteSpace: 'pre' as const
  },
  note: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    textAlign: 'center' as const,
    maxWidth: '520px',
    lineHeight: '1.5'
  }
}

function ApiKeyMissing(): React.JSX.Element {
  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>API Key Required</h1>
      <p style={styles.text}>
        To use Singularity, you need to set the{' '}
        <span style={styles.code}>ANTHROPIC_API_KEY</span> environment variable with your Anthropic
        API key.
      </p>
      <div style={styles.box}>
        <div style={styles.boxLabel}>Add to ~/.zshrc</div>
        <div style={styles.codeBlock}>
          {'export ANTHROPIC_API_KEY="sk-ant-...your-key-here"'}
        </div>
      </div>
      <p style={styles.note}>
        After adding the key, run <span style={styles.code}>source ~/.zshrc</span> in your terminal
        and restart Singularity.
      </p>
    </div>
  )
}

export default ApiKeyMissing
