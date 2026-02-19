import { spawn, ChildProcess } from 'child_process'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { log } from './logger'

// Track active processes per conversation so we can kill them if needed
const activeProcesses = new Map<number, ChildProcess>()

export function generateSessionId(): string {
  return randomUUID()
}

export async function sendClaudeMessage(
  conversationId: number,
  sessionId: string,
  message: string,
  workspacePath: string,
  model: string,
  window: BrowserWindow,
  isFirstMessage: boolean
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
    log('cli', `Process spawned with PID ${child.pid}`)

    let fullResponse = ''
    let buffer = ''

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

          // Handle complete assistant messages (fallback / final content)
          if (eventType === 'assistant') {
            const message = event.message as {
              content?: Array<{ type: string; text?: string }>
            } | undefined
            if (message?.content) {
              let currentText = ''
              for (const block of message.content) {
                if (block.type === 'text' && block.text) {
                  currentText += block.text
                }
              }
              // Only use if we haven't been getting stream_events
              if (!fullResponse && currentText) {
                fullResponse = currentText
                window.webContents.send('stream-delta', {
                  conversationId,
                  text: currentText
                })
              } else if (currentText) {
                // Update fullResponse to the complete text
                fullResponse = currentText
              }
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
      log('cli', `Process closed with code ${code}`, {
        responseLength: fullResponse.length,
        stderr: stderrOutput.slice(0, 500)
      })

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer) as Record<string, unknown>
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
        } catch {
          // ignore
        }
      }

      window.webContents.send('stream-complete', { conversationId })

      if (code !== 0 && !fullResponse) {
        reject(new Error(stderrOutput || `Claude CLI exited with code ${code}`))
      } else {
        resolve(fullResponse)
      }
    })

    child.on('error', (err) => {
      activeProcesses.delete(conversationId)
      log('cli-error', 'Process error', { message: err.message })
      window.webContents.send('stream-complete', { conversationId })
      reject(err)
    })
  })
}

export function cancelClaudeProcess(conversationId: number): void {
  const proc = activeProcesses.get(conversationId)
  if (proc) {
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
