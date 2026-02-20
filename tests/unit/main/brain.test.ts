import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn()
}))

vi.mock('../../../src/main/logger', () => ({
  log: vi.fn()
}))

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import {
  parseBrainMd,
  serializeBrainMd,
  readBrain,
  writeBrain,
  appendEntries,
  removeEntry,
  updateEntry,
  getCategories,
  brainExists,
  getTokenWarningThreshold,
  scanWorkspace,
  BrainEntry
} from '../../../src/main/brain'

const mockedExistsSync = vi.mocked(existsSync)
const mockedReadFileSync = vi.mocked(readFileSync)
const mockedWriteFileSync = vi.mocked(writeFileSync)
const mockedMkdirSync = vi.mocked(mkdirSync)

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// parseBrainMd
// ---------------------------------------------------------------------------
describe('parseBrainMd', () => {
  it('parses headings as categories and bullet items as entries', () => {
    const md = '## Tech Stack\n- React 18\n- TypeScript\n'
    const entries = parseBrainMd(md)
    expect(entries).toEqual([
      { text: 'React 18', category: 'Tech Stack' },
      { text: 'TypeScript', category: 'Tech Stack' }
    ])
  })

  it('returns an empty array for empty content', () => {
    expect(parseBrainMd('')).toEqual([])
  })

  it('assigns "General" category to entries before any heading', () => {
    const md = '- loose item\n## Custom\n- categorized item\n'
    const entries = parseBrainMd(md)
    expect(entries).toEqual([
      { text: 'loose item', category: 'General' },
      { text: 'categorized item', category: 'Custom' }
    ])
  })

  it('handles multiple categories', () => {
    const md = [
      '## Alpha',
      '- a1',
      '- a2',
      '## Beta',
      '- b1',
      '## Gamma',
      '- g1',
      '- g2',
      '- g3'
    ].join('\n')
    const entries = parseBrainMd(md)
    expect(entries).toHaveLength(6)
    expect(entries[0]).toEqual({ text: 'a1', category: 'Alpha' })
    expect(entries[1]).toEqual({ text: 'a2', category: 'Alpha' })
    expect(entries[2]).toEqual({ text: 'b1', category: 'Beta' })
    expect(entries[3]).toEqual({ text: 'g1', category: 'Gamma' })
    expect(entries[4]).toEqual({ text: 'g2', category: 'Gamma' })
    expect(entries[5]).toEqual({ text: 'g3', category: 'Gamma' })
  })

  it('ignores lines that are not headings or bullet items', () => {
    const md = '# Title\nSome paragraph text\n## Cat\n- item\nAnother paragraph\n'
    const entries = parseBrainMd(md)
    expect(entries).toEqual([{ text: 'item', category: 'Cat' }])
  })
})

// ---------------------------------------------------------------------------
// serializeBrainMd
// ---------------------------------------------------------------------------
describe('serializeBrainMd', () => {
  it('groups entries by category with proper markdown format', () => {
    const entries: BrainEntry[] = [
      { text: 'React 18', category: 'Tech Stack' },
      { text: 'TypeScript', category: 'Tech Stack' },
      { text: 'MIT', category: 'License' }
    ]
    const md = serializeBrainMd(entries)
    expect(md).toBe(
      '# Singularity Brain\n\n## Tech Stack\n- React 18\n- TypeScript\n\n## License\n- MIT\n'
    )
  })

  it('produces just the header for empty entries', () => {
    const md = serializeBrainMd([])
    expect(md).toBe('# Singularity Brain\n')
  })
})

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------
describe('round-trip parse/serialize', () => {
  it('parseBrainMd(serializeBrainMd(entries)) equals original entries', () => {
    const entries: BrainEntry[] = [
      { text: 'electron ^28.0.0', category: 'Tech Stack' },
      { text: 'vitest ^1.0.0', category: 'Tech Stack' },
      { text: 'Remember to run lint', category: 'Conventions' },
      { text: 'Prefer composition over inheritance', category: 'Conventions' }
    ]
    const roundTripped = parseBrainMd(serializeBrainMd(entries))
    expect(roundTripped).toEqual(entries)
  })
})

// ---------------------------------------------------------------------------
// getTokenWarningThreshold
// ---------------------------------------------------------------------------
describe('getTokenWarningThreshold', () => {
  it('returns 2000', () => {
    expect(getTokenWarningThreshold()).toBe(2000)
  })
})

// ---------------------------------------------------------------------------
// readBrain
// ---------------------------------------------------------------------------
describe('readBrain', () => {
  it('returns empty result when brain file does not exist', () => {
    mockedExistsSync.mockReturnValue(false)
    const result = readBrain('/workspace')
    expect(result).toEqual({ entries: [], raw: '', tokenEstimate: 0 })
  })

  it('parses existing file content and estimates tokens', () => {
    const raw = '## Tech Stack\n- React 18\n- TypeScript\n'
    mockedExistsSync.mockReturnValue(true)
    mockedReadFileSync.mockReturnValue(raw)

    const result = readBrain('/workspace')
    expect(result.entries).toEqual([
      { text: 'React 18', category: 'Tech Stack' },
      { text: 'TypeScript', category: 'Tech Stack' }
    ])
    expect(result.raw).toBe(raw)
    expect(result.tokenEstimate).toBe(Math.ceil(raw.length / 4))
  })
})

// ---------------------------------------------------------------------------
// writeBrain
// ---------------------------------------------------------------------------
describe('writeBrain', () => {
  it('creates directory if it does not exist and writes serialized content', () => {
    mockedExistsSync.mockReturnValue(false)

    const entries: BrainEntry[] = [{ text: 'React', category: 'Tech Stack' }]
    writeBrain('/workspace', entries)

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.singularity/brain'),
      { recursive: true }
    )
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('BRAIN.md'),
      serializeBrainMd(entries),
      'utf-8'
    )
  })

  it('does not create directory if it already exists', () => {
    mockedExistsSync.mockReturnValue(true)

    writeBrain('/workspace', [{ text: 'item', category: 'General' }])

    expect(mockedMkdirSync).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// appendEntries
// ---------------------------------------------------------------------------
describe('appendEntries', () => {
  it('appends new entries to existing ones and writes', () => {
    const existingRaw = '## Tech Stack\n- React\n'
    mockedExistsSync.mockReturnValue(true)
    mockedReadFileSync.mockReturnValue(existingRaw)

    appendEntries('/workspace', [{ text: 'Vue', category: 'Tech Stack' }])

    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1)
    const writtenContent = mockedWriteFileSync.mock.calls[0][1] as string
    expect(writtenContent).toContain('- React')
    expect(writtenContent).toContain('- Vue')
  })
})

// ---------------------------------------------------------------------------
// removeEntry
// ---------------------------------------------------------------------------
describe('removeEntry', () => {
  it('removes the entry at the given index', () => {
    const raw = '## Tech Stack\n- React\n- Vue\n- Angular\n'
    mockedExistsSync.mockReturnValue(true)
    mockedReadFileSync.mockReturnValue(raw)

    removeEntry('/workspace', 1)

    const writtenContent = mockedWriteFileSync.mock.calls[0][1] as string
    expect(writtenContent).toContain('- React')
    expect(writtenContent).not.toContain('- Vue')
    expect(writtenContent).toContain('- Angular')
  })
})

// ---------------------------------------------------------------------------
// updateEntry
// ---------------------------------------------------------------------------
describe('updateEntry', () => {
  it('updates the entry at the given index', () => {
    const raw = '## Tech Stack\n- React\n- Vue\n'
    mockedExistsSync.mockReturnValue(true)
    mockedReadFileSync.mockReturnValue(raw)

    updateEntry('/workspace', 0, { text: 'Svelte', category: 'Tech Stack' })

    const writtenContent = mockedWriteFileSync.mock.calls[0][1] as string
    expect(writtenContent).toContain('- Svelte')
    expect(writtenContent).not.toContain('- React')
    expect(writtenContent).toContain('- Vue')
  })

  it('does nothing when index is out of range', () => {
    const raw = '## Tech Stack\n- React\n'
    mockedExistsSync.mockReturnValue(true)
    mockedReadFileSync.mockReturnValue(raw)

    updateEntry('/workspace', 99, { text: 'Svelte', category: 'Tech Stack' })

    expect(mockedWriteFileSync).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getCategories
// ---------------------------------------------------------------------------
describe('getCategories', () => {
  it('returns unique categories from the brain', () => {
    const raw = '## Tech Stack\n- React\n## Conventions\n- lint\n## Tech Stack\n- Vue\n'
    mockedExistsSync.mockReturnValue(true)
    mockedReadFileSync.mockReturnValue(raw)

    const categories = getCategories('/workspace')
    expect(categories).toEqual(['Tech Stack', 'Conventions'])
  })
})

// ---------------------------------------------------------------------------
// brainExists
// ---------------------------------------------------------------------------
describe('brainExists', () => {
  it('returns true when brain file exists', () => {
    mockedExistsSync.mockReturnValue(true)
    expect(brainExists('/workspace')).toBe(true)
  })

  it('returns false when brain file does not exist', () => {
    mockedExistsSync.mockReturnValue(false)
    expect(brainExists('/workspace')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// scanWorkspace
// ---------------------------------------------------------------------------
describe('scanWorkspace', () => {
  it('detects package.json dependencies', () => {
    const packageJson = JSON.stringify({
      dependencies: { react: '^18.0.0', express: '^4.0.0' },
      devDependencies: { vitest: '^1.0.0' }
    })

    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p)
      if (path.endsWith('package.json')) return true
      return false
    })
    mockedReadFileSync.mockReturnValue(packageJson)

    const entries = scanWorkspace('/workspace')

    const texts = entries.map((e) => e.text)
    expect(texts).toContain('react ^18.0.0')
    expect(texts).toContain('express ^4.0.0')
    expect(texts).toContain('vitest ^1.0.0')
    expect(entries.every((e) => e.category === 'Tech Stack')).toBe(true)
  })

  it('detects tsconfig.json', () => {
    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p)
      if (path.endsWith('tsconfig.json')) return true
      return false
    })

    const entries = scanWorkspace('/workspace')

    expect(entries).toContainEqual({ text: 'TypeScript project', category: 'Tech Stack' })
  })

  it('detects Dockerfile', () => {
    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p)
      if (path.endsWith('Dockerfile')) return true
      return false
    })

    const entries = scanWorkspace('/workspace')

    expect(entries).toContainEqual({ text: 'Docker support', category: 'Tech Stack' })
  })

  it('detects ES Modules type', () => {
    const packageJson = JSON.stringify({ type: 'module' })

    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p)
      if (path.endsWith('package.json')) return true
      return false
    })
    mockedReadFileSync.mockReturnValue(packageJson)

    const entries = scanWorkspace('/workspace')

    expect(entries).toContainEqual({
      text: 'ES Modules (package.json type: module)',
      category: 'Tech Stack'
    })
  })

  it('handles malformed package.json gracefully', () => {
    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p)
      if (path.endsWith('package.json')) return true
      return false
    })
    mockedReadFileSync.mockReturnValue('not valid json')

    const entries = scanWorkspace('/workspace')
    // Should not throw, just returns no package-related entries
    expect(entries).toEqual([])
  })

  it('detects multiple project indicators at once', () => {
    const packageJson = JSON.stringify({
      dependencies: { typescript: '^5.0.0' },
      devDependencies: {}
    })

    mockedExistsSync.mockImplementation((p: unknown) => {
      const path = String(p)
      if (path.endsWith('package.json')) return true
      if (path.endsWith('tsconfig.json')) return true
      if (path.endsWith('Dockerfile')) return true
      if (path.endsWith('docker-compose.yml')) return true
      return false
    })
    mockedReadFileSync.mockReturnValue(packageJson)

    const entries = scanWorkspace('/workspace')
    const texts = entries.map((e) => e.text)
    expect(texts).toContain('typescript ^5.0.0')
    expect(texts).toContain('TypeScript project')
    expect(texts).toContain('Docker support')
    expect(texts).toContain('Docker Compose')
  })
})
