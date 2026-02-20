#!/usr/bin/env node
/**
 * Mock Claude CLI binary for e2e tests.
 *
 * When Playwright launches the Electron app, it overrides PATH to include
 * a directory containing a symlink (or wrapper) that points to this script
 * instead of the real `claude` CLI. This lets e2e tests run deterministically
 * without network access or an API key.
 *
 * Usage (matches the real Claude CLI interface):
 *   mock-claude-cli -p "Hello, how are you?" --output-format stream-json
 *
 * The script reads the -p argument, matches keywords to choose a fixture
 * JSONL file, then streams each line to stdout with small delays to simulate
 * real streaming behavior.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

// ---------------------------------------------------------------------------
// Fixtures directory -- resolved relative to this script's location.
// At runtime __dirname will be either:
//   tests/helpers          (when executed directly via ts-node / tsx)
//   dist-tests/helpers     (if compiled to JS first)
// In both cases the fixtures sit one level up under tests/fixtures.
// ---------------------------------------------------------------------------
const fixturesDir = path.resolve(__dirname, '../fixtures')

// ---------------------------------------------------------------------------
// Keyword -> fixture mapping
// ---------------------------------------------------------------------------
interface FixtureMapping {
  keywords: string[]
  file: string
}

const FIXTURE_MAP: FixtureMapping[] = [
  {
    keywords: ['read', 'file', 'tool', 'check'],
    file: 'claude-stream-with-tools.jsonl'
  },
  {
    keywords: ['hello', 'hi', 'hey', 'how are you'],
    file: 'claude-stream-simple.jsonl'
  }
]

const DEFAULT_FIXTURE = 'claude-stream-simple.jsonl'

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
function parsePrompt(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-p' && i + 1 < argv.length) {
      return argv[i + 1]
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// Choose fixture based on keywords in the prompt
// ---------------------------------------------------------------------------
function chooseFixture(prompt: string): string {
  const lower = prompt.toLowerCase()

  for (const mapping of FIXTURE_MAP) {
    for (const keyword of mapping.keywords) {
      if (lower.includes(keyword)) {
        return mapping.file
      }
    }
  }

  return DEFAULT_FIXTURE
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Random delay between min and max milliseconds
// ---------------------------------------------------------------------------
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ---------------------------------------------------------------------------
// Stream fixture lines to stdout
// ---------------------------------------------------------------------------
async function streamFixture(fixturePath: string): Promise<void> {
  const fileStream = fs.createReadStream(fixturePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    process.stdout.write(trimmed + '\n')
    await sleep(randomDelay(10, 50))
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const prompt = parsePrompt(process.argv.slice(2))
  const fixtureName = chooseFixture(prompt)
  const fixturePath = path.join(fixturesDir, fixtureName)

  if (!fs.existsSync(fixturePath)) {
    process.stderr.write(
      `mock-claude-cli: fixture not found: ${fixturePath}\n`
    )
    process.exit(1)
  }

  await streamFixture(fixturePath)
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`mock-claude-cli: ${err}\n`)
  process.exit(1)
})
