import { existsSync, mkdirSync, createWriteStream, statSync, unlinkSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
import { spawn, exec, execSync } from 'child_process'
import type { BrowserWindow } from 'electron'

export interface WhisperModelInfo {
  id: string
  name: string
  description: string
  filename: string
  downloadUrl: string
  sizeBytes: number
  sizeDisplay: string
}

export interface LocalWhisperTranscriptionSegment {
  start: number
  end: number
  text: string
}

export interface LocalWhisperTranscriptionResult {
  text: string
  timestampedText: string
  durationSeconds: number
  segments: LocalWhisperTranscriptionSegment[]
}

export const WHISPER_MODELS: WhisperModelInfo[] = [
  {
    id: 'whisper-tiny-en',
    name: 'Whisper Tiny (English)',
    description: 'Ultra-fast speech model (~75 MB). Recommended for quick on-device transcription.',
    filename: 'ggml-tiny.en.bin',
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    sizeBytes: 77700000,
    sizeDisplay: '~75 MB'
  },
  {
    id: 'whisper-base-en',
    name: 'Whisper Base (English)',
    description: 'Higher accuracy speech model (~145 MB). Best balance of speed and clarity.',
    filename: 'ggml-base.en.bin',
    downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    sizeBytes: 148000000,
    sizeDisplay: '~145 MB'
  }
]

interface ActiveWhisperDownload {
  modelId: string
  req?: http.ClientRequest
  tempPath: string
  cancelled: boolean
}

class LocalWhisperServiceManager {
  private activeDownload: ActiveWhisperDownload | null = null
  private getWindow: (() => BrowserWindow | null) | null = null

  public setWindowGetter(getter: () => BrowserWindow | null): void {
    this.getWindow = getter
  }

  public getModelsDir(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron')
      if (app && typeof app.getPath === 'function') {
        const dir = join(app.getPath('userData'), 'local-ai', 'whisper')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        return dir
      }
    } catch {
      // fallback
    }
    const dir = join(process.cwd(), 'local-ai', 'whisper')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  public getBinDir(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron')
      if (app && typeof app.getPath === 'function') {
        const dir = join(app.getPath('userData'), 'local-ai', 'bin')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        return dir
      }
    } catch {
      // fallback
    }
    const dir = join(process.cwd(), 'local-ai', 'bin')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  public findWhisperBinary(): string | null {
    const binDir = this.getBinDir()
    const candidates = process.platform === 'win32'
      ? ['whisper-cli.exe', 'main.exe', 'whisper.exe', 'whisper-cpp.exe']
      : ['whisper-cli', 'main', 'whisper-cpp', 'whisper']

    // 1. Direct in local-ai/bin
    for (const name of candidates) {
      const p = join(binDir, name)
      if (existsSync(p)) return p
    }

    // 2. Subdirectories in local-ai/bin
    try {
      const entries = readdirSync(binDir)
      for (const entry of entries) {
        for (const name of candidates) {
          const p = join(binDir, entry, name)
          if (existsSync(p)) return p
        }
      }
    } catch {
      // ignore
    }

    // 3. System common paths
    if (process.platform === 'darwin') {
      const macPaths = [
        '/opt/homebrew/bin/whisper-cli',
        '/opt/homebrew/bin/whisper-cpp',
        '/usr/local/bin/whisper-cli',
        '/usr/local/bin/whisper-cpp'
      ]
      for (const p of macPaths) {
        if (existsSync(p)) return p
      }
    }

    // 4. Check system PATH
    try {
      const checkCmd = process.platform === 'win32' ? 'where whisper-cli' : 'which whisper-cli || which whisper-cpp'
      const out = execSync(checkCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0]
      if (out && existsSync(out)) return out
    } catch {
      // ignore
    }

    return null
  }

  public findFfmpegBinary(): string | null {
    if (process.platform === 'darwin') {
      const macPaths = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
      for (const p of macPaths) {
        if (existsSync(p)) return p
      }
    }
    try {
      const checkCmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg'
      const out = execSync(checkCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0]
      if (out && existsSync(out)) return out
    } catch {
      // ignore
    }
    return null
  }

  public getModelStatus(modelId: string): {
    status: 'not_downloaded' | 'downloading' | 'ready'
    localPath?: string
    sizeBytes?: number
  } {
    const model = WHISPER_MODELS.find((m) => m.id === modelId)
    if (!model) return { status: 'not_downloaded' }

    if (this.activeDownload && this.activeDownload.modelId === modelId) {
      return { status: 'downloading' }
    }

    const fullPath = join(this.getModelsDir(), model.filename)
    if (existsSync(fullPath)) {
      try {
        const stats = statSync(fullPath)
        if (stats.size > 5 * 1024 * 1024) {
          return { status: 'ready', localPath: fullPath, sizeBytes: stats.size }
        }
      } catch {
        // ignore
      }
    }

    return { status: 'not_downloaded' }
  }

  public listModels(): Array<WhisperModelInfo & { status: 'not_downloaded' | 'downloading' | 'ready'; localPath?: string }> {
    return WHISPER_MODELS.map((model) => {
      const statusInfo = this.getModelStatus(model.id)
      return {
        ...model,
        status: statusInfo.status,
        localPath: statusInfo.localPath
      }
    })
  }

  public async downloadModel(
    modelId: string,
    onProgress?: (progress: { modelId: string; progress: number; status: string; error?: string }) => void
  ): Promise<{ success: boolean; error?: string }> {
    const model = WHISPER_MODELS.find((m) => m.id === modelId)
    if (!model) return { success: false, error: 'Model not found in catalog' }

    if (this.activeDownload) {
      return { success: false, error: 'Another download is currently active' }
    }

    const modelsDir = this.getModelsDir()
    const finalPath = join(modelsDir, model.filename)
    const tempPath = finalPath + '.downloading'

    const sendProgress = (p: number, status: string, error?: string): void => {
      if (onProgress) {
        onProgress({ modelId, progress: p, status, error })
      }
      const win = this.getWindow ? this.getWindow() : null
      if (win && !win.isDestroyed()) {
        win.webContents.send('whisper:download-progress', { modelId, progress: p, status, error })
      }
    }

    sendProgress(0, 'downloading')

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const downloadRecord: ActiveWhisperDownload = {
        modelId,
        tempPath,
        cancelled: false
      }
      this.activeDownload = downloadRecord

      const handleDownloadUrl = (url: string): void => {
        const parsedUrl = new URL(url)
        const client = parsedUrl.protocol === 'https:' ? https : http

        const req = client.get(
          url,
          {
            headers: {
              'User-Agent': 'Neuron-Desktop-App',
              Accept: '*/*'
            }
          },
          (res) => {
            // Handle HTTP redirects (Hugging Face resolve redirects to CDN)
            if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
              const redirectUrl = res.headers.location
              if (redirectUrl) {
                handleDownloadUrl(redirectUrl)
                return
              }
            }

            if (res.statusCode !== 200) {
              cleanup()
              const err = `Server returned HTTP ${res.statusCode}`
              sendProgress(0, 'error', err)
              resolve({ success: false, error: err })
              return
            }

            const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || model.sizeBytes
            let downloadedBytes = 0
            const fileStream = createWriteStream(tempPath)

            res.on('data', (chunk: Buffer) => {
              if (downloadRecord.cancelled) {
                res.destroy()
                cleanup()
                resolve({ success: false, error: 'Download cancelled' })
                return
              }

              downloadedBytes += chunk.length
              fileStream.write(chunk)

              const pct = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0
              sendProgress(pct, 'downloading')
            })

            res.on('end', () => {
              fileStream.end(() => {
                if (downloadRecord.cancelled) {
                  cleanup()
                  resolve({ success: false, error: 'Download cancelled' })
                  return
                }

                try {
                  const fs = require('fs')
                  if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath)
                  fs.renameSync(tempPath, finalPath)
                  this.activeDownload = null
                  sendProgress(100, 'completed')
                  resolve({ success: true })
                } catch (err: any) {
                  cleanup()
                  sendProgress(0, 'error', err.message)
                  resolve({ success: false, error: err.message })
                }
              })
            })

            res.on('error', (err) => {
              cleanup()
              sendProgress(0, 'error', err.message)
              resolve({ success: false, error: err.message })
            })
          }
        )

        downloadRecord.req = req
        req.on('error', (err) => {
          cleanup()
          sendProgress(0, 'error', err.message)
          resolve({ success: false, error: err.message })
        })
      }

      const cleanup = (): void => {
        try {
          if (existsSync(tempPath)) unlinkSync(tempPath)
        } catch {
          // ignore
        }
        this.activeDownload = null
      }

      handleDownloadUrl(model.downloadUrl)
    })
  }

  public cancelDownload(modelId: string): boolean {
    if (this.activeDownload && this.activeDownload.modelId === modelId) {
      this.activeDownload.cancelled = true
      if (this.activeDownload.req) {
        this.activeDownload.req.destroy()
      }
      try {
        if (existsSync(this.activeDownload.tempPath)) {
          unlinkSync(this.activeDownload.tempPath)
        }
      } catch {
        // ignore
      }
      this.activeDownload = null
      return true
    }
    return false
  }

  public deleteModel(modelId: string): boolean {
    const model = WHISPER_MODELS.find((m) => m.id === modelId)
    if (!model) return false
    const fullPath = join(this.getModelsDir(), model.filename)
    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath)
        return true
      } catch {
        return false
      }
    }
    return false
  }

  /**
   * Convert an audio file (e.g. .webm, .mp4, .m4a) to 16kHz 16-bit mono WAV for whisper.cpp
   */
  public async convertTo16kWav(inputPath: string, outputPath: string): Promise<void> {
    const ffmpeg = this.findFfmpegBinary()
    if (!ffmpeg) {
      throw new Error(
        'ffmpeg is required for local audio conversion. Please install ffmpeg (e.g. "brew install ffmpeg") or use Cloud transcription.'
      )
    }

    return new Promise((resolve, reject) => {
      const cmd = `"${ffmpeg}" -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`
      exec(cmd, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`Audio conversion failed: ${stderr || err.message}`))
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Transcribe an audio file using local Whisper binary and model
   */
  public async transcribeAudio(
    audioPath: string,
    modelIdOrPath?: string
  ): Promise<LocalWhisperTranscriptionResult> {
    // 1. Resolve model path
    let modelPath = modelIdOrPath
    if (!modelPath) {
      const readyModel = this.listModels().find((m) => m.status === 'ready')
      if (!readyModel || !readyModel.localPath) {
        throw new Error(
          'No local Whisper model is downloaded. Please download Whisper Base or Tiny in Settings.'
        )
      }
      modelPath = readyModel.localPath
    } else if (!existsSync(modelPath)) {
      const fromList = this.listModels().find((m) => m.id === modelPath)
      if (fromList?.localPath && existsSync(fromList.localPath)) {
        modelPath = fromList.localPath
      } else {
        throw new Error(`Local Whisper model file not found: ${modelPath}`)
      }
    }

    // 2. Resolve whisper executable
    const whisperBin = this.findWhisperBinary()
    if (!whisperBin) {
      throw new Error(
        'Local Whisper executable (whisper-cli) not found on system. Please install whisper-cpp (e.g. "brew install whisper-cpp") or use Groq Cloud transcription in Settings.'
      )
    }

    // 3. Prepare temporary 16kHz WAV file
    const tempDir = this.getModelsDir()
    const tempWav = join(tempDir, `temp_transcribe_${Date.now()}.wav`)
    const tempJsonBase = join(tempDir, `temp_transcribe_${Date.now()}`)
    const tempJsonFile = `${tempJsonBase}.json`

    try {
      await this.convertTo16kWav(audioPath, tempWav)

      // 4. Run whisper-cli
      await new Promise<void>((resolve, reject) => {
        const args = ['-m', modelPath!, '-f', tempWav, '-oj', '-of', tempJsonBase]
        const proc = spawn(whisperBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        let stderr = ''

        proc.stderr.on('data', (d) => {
          stderr += d.toString()
        })

        proc.on('close', (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`Whisper execution failed (code ${code}): ${stderr.slice(-300)}`))
          }
        })

        proc.on('error', (err) => {
          reject(err)
        })
      })

      // 5. Parse JSON output
      if (!existsSync(tempJsonFile)) {
        throw new Error('Local Whisper did not produce a transcript output file.')
      }

      const rawJsonStr = readFileSync(tempJsonFile, 'utf-8')
      const parsed = JSON.parse(rawJsonStr)

      const segments: LocalWhisperTranscriptionSegment[] = []
      let fullText = ''

      const rawTrans = parsed.transcription || []
      for (const item of rawTrans) {
        const text = (item.text || '').trim()
        if (!text) continue
        const fromSec = (item.timestamps?.from ? this.parseWhisperTimestamp(item.timestamps.from) : 0)
        const toSec = (item.timestamps?.to ? this.parseWhisperTimestamp(item.timestamps.to) : fromSec + 5)
        segments.push({
          start: fromSec,
          end: toSec,
          text
        })
        fullText += (fullText ? ' ' : '') + text
      }

      const durationSeconds = segments.length > 0 ? Math.round(segments[segments.length - 1].end) : 0

      // Format timestamped text
      const timestampedLines: string[] = []
      for (const seg of segments) {
        const mm = String(Math.floor(seg.start / 60)).padStart(2, '0')
        const ss = String(Math.floor(seg.start % 60)).padStart(2, '0')
        timestampedLines.push(`[${mm}:${ss}] ${seg.text}`)
      }
      const timestampedText = timestampedLines.join('\n\n')

      return {
        text: fullText,
        timestampedText: timestampedText || fullText,
        durationSeconds,
        segments
      }
    } finally {
      // Cleanup temporary files
      try { if (existsSync(tempWav)) unlinkSync(tempWav) } catch {}
      try { if (existsSync(tempJsonFile)) unlinkSync(tempJsonFile) } catch {}
    }
  }

  private parseWhisperTimestamp(ts: string): number {
    // format: "00:01:23.456" or "01:23.456"
    const parts = ts.split(':')
    if (parts.length === 3) {
      const h = parseFloat(parts[0]) || 0
      const m = parseFloat(parts[1]) || 0
      const s = parseFloat(parts[2]) || 0
      return h * 3600 + m * 60 + s
    } else if (parts.length === 2) {
      const m = parseFloat(parts[0]) || 0
      const s = parseFloat(parts[1]) || 0
      return m * 60 + s
    }
    return parseFloat(ts) || 0
  }
}

export const LocalWhisperService = new LocalWhisperServiceManager()
