import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock electron and fs modules
// ---------------------------------------------------------------------------
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

const mockWriteFileSync = vi.fn()
const mockAppendFileSync = vi.fn()

vi.mock('fs', () => ({
  writeFileSync: mockWriteFileSync,
  appendFileSync: mockAppendFileSync
}))

// Import after mocks are registered
import { initLogger, log, getLogPath } from '../../../src/main/logger'
import { app } from 'electron'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module-level logPath to '' by re-importing is not feasible,
    // so we rely on test ordering: the first test checks the uninitialised
    // state, then initLogger() is called for subsequent tests.
  })

  // ---- log() before init --------------------------------------------------
  describe('log() before initialization', () => {
    it('is a no-op when logger has not been initialized (logPath is empty)', async () => {
      // We need to test with a fresh module where logPath = ''
      // Use dynamic import with a cache-busting query to get a fresh instance
      vi.resetModules()

      // Re-register mocks after resetModules
      vi.doMock('electron', () => ({
        app: {
          getPath: vi.fn().mockReturnValue('/mock/userData')
        }
      }))
      vi.doMock('fs', () => ({
        writeFileSync: mockWriteFileSync,
        appendFileSync: mockAppendFileSync
      }))

      const freshLogger = await import('../../../src/main/logger')

      // logPath should be empty string before initLogger is called
      expect(freshLogger.getLogPath()).toBe('')

      // Calling log() should do nothing -- no appendFileSync call
      freshLogger.log('TEST', 'should not be written')
      expect(mockAppendFileSync).not.toHaveBeenCalled()
    })
  })

  // ---- initLogger ---------------------------------------------------------
  describe('initLogger()', () => {
    it('creates log file with startup message', async () => {
      vi.resetModules()

      vi.doMock('electron', () => ({
        app: {
          getPath: vi.fn().mockReturnValue('/mock/userData')
        }
      }))
      vi.doMock('fs', () => ({
        writeFileSync: mockWriteFileSync,
        appendFileSync: mockAppendFileSync
      }))

      const freshLogger = await import('../../../src/main/logger')
      freshLogger.initLogger()

      expect(mockWriteFileSync).toHaveBeenCalledOnce()
      const [path, content] = mockWriteFileSync.mock.calls[0]
      expect(path).toBe('/mock/userData/singularity.log')
      expect(content).toMatch(/^\[.+\] Singularity started\n$/)
    })
  })

  // ---- log() after init ---------------------------------------------------
  describe('log() after initialization', () => {
    // Helper: get a fresh, initialised logger module
    async function getFreshInitedLogger() {
      vi.resetModules()
      mockWriteFileSync.mockClear()
      mockAppendFileSync.mockClear()

      vi.doMock('electron', () => ({
        app: {
          getPath: vi.fn().mockReturnValue('/mock/userData')
        }
      }))
      vi.doMock('fs', () => ({
        writeFileSync: mockWriteFileSync,
        appendFileSync: mockAppendFileSync
      }))

      const mod = await import('../../../src/main/logger')
      mod.initLogger()
      mockAppendFileSync.mockClear() // clear any calls from initLogger
      return mod
    }

    it('appends formatted line with timestamp and category', async () => {
      const logger = await getFreshInitedLogger()
      logger.log('DB', 'Connection established')

      expect(mockAppendFileSync).toHaveBeenCalledOnce()
      const [path, line] = mockAppendFileSync.mock.calls[0]
      expect(path).toBe('/mock/userData/singularity.log')
      // Verify format: [timestamp] [category] message\n
      expect(line).toMatch(/^\[.+\] \[DB\] Connection established\n$/)
    })

    it('includes JSON-serialized data when provided', async () => {
      const logger = await getFreshInitedLogger()
      const data = { count: 42, items: ['a', 'b'] }
      logger.log('API', 'Response received', data)

      expect(mockAppendFileSync).toHaveBeenCalledOnce()
      const [, line] = mockAppendFileSync.mock.calls[0]
      expect(line).toContain(JSON.stringify(data))
      expect(line).toMatch(/^\[.+\] \[API\] Response received \{.*\}\n$/)
    })

    it('handles unserializable data with [unserializable] marker', async () => {
      const logger = await getFreshInitedLogger()

      // Create a circular reference which JSON.stringify cannot handle
      const circular: Record<string, unknown> = {}
      circular.self = circular

      logger.log('ERROR', 'Circular data', circular)

      expect(mockAppendFileSync).toHaveBeenCalledOnce()
      const [, line] = mockAppendFileSync.mock.calls[0]
      expect(line).toContain('[unserializable]')
      expect(line).toMatch(/^\[.+\] \[ERROR\] Circular data \[unserializable\]\n$/)
    })

    it('works without data parameter', async () => {
      const logger = await getFreshInitedLogger()
      logger.log('INFO', 'Simple message')

      expect(mockAppendFileSync).toHaveBeenCalledOnce()
      const [, line] = mockAppendFileSync.mock.calls[0]
      // Should not contain any serialized data -- just message + newline
      expect(line).toMatch(/^\[.+\] \[INFO\] Simple message\n$/)
      expect(line).not.toContain('[unserializable]')
    })
  })

  // ---- getLogPath ---------------------------------------------------------
  describe('getLogPath()', () => {
    it('returns the log file path after initialization', async () => {
      vi.resetModules()

      vi.doMock('electron', () => ({
        app: {
          getPath: vi.fn().mockReturnValue('/mock/userData')
        }
      }))
      vi.doMock('fs', () => ({
        writeFileSync: mockWriteFileSync,
        appendFileSync: mockAppendFileSync
      }))

      const freshLogger = await import('../../../src/main/logger')
      freshLogger.initLogger()

      expect(freshLogger.getLogPath()).toBe('/mock/userData/singularity.log')
    })
  })
})
