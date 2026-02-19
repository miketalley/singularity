import { app } from 'electron'
import { join } from 'path'
import { appendFileSync, writeFileSync } from 'fs'

let logPath = ''

export function initLogger(): void {
  logPath = join(app.getPath('userData'), 'singularity.log')
  // Clear log on startup
  writeFileSync(logPath, `[${new Date().toISOString()}] Singularity started\n`)
}

export function log(category: string, message: string, data?: unknown): void {
  if (!logPath) return
  const timestamp = new Date().toISOString()
  let line = `[${timestamp}] [${category}] ${message}`
  if (data !== undefined) {
    try {
      line += ' ' + JSON.stringify(data)
    } catch {
      line += ' [unserializable]'
    }
  }
  line += '\n'
  try {
    appendFileSync(logPath, line)
  } catch {
    // ignore write errors
  }
}

export function getLogPath(): string {
  return logPath
}
