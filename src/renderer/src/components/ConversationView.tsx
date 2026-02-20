import React, { useState, useEffect, useRef, useCallback } from 'react'
import MessageBubble from './MessageBubble'
import { parseExecutionModeOptions } from './MessageBubble'
import ModelSelector from './ModelSelector'
import ThinkingIndicator from './ThinkingIndicator'
import ToolActivityIndicator from './ToolActivityIndicator'
import EphemeralText from './EphemeralText'

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
  onStreamingStateChange?: (conversationId: number, isStreaming: boolean) => void
  draft?: string
  onDraftChange?: (conversationId: number, text: string) => void
  onLearnFromThis?: (content: string, sentiment: 'positive' | 'negative') => void
  onReportProblem?: (sourceConversationId: number, description: string, screenshotPath?: string) => void
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

function buildWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = samples.length * (bitsPerSample / 8)

  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  return buffer
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
  messagesAreaWrapper: {
    position: 'relative' as const,
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden'
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    padding: '20px 0'
  },
  scrollToBottomButton: {
    position: 'absolute' as const,
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(60, 60, 60, 0.9)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-bright)',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    zIndex: 10,
    transition: 'background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease'
  },
  inputBar: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    flexShrink: 0,
    alignItems: 'flex-end'
  },
  textarea: {
    flex: 1,
    minHeight: '40px',
    maxHeight: '120px',
    padding: '8px 12px',
    fontSize: '14px',
    lineHeight: '1.4',
    resize: 'none',
    overflowY: 'auto' as const
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
  stopButton: {
    alignSelf: 'flex-end',
    padding: '8px 16px',
    backgroundColor: 'var(--error-color)',
    color: 'var(--text-bright)',
    borderRadius: '4px',
    fontWeight: 500,
    fontSize: '13px'
  },
  queueButton: {
    alignSelf: 'flex-end',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    fontWeight: 500,
    fontSize: '13px'
  },
  micButton: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '2px solid var(--text-secondary)',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0
  },
  error: {
    padding: '8px 16px',
    margin: '8px 16px',
    backgroundColor: 'rgba(241, 76, 76, 0.1)',
    border: '1px solid var(--error-color)',
    borderRadius: '4px',
    color: 'var(--error-color)',
    fontSize: '13px'
  },
  retryBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 60px',
    fontSize: '13px',
    color: 'var(--text-secondary)'
  },
  retryButton: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    border: '1px solid var(--accent-color)',
    borderRadius: '4px',
    color: 'var(--accent-color)',
    cursor: 'pointer'
  },
  dismissButton: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    cursor: 'pointer'
  },
  failureDetails: {
    margin: '0 60px 8px',
    padding: '10px 12px',
    backgroundColor: 'rgba(241, 76, 76, 0.05)',
    border: '1px solid rgba(241, 76, 76, 0.2)',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    overflowX: 'auto' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const
  },
  reportDropdownContainer: {
    position: 'relative' as const,
    alignSelf: 'flex-end',
    display: 'flex'
  },
  reportButtonMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '8px 12px',
    backgroundColor: '#e8820c',
    color: 'var(--text-bright)',
    fontWeight: 500,
    fontSize: '13px',
    border: 'none',
    borderRadius: '4px 0 0 4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const
  },
  reportButtonCaret: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 6px',
    backgroundColor: '#e8820c',
    color: 'var(--text-bright)',
    border: 'none',
    borderLeft: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '0 4px 4px 0',
    cursor: 'pointer',
    fontSize: '10px'
  },
  reportDropdown: {
    position: 'absolute' as const,
    bottom: '100%',
    right: 0,
    marginBottom: '4px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: 100,
    minWidth: '200px',
    overflow: 'hidden'
  },
  reportDropdownItem: {
    padding: '8px 12px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
    width: '100%',
    textAlign: 'left' as const,
    display: 'block',
    whiteSpace: 'nowrap' as const
  },
  screenshotThumbnailContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    padding: '8px',
    backgroundColor: 'var(--bg-primary)',
    borderRadius: '4px',
    border: '1px solid var(--border-color)'
  },
  screenshotThumbnail: {
    width: '120px',
    borderRadius: '4px',
    border: '1px solid var(--border-color)'
  },
  screenshotLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary)'
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalCard: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '24px',
    width: '480px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-bright)',
    marginBottom: '4px'
  },
  modalSubtitle: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '16px'
  },
  modalTextarea: {
    width: '100%',
    minHeight: '100px',
    padding: '10px 12px',
    fontSize: '14px',
    lineHeight: '1.4',
    resize: 'vertical' as const,
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    outline: 'none',
    boxSizing: 'border-box' as const
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '16px'
  },
  modalCancel: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    cursor: 'pointer'
  },
  modalSend: {
    padding: '8px 16px',
    backgroundColor: '#e8820c',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--text-bright)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer'
  }
}

function ConversationView({
  conversationId,
  initialModel,
  onModelChange,
  onStreamingStateChange,
  draft = '',
  onDraftChange,
  onLearnFromThis,
  onReportProblem
}: ConversationViewProps): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState(draft)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [model, setModel] = useState(initialModel)
  const [error, setError] = useState<string | null>(null)
  const [streamingElapsed, setStreamingElapsed] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [toolActivity, setToolActivity] = useState('')
  const [ephemeralText, setEphemeralText] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [failureDetails, setFailureDetails] = useState<Map<number, string>>(new Map())
  const [expandedDetails, setExpandedDetails] = useState<Set<number>>(new Set())
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportDescription, setReportDescription] = useState('')
  const [showReportDropdown, setShowReportDropdown] = useState(false)
  const [screenshotData, setScreenshotData] = useState<{ filePath: string; dataUrl: string } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const reportTextareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messageQueueRef = useRef<string[]>([])
  const isProcessingRef = useRef(false)
  const pendingMessagesRef = useRef<Message[]>([])
  const isRecordingRef = useRef(false)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioChunksRef = useRef<Float32Array[]>([])
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const userHasScrolledUpRef = useRef(false)
  const streamingContentRef = useRef('')

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    userHasScrolledUpRef.current = !isNearBottom
    setShowScrollButton((prev) => {
      const next = !isNearBottom
      return prev === next ? prev : next
    })
  }, [])

  // Load messages on mount or conversationId change, and restore streaming state
  useEffect(() => {
    // Clear renderer-side state for previous conversation
    setStreamingContent('')
    streamingContentRef.current = ''
    setToolActivity('')
    setEphemeralText('')
    setError(null)
    setFailureDetails(new Map())
    setExpandedDetails(new Set())
    messageQueueRef.current = []
    isProcessingRef.current = false
    pendingMessagesRef.current = []
    userHasScrolledUpRef.current = false
    setShowScrollButton(false)
    // Don't set isStreaming synchronously — determine it from backend state

    ;(async () => {
      try {
        const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
        setMessages(msgs)

        // Recover streaming state if the backend is still actively processing
        // this conversation (e.g. user switched away and back, or app reloaded).
        const content = await window.electronAPI.getStreamingState(conversationId)
        if (content !== null) {
          setIsStreaming(true)
          if (content) setStreamingContent(content)
        } else {
          const active = await window.electronAPI.isProcessActive(conversationId)
          setIsStreaming(active)
        }
      } catch (err) {
        setIsStreaming(false)
        setError(`Failed to load messages: ${err}`)
      }
    })()
  }, [conversationId])

  // Register stream listeners
  useEffect(() => {
    window.electronAPI.onStreamDelta((data) => {
      if (data.conversationId === conversationId) {
        // Clear ephemeral text — live streaming content takes over
        setEphemeralText('')
        setStreamingContent((prev) => {
          const next = prev + data.text
          streamingContentRef.current = next
          return next
        })
      }
    })

    window.electronAPI.onToolActivity((data) => {
      if (data.conversationId === conversationId) {
        setToolActivity(data.activity)
        // Preserve narration text as ephemeral before clearing
        if (streamingContentRef.current) {
          setEphemeralText(streamingContentRef.current)
        }
        setStreamingContent('')
        streamingContentRef.current = ''
      }
    })

    window.electronAPI.onStreamComplete(async (data) => {
      if (data.conversationId === conversationId) {
        setStreamingContent('')
        setEphemeralText('')
        setToolActivity('')
        // Only reset streaming if we're not processing a queue
        if (!isProcessingRef.current) {
          setIsStreaming(false)
        }
        try {
          const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
          setMessages([...msgs, ...pendingMessagesRef.current])

          // Auto-response: check if the latest assistant message contains
          // execution mode options and the user has a preference set
          const pref = await window.electronAPI.getSetting('execution_mode_preference', 'ask')
          if (pref && pref !== 'ask') {
            const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
            if (lastAssistant) {
              const detected = parseExecutionModeOptions(lastAssistant.content)
              if (detected) {
                const keyword = pref === 'subagent' ? /subagent/i : /parallel/i
                const matched = detected.options.find((opt) => keyword.test(opt.label))
                if (matched) {
                  const formatted = `${matched.number}. ${matched.label} — ${matched.description}`
                  setToastMessage(`Auto-selected: ${matched.label} (from Settings)`)
                  setTimeout(() => setToastMessage(null), 3000)
                  // Small delay so the user sees the message before auto-response
                  setTimeout(() => {
                    sendDirectMessage(formatted)
                  }, 500)
                }
              }
            }
          }
        } catch (err) {
          setError(`Failed to reload messages: ${err}`)
        }
      }
    })

    return () => {
      window.electronAPI.removeStreamListeners()
    }
  }, [conversationId, sendDirectMessage])

  // Auto-scroll on new messages or streaming content (only if user hasn't scrolled up)
  useEffect(() => {
    if (!userHasScrolledUpRef.current) {
      scrollToBottom()
    }
  }, [messages, streamingContent, ephemeralText, toolActivity, scrollToBottom])

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

  // Report streaming state changes to parent
  useEffect(() => {
    onStreamingStateChange?.(conversationId, isStreaming)
  }, [isStreaming, conversationId, onStreamingStateChange])

  // Focus textarea when conversation loads
  useEffect(() => {
    textareaRef.current?.focus()
  }, [conversationId])

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

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      // Use a gain node at 0 to prevent playback echo
      const silencer = audioContext.createGain()
      silencer.gain.value = 0

      audioChunksRef.current = []

      processor.onaudioprocess = (e): void => {
        audioChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }

      source.connect(processor)
      processor.connect(silencer)
      silencer.connect(audioContext.destination)

      isRecordingRef.current = true
      setIsRecording(true)
      setError(null)
    } catch (err) {
      setError(`Microphone access failed: ${err}`)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    isRecordingRef.current = false
    setIsRecording(false)

    processorRef.current?.disconnect()
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    const sampleRate = audioContextRef.current?.sampleRate ?? 48000
    audioContextRef.current?.close()

    const chunks = audioChunksRef.current
    audioChunksRef.current = []
    if (chunks.length === 0) return

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
    const samples = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      samples.set(chunk, offset)
      offset += chunk.length
    }

    const wavBuffer = buildWav(samples, sampleRate)

    setIsTranscribing(true)
    try {
      const text = await window.electronAPI.transcribeAudio(wavBuffer)
      const transcribed = text.trim()
      if (transcribed) {
        const currentInput = textareaRef.current?.value ?? ''
        const newValue = currentInput + (currentInput ? ' ' : '') + transcribed
        setInput(newValue)
        onDraftChange?.(conversationId, newValue)
      }
    } catch (err) {
      setError(`Transcription failed: ${err}`)
    } finally {
      setIsTranscribing(false)
    }
  }, [conversationId, onDraftChange])

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [startRecording, stopRecording])

  // Ctrl+Space shortcut for recording
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        toggleRecording()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggleRecording])

  // Cleanup audio resources on unmount
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioContextRef.current?.close()
    }
  }, [])

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || messageQueueRef.current.length === 0) return

    isProcessingRef.current = true
    setIsStreaming(true)
    setStreamingContent('')
    streamingContentRef.current = ''
    setToolActivity('')

    while (messageQueueRef.current.length > 0) {
      const nextMessage = messageQueueRef.current.shift()!
      setStreamingContent('')
      streamingContentRef.current = ''
      setToolActivity('')

      try {
        await window.electronAPI.sendMessage(conversationId, nextMessage, model)
        // This message is now in DB (ipc handler saves user + assistant)
        pendingMessagesRef.current.shift()
        const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
        setMessages([...msgs, ...pendingMessagesRef.current])
      } catch (err) {
        // User message was saved to DB even on error — capture partial
        // streaming content + error so the user can inspect what happened.
        const partialContent = streamingContentRef.current
        const detail = [
          `Error: ${err}`,
          partialContent ? `\nPartial response received:\n${partialContent}` : 'No response data was received.'
        ].join('\n')

        pendingMessagesRef.current.shift()
        setError(`Failed to send message: ${err}`)
        const msgs = (await window.electronAPI.getMessages(conversationId)) as Message[]
        setMessages([...msgs, ...pendingMessagesRef.current])

        // Associate failure detail with the latest user message in DB
        const lastUserMsg = msgs.filter((m) => m.role === 'user').pop()
        if (lastUserMsg) {
          setFailureDetails((prev) => new Map(prev).set(lastUserMsg.id, detail))
        }
      }
    }

    setIsStreaming(false)
    setStreamingContent('')
    isProcessingRef.current = false
  }, [conversationId, model])

  const sendDirectMessage = useCallback((text: string) => {
    setError(null)
    userHasScrolledUpRef.current = false
    setShowScrollButton(false)

    const optimisticMsg: Message = {
      id: Date.now(),
      conversation_id: conversationId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    }
    setMessages((prev) => [...prev, optimisticMsg])
    pendingMessagesRef.current.push(optimisticMsg)

    messageQueueRef.current.push(text)
    processQueue()
  }, [conversationId, processQueue])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    setInput('')
    onDraftChange?.(conversationId, '')
    sendDirectMessage(trimmed)
  }, [input, conversationId, sendDirectMessage, onDraftChange])

  const handleRetry = useCallback(async (orphanedMsg: Message) => {
    setError(null)
    userHasScrolledUpRef.current = false
    setShowScrollButton(false)

    // Delete the orphaned message from DB so sendMessage can save a fresh one
    await window.electronAPI.deleteMessage(orphanedMsg.id)

    // Re-add as optimistic message
    const optimisticMsg: Message = {
      id: Date.now(),
      conversation_id: conversationId,
      role: 'user',
      content: orphanedMsg.content,
      created_at: new Date().toISOString()
    }
    setMessages((prev) => [...prev.filter((m) => m.id !== orphanedMsg.id), optimisticMsg])
    pendingMessagesRef.current.push(optimisticMsg)

    messageQueueRef.current.push(orphanedMsg.content)
    processQueue()
  }, [conversationId, processQueue])

  const handleDismissOrphan = useCallback(async (orphanedMsg: Message) => {
    await window.electronAPI.deleteMessage(orphanedMsg.id)
    setMessages((prev) => prev.filter((m) => m.id !== orphanedMsg.id))
    setError(null)
  }, [])

  const handleStop = useCallback(() => {
    window.electronAPI.cancelMessage(conversationId)
  }, [conversationId])

  const handleAdd = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    setInput('')
    onDraftChange?.(conversationId, '')

    // Queue the follow-up, then cancel the current response.
    // processQueue's while loop will pick up the queued message
    // after the cancelled sendClaudeMessage promise resolves.
    sendDirectMessage(trimmed)
    window.electronAPI.cancelMessage(conversationId)
  }, [input, conversationId, sendDirectMessage, onDraftChange])

  const handleQueue = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return

    setInput('')
    onDraftChange?.(conversationId, '')
    sendDirectMessage(trimmed)
  }, [input, conversationId, sendDirectMessage, onDraftChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (isStreaming) {
          handleAdd()
        } else {
          handleSend()
        }
      }
    },
    [handleSend, handleAdd, isStreaming]
  )

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    onDraftChange?.(conversationId, value)
    resizeTextarea()
  }, [conversationId, onDraftChange, resizeTextarea])

  const handlePaste = useCallback(() => {
    // Defer resize to after the pasted content is applied to the textarea
    requestAnimationFrame(resizeTextarea)
  }, [resizeTextarea])

  const openReportModal = useCallback((screenshot?: { filePath: string; dataUrl: string } | null) => {
    setReportDescription('')
    setScreenshotData(screenshot ?? null)
    setShowReportModal(true)
    setTimeout(() => reportTextareaRef.current?.focus(), 50)
  }, [])

  const closeReportModal = useCallback(() => {
    setShowReportModal(false)
    setReportDescription('')
    setScreenshotData(null)
  }, [])

  const handleSendReport = useCallback(() => {
    const trimmed = reportDescription.trim()
    if (!trimmed || !onReportProblem) return
    onReportProblem(conversationId, trimmed, screenshotData?.filePath)
    closeReportModal()
  }, [reportDescription, conversationId, onReportProblem, closeReportModal, screenshotData])

  const handleScreenshotAndReport = useCallback(async () => {
    setShowReportDropdown(false)
    try {
      const result = await (window as any).electronAPI.captureScreenshot()
      openReportModal(result)
    } catch (err) {
      console.error('Failed to capture screenshot:', err)
      openReportModal()
    }
  }, [openReportModal])

  // Escape key closes report modal or dropdown
  useEffect(() => {
    if (!showReportModal && !showReportDropdown) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (showReportDropdown) setShowReportDropdown(false)
        else closeReportModal()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showReportModal, showReportDropdown, closeReportModal])

  // Click outside closes dropdown
  useEffect(() => {
    if (!showReportDropdown) return
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-report-dropdown]')) {
        setShowReportDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showReportDropdown])

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerLabel}>Model:</span>
        <ModelSelector value={model} onChange={handleModelChange} disabled={isStreaming} />
      </div>

      {/* Messages area */}
      <div style={styles.messagesAreaWrapper}>
        <div
          ref={messagesContainerRef}
          style={styles.messagesArea}
          onScroll={handleScroll}
        >
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
                  onLearnFromThis={onLearnFromThis}
                  onQuestionOptionClick={sendDirectMessage}
                />
              )

              // Show streaming content, ephemeral narration, tool activity, or thinking indicator
              if (isUnanswered && index === firstUnansweredIndex && isStreaming) {
                if (streamingContent) {
                  items.push(
                    <MessageBubble
                      key={`stream-${msg.id}`}
                      role="assistant"
                      content={streamingContent}
                    />
                  )
                } else if (ephemeralText) {
                  items.push(
                    <React.Fragment key={`ephemeral-${msg.id}`}>
                      <EphemeralText text={ephemeralText} />
                      {toolActivity && (
                        <ToolActivityIndicator activity={toolActivity} elapsed={streamingElapsed} />
                      )}
                    </React.Fragment>
                  )
                } else if (toolActivity) {
                  items.push(
                    <React.Fragment key={`tool-${msg.id}`}>
                      <ThinkingIndicator elapsed={streamingElapsed} />
                      <ToolActivityIndicator activity={toolActivity} elapsed={streamingElapsed} />
                    </React.Fragment>
                  )
                } else {
                  items.push(
                    <ThinkingIndicator key={`think-${msg.id}`} elapsed={streamingElapsed} />
                  )
                }
              }

              // Show retry bar for orphaned messages (not streaming, not in queue)
              if (isUnanswered && !isStreaming && !isProcessingRef.current) {
                const detail = failureDetails.get(msg.id)
                const isExpanded = expandedDetails.has(msg.id)
                items.push(
                  <div key={`retry-${msg.id}`}>
                    <div style={styles.retryBar}>
                      <span>Message never got a response.</span>
                      <button
                        style={styles.retryButton}
                        onClick={() => handleRetry(msg)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--accent-color)'
                          e.currentTarget.style.color = 'var(--text-bright)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = 'var(--accent-color)'
                        }}
                      >
                        Retry
                      </button>
                      {detail && (
                        <button
                          style={styles.dismissButton}
                          onClick={() => {
                            setExpandedDetails((prev) => {
                              const next = new Set(prev)
                              if (next.has(msg.id)) next.delete(msg.id)
                              else next.add(msg.id)
                              return next
                            })
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--text-secondary)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-color)'
                          }}
                        >
                          {isExpanded ? 'Hide Details' : 'Show Details'}
                        </button>
                      )}
                      <button
                        style={styles.dismissButton}
                        onClick={() => handleDismissOrphan(msg)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--text-secondary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-color)'
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                    {detail && isExpanded && (
                      <pre style={styles.failureDetails}>{detail}</pre>
                    )}
                  </div>
                )
              }

              return items
            })
          })()}
          {error && <div style={styles.error}>{error}</div>}
        </div>
        {showScrollButton && (
          <button
            onClick={() => {
              scrollToBottom()
              userHasScrolledUpRef.current = false
              setShowScrollButton(false)
            }}
            style={styles.scrollToBottomButton}
            title="Scroll to bottom"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent-color)'
              e.currentTarget.style.borderColor = 'var(--accent-color)'
              e.currentTarget.style.transform = 'translateX(-50%) scale(1.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(60, 60, 60, 0.9)'
              e.currentTarget.style.borderColor = 'var(--border-color)'
              e.currentTarget.style.transform = 'translateX(-50%)'
            }}
          >
            ↓
          </button>
        )}
        {toastMessage && (
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '8px 16px',
              backgroundColor: 'rgba(0, 120, 212, 0.9)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              zIndex: 11,
              whiteSpace: 'nowrap' as const
            }}
          >
            {toastMessage}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={styles.inputBar}>
        <button
          style={{
            ...styles.micButton,
            ...(isRecording
              ? { borderColor: '#e06c75', backgroundColor: '#e06c75' }
              : isTranscribing
                ? { borderColor: 'var(--accent-color)', opacity: 0.6 }
                : {})
          }}
          onClick={toggleRecording}
          disabled={isTranscribing}
          title={
            isRecording
              ? 'Stop recording (Ctrl+Space)'
              : isTranscribing
                ? 'Transcribing...'
                : 'Start recording (Ctrl+Space)'
          }
        >
          <span
            style={{
              width: isRecording ? '10px' : '12px',
              height: isRecording ? '10px' : '12px',
              borderRadius: isRecording ? '2px' : '50%',
              backgroundColor: isRecording
                ? 'white'
                : isTranscribing
                  ? 'var(--accent-color)'
                  : 'var(--text-secondary)',
              display: 'block'
            }}
          />
        </button>
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          value={input}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? 'Add to your thought...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
          rows={1}
        />
        {isStreaming ? (
          input.trim() ? (
            <>
              <button
                style={styles.sendButton}
                onClick={handleAdd}
                title="Stop current response and send this message"
              >
                Add
              </button>
              <button
                style={styles.queueButton}
                onClick={handleQueue}
                title="Send after current response finishes"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--text-secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                }}
              >
                Queue
              </button>
            </>
          ) : (
            <button
              style={styles.stopButton}
              onClick={handleStop}
              title="Stop AI response"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#d13438'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--error-color)'
              }}
            >
              Stop
            </button>
          )
        ) : (
          <button
            style={styles.sendButton}
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </button>
        )}
        <button
          style={styles.reportButton}
          onClick={openReportModal}
          title="Report Problem"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f59b2e'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#e8820c'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Report Problem
        </button>
      </div>

      {/* Report Problem Modal */}
      {showReportModal && (
        <div
          style={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReportModal()
          }}
        >
          <div style={styles.modalCard}>
            <div style={styles.modalTitle}>Report Problem</div>
            <div style={styles.modalSubtitle}>Conversation #{conversationId}</div>
            <textarea
              ref={reportTextareaRef}
              style={styles.modalTextarea}
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSendReport()
                }
              }}
              placeholder="Describe the problem..."
            />
            <div style={styles.modalActions}>
              <button
                style={styles.modalCancel}
                onClick={closeReportModal}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--text-secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                }}
              >
                Cancel
              </button>
              <button
                style={{
                  ...styles.modalSend,
                  ...(!reportDescription.trim() ? { opacity: 0.5, cursor: 'default' } : {})
                }}
                onClick={handleSendReport}
                disabled={!reportDescription.trim()}
                onMouseEnter={(e) => {
                  if (reportDescription.trim()) e.currentTarget.style.backgroundColor = '#f59b2e'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#e8820c'
                }}
              >
                Send Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConversationView
