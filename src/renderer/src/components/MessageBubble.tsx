import React, { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface QuestionOption {
  number: number
  label: string
  description: string
}

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  status?: 'pending' | 'queued'
  onLearnFromThis?: (content: string, sentiment: 'positive' | 'negative') => void
  onQuestionOptionClick?: (answer: string) => void
}

function parseQuestionBlocks(
  content: string
): Array<{ type: 'text' | 'question'; text: string }> {
  const parts: Array<{ type: 'text' | 'question'; text: string }> = []
  const regex = /\[QUESTION_BLOCK\]\n([\s\S]*?)\[\/QUESTION_BLOCK\]/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'question', text: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) })
  }
  return parts.length > 0 ? parts : [{ type: 'text', text: content }]
}

function parseQuestionOptions(text: string): {
  questionText: string
  options: QuestionOption[]
} {
  const lines = text.split('\n')
  const optionRegex = /^(\d+)\.\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/
  const options: QuestionOption[] = []
  const questionLines: string[] = []

  for (const line of lines) {
    const match = optionRegex.exec(line.trim())
    if (match) {
      options.push({
        number: parseInt(match[1]),
        label: match[2],
        description: match[3]
      })
    } else {
      questionLines.push(line)
    }
  }

  return {
    questionText: questionLines.join('\n').trim(),
    options
  }
}

function extractTrailingQuestion(content: string): {
  body: string
  trailingQuestion: string | null
} {
  // Don't extract from content that already has QUESTION_BLOCKs
  if (content.includes('[QUESTION_BLOCK]')) {
    return { body: content, trailingQuestion: null }
  }

  const paragraphs = content.split(/\n\n+/)

  // Walk backwards collecting paragraphs that end with '?'
  let questionStart = paragraphs.length
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const trimmed = paragraphs[i].trim()
    if (!trimmed) continue
    if (trimmed.endsWith('?')) {
      questionStart = i
    } else {
      break
    }
  }

  if (questionStart >= paragraphs.length) {
    return { body: content, trailingQuestion: null }
  }

  const body = paragraphs.slice(0, questionStart).join('\n\n')
  const trailingQuestion = paragraphs.slice(questionStart).join('\n\n')

  return { body, trailingQuestion }
}

interface ApproachBlock {
  label: string
  title: string
  recommended: boolean
  body: string
}

function parseApproachBlocks(text: string): {
  preamble: string
  approaches: ApproachBlock[]
  postamble: string
} | null {
  // Match approach/option headings: "Approach A: Title", "**Approach A:** Title", "### Approach A: Title"
  const headingRegex =
    /^(?:#{1,4}\s+)?(?:\*\*)?(?:Approach|Option)\s+([A-Za-z\d]+)[\s:*—–-]+(.+?)(?:\*\*)?$/gm

  const matches: Array<{
    index: number
    endIndex: number
    id: string
    title: string
    recommended: boolean
  }> = []
  let m
  while ((m = headingRegex.exec(text)) !== null) {
    const rawTitle = m[2].trim().replace(/\*+$/g, '')
    const recommended = /\(recommended\)/i.test(rawTitle)
    const title = rawTitle.replace(/\s*\(recommended\)\s*/i, '').trim()
    matches.push({
      index: m.index,
      endIndex: m.index + m[0].length,
      id: m[1],
      title,
      recommended
    })
  }

  if (matches.length < 2) return null

  const preamble = text.slice(0, matches[0].index).trim()
  const approaches: ApproachBlock[] = []

  for (let i = 0; i < matches.length; i++) {
    const bodyStart = matches[i].endIndex
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : text.length
    approaches.push({
      label: /^\d+$/.test(matches[i].id)
        ? `Option ${matches[i].id}`
        : `Approach ${matches[i].id}`,
      title: matches[i].title,
      recommended: matches[i].recommended,
      body: text.slice(bodyStart, bodyEnd).trim()
    })
  }

  // Separate recommendation paragraph from last approach body
  const last = approaches[approaches.length - 1]
  const recMatch = last.body.match(/\n\n(?=(?:my\s+)?recommendation[:\s])/i)
  let postamble = ''
  if (recMatch && recMatch.index !== undefined) {
    postamble = last.body.slice(recMatch.index).trim()
    last.body = last.body.slice(0, recMatch.index).trim()
  }

  return { preamble, approaches, postamble }
}

function parseNumberedOptions(text: string): {
  preamble: string
  options: Array<{ number: number; label: string; description: string }>
  postamble: string
} | null {
  // Only trigger when surrounding text suggests a choice
  const keywordPattern = /\b(approach|option|choose|prefer|select|which|strategy|method)\b/i
  if (!keywordPattern.test(text)) return null

  const itemRegex = /^(\d+)\.\s+(.+?)\s+[—–-]\s+(.+)$/gm
  const items: Array<{
    index: number
    endIndex: number
    number: number
    label: string
    description: string
  }> = []
  let match
  while ((match = itemRegex.exec(text)) !== null) {
    items.push({
      index: match.index,
      endIndex: match.index + match[0].length,
      number: parseInt(match[1]),
      label: match[2].trim(),
      description: match[3].trim()
    })
  }

  if (items.length < 2) return null

  const preamble = text.slice(0, items[0].index).trim()
  const postamble = text.slice(items[items.length - 1].endIndex).trim()

  return {
    preamble,
    options: items.map((item) => ({
      number: item.number,
      label: item.label,
      description: item.description
    })),
    postamble
  }
}

// Ensure ATX heading markers (e.g. ## ) that aren't at the start of a line
// get a blank line inserted before them so react-markdown parses them as headings.
function normalizeMarkdown(text: string): string {
  return text.replace(/([^\n])\n?(#{1,6} )/g, '$1\n\n$2')
}

const styles: Record<string, React.CSSProperties> = {
  userRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '6px 24px'
  },
  assistantRow: {
    display: 'flex',
    justifyContent: 'flex-start',
    padding: '6px 24px'
  },
  userBubble: {
    backgroundColor: 'var(--user-bubble)',
    color: 'var(--text-bright)',
    padding: '12px 16px',
    borderRadius: '16px 16px 4px 16px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '14px',
    lineHeight: '1.6',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
  },
  assistantBubble: {
    backgroundColor: 'var(--assistant-bubble)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    color: 'var(--text-primary)',
    padding: '14px 18px',
    borderRadius: '16px 16px 16px 4px',
    wordBreak: 'break-word',
    fontSize: '14px',
    lineHeight: '1.6',
    overflowX: 'auto',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
  },
  inlineCode: {
    backgroundColor: 'var(--bg-hover)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: '13px'
  },
  questionCard: {
    backgroundColor: 'rgba(0, 120, 212, 0.08)',
    border: '1px solid rgba(0, 120, 212, 0.2)',
    borderLeft: '3px solid var(--accent-color)',
    borderRadius: '8px',
    padding: '14px 16px',
    margin: '12px 0 4px 0'
  },
  questionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--accent-hover)'
  },
  trailingQuestionCard: {
    backgroundColor: 'rgba(229, 192, 123, 0.08)',
    border: '1px solid rgba(229, 192, 123, 0.2)',
    borderLeft: '3px solid #e5c07b',
    borderRadius: '8px',
    padding: '14px 16px',
    margin: '12px 0 4px 0'
  },
  trailingQuestionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '8px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#e5c07b'
  },
  approachCard: {
    padding: '12px 16px',
    marginTop: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, border-color 0.15s ease'
  },
  approachHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const
  },
  approachLabel: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: 'var(--accent-color)',
    color: 'var(--text-bright)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.3px'
  },
  approachRecommended: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(152, 195, 121, 0.2)',
    color: '#98c379',
    fontSize: '10px',
    fontWeight: 600
  },
  approachTitle: {
    fontWeight: 600,
    fontSize: '14px',
    color: 'var(--text-bright)',
    marginTop: '6px'
  },
  approachBody: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    marginTop: '4px',
    maxHeight: '60px',
    overflow: 'hidden',
    maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)'
  },
  optionCard: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
    padding: '10px 14px',
    marginTop: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, border-color 0.15s ease'
  },
  optionNumber: {
    flexShrink: 0,
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-color)',
    color: 'var(--text-bright)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700
  },
  optionContent: {
    flex: 1,
    minWidth: 0
  },
  optionLabel: {
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--text-bright)'
  },
  optionDescription: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
    lineHeight: '1.4'
  },
  customResponseRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '8px'
  },
  customResponseInput: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '13px',
    lineHeight: '1.4',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: 'var(--text-bright)',
    outline: 'none'
  },
  customResponseSend: {
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: 'var(--accent-color)',
    color: 'var(--text-bright)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background-color 0.15s ease'
  },
  statusLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
    paddingTop: '5px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '11px',
    opacity: 0.7
  },
  actionBar: {
    display: 'flex',
    padding: '2px 0 0 0',
    opacity: 0,
    pointerEvents: 'none' as const,
    transition: 'opacity 0.15s ease',
    height: '22px'
  },
  actionBarVisible: {
    opacity: 1,
    pointerEvents: 'auto' as const
  },
  feedbackButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    transition: 'color 0.15s ease, background-color 0.15s ease'
  }
}

function PulsingDot(): React.JSX.Element {
  const [on, setOn] = React.useState(true)
  React.useEffect(() => {
    const interval = setInterval(() => setOn((v) => !v), 600)
    return () => clearInterval(interval)
  }, [])
  return (
    <span
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: 'var(--accent-color)',
        opacity: on ? 1 : 0.3,
        transition: 'opacity 0.3s ease'
      }}
    />
  )
}

function FeedbackButton({
  icon,
  tooltip,
  hoverColor,
  onClick,
  align
}: {
  icon: string
  tooltip: string
  hoverColor: string
  onClick: () => void
  align: 'left' | 'right'
}): React.JSX.Element {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        style={styles.feedbackButton}
        onClick={onClick}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = hoverColor
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          setShowTooltip(true)
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-secondary)'
          e.currentTarget.style.backgroundColor = 'transparent'
          setShowTooltip(false)
        }}
      >
        {icon}
      </button>
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            ...(align === 'left' ? { left: 0 } : { right: 0 }),
            marginBottom: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: 'var(--text-bright)',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 300
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  )
}

function FeedbackActionBar({
  isVisible,
  align,
  onThumbsUp,
  onThumbsDown
}: {
  isVisible: boolean
  align: 'left' | 'right'
  onThumbsUp: () => void
  onThumbsDown: () => void
}): React.JSX.Element {
  return (
    <div
      style={{
        ...styles.actionBar,
        ...(isVisible ? styles.actionBarVisible : {}),
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start'
      }}
    >
      <FeedbackButton
        icon={'\u{1F44D}'}
        tooltip="Learn from this"
        hoverColor="#98c379"
        onClick={onThumbsUp}
        align={align}
      />
      <FeedbackButton
        icon={'\u{1F44E}'}
        tooltip="Learn what to avoid"
        hoverColor="#e06c75"
        onClick={onThumbsDown}
        align={align}
      />
    </div>
  )
}

function MessageBubble({
  role,
  content,
  status,
  onLearnFromThis,
  onQuestionOptionClick
}: MessageBubbleProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false)
  const [customResponse, setCustomResponse] = useState('')

  if (role === 'user') {
    return (
      <div style={styles.userRow}>
        <div
          style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: '95%' }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div style={styles.userBubble}>
            {content}
            {status === 'pending' && (
              <div style={styles.statusLine}>
                <PulsingDot /> Awaiting response...
              </div>
            )}
            {status === 'queued' && (
              <div style={{ ...styles.statusLine, opacity: 0.5 }}>
                <span style={{ fontSize: '10px' }}>&#9679;</span> Queued
              </div>
            )}
          </div>
          {onLearnFromThis && (
            <FeedbackActionBar
              isVisible={isHovered}
              align="right"
              onThumbsUp={() => onLearnFromThis(content, 'positive')}
              onThumbsDown={() => onLearnFromThis(content, 'negative')}
            />
          )}
        </div>
      </div>
    )
  }

  const segments = parseQuestionBlocks(content)

  const markdownComponents = {
    code({ className, children, ...rest }: { className?: string; children?: React.ReactNode }) {
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
  }

  return (
    <div style={styles.assistantRow}>
      <div
        style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '95%' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={styles.assistantBubble} className="markdown-body">
          {segments.map((seg, i) => {
            if (seg.type === 'question') {
              const { questionText, options } = parseQuestionOptions(seg.text)
              return (
                <div key={i} style={styles.questionCard}>
                  <div style={styles.questionHeader}>? Question</div>
                  {questionText && (
                    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {normalizeMarkdown(questionText)}
                    </Markdown>
                  )}
                  {options.length > 0
                    ? (
                        <>
                          {options.map((opt) => (
                            <div
                              key={opt.number}
                              style={styles.optionCard}
                              role="button"
                              tabIndex={0}
                              onClick={() => onQuestionOptionClick?.(`${opt.number}. ${opt.label} — ${opt.description}`)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onQuestionOptionClick?.(`${opt.number}. ${opt.label} — ${opt.description}`)
                                }
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(0, 120, 212, 0.12)'
                                e.currentTarget.style.borderColor = 'var(--accent-color)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                              }}
                            >
                              <span style={styles.optionNumber}>{opt.number}</span>
                              <div style={styles.optionContent}>
                                <div style={styles.optionLabel}>{opt.label}</div>
                                <div style={styles.optionDescription}>{opt.description}</div>
                              </div>
                            </div>
                          ))}
                          <div style={styles.customResponseRow}>
                            <input
                              style={styles.customResponseInput}
                              type="text"
                              placeholder="Other..."
                              value={customResponse}
                              onChange={(e) => setCustomResponse(e.target.value)}
                              onFocus={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent-color)'
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && customResponse.trim()) {
                                  onQuestionOptionClick?.(customResponse.trim())
                                  setCustomResponse('')
                                }
                              }}
                            />
                            <button
                              style={{
                                ...styles.customResponseSend,
                                ...(customResponse.trim() ? {} : { opacity: 0.4, cursor: 'default' })
                              }}
                              disabled={!customResponse.trim()}
                              onClick={() => {
                                if (customResponse.trim()) {
                                  onQuestionOptionClick?.(customResponse.trim())
                                  setCustomResponse('')
                                }
                              }}
                              onMouseEnter={(e) => {
                                if (customResponse.trim()) {
                                  e.currentTarget.style.backgroundColor = 'var(--accent-hover)'
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'var(--accent-color)'
                              }}
                            >
                              Send
                            </button>
                          </div>
                        </>
                      )
                    : (
                        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {normalizeMarkdown(seg.text)}
                        </Markdown>
                      )}
                </div>
              )
            }
            const { body, trailingQuestion } = extractTrailingQuestion(seg.text)
            const approachData = parseApproachBlocks(body)
            const numberedOptions = !approachData ? parseNumberedOptions(body) : null
            return (
              <React.Fragment key={i}>
                {approachData ? (
                  <>
                    {approachData.preamble && (
                      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {normalizeMarkdown(approachData.preamble)}
                      </Markdown>
                    )}
                    {approachData.approaches.map((approach, ai) => (
                      <div
                        key={ai}
                        style={styles.approachCard}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          onQuestionOptionClick?.(`${approach.label} - ${approach.title}`)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onQuestionOptionClick?.(`${approach.label} - ${approach.title}`)
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(0, 120, 212, 0.12)'
                          e.currentTarget.style.borderColor = 'var(--accent-color)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                        }}
                      >
                        <div style={styles.approachHeaderRow}>
                          <span style={styles.approachLabel}>{approach.label}</span>
                          {approach.recommended && (
                            <span style={styles.approachRecommended}>Recommended</span>
                          )}
                        </div>
                        <div style={styles.approachTitle}>{approach.title}</div>
                        {approach.body && (
                          <div style={styles.approachBody}>
                            {approach.body
                              .replace(/[*#`]/g, '')
                              .slice(0, 150)
                              .trim() + (approach.body.length > 150 ? '…' : '')}
                          </div>
                        )}
                      </div>
                    ))}
                    {approachData.postamble && (
                      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {normalizeMarkdown(approachData.postamble)}
                      </Markdown>
                    )}
                  </>
                ) : numberedOptions ? (
                  <>
                    {numberedOptions.preamble && (
                      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {normalizeMarkdown(numberedOptions.preamble)}
                      </Markdown>
                    )}
                    {numberedOptions.options.map((opt) => (
                      <div
                        key={opt.number}
                        style={styles.optionCard}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          onQuestionOptionClick?.(
                            `${opt.number}. ${opt.label} — ${opt.description}`
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onQuestionOptionClick?.(
                              `${opt.number}. ${opt.label} — ${opt.description}`
                            )
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            'rgba(0, 120, 212, 0.12)'
                          e.currentTarget.style.borderColor = 'var(--accent-color)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor =
                            'rgba(255, 255, 255, 0.04)'
                          e.currentTarget.style.borderColor =
                            'rgba(255, 255, 255, 0.08)'
                        }}
                      >
                        <span style={styles.optionNumber}>{opt.number}</span>
                        <div style={styles.optionContent}>
                          <div style={styles.optionLabel}>{opt.label}</div>
                          <div style={styles.optionDescription}>
                            {opt.description}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={styles.customResponseRow}>
                      <input
                        style={styles.customResponseInput}
                        type="text"
                        placeholder="Other..."
                        value={customResponse}
                        onChange={(e) => setCustomResponse(e.target.value)}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent-color)'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customResponse.trim()) {
                            onQuestionOptionClick?.(customResponse.trim())
                            setCustomResponse('')
                          }
                        }}
                      />
                      <button
                        style={{
                          ...styles.customResponseSend,
                          ...(customResponse.trim() ? {} : { opacity: 0.4, cursor: 'default' })
                        }}
                        disabled={!customResponse.trim()}
                        onClick={() => {
                          if (customResponse.trim()) {
                            onQuestionOptionClick?.(customResponse.trim())
                            setCustomResponse('')
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (customResponse.trim()) {
                            e.currentTarget.style.backgroundColor = 'var(--accent-hover)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--accent-color)'
                        }}
                      >
                        Send
                      </button>
                    </div>
                    {numberedOptions.postamble && (
                      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {normalizeMarkdown(numberedOptions.postamble)}
                      </Markdown>
                    )}
                  </>
                ) : body ? (
                  <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {normalizeMarkdown(body)}
                  </Markdown>
                ) : null}
                {trailingQuestion && (
                  <div style={styles.trailingQuestionCard}>
                    <div style={styles.trailingQuestionHeader}>? Response Needed</div>
                    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {normalizeMarkdown(trailingQuestion)}
                    </Markdown>
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>
        {onLearnFromThis && (
          <FeedbackActionBar
            isVisible={isHovered}
            align="left"
            onThumbsUp={() => onLearnFromThis(content, 'positive')}
            onThumbsDown={() => onLearnFromThis(content, 'negative')}
          />
        )}
      </div>
    </div>
  )
}

export default MessageBubble
