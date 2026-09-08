import { ipcMain, app, BrowserWindow } from 'electron'
import { createWriteStream, existsSync, mkdirSync, unlinkSync, renameSync, statSync, chmodSync, readdirSync } from 'fs'
import { join } from 'path'
import { spawn, exec, ChildProcess } from 'child_process'
import https from 'https'
import http from 'http'
import type { LocalModelInfo, DownloadProgress, LocalEngineStatus } from '../../src/types'
import { getHardwareProfile } from './localHardware'
import { saveAIConfig } from './aiConfigStore'

export const MODEL_CATALOG: Omit<LocalModelInfo, 'status' | 'isRecommended' | 'localPath'>[] = [
  {
    id: 'qwen-2.5-1.5b',
    name: 'Qwen 2.5 1.5B Instruct',
    description: 'Ultra-lightweight model. Designed for laptops with <8 GB RAM or older computers.',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeBytes: 1117282816,
    sizeDisplay: '1.1 GB',
    ramRequirementDisplay: '~1.6 GB RAM'
  },
  {
    id: 'qwen-2.5-3b',
    name: 'Qwen 2.5 3B Instruct',
    description: 'Balanced speed & high accuracy. Optimal for 8GB–12GB Macs (M1/M2/M3) and modern PCs.',
    filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    sizeBytes: 2176000000,
    sizeDisplay: '2.2 GB',
    ramRequirementDisplay: '~2.8 GB RAM'
  },
  {
    id: 'qwen-2.5-7b',
    name: 'Qwen 2.5 7B Instruct',
    description: 'Highest reasoning and card generation quality. Best for machines with 16GB+ RAM.',
    filename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    sizeBytes: 4680000000,
    sizeDisplay: '4.7 GB',
    ramRequirementDisplay: '~5.5 GB RAM'
  }
]

let getWindow: () => BrowserWindow | null = () => null

export function setLocalEngineWindowGetter(getter: () => BrowserWindow | null): void {
  getWindow = getter
}

function getModelsDir(): string {
  const dir = join(app.getPath('userData'), 'local-ai', 'models')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getBinDir(): string {
  const dir = join(app.getPath('userData'), 'local-ai', 'bin')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ── Active Download State ───────────────────────────────────────────────────

interface ActiveDownload {
  modelId: string
  req?: http.ClientRequest
  fileStream?: ReturnType<typeof createWriteStream>
  tempPath: string
  cancelled: boolean
}

let activeDownload: ActiveDownload | null = null

export function listLocalModels(): LocalModelInfo[] {
  const modelsDir = getModelsDir()
  const profile = getHardwareProfile()

  return MODEL_CATALOG.map((item) => {
    const fullPath = join(modelsDir, item.filename)
    let status: 'not_downloaded' | 'downloading' | 'ready' = 'not_downloaded'
    let localPath: string | undefined = undefined

    if (activeDownload && activeDownload.modelId === item.id) {
      status = 'downloading'
    } else if (existsSync(fullPath)) {
      try {
        const stats = statSync(fullPath)
        // Verify file is not empty or tiny
        if (stats.size > 10 * 1024 * 1024) {
          status = 'ready'
          localPath = fullPath
        }
      } catch {
        status = 'not_downloaded'
      }
    }

    return {
      ...item,
      status,
      localPath,
      isRecommended: profile.recommendedModelId === item.id
    }
  })
}

export function cancelModelDownload(modelId: string): { success: boolean } {
  if (activeDownload && activeDownload.modelId === modelId) {
    activeDownload.cancelled = true
    if (activeDownload.req) {
      activeDownload.req.destroy()
    }
    if (activeDownload.fileStream) {
      activeDownload.fileStream.destroy()
    }
    if (existsSync(activeDownload.tempPath)) {
      try {
        unlinkSync(activeDownload.tempPath)
      } catch {
        // ignore
      }
    }
    const win = getWindow()
    if (win) {
      win.webContents.send('local-ai:download-progress', {
        modelId,
        bytesDownloaded: 0,
        totalBytes: 0,
        percent: 0,
        status: 'cancelled'
      } as DownloadProgress)
    }
    activeDownload = null
    return { success: true }
  }
  return { success: false }
}

export function deleteLocalModel(modelId: string): { success: boolean; error?: string } {
  const modelsDir = getModelsDir()
  const model = MODEL_CATALOG.find((m) => m.id === modelId)
  if (!model) {
    return { success: false, error: 'Model not found' }
  }

  // Stop engine if it is running this model
  if (engineStatus.isRunning && engineStatus.activeModelId === modelId) {
    stopEngine()
  }

  const fullPath = join(modelsDir, model.filename)
  if (existsSync(fullPath)) {
    try {
      unlinkSync(fullPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }

  return { success: true }
}

export function downloadLocalModel(modelId: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (activeDownload) {
      resolve({ success: false, error: 'Another model download is currently in progress.' })
      return
    }

    const model = MODEL_CATALOG.find((m) => m.id === modelId)
    if (!model) {
      resolve({ success: false, error: 'Model not found in catalog.' })
      return
    }

    const modelsDir = getModelsDir()
    const destFinalPath = join(modelsDir, model.filename)
    const destTempPath = join(modelsDir, `${model.filename}.part`)

    activeDownload = {
      modelId,
      tempPath: destTempPath,
      cancelled: false
    }

    // Ensure engine binary is downloaded in background while model is downloading
    ensureLocalEngineBinary().catch(() => {})

    const win = getWindow()

    function emitProgress(bytesDownloaded: number, totalBytes: number, percent: number, status: DownloadProgress['status'], error?: string): void {
      const targetWin = win || getWindow()
      if (targetWin) {
        targetWin.webContents.send('local-ai:download-progress', {
          modelId,
          bytesDownloaded,
          totalBytes,
          percent,
          status,
          error
        } as DownloadProgress)
      }
    }

    const expectedSizeBytes = model.sizeBytes
    emitProgress(0, expectedSizeBytes, 0, 'downloading')

    function fetchWithRedirects(u: string, redirectCount = 0): void {
      if (redirectCount > 10) {
        activeDownload = null
        emitProgress(0, 0, 0, 'error', 'Too many redirects')
        resolve({ success: false, error: 'Too many redirects' })
        return
      }

      const isHttps = u.startsWith('https:')
      const lib = isHttps ? https : http

      const req = lib.get(u, { headers: { 'User-Agent': 'Neuron-App' } }, (res) => {
        if (activeDownload?.cancelled) return

        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          if (res.headers.location) {
            fetchWithRedirects(res.headers.location, redirectCount + 1)
            return
          }
        }

        if (res.statusCode !== 200) {
          activeDownload = null
          const msg = `Download failed with HTTP ${res.statusCode}`
          emitProgress(0, 0, 0, 'error', msg)
          resolve({ success: false, error: msg })
          return
        }

        const totalBytes = parseInt(res.headers['content-length'] || `${expectedSizeBytes}`, 10)
        let bytesDownloaded = 0

        const fileStream = createWriteStream(destTempPath)
        if (activeDownload) {
          activeDownload.fileStream = fileStream
        }

        res.on('data', (chunk: Buffer) => {
          if (activeDownload?.cancelled) return
          bytesDownloaded += chunk.length
          fileStream.write(chunk)
          const pct = totalBytes > 0 ? Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100)) : 0
          emitProgress(bytesDownloaded, totalBytes, pct, 'downloading')
        })

        res.on('end', () => {
          if (activeDownload?.cancelled) return
          fileStream.end()
          fileStream.on('finish', () => {
            try {
              if (existsSync(destFinalPath)) {
                unlinkSync(destFinalPath)
              }
              renameSync(destTempPath, destFinalPath)
              activeDownload = null
              emitProgress(totalBytes, totalBytes, 100, 'completed')
              resolve({ success: true })
            } catch (err) {
              activeDownload = null
              const errStr = (err as Error).message
              emitProgress(0, 0, 0, 'error', errStr)
              resolve({ success: false, error: errStr })
            }
          })
        })

        res.on('error', (err) => {
          fileStream.destroy()
          activeDownload = null
          emitProgress(0, 0, 0, 'error', err.message)
          resolve({ success: false, error: err.message })
        })

        fileStream.on('error', (err) => {
          activeDownload = null
          emitProgress(0, 0, 0, 'error', err.message)
          resolve({ success: false, error: err.message })
        })
      })

      req.on('error', (err) => {
        if (activeDownload?.cancelled) return
        activeDownload = null
        emitProgress(0, 0, 0, 'error', err.message)
        resolve({ success: false, error: err.message })
      })

      if (activeDownload) {
        activeDownload.req = req
      }
    }

    fetchWithRedirects(model.downloadUrl)
  })
}

// ── Helper: Download File with Redirects ────────────────────────────────────

function downloadFileWithRedirects(u: string, destPath: string, redirectCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) {
      reject(new Error('Too many redirects'))
      return
    }

    const isHttps = u.startsWith('https:')
    const lib = isHttps ? https : http

    const req = lib.get(u, { headers: { 'User-Agent': 'Neuron-App' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        if (res.headers.location) {
          downloadFileWithRedirects(res.headers.location, destPath, redirectCount + 1)
            .then(resolve)
            .catch(reject)
          return
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed with HTTP ${res.statusCode}`))
        return
      }

      const fileStream = createWriteStream(destPath)
      res.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close(() => resolve())
      })

      fileStream.on('error', (err) => {
        try { unlinkSync(destPath) } catch {}
        reject(err)
      })

      res.on('error', (err) => {
        fileStream.destroy()
        reject(err)
      })
    })

    req.on('error', reject)
  })
}

// ── Binary Management ──────────────────────────────────────────────────────

export function getEngineBinaryPath(): string | null {
  const binDir = getBinDir()
  const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'

  // 1. Direct path in binDir
  const directPath = join(binDir, exeName)
  if (existsSync(directPath)) return directPath

  // 2. Extracted subfolder inside binDir (e.g. binDir/llama-b10864/llama-server)
  try {
    const entries = readdirSync(binDir)
    for (const entry of entries) {
      const subPath = join(binDir, entry, exeName)
      if (existsSync(subPath)) return subPath
    }
  } catch {}

  // 3. Fallback standard system locations (e.g. Homebrew on macOS)
  if (process.platform === 'darwin') {
    if (existsSync('/opt/homebrew/bin/llama-server')) return '/opt/homebrew/bin/llama-server'
    if (existsSync('/usr/local/bin/llama-server')) return '/usr/local/bin/llama-server'
  }

  return null
}

export async function ensureLocalEngineBinary(
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; binaryPath?: string; error?: string }> {
  const existing = getEngineBinaryPath()
  if (existing) {
    return { success: true, binaryPath: existing }
  }

  onStatus?.('Downloading local inference engine (~11 MB)...')
  const binDir = getBinDir()

  let archiveUrl = ''
  let isTarGz = true

  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') {
      archiveUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b10864/llama-b10864-bin-macos-arm64.tar.gz'
    } else {
      archiveUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b10864/llama-b10864-bin-macos-x64.tar.gz'
    }
  } else if (process.platform === 'win32') {
    archiveUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b10864/llama-b10864-bin-win-cpu-x64.zip'
    isTarGz = false
  } else {
    archiveUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b10864/llama-b10864-bin-ubuntu-x64.tar.gz'
  }

  const archivePath = join(binDir, isTarGz ? 'engine.tar.gz' : 'engine.zip')

  try {
    await downloadFileWithRedirects(archiveUrl, archivePath)
    onStatus?.('Extracting engine binary...')

    await new Promise<void>((resolve, reject) => {
      const extractCmd = isTarGz
        ? `tar -xzf "${archivePath}" -C "${binDir}"`
        : `tar -xf "${archivePath}" -C "${binDir}"`

      exec(extractCmd, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    try { unlinkSync(archivePath) } catch {}

    const binPath = getEngineBinaryPath()
    if (!binPath) {
      return { success: false, error: 'Failed to locate extracted llama-server binary.' }
    }

    if (process.platform !== 'win32') {
      try {
        chmodSync(binPath, 0o755)
      } catch {}
      if (process.platform === 'darwin') {
        try {
          exec(`xattr -rd com.apple.quarantine "${binDir}" 2>/dev/null`, () => {})
        } catch {}
      }
    }

    return { success: true, binaryPath: binPath }
  } catch (err) {
    return { success: false, error: `Failed to set up local engine: ${(err as Error).message}` }
  }
}

// ── Process Supervisor ─────────────────────────────────────────────────────

let engineProcess: ChildProcess | null = null
let engineStatus: LocalEngineStatus = { isRunning: false }

export function getEngineStatus(): LocalEngineStatus {
  return { ...engineStatus }
}

export function stopEngine(): { success: boolean } {
  if (engineProcess) {
    try {
      engineProcess.kill('SIGTERM')
    } catch {
      // ignore
    }
    engineProcess = null
  }
  engineStatus = { isRunning: false }
  return { success: true }
}

export async function startEngine(modelId: string, port = 8080): Promise<{ success: boolean; error?: string; port?: number }> {
  if (engineStatus.isRunning && engineStatus.activeModelId === modelId) {
    return { success: true, port: engineStatus.port }
  }

  if (engineStatus.isRunning) {
    stopEngine()
  }

  const model = MODEL_CATALOG.find((m) => m.id === modelId)
  if (!model) {
    return { success: false, error: 'Model not found' }
  }

  const modelsDir = getModelsDir()
  const modelPath = join(modelsDir, model.filename)

  if (!existsSync(modelPath)) {
    return { success: false, error: `Model file ${model.filename} is not downloaded yet.` }
  }

  // Ensure llama-server binary is present (downloads in seconds if missing)
  const binaryRes = await ensureLocalEngineBinary()
  if (!binaryRes.success || !binaryRes.binaryPath) {
    return {
      success: false,
      error: binaryRes.error || 'Failed to initialize local inference engine.'
    }
  }
  const executable = binaryRes.binaryPath

  return new Promise((resolve) => {
    try {
      const proc = spawn(
        executable,
        [
          '-m', modelPath,
          '--port', String(port),
          '--host', '127.0.0.1',
          '-c', '2048'
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: join(executable, '..')
        }
      )

      engineProcess = proc
      let resolved = false

      proc.stdout?.on('data', (data: Buffer) => {
        const str = data.toString()
        if (str.includes('HTTP server listening') || str.includes('listening at') || str.includes('all slots are idle')) {
          if (!resolved) {
            resolved = true
            engineStatus = { isRunning: true, port, activeModelId: modelId }
            saveAIConfig({
              provider: 'openai-compatible',
              baseUrl: `http://127.0.0.1:${port}`,
              model: model.name
            })
            resolve({ success: true, port })
          }
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const str = data.toString()
        if (str.includes('HTTP server listening') || str.includes('listening at') || str.includes('all slots are idle')) {
          if (!resolved) {
            resolved = true
            engineStatus = { isRunning: true, port, activeModelId: modelId }
            saveAIConfig({
              provider: 'openai-compatible',
              baseUrl: `http://127.0.0.1:${port}`,
              model: model.name
            })
            resolve({ success: true, port })
          }
        }
      })

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true
          engineStatus = { isRunning: false, error: err.message }
          resolve({
            success: false,
            error: `Could not launch local inference engine: ${err.message}.`
          })
        }
      })

      proc.on('exit', (code) => {
        engineStatus = { isRunning: false }
        engineProcess = null
        if (!resolved) {
          resolved = true
          resolve({ success: false, error: `Engine exited with code ${code}` })
        }
      })

      // Timeout fallback after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          if (engineProcess && !engineProcess.killed) {
            engineStatus = { isRunning: true, port, activeModelId: modelId }
            saveAIConfig({
              provider: 'openai-compatible',
              baseUrl: `http://127.0.0.1:${port}`,
              model: model.name
            })
            resolve({ success: true, port })
          } else {
            resolve({ success: false, error: 'Engine startup timed out.' })
          }
        }
      }, 30000)
    } catch (err) {
      resolve({ success: false, error: (err as Error).message })
    }
  })
}

// ── IPC Handlers Registration ──────────────────────────────────────────────

export function registerLocalEngineHandlers(): void {
  ipcMain.handle('local-ai:get-hardware-profile', () => {
    return getHardwareProfile()
  })

  ipcMain.handle('local-ai:list-models', () => {
    return listLocalModels()
  })

  ipcMain.handle('local-ai:download-model', (_e, modelId: string) => {
    return downloadLocalModel(modelId)
  })

  ipcMain.handle('local-ai:cancel-download', (_e, modelId: string) => {
    return cancelModelDownload(modelId)
  })

  ipcMain.handle('local-ai:delete-model', (_e, modelId: string) => {
    return deleteLocalModel(modelId)
  })

  ipcMain.handle('local-ai:get-engine-status', () => {
    return getEngineStatus()
  })

  ipcMain.handle('local-ai:start-engine', (_e, modelId: string, port?: number) => {
    return startEngine(modelId, port)
  })

  ipcMain.handle('local-ai:stop-engine', () => {
    return stopEngine()
  })
}
