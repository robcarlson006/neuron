import { existsSync, mkdirSync, createWriteStream, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
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
}

export const LocalWhisperService = new LocalWhisperServiceManager()
