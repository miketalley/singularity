import { spawn, ChildProcess } from 'child_process'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { log } from './logger'

// Track active processes per conversation so we can kill them if needed
const activeProcesses = new Map<number, ChildProcess>()

// Track conversations cancelled voluntarily (Stop/Add) so the close handler
// resolves with partial content instead of rejecting as an error.
const cancelledConversations = new Set<number>()

// Track accumulated streaming content per conversation so the renderer can
// recover it after navigating away and back.
const streamingState = new Map<number, string>()

export function getStreamingContent(conversationId: number): string | null {
  return streamingState.get(conversationId) ?? null
}

export function isProcessActive(conversationId: number): boolean {
  return activeProcesses.has(conversationId)
}

export function generateSessionId(): string {
  return randomUUID()
}

function shortenPath(filePath: unknown): string {
  if (typeof filePath !== 'string') return ''
  const parts = filePath.replace(/\\/g, '/').split('/')
  if (parts.length <= 2) return filePath
  return parts.slice(-2).join('/')
}

function truncate(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.length > maxLen ? value.slice(0, maxLen) + '...' : value
}

function formatToolActivity(name: string, input: unknown): string | null {
  const data = input as Record<string, unknown>
  switch (name) {
    case 'Read':
      return `Reading ${shortenPath(data.file_path) || 'file'}`
    case 'Write':
      return `Writing ${shortenPath(data.file_path) || 'file'}`
    case 'Edit':
      return `Editing ${shortenPath(data.file_path) || 'file'}`
    case 'Bash':
      return 'Running command'
    case 'Grep':
      return `Searching for "${truncate(data.pattern, 30)}"`
    case 'Glob':
      return `Finding files matching ${truncate(data.pattern, 30)}`
    case 'WebFetch':
      return 'Fetching web page'
    case 'WebSearch':
      return 'Searching the web'
    case 'Task':
      return 'Running subtask'
    case 'TodoWrite':
      return 'Updating task list'
    case 'AskUserQuestion':
      return null
    default:
      return `Using ${name}`
  }
}

function formatAskUserQuestion(input: unknown): string {
  const data = input as {
    questions?: Array<{
      question: string
      options: Array<{ label: string; description: string }>
    }>
  }
  if (!data?.questions?.length) return ''

  let formatted = '\n\n[QUESTION_BLOCK]\n'
  for (const q of data.questions) {
    formatted += `**${q.question}**\n\n`
    for (let i = 0; i < q.options.length; i++) {
      const opt = q.options[i]
      formatted += `${i + 1}. **${opt.label}** — ${opt.description}\n`
    }
  }
  formatted += '[/QUESTION_BLOCK]'
  return formatted
}

export async function sendClaudeMessage(
  conversationId: number,
  sessionId: string,
  message: string,
  workspacePath: string,
  model: string,
  window: BrowserWindow,
  isFirstMessage: boolean,
  brainContext?: string | null
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      message,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--model',
      model,
      '--permission-mode',
      'bypassPermissions'
    ]

    if (isFirstMessage) {
      args.push('--session-id', sessionId)
    } else {
      args.push('--resume', sessionId)
    }

    // Inject brain context as system prompt on first message
    if (isFirstMessage && brainContext) {
      args.push(
        '--append-system-prompt',
        `The following is known context about this project:\n\n${brainContext}\nUse this context to inform your responses.`
      )
    }

    // Remove env vars that interfere with a fresh Claude Code session:
    // - CLAUDECODE: prevents "cannot launch inside another session" error
    // - ANTHROPIC_API_KEY: when set to an OAuth token by parent Claude Code,
    //   the child process tries to use it as a regular API key and fails.
    //   Unsetting it lets the CLI use its own stored credentials.
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.ANTHROPIC_API_KEY

    log('cli', 'Spawning claude', { args, cwd: workspacePath, isFirstMessage })

    const child = spawn('claude', args, {
      cwd: workspacePath,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    activeProcesses.set(conversationId, child)
    streamingState.set(conversationId, '')
    log('cli', `Process spawned with PID ${child.pid}`)

    let fullResponse = ''
    let buffer = ''
    const processedToolUses = new Set<string>()
    let hasQuestionBlock = false
    let needsSeparatorBeforeNextText = false

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      buffer += chunk

      // Process complete lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const event = JSON.parse(line) as Record<string, unknown>
          const eventType = event.type as string
          const eventSubtype = event.subtype as string | undefined

          // Log non-stream events (stream_events are too frequent)
          if (eventType !== 'stream_event') {
            log('cli-event', `${eventType}${eventSubtype ? ':' + eventSubtype : ''}`, {
              is_error: event.is_error,
              result: eventType === 'result' ? (event.result as string)?.slice(0, 200) : undefined
            })
          }

          // Handle raw streaming events (text deltas from the API)
          if (eventType === 'stream_event') {
            const apiEvent = event.event as Record<string, unknown> | undefined

            // Track tool use so we can insert a separator before the next text
            if (apiEvent?.type === 'content_block_start') {
              const block = apiEvent.content_block as Record<string, unknown> | undefined
              if (block?.type === 'tool_use') {
                needsSeparatorBeforeNextText = true
              }
            }

            if (apiEvent?.type === 'content_block_delta') {
              const delta = apiEvent.delta as Record<string, unknown> | undefined
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                // Insert separator into fullResponse (for DB storage) when text
                // resumes after tool use.  Don't send it as stream-delta — the
                // renderer clears streamingContent on tool activity so each text
                // segment starts fresh.
                if (needsSeparatorBeforeNextText && fullResponse.length > 0) {
                  fullResponse += '\n\n'
                  streamingState.set(conversationId, fullResponse)
                  needsSeparatorBeforeNextText = false
                }
                fullResponse += delta.text
                streamingState.set(conversationId, fullResponse)
                window.webContents.send('stream-delta', {
                  conversationId,
                  text: delta.text
                })
              }
            }
          }

          // Handle complete assistant messages (fallback / final content)
          if (eventType === 'assistant') {
            const message = event.message as {
              content?: Array<{
                type: string
                text?: string
                name?: string
                id?: string
                input?: unknown
              }>
            } | undefined
            if (message?.content) {
              let currentText = ''
              let questionText = ''
              for (const block of message.content) {
                if (block.type === 'text' && block.text) {
                  if (currentText.length > 0) {
                    currentText += '\n\n'
                  }
                  currentText += block.text
                }
                if (
                  block.type === 'tool_use' &&
                  block.name &&
                  block.id &&
                  !processedToolUses.has(block.id)
                ) {
                  processedToolUses.add(block.id)
                  needsSeparatorBeforeNextText = true

                  // Emit tool activity for all tools
                  const activity = formatToolActivity(block.name, block.input)
                  if (activity) {
                    window.webContents.send('stream-tool-activity', {
                      conversationId,
                      activity
                    })
                    log('cli-event', `tool-activity: ${activity}`, {
                      toolName: block.name,
                      toolId: block.id
                    })
                  }

                  // AskUserQuestion also appends formatted text to response.
                  // In bypassPermissions mode, the CLI denies AskUserQuestion
                  // (is_error: true), and the model retries with rephrased
                  // questions (new tool_use id, slightly different wording).
                  // Only keep the first one to avoid duplicates.
                  if (block.name === 'AskUserQuestion' && !hasQuestionBlock) {
                    hasQuestionBlock = true
                    const formatted = formatAskUserQuestion(block.input)
                    if (formatted) {
                      questionText += formatted
                    }
                  }
                }
              }
              // Only use text as fallback if we haven't been getting stream_events
              if (!fullResponse && currentText) {
                fullResponse = currentText + questionText
                streamingState.set(conversationId, fullResponse)
                window.webContents.send('stream-delta', {
                  conversationId,
                  text: fullResponse
                })
              } else if (questionText) {
                // Append newly discovered question content
                fullResponse += questionText
                streamingState.set(conversationId, fullResponse)
                window.webContents.send('stream-delta', {
                  conversationId,
                  text: questionText
                })
              }
              // Do NOT overwrite fullResponse with text from partial assistant
              // messages — stream deltas are the source of truth for text content
            }
          }

          if (eventType === 'result') {
            log('cli-result', 'Result received', {
              is_error: event.is_error as boolean,
              result: (event.result as string)?.slice(0, 200)
            })
            if (!fullResponse && event.result) {
              fullResponse = event.result as string
            }
          }
        } catch {
          log('cli-parse', 'Failed to parse line', { line: line.slice(0, 200) })
        }
      }
    })

    let stderrOutput = ''
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      stderrOutput += text
      log('cli-stderr', text.trim())
    })

    child.on('close', (code) => {
      activeProcesses.delete(conversationId)
      const wasCancelled = cancelledConversations.delete(conversationId)
      log('cli', `Process closed with code ${code}`, {
        responseLength: fullResponse.length,
        stderr: stderrOutput.slice(0, 500),
        wasCancelled
      })

      // Drain any remaining buffer — split on newlines just like the data
      // handler so we don't silently drop text deltas from the final chunk.
      if (buffer.trim()) {
        const remaining = buffer.split('\n')
        for (const line of remaining) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as Record<string, unknown>
            if (event.type === 'stream_event') {
              const apiEvent = event.event as Record<string, unknown> | undefined
              if (apiEvent?.type === 'content_block_delta') {
                const delta = apiEvent.delta as Record<string, unknown> | undefined
                if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                  fullResponse += delta.text
                  window.webContents.send('stream-delta', {
                    conversationId,
                    text: delta.text
                  })
                }
              }
            }
            if (event.type === 'result' && !fullResponse && event.result) {
              fullResponse = event.result as string
            }
          } catch {
            log('cli-parse', 'Failed to parse remaining buffer line', {
              line: line.slice(0, 200)
            })
          }
        }
      }

      streamingState.delete(conversationId)

      if (wasCancelled) {
        // Voluntary cancellation — resolve with whatever we have (may be empty)
        resolve(fullResponse)
      } else if (code !== 0 && !fullResponse) {
        reject(new Error(stderrOutput || `Claude CLI exited with code ${code}`))
      } else if (code !== 0 && fullResponse) {
        log('cli', 'Process exited with non-zero code but had partial response', {
          code,
          responseLength: fullResponse.length,
          stderr: stderrOutput.slice(0, 500)
        })
        resolve(fullResponse + '\n\n---\n*[Response interrupted — Claude CLI exited with code ' + code + ']*')
      } else {
        resolve(fullResponse)
      }
    })

    child.on('error', (err) => {
      activeProcesses.delete(conversationId)
      streamingState.delete(conversationId)
      log('cli-error', 'Process error', { message: err.message })
      reject(err)
    })
  })
}

export function cancelClaudeProcess(conversationId: number): void {
  const proc = activeProcesses.get(conversationId)
  if (proc) {
    cancelledConversations.add(conversationId)
    proc.kill('SIGTERM')
    activeProcesses.delete(conversationId)
  }
}

export function isClaudeAvailable(): boolean {
  try {
    execSync('which claude', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
