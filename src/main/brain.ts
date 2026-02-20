import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { log } from './logger'

export interface BrainEntry {
  text: string
  category: string
}

const BRAIN_DIR = '.singularity/brain'
const BRAIN_FILE = 'BRAIN.md'
const TOKEN_WARNING_THRESHOLD = 2000

function brainPath(workspacePath: string): string {
  return join(workspacePath, BRAIN_DIR, BRAIN_FILE)
}

function brainDirPath(workspacePath: string): string {
  return join(workspacePath, BRAIN_DIR)
}

export function parseBrainMd(content: string): BrainEntry[] {
  const entries: BrainEntry[] = []
  let currentCategory = 'General'

  for (const line of content.split('\n')) {
    const headingMatch = line.match(/^## (.+)$/)
    if (headingMatch) {
      currentCategory = headingMatch[1].trim()
      continue
    }
    const entryMatch = line.match(/^- (.+)$/)
    if (entryMatch) {
      entries.push({ text: entryMatch[1].trim(), category: currentCategory })
    }
  }

  return entries
}

export function serializeBrainMd(entries: BrainEntry[]): string {
  const categories = new Map<string, string[]>()

  for (const entry of entries) {
    if (!categories.has(entry.category)) {
      categories.set(entry.category, [])
    }
    categories.get(entry.category)!.push(entry.text)
  }

  let md = '# Singularity Brain\n'
  for (const [category, items] of categories) {
    md += `\n## ${category}\n`
    for (const item of items) {
      md += `- ${item}\n`
    }
  }

  return md
}

export function readBrain(
  workspacePath: string
): { entries: BrainEntry[]; raw: string; tokenEstimate: number } {
  const path = brainPath(workspacePath)
  if (!existsSync(path)) {
    return { entries: [], raw: '', tokenEstimate: 0 }
  }
  const raw = readFileSync(path, 'utf-8')
  const entries = parseBrainMd(raw)
  const tokenEstimate = Math.ceil(raw.length / 4)
  return { entries, raw, tokenEstimate }
}

export function writeBrain(workspacePath: string, entries: BrainEntry[]): void {
  const dir = brainDirPath(workspacePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const content = serializeBrainMd(entries)
  writeFileSync(brainPath(workspacePath), content, 'utf-8')
  log('brain', 'Brain file written', { workspacePath, entryCount: entries.length })
}

export function appendEntries(workspacePath: string, newEntries: BrainEntry[]): void {
  const { entries } = readBrain(workspacePath)
  writeBrain(workspacePath, [...entries, ...newEntries])
}

export function removeEntry(workspacePath: string, index: number): void {
  const { entries } = readBrain(workspacePath)
  entries.splice(index, 1)
  writeBrain(workspacePath, entries)
}

export function updateEntry(workspacePath: string, index: number, updated: BrainEntry): void {
  const { entries } = readBrain(workspacePath)
  if (index >= 0 && index < entries.length) {
    entries[index] = updated
    writeBrain(workspacePath, entries)
  }
}

export function getCategories(workspacePath: string): string[] {
  const { entries } = readBrain(workspacePath)
  return [...new Set(entries.map((e) => e.category))]
}

export function brainExists(workspacePath: string): boolean {
  return existsSync(brainPath(workspacePath))
}

export function getTokenWarningThreshold(): number {
  return TOKEN_WARNING_THRESHOLD
}

export function scanWorkspace(workspacePath: string): BrainEntry[] {
  const entries: BrainEntry[] = []

  // package.json
  const pkgPath = join(workspacePath, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      const notable = [
        'react',
        'vue',
        'angular',
        'svelte',
        'next',
        'nuxt',
        'express',
        'fastify',
        'electron',
        'prisma',
        '@prisma/client',
        'drizzle-orm',
        'tailwindcss',
        'typescript',
        '@anthropic-ai/sdk',
        'openai',
        'better-sqlite3',
        'mongoose',
        'sequelize',
        'jest',
        'vitest',
        'mocha'
      ]
      for (const dep of notable) {
        if (allDeps[dep]) {
          entries.push({ text: `${dep} ${allDeps[dep]}`, category: 'Tech Stack' })
        }
      }
      if (pkg.type === 'module') {
        entries.push({ text: 'ES Modules (package.json type: module)', category: 'Tech Stack' })
      }
    } catch {
      /* ignore parse errors */
    }
  }

  // tsconfig.json
  if (existsSync(join(workspacePath, 'tsconfig.json'))) {
    entries.push({ text: 'TypeScript project', category: 'Tech Stack' })
  }

  // Cargo.toml
  if (existsSync(join(workspacePath, 'Cargo.toml'))) {
    entries.push({ text: 'Rust project (Cargo)', category: 'Tech Stack' })
  }

  // Python
  if (existsSync(join(workspacePath, 'pyproject.toml'))) {
    entries.push({ text: 'Python project (pyproject.toml)', category: 'Tech Stack' })
  } else if (existsSync(join(workspacePath, 'requirements.txt'))) {
    entries.push({ text: 'Python project (requirements.txt)', category: 'Tech Stack' })
  }

  // Go
  if (existsSync(join(workspacePath, 'go.mod'))) {
    entries.push({ text: 'Go project (go.mod)', category: 'Tech Stack' })
  }

  // Docker
  if (existsSync(join(workspacePath, 'Dockerfile'))) {
    entries.push({ text: 'Docker support', category: 'Tech Stack' })
  }
  if (
    existsSync(join(workspacePath, 'docker-compose.yml')) ||
    existsSync(join(workspacePath, 'docker-compose.yaml'))
  ) {
    entries.push({ text: 'Docker Compose', category: 'Tech Stack' })
  }

  log('brain', 'Workspace scanned', { workspacePath, entriesFound: entries.length })
  return entries
}
