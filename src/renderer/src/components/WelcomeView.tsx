import React from 'react'

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px',
    color: 'var(--text-secondary)'
  },
  heading: {
    fontSize: '24px',
    fontWeight: 600,
    color: 'var(--text-bright)',
    marginBottom: '12px'
  },
  text: {
    fontSize: '14px',
    lineHeight: '1.6',
    textAlign: 'center' as const,
    maxWidth: '400px'
  }
}

function WelcomeView(): React.JSX.Element {
  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Welcome to Singularity</h1>
      <p style={styles.text}>
        Add a workspace from the sidebar to get started, then begin a new conversation.
      </p>
    </div>
  )
}

export default WelcomeView
