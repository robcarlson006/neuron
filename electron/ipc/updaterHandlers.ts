import { ipcMain, app, shell, BrowserWindow } from 'electron'
import { createWriteStream, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import os from 'os'
import https from 'https'
import http from 'http'

const GITHUB_OWNER = 'robmcarlson006'
const GITHUB_REPO  = 'neuron'

let getWindow: () => BrowserWindow | null = () => null
let backgroundCheckTimer: NodeJS.Timeout | null = null

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  downloadUrl: string | null
  releaseUrl: string
  releaseNotes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compare semver strings. Returns true if latest > current. */
export function isNewer(current: string, latest: string): boolean {
  if (!current || !latest) return false
  const clean = (v: string): string => v.replace(/^v/i, '').trim().split('-')[0]
  const cParts = clean(current).split('.').map(n => parseInt(n, 10) || 0)
  const lParts = clean(latest).split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(cParts.length, lParts.length, 3)
  for (let i = 0; i < len; i++) {
    const c = cParts[i] ?? 0
    const l = lParts[i] ?? 0
    if (l > c) return true
    if (l < c) return false
  }
  return false
}

/** HTTP GET with redirect following — returns parsed JSON. */
export function fetchJSON(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    function get(u: string, redirectCount = 0): void {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }
      const lib = u.startsWith('https') ? https : http
      lib.get(
        u,
        { headers: { 'User-Agent': 'Neuron-App', Accept: 'application/vnd.github+json' } },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            if (res.headers.location) {
              get(res.headers.location, redirectCount + 1)
              return
            }
          }
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API returned ${res.statusCode}`))
            return
          }
          let body = ''
          res.on('data', (chunk: Buffer) => { body += chunk.toString() })
          res.on('end', () => {
            try { resolve(JSON.parse(body)) }
            catch (e) { reject(e) }
          })
        }
      ).on('error', reject)
    }
    get(url)
  })
}

/** Download a URL to destPath, emitting progress (0-100) to the renderer. */
export function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    function get(u: string, redirectCount = 0): void {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }
      const lib = u.startsWith('https') ? https : http
      lib.get(
        u,
        { headers: { 'User-Agent': 'Neuron-App' } },
        (res) => {
          // Follow redirects
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            if (res.headers.location) {
              get(res.headers.location, redirectCount + 1)
              return
            }
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`))
            return
          }

          const total = parseInt(res.headers['content-length'] ?? '0', 10)
          let received = 0
          const file = createWriteStream(destPath)

          res.on('data', (chunk: Buffer) => {
            received += chunk.length
            file.write(chunk)
            if (total > 0) {
              const pct = Math.round((received / total) * 100)
              if (onProgress) onProgress(pct)
              getWindow()?.webContents.send('updater:download-progress', pct)
            }
          })

          res.on('end', () => {
            file.end()
            file.on('finish', resolve)
          })

          res.on('error', (err) => { file.destroy(); reject(err) })
          file.on('error', reject)
        }
      ).on('error', reject)
    }
    get(url)
  })
}

/** Pick the right asset URL for the current platform/arch. */
export function pickAsset(
  assets: { name: string; browser_download_url: string }[],
  targetPlatform: string = process.platform,
  targetArch: string = process.arch,
  preferredArch?: string
): string | null {
  if (!assets || assets.length === 0) return null

  if (targetPlatform === 'darwin') {
    let resolvedArch = preferredArch && preferredArch !== 'auto' ? preferredArch : targetArch
    if (!resolvedArch) resolvedArch = 'arm64'

    // 1. Prefer DMG matching the target architecture
    const target = resolvedArch === 'arm64'
      ? assets.find(a => /arm64.*\.dmg$/i.test(a.name) || /aarch64.*\.dmg$/i.test(a.name))
      : assets.find(a => /x64.*\.dmg$/i.test(a.name) || /x86_64.*\.dmg$/i.test(a.name))

    // 2. Fallback: any DMG that mentions the arch
    const fallback = resolvedArch === 'arm64'
      ? assets.find(a => a.name.toLowerCase().endsWith('.dmg') && (a.name.includes('arm64') || a.name.includes('aarch64')))
      : assets.find(a => a.name.toLowerCase().endsWith('.dmg') && !a.name.includes('arm64') && !a.name.includes('aarch64'))

    // 3. Final fallback: any DMG
    return target?.browser_download_url
      ?? fallback?.browser_download_url
      ?? assets.find(a => a.name.toLowerCase().endsWith('.dmg'))?.browser_download_url
      ?? null
  }

  if (targetPlatform === 'win32') {
    // Prefer NSIS Setup exe
    return assets.find(a => /Setup.*\.exe$/i.test(a.name))?.browser_download_url
      ?? assets.find(a => a.name.toLowerCase().endsWith('.exe'))?.browser_download_url
      ?? null
  }

  if (targetPlatform === 'linux') {
    // Prefer AppImage
    return assets.find(a => a.name.toLowerCase().endsWith('.appimage'))?.browser_download_url
      ?? assets.find(a => a.name.toLowerCase().endsWith('.deb'))?.browser_download_url
      ?? assets.find(a => a.name.toLowerCase().endsWith('.tar.gz'))?.browser_download_url
      ?? null
  }

  return null
}

/** Retrieve user preferred arch from SQLite database if set. */
export function getPreferredArchFromDB(): string | undefined {
  try {
    const Database = require('better-sqlite3')
    const userDataPath = app.getPath('userData')
    const dbPath = join(userDataPath, 'studyhelper.db')
    const db = new Database(dbPath)
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('preferred_arch') as { value?: string } | undefined
    db.close()
    return row?.value
  } catch {
    return undefined
  }
}

// ── macOS auto-install shell script ──────────────────────────────────────────
export function buildMacInstallScript(dmgPath: string): string {
  return `#!/bin/bash
set -e
sleep 2

# Mount DMG with robust mount point extraction
MOUNT_OUTPUT=$(hdiutil attach "${dmgPath}" -nobrowse -noautoopen 2>&1)
VOLUME=$(echo "$MOUNT_OUTPUT" | grep -o '/Volumes/.*' | head -n 1)

if [ -z "$VOLUME" ] || [ ! -d "$VOLUME" ]; then
  echo "Failed to mount DMG: $MOUNT_OUTPUT" >&2
  exit 1
fi

APP_SRC=$(find "$VOLUME" -maxdepth 2 -name "*.app" | head -n 1)
if [ -z "$APP_SRC" ]; then
  echo "No .app bundle found in DMG" >&2
  hdiutil detach "$VOLUME" -force -quiet || true
  exit 1
fi

DEST="/Applications/Neuron.app"

# Replace app bundle cleanly
if rm -rf "$DEST" 2>/dev/null && cp -R "$APP_SRC" "$DEST" 2>/dev/null; then
  echo "Updated successfully without admin"
elif cp -R "$APP_SRC" "$DEST" 2>/dev/null; then
  echo "Copied successfully"
else
  # Fallback: prompt for admin privileges via AppleScript
  osascript -e "do shell script \\"rm -rf '$DEST' && cp -R '$APP_SRC' '$DEST'\\" with administrator privileges"
fi

# Remove quarantine flags so macOS doesn't block unsigned update
xattr -cr "$DEST" 2>/dev/null || true

# Unmount DMG
hdiutil detach "$VOLUME" -force -quiet || true

# Clean up downloaded DMG file
rm -f "${dmgPath}"

# Wait and relaunch
sleep 1
open "$DEST" || open -a Neuron
`
}

// ── Update Checker Core Function ─────────────────────────────────────────────

export async function checkGitHubUpdates(): Promise<UpdateInfo> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
  const data = await fetchJSON(url) as {
    tag_name: string
    html_url: string
    body?: string
    assets: { name: string; browser_download_url: string }[]
  }

  const latestTag      = data.tag_name ?? ''
  const latestVersion  = latestTag.replace(/^v/i, '')
  const currentVersion = app.getVersion()
  const updateAvailable = isNewer(currentVersion, latestVersion)
  const preferredArch  = getPreferredArchFromDB()
  const downloadUrl    = pickAsset(data.assets, process.platform, process.arch, preferredArch)

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    downloadUrl,
    releaseUrl: data.html_url,
    releaseNotes: data.body ?? ''
  }
}

// ── Background Auto-Check ───────────────────────────────────────────────────

export function startPeriodicUpdateCheck(intervalMs = 2 * 60 * 60 * 1000): void {
  if (backgroundCheckTimer) {
    clearInterval(backgroundCheckTimer)
  }

  // Run initial check after 5 seconds
  setTimeout(async () => {
    try {
      const info = await checkGitHubUpdates()
      if (info.updateAvailable) {
        const win = getWindow()
        win?.webContents.send('updater:available', info)
        win?.webContents.send('update:available', info.latestVersion)
      }
    } catch {
      // Background check fails silently if offline
    }
  }, 5000)

  // Recurring check
  backgroundCheckTimer = setInterval(async () => {
    try {
      const info = await checkGitHubUpdates()
      if (info.updateAvailable) {
        const win = getWindow()
        win?.webContents.send('updater:available', info)
        win?.webContents.send('update:available', info.latestVersion)
      }
    } catch {
      // Offline, ignore
    }
  }, intervalMs)
}

// ── IPC Handlers Registration ────────────────────────────────────────────────

export function registerUpdaterHandlers(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter

  // ── Get current version ──
  ipcMain.handle('updater:getVersion', () => app.getVersion())

  // ── Check GitHub for latest release ──
  ipcMain.handle('updater:checkGitHub', async () => {
    try {
      return await checkGitHubUpdates()
    } catch (err) {
      throw new Error(`Could not reach GitHub: ${(err as Error).message}`)
    }
  })

  // ── Download update binary ──
  ipcMain.handle('updater:download', async (_event, downloadUrl: string, version: string) => {
    const platform = process.platform
    const ext      = platform === 'darwin' ? 'dmg' : platform === 'win32' ? 'exe' : 'AppImage'
    const fileName = `Neuron-${version}-update.${ext}`

    // Save to ~/Downloads so the user can easily find it if needed
    const destPath = join(os.homedir(), 'Downloads', fileName)

    try {
      await downloadFile(downloadUrl, destPath)
      // Notify renderer download is ready
      getWindow()?.webContents.send('updater:downloaded', { filePath: destPath, version })
      getWindow()?.webContents.send('update:downloaded', version)
      return { success: true, filePath: destPath }
    } catch (err) {
      getWindow()?.webContents.send('updater:error', (err as Error).message)
      getWindow()?.webContents.send('update:error', (err as Error).message)
      return { success: false, error: (err as Error).message }
    }
  })

  // ── Install update ──
  ipcMain.handle('updater:install', async (_event, filePath: string) => {
    const platform = process.platform

    if (platform === 'darwin') {
      // Write background install script, spawn detached, then quit
      const scriptPath = join(os.tmpdir(), 'neuron_update.sh')
      try {
        writeFileSync(scriptPath, buildMacInstallScript(filePath), { mode: 0o755 })
        spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
        setTimeout(() => app.quit(), 500)
        return { success: true, method: 'script' }
      } catch (err) {
        // Fallback: just open the DMG in Finder
        await shell.openPath(filePath)
        return { success: true, method: 'finder' }
      }
    }

    if (platform === 'win32') {
      // NSIS installer handles everything — launch and quit
      await shell.openPath(filePath)
      setTimeout(() => app.quit(), 1000)
      return { success: true, method: 'nsis' }
    }

    // Linux / other — open in file manager / launch AppImage
    await shell.openPath(filePath)
    return { success: true, method: 'open' }
  })

  // ── Open release page in browser (fallback) ──
  ipcMain.handle('updater:openReleasePage', (_event, url: string) => {
    shell.openExternal(url)
  })

  // ── Clean up a downloaded file ──
  ipcMain.handle('updater:cleanupFile', (_event, filePath: string) => {
    try { unlinkSync(filePath) } catch { /* ignore */ }
  })

  // Start periodic background check
  startPeriodicUpdateCheck()
}

