import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module under test is imported
// ---------------------------------------------------------------------------

// Mock the logger so we don't try to write to disk during tests
vi.mock('../../../src/main/logger', () => ({
  log: vi.fn()
}))

// Mock child_process — we provide fine-grained implementations per test
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn()
}))

// Mock crypto.randomUUID
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440000')
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  generateSessionId,
  isClaudeAvailable,
  sendClaudeMessage,
  cancelClaudeProcess,
  getStreamingContent,
  isProcessActive
} from '../../../src/main/claude-cli'

import { spawn, execSync } from 'child_process'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURE_PATH = join(__dirname, '../../fixtures/claude-stream-simple.jsonl')

function createMockWindow(): BrowserWindow {
  return {
    webContents: {
      send: vi.fn()
    }
  } as unknown as BrowserWindow
}

/**
 * Creates a mock ChildProcess that is an EventEmitter with stdout/stderr
 * sub-emitters and a kill spy.
 */
function createMockChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    pid: number
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = 12345
  child.kill = vi.fn()
  return child
}

/**
 * Feed fixture lines into a mock child process stdout, then close it.
 * Each line is emitted as a separate data event to simulate realistic
 * streaming. A small delay allows the microtask queue to flush between lines.
 */
async function feedFixtureAndClose(
  child: ReturnType<typeof createMockChildProcess>,
  exitCode = 0
): Promise<void> {
  const fixtureData = readFileSync(FIXTURE_PATH, 'utf-8')
  const lines = fixtureData.split('\n').filter((l) => l.trim())

  for (const line of lines) {
    child.stdout.emit('data', Buffer.from(line + '\n'))
    // Yield to the event loop so the handler processes each line
    await new Promise((r) => setTimeout(r, 0))
  }

  child.emit('close', exitCode)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('claude-cli', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // generateSessionId
  // -----------------------------------------------------------------------
  describe('generateSessionId', () => {
    it('returns a UUID string', () => {
      const id = generateSessionId()
      expect(id).toBe('550e8400-e29b-41d4-a716-446655440000')
      // Verify it matches UUID v4 format
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })
  })

  // -----------------------------------------------------------------------
  // isClaudeAvailable
  // -----------------------------------------------------------------------
  describe('isClaudeAvailable', () => {
    it('returns true when claude CLI is found', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/local/bin/claude'))
      expect(isClaudeAvailable()).toBe(true)
      expect(execSync).toHaveBeenCalledWith('which claude', { stdio: 'ignore' })
    })

    it('returns false when claude CLI is not found', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found')
      })
      expect(isClaudeAvailable()).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // sendClaudeMessage — basic streaming
  // -----------------------------------------------------------------------
  describe('sendClaudeMessage', () => {
    let mockChild: ReturnType<typeof createMockChildProcess>
    let mockWindow: BrowserWindow

    beforeEach(() => {
      mockChild = createMockChildProcess()
      mockWindow = createMockWindow()
      vi.mocked(spawn).mockReturnValue(mockChild as never)
    })

    it('resolves with the full response text after streaming completes', async () => {
      const promise = sendClaudeMessage(
        1,
        'session-abc',
        'Hello, how are you?',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      await feedFixtureAndClose(mockChild)
      const result = await promise

      expect(result).toBe(
        "Hello! I'm doing well, thank you for asking. How can I help you today?"
      )
    })

    it('sends stream-delta events to the renderer for each text chunk', async () => {
      const promise = sendClaudeMessage(
        2,
        'session-abc',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      await feedFixtureAndClose(mockChild)
      await promise

      const sendMock = vi.mocked(mockWindow.webContents.send)
      const deltaEvents = sendMock.mock.calls.filter(
        ([channel]) => channel === 'stream-delta'
      )

      // Should have multiple delta calls (one per text_delta chunk)
      expect(deltaEvents.length).toBeGreaterThanOrEqual(5)

      // Each delta should include conversationId and text
      for (const [, payload] of deltaEvents) {
        expect(payload).toHaveProperty('conversationId', 2)
        expect(payload).toHaveProperty('text')
        expect(typeof payload.text).toBe('string')
      }
    })

    it('passes correct spawn arguments for a first message', async () => {
      const promise = sendClaudeMessage(
        3,
        'session-abc',
        'Hello',
        '/my/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true // isFirstMessage
      )

      await feedFixtureAndClose(mockChild)
      await promise

      const spawnCall = vi.mocked(spawn).mock.calls[0]
      const [command, args, options] = spawnCall

      expect(command).toBe('claude')
      expect(args).toContain('-p')
      expect(args).toContain('Hello')
      expect(args).toContain('--output-format')
      expect(args).toContain('stream-json')
      expect(args).toContain('--model')
      expect(args).toContain('claude-sonnet-4-20250514')
      expect(args).toContain('--session-id')
      expect(args).toContain('session-abc')
      expect(args).not.toContain('--resume')
      expect(options.cwd).toBe('/my/workspace')
      expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe'])
    })

    it('uses --resume instead of --session-id when isFirstMessage is false', async () => {
      const promise = sendClaudeMessage(
        4,
        'session-abc',
        'Follow-up',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        false // isFirstMessage = false
      )

      await feedFixtureAndClose(mockChild)
      await promise

      const args = vi.mocked(spawn).mock.calls[0][1]
      expect(args).toContain('--resume')
      expect(args).toContain('session-abc')
      expect(args).not.toContain('--session-id')
    })

    it('appends --append-system-prompt when brainContext is provided on first message', async () => {
      const brainContext = 'This project uses React and TypeScript.'
      const promise = sendClaudeMessage(
        5,
        'session-abc',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true,
        brainContext
      )

      await feedFixtureAndClose(mockChild)
      await promise

      const args = vi.mocked(spawn).mock.calls[0][1]
      expect(args).toContain('--append-system-prompt')

      // The system prompt value should contain the brain context
      const systemPromptIndex = args.indexOf('--append-system-prompt')
      const systemPromptValue = args[systemPromptIndex + 1] as string
      expect(systemPromptValue).toContain(brainContext)
      expect(systemPromptValue).toContain('known context about this project')
    })

    it('does NOT append --append-system-prompt when isFirstMessage is false even with brainContext', async () => {
      const promise = sendClaudeMessage(
        6,
        'session-abc',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        false, // not first message
        'some context'
      )

      await feedFixtureAndClose(mockChild)
      await promise

      const args = vi.mocked(spawn).mock.calls[0][1]
      expect(args).not.toContain('--append-system-prompt')
    })

    it('does NOT append --append-system-prompt when brainContext is null', async () => {
      const promise = sendClaudeMessage(
        7,
        'session-abc',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true,
        null
      )

      await feedFixtureAndClose(mockChild)
      await promise

      const args = vi.mocked(spawn).mock.calls[0][1]
      expect(args).not.toContain('--append-system-prompt')
    })

    it('rejects when process exits with non-zero code and no response', async () => {
      const promise = sendClaudeMessage(
        8,
        'session-abc',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      // Emit stderr then close with error code, no stdout data
      mockChild.stderr.emit('data', Buffer.from('Something went wrong'))
      mockChild.emit('close', 1)

      await expect(promise).rejects.toThrow('Something went wrong')
    })

    it('resolves with partial response + interruption note on non-zero exit with content', async () => {
      const promise = sendClaudeMessage(
        9,
        'session-abc',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      // Feed some data then exit with error
      mockChild.stdout.emit(
        'data',
        Buffer.from(
          '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial response"}}}\n'
        )
      )
      await new Promise((r) => setTimeout(r, 0))

      mockChild.emit('close', 1)
      const result = await promise

      expect(result).toContain('Partial response')
      expect(result).toContain('Response interrupted')
      expect(result).toContain('code 1')
    })

    it('rejects when process emits an error event', async () => {
      const promise = sendClaudeMessage(
        10,
        'session-abc',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      mockChild.emit('error', new Error('spawn ENOENT'))

      await expect(promise).rejects.toThrow('spawn ENOENT')
    })

    it('strips CLAUDECODE and ANTHROPIC_API_KEY from the env passed to spawn', async () => {
      // Set the env vars that should be removed
      process.env.CLAUDECODE = 'true'
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test'

      const promise = sendClaudeMessage(
        11,
        'session-abc',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      await feedFixtureAndClose(mockChild)
      await promise

      const spawnOptions = vi.mocked(spawn).mock.calls[0][2] as { env: Record<string, string | undefined> }
      expect(spawnOptions.env.CLAUDECODE).toBeUndefined()
      expect(spawnOptions.env.ANTHROPIC_API_KEY).toBeUndefined()

      // Clean up
      delete process.env.CLAUDECODE
      delete process.env.ANTHROPIC_API_KEY
    })
  })

  // -----------------------------------------------------------------------
  // AskUserQuestion deduplication
  // -----------------------------------------------------------------------
  describe('AskUserQuestion deduplication', () => {
    let mockChild: ReturnType<typeof createMockChildProcess>
    let mockWindow: BrowserWindow

    beforeEach(() => {
      mockChild = createMockChildProcess()
      mockWindow = createMockWindow()
      vi.mocked(spawn).mockReturnValue(mockChild as never)
    })

    it('only includes the first AskUserQuestion when multiple are received with different wording', async () => {
      const promise = sendClaudeMessage(
        40,
        'session-dedup',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      // Simulate three assistant events with AskUserQuestion tool_uses
      // (different IDs and slightly different question text — mimics
      // bypassPermissions denial retry behaviour where the model rephrases)
      const makeAssistantEvent = (
        toolId: string,
        questionText: string
      ) =>
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: toolId,
                name: 'AskUserQuestion',
                input: {
                  questions: [
                    {
                      question: questionText,
                      options: [
                        { label: 'Yes', description: 'Option A' },
                        { label: 'No', description: 'Option B' }
                      ]
                    }
                  ]
                }
              }
            ]
          }
        })

      mockChild.stdout.emit(
        'data',
        Buffer.from(
          makeAssistantEvent('tool-1', 'Do you mean narration text that flashes briefly?') + '\n'
        )
      )
      await new Promise((r) => setTimeout(r, 0))

      mockChild.stdout.emit(
        'data',
        Buffer.from(
          makeAssistantEvent('tool-2', 'By thinking text do you mean narration?') + '\n'
        )
      )
      await new Promise((r) => setTimeout(r, 0))

      mockChild.stdout.emit(
        'data',
        Buffer.from(
          makeAssistantEvent('tool-3', 'Is thinking text the narration text?') + '\n'
        )
      )
      await new Promise((r) => setTimeout(r, 0))

      mockChild.emit('close', 0)
      const result = await promise

      // Should contain exactly one QUESTION_BLOCK, not three
      const questionBlockCount = (result.match(/\[QUESTION_BLOCK\]/g) || []).length
      expect(questionBlockCount).toBe(1)

      // Should contain the first question's text
      expect(result).toContain('Do you mean narration text that flashes briefly?')
      // Should NOT contain the retry questions
      expect(result).not.toContain('By thinking text do you mean narration?')
      expect(result).not.toContain('Is thinking text the narration text?')
    })
  })

  // -----------------------------------------------------------------------
  // cancelClaudeProcess
  // -----------------------------------------------------------------------
  describe('cancelClaudeProcess', () => {
    let mockChild: ReturnType<typeof createMockChildProcess>
    let mockWindow: BrowserWindow

    beforeEach(() => {
      mockChild = createMockChildProcess()
      mockWindow = createMockWindow()
      vi.mocked(spawn).mockReturnValue(mockChild as never)
    })

    it('calls kill(SIGTERM) on the active process', async () => {
      // Start a message to register the process
      const promise = sendClaudeMessage(
        20,
        'session-cancel',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      // Cancel while the process is still running
      cancelClaudeProcess(20)

      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')

      // Close the process so the promise resolves
      mockChild.emit('close', 0)
      const result = await promise
      // Cancelled processes resolve with whatever content was accumulated (empty here)
      expect(typeof result).toBe('string')
    })

    it('does nothing when no active process exists for the conversationId', () => {
      // Should not throw
      expect(() => cancelClaudeProcess(999)).not.toThrow()
    })

    it('resolves the promise with partial content when cancelled mid-stream', async () => {
      const promise = sendClaudeMessage(
        21,
        'session-cancel-2',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      // Feed some partial data
      mockChild.stdout.emit(
        'data',
        Buffer.from(
          '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial"}}}\n'
        )
      )
      await new Promise((r) => setTimeout(r, 0))

      // Cancel
      cancelClaudeProcess(21)

      // Simulate the process closing after SIGTERM
      mockChild.emit('close', null)
      const result = await promise

      expect(result).toBe('Partial')
    })
  })

  // -----------------------------------------------------------------------
  // getStreamingContent / isProcessActive
  // -----------------------------------------------------------------------
  describe('getStreamingContent and isProcessActive', () => {
    let mockChild: ReturnType<typeof createMockChildProcess>
    let mockWindow: BrowserWindow

    beforeEach(() => {
      mockChild = createMockChildProcess()
      mockWindow = createMockWindow()
      vi.mocked(spawn).mockReturnValue(mockChild as never)
    })

    it('returns null for unknown conversation', () => {
      expect(getStreamingContent(9999)).toBeNull()
    })

    it('returns false for unknown conversation process', () => {
      expect(isProcessActive(9999)).toBe(false)
    })

    it('tracks streaming content and active state during a message', async () => {
      const promise = sendClaudeMessage(
        30,
        'session-state',
        'Hello',
        '/workspace',
        'claude-sonnet-4-20250514',
        mockWindow,
        true
      )

      // Process is now active
      expect(isProcessActive(30)).toBe(true)

      // Feed a delta
      mockChild.stdout.emit(
        'data',
        Buffer.from(
          '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello!"}}}\n'
        )
      )
      await new Promise((r) => setTimeout(r, 0))

      // Streaming content should be available
      expect(getStreamingContent(30)).toBe('Hello!')

      // Close
      mockChild.emit('close', 0)
      await promise

      // After close, streaming state is cleaned up
      expect(getStreamingContent(30)).toBeNull()
      expect(isProcessActive(30)).toBe(false)
    })
  })
})
