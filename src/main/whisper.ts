import { initWhisper } from '@fugood/whisper.node'
import type { WhisperContext } from '@fugood/whisper.node'
import { app, BrowserWindow } from 'electron'
import {
  existsSync,
  createWriteStream,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  mkdtempSync,
  rmdirSync
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { get as httpsGet } from 'https'
import { log } from './logger'
import { getSetting } from './database'

const MODEL_NAME = 'ggml-base.en.bin'
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`

let whisperContext: WhisperContext | null = null
let downloading = false

function getModelsDir(): string {
  const dir = join(app.getPath('userData'), 'models')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getModelPath(): string | null {
  // Check settings override first
  const settingPath = getSetting('whisper_model_path')
  if (settingPath && existsSync(settingPath)) return settingPath

  // Check default location
  const defaultPath = join(getModelsDir(), MODEL_NAME)
  if (existsSync(defaultPath)) return defaultPath

  return null
}

async function getContext(): Promise<WhisperContext> {
  if (whisperContext) return whisperContext

  const modelPath = getModelPath()
  if (!modelPath) {
    throw new Error(
      'Whisper model not downloaded. Click "Download Model" in Settings to get started.'
    )
  }

  log('whisper', 'Initializing whisper context', { modelPath })
  whisperContext = await initWhisper({ filePath: modelPath, useGpu: true })
  log('whisper', 'Whisper context ready')
  return whisperContext
}

export async function transcribeAudio(wavBuffer: Buffer): Promise<string> {
  const ctx = await getContext()

  // Write WAV to temp file — transcribeFile handles WAV decoding internally
  const tempDir = mkdtempSync(join(tmpdir(), 'singularity-'))
  const wavPath = join(tempDir, 'recording.wav')
  writeFileSync(wavPath, wavBuffer)

  log('whisper', 'Transcribing', { wavSize: wavBuffer.length })

  try {
    const { promise } = ctx.transcribeFile(wavPath, {
      language: 'en',
      temperature: 0.0
    })
    const result = await promise

    let text = result.result.trim()
    text = text.replace(/\[BLANK_AUDIO\]/g, '').trim()
    log('whisper', 'Transcription complete', { textLength: text.length })
    return text
  } finally {
    try {
      unlinkSync(wavPath)
    } catch {
      /* ignore */
    }
    try {
      rmdirSync(tempDir)
    } catch {
      /* ignore */
    }
  }
}

export function getWhisperStatus(): {
  modelDownloaded: boolean
  modelPath: string | null
  isDownloading: boolean
} {
  return {
    modelDownloaded: getModelPath() !== null,
    modelPath: getModelPath(),
    isDownloading: downloading
  }
}

function followRedirects(
  url: string,
  callback: (res: import('http').IncomingMessage) => void
): void {
  httpsGet(url, (res) => {
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      followRedirects(res.headers.location, callback)
    } else {
      callback(res)
    }
  })
}

export async function downloadWhisperModel(window: BrowserWindow): Promise<void> {
  if (downloading) throw new Error('Already downloading')
  if (getModelPath()) throw new Error('Model already downloaded')

  downloading = true
  const destPath = join(getModelsDir(), MODEL_NAME)

  log('whisper', 'Starting model download', { url: MODEL_URL, destPath })

  return new Promise((resolve, reject) => {
    followRedirects(MODEL_URL, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        downloading = false
        reject(new Error(`Download failed with status ${res.statusCode}`))
        return
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
      let downloadedBytes = 0

      const file = createWriteStream(destPath)

      res.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length
        file.write(chunk)
        if (totalBytes > 0) {
          const progress = Math.round((downloadedBytes / totalBytes) * 100)
          window.webContents.send('whisper-download-progress', {
            progress,
            downloadedBytes,
            totalBytes
          })
        }
      })

      res.on('end', () => {
        file.end(() => {
          downloading = false
          log('whisper', 'Model download complete', { destPath, size: downloadedBytes })
          // Reset context so it picks up the new model
          whisperContext = null
          resolve()
        })
      })

      res.on('error', (err) => {
        file.end()
        downloading = false
        // Clean up partial download
        try {
          unlinkSync(destPath)
        } catch {
          /* ignore */
        }
        log('whisper-error', 'Download failed', { message: err.message })
        reject(err)
      })
    })
  })
}
