import React, { useState, useEffect, useRef, useCallback } from 'react'
import MessageBubble from './MessageBubble'
import ModelSelector from './ModelSelector'

interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface ConversationViewProps {
  conversationId: number
  initialModel: string
  onModelChange: (model: string) => void
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    flexShrink: 0
  },
  headerLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)'
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 0'
  },
  inputBar: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    flexShrink: 0
  },
  textarea: {
    flex: 1,
    minHeight: '40px',
    maxHeight: '120px',
    padding: '8px 12px',
    fontSize: '14px',
    lineHeight: '1.4',
    resize: 'none'
  },
  sendButton: {
    alignSelf: 'flex-end',
    padding: '8px 16px',
    backgroundColor: 'var(--accent-color)',
    color: 'var(--text-bright)',
    borderRadius: '4px',
    fontWeight: 500,
    fontSize: '13px'
  },
  sendButtonHover: {
    backgroundColor: 'var(--accent-hover)'
  },
  error: {
    padding: '8px 16px',
    margin: '8px 16px',
    backgroundColor: 'rgba(241, 76, 76, 0.1)',
    border: '1px solid var(--error-color)',
    borderRadius: '4px',
    color: 'var(--error-color)',
    fontSize: '13px'
  }
}

function ConversationView({
  conversationId,
  initialModel,
  onModelChange
}: ConversationViewProps): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [model, setModel] = useState(initialModel)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Load messages on mount or conversationId change
  useEffect(() => {
    async function loadMessages(): Promise<void> {
      try {
        const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
        setMessages(msgs)
        setError(null)
      } catch (err) {
        setError(`Failed to load messages: ${err}`)
      }
    }
    loadMessages()
    setInput('')
    setStreamingContent('')
    setIsStreaming(false)
  }, [conversationId])

  // Register stream listeners
  useEffect(() => {
    window.electronAPI.onStreamDelta((data) => {
      if (data.conversationId === conversationId) {
        setStreamingContent((prev) => prev + data.text)
      }
    })

    window.electronAPI.onStreamComplete(async (data) => {
      if (data.conversationId === conversationId) {
        setStreamingContent('')
        setIsStreaming(false)
        try {
          const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
          setMessages(msgs)
        } catch (err) {
          setError(`Failed to reload messages: ${err}`)
        }
      }
    })

    return () => {
      window.electronAPI.removeStreamListeners()
    }
  }, [conversationId])

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, scrollToBottom])

  // Sync model from parent
  useEffect(() => {
    setModel(initialModel)
  }, [initialModel])

  const handleModelChange = useCallback(
    (newModel: string) => {
      setModel(newModel)
      onModelChange(newModel)
    },
    [onModelChange]
  )

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    setError(null)
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')

    // Optimistically add user message
    const optimisticMsg: Message = {
      id: Date.now(),
      conversation_id: conversationId,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString()
    }
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      await window.electronAPI.sendMessage(conversationId, trimmed, model)
    } catch (err) {
      setError(`Failed to send message: ${err}`)
      setIsStreaming(false)
      setStreamingContent('')
    }
  }, [input, isStreaming, conversationId, model])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [])

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>Model:</span>
        <ModelSelector value={model} onChange={handleModelChange} disabled={isStreaming} />
      </div>

      {/* Messages area */}
      <div style={styles.messagesArea}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {isStreaming && streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} />
        )}
        {error && <div style={styles.error}>{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={styles.inputBar}>
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          disabled={isStreaming}
          rows={1}
        />
        <button
          style={{
            ...styles.sendButton,
            ...(isStreaming ? { opacity: 0.5, cursor: 'not-allowed' } : {})
          }}
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default ConversationView
