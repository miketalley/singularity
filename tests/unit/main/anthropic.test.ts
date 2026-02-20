import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the @anthropic-ai/sdk module
// ---------------------------------------------------------------------------
const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate }
    constructor(public opts?: Record<string, unknown>) {
      // Store constructor args for assertion
      MockAnthropic._lastOpts = opts
    }
    static _lastOpts: Record<string, unknown> | undefined
  }
  return { default: MockAnthropic }
})

// Import after mock is registered so the module picks up our mock
import Anthropic from '@anthropic-ai/sdk'
import {
  initAnthropicClient,
  getClient,
  generateTitle,
  extractMemories
} from '../../../src/main/anthropic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Access the mock class to inspect constructor args
const MockedAnthropic = Anthropic as unknown as {
  _lastOpts: Record<string, unknown> | undefined
}

/** Reset module-level `client` by re-initialising with a known key. */
function initWithKey(key: string): boolean {
  process.env.ANTHROPIC_API_KEY = key
  return initAnthropicClient()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('anthropic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ANTHROPIC_API_KEY
    // Reset the module-level client to null by calling init without a key
    // (returns false, leaves client as null)
    initAnthropicClient()
  })

  // ---- initAnthropicClient ------------------------------------------------
  describe('initAnthropicClient()', () => {
    it('returns false when ANTHROPIC_API_KEY is not set', () => {
      delete process.env.ANTHROPIC_API_KEY
      expect(initAnthropicClient()).toBe(false)
    })

    it('returns true and creates a client with a regular API key', () => {
      const result = initWithKey('sk-ant-api03-regularkey')
      expect(result).toBe(true)
      expect(MockedAnthropic._lastOpts).toEqual({ apiKey: 'sk-ant-api03-regularkey' })
    })

    it('detects OAuth token (sk-ant-oat prefix) and uses authToken', () => {
      const oauthKey = 'sk-ant-oat-someoauthtoken'
      const result = initWithKey(oauthKey)
      expect(result).toBe(true)
      expect(MockedAnthropic._lastOpts).toEqual({
        authToken: oauthKey,
        apiKey: null,
        defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' }
      })
    })
  })

  // ---- getClient ----------------------------------------------------------
  describe('getClient()', () => {
    it('throws when client has not been initialized', async () => {
      // Use a fresh module to guarantee client is null (module-level state)
      vi.resetModules()
      const freshModule = await import('../../../src/main/anthropic')
      expect(() => freshModule.getClient()).toThrow(
        'Anthropic client not initialized. Call initAnthropicClient() first.'
      )
    })

    it('returns the client after successful initialization', () => {
      initWithKey('sk-ant-api03-regularkey')
      expect(() => getClient()).not.toThrow()
      const client = getClient()
      expect(client).toBeDefined()
      expect(client.messages).toBeDefined()
    })
  })

  // ---- generateTitle ------------------------------------------------------
  describe('generateTitle()', () => {
    beforeEach(() => {
      initWithKey('sk-ant-api03-test')
    })

    it('returns trimmed API response text', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '  Hello World Title  ' }]
      })

      const title = await generateTitle('Tell me about quantum computing')
      expect(title).toBe('Hello World Title')
      expect(mockCreate).toHaveBeenCalledOnce()
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 30
        })
      )
    })

    it('returns fallback (first 5 words) on API error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API rate limit'))

      const title = await generateTitle('How do I bake a chocolate cake at home')
      expect(title).toBe('How do I bake a')
    })

    it('truncates long fallback to 40 chars with ellipsis', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API error'))

      // Each word is long enough that 5 words exceed 40 characters
      const longMessage = 'Internationalization Conceptualization Experimentation Standardization Implementation'
      const title = await generateTitle(longMessage)
      expect(title.length).toBeLessThanOrEqual(43) // 40 + '...'
      expect(title).toMatch(/\.{3}$/)
      expect(title.slice(0, -3).length).toBe(40)
    })
  })

  // ---- extractMemories ----------------------------------------------------
  describe('extractMemories()', () => {
    beforeEach(() => {
      initWithKey('sk-ant-api03-test')
    })

    it('parses a valid JSON array response', async () => {
      const memories = [
        { text: 'Uses Tailwind CSS for styling', category: 'Tech Stack' },
        { text: 'Prefer composition over inheritance', category: 'Conventions' }
      ]
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(memories) }]
      })

      const result = await extractMemories('We use Tailwind and prefer composition')
      expect(result).toEqual(memories)
    })

    it('returns empty array on invalid JSON', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'this is not valid json at all' }]
      })

      const result = await extractMemories('some message content')
      expect(result).toEqual([])
    })

    it('filters out entries missing text or category fields', async () => {
      const mixed = [
        { text: 'Valid entry', category: 'Tech Stack' },
        { text: 'Missing category' },
        { category: 'Missing text' },
        { text: 123, category: 'Numeric text should be filtered' },
        null,
        'string entry',
        { text: 'Another valid', category: 'Conventions' }
      ]
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mixed) }]
      })

      const result = await extractMemories('some message')
      expect(result).toEqual([
        { text: 'Valid entry', category: 'Tech Stack' },
        { text: 'Another valid', category: 'Conventions' }
      ])
    })

    it('returns empty array when response content is not a text block', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tool_1', name: 'test', input: {} }]
      })

      const result = await extractMemories('some message')
      expect(result).toEqual([])
    })

    it('returns empty array when parsed JSON is not an array', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"text": "not an array", "category": "Test"}' }]
      })

      const result = await extractMemories('some message')
      expect(result).toEqual([])
    })
  })
})
