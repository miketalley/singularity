import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
}

const styles: Record<string, React.CSSProperties> = {
  userRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '4px 16px'
  },
  assistantRow: {
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '4px 16px'
  },
  userBubble: {
    backgroundColor: 'var(--user-bubble)',
    color: 'var(--text-bright)',
    padding: '10px 14px',
    borderRadius: '12px 12px 2px 12px',
    maxWidth: '75%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '14px',
    lineHeight: '1.5'
  },
  assistantBubble: {
    backgroundColor: 'var(--assistant-bubble)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    borderRadius: '12px 12px 12px 2px',
    maxWidth: '75%',
    wordBreak: 'break-word',
    fontSize: '14px',
    lineHeight: '1.5'
  },
  inlineCode: {
    backgroundColor: 'var(--bg-hover)',
    padding: '2px 5px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '13px'
  }
}

function MessageBubble({ role, content }: MessageBubbleProps): React.JSX.Element {
  if (role === 'user') {
    return (
      <div style={styles.userRow}>
        <div style={styles.userBubble}>{content}</div>
      </div>
    )
  }

  return (
    <div style={styles.assistantRow}>
      <div style={styles.assistantBubble} className="markdown-body">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...rest }) {
              const match = /language-(\w+)/.exec(className || '')
              if (match) {
                return (
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      margin: '8px 0',
                      borderRadius: '4px',
                      fontSize: '13px'
                    }}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                )
              }
              return (
                <code style={styles.inlineCode} className={className} {...rest}>
                  {children}
                </code>
              )
            }
          }}
        >
          {content}
        </Markdown>
      </div>
    </div>
  )
}

export default MessageBubble
