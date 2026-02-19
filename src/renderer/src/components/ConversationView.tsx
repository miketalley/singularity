import React, { useState, useEffect, useRef, useCallback } from 'react'
import MessageBubble from './MessageBubble'
import ModelSelector from './ModelSelector'
import ThinkingIndicator from './ThinkingIndicator'

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
  const [streamingElapsed, setStreamingElapsed] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messageQueueRef = useRef<string[]>([])
  const isProcessingRef = useRef(false)
  const pendingMessagesRef = useRef<Message[]>([])

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
    messageQueueRef.current = []
    isProcessingRef.current = false
    pendingMessagesRef.current = []
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
        // Only reset streaming if we're not processing a queue
        if (!isProcessingRef.current) {
          setIsStreaming(false)
        }
        try {
          const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
          setMessages([...msgs, ...pendingMessagesRef.current])
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

  // Track elapsed time while streaming
  useEffect(() => {
    if (!isStreaming) {
      setStreamingElapsed(0)
      return
    }
    const start = Date.now()
    setStreamingElapsed(0)
    const interval = setInterval(() => {
      setStreamingElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isStreaming])

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

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || messageQueueRef.current.length === 0) return

    isProcessingRef.current = true
    setIsStreaming(true)
    setStreamingContent('')

    while (messageQueueRef.current.length > 0) {
      const nextMessage = messageQueueRef.current.shift()!
      setStreamingContent('')

      try {
        await window.electronAPI.sendMessage(conversationId, nextMessage, model)
        // This message is now in DB (ipc handler saves user + assistant)
        pendingMessagesRef.current.shift()
        const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
        setMessages([...msgs, ...pendingMessagesRef.current])
      } catch (err) {
        // User message was saved to DB even on error
        pendingMessagesRef.current.shift()
        setError(`Failed to send message: ${err}`)
        const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
        setMessages([...msgs, ...pendingMessagesRef.current])
      }
    }

    setIsStreaming(false)
    setStreamingContent('')
    isProcessingRef.current = false
  }, [conversationId, model])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    setError(null)
    setInput('')

    // Optimistically add user message
    const optimisticMsg: Message = {
      id: Date.now(),
      conversation_id: conversationId,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString()
    }
    setMessages((prev) => [...prev, optimisticMsg])
    pendingMessagesRef.current.push(optimisticMsg)

    // Add to queue and start processing
    messageQueueRef.current.push(trimmed)
    processQueue()
  }, [input, conversationId, processQueue])

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
        {(() => {
          // Find the first unanswered user message
          let firstUnansweredIndex = -1
          for (let i = 0; i < messages.length; i++) {
            const isUnanswered =
              messages[i].role === 'user' &&
              (i === messages.length - 1 || messages[i + 1]?.role !== 'assistant')
            if (isUnanswered && firstUnansweredIndex === -1) {
              firstUnansweredIndex = i
            }
          }

          return messages.flatMap((msg, index) => {
            const items: React.ReactNode[] = []
            const isUnanswered =
              msg.role === 'user' &&
              (index === messages.length - 1 || messages[index + 1]?.role !== 'assistant')

            // Determine status for user message bubbles
            let status: 'pending' | 'queued' | undefined
            if (isUnanswered) {
              status = index === firstUnansweredIndex ? 'pending' : 'queued'
            }

            items.push(
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                status={status}
              />
            )

            // Show thinking indicator or streaming content after the active message
            if (isUnanswered && index === firstUnansweredIndex && isStreaming) {
              if (streamingContent) {
                items.push(
                  <MessageBubble
                    key={`stream-${msg.id}`}
                    role="assistant"
                    content={streamingContent}
                  />
                )
              } else {
                items.push(
                  <ThinkingIndicator key={`think-${msg.id}`} elapsed={streamingElapsed} />
                )
              }
            }

            return items
          })
        })()}
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
          rows={1}
        />
        <button
          style={styles.sendButton}
          onClick={handleSend}
          disabled={!input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default ConversationView
