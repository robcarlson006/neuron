import { ipcMain, app, shell, BrowserWindow } from 'electron'
import { createWriteStream, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import os from 'os'
import https from 'https'
import http from 'http'

const GITHUB_OWNER = 'robcarlson006'
const GITHUB_REPO  = 'neuron'

let getWindow: () => BrowserWindow | null = () => null

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compare semver strings. Returns true if b > a. */
function isNewer(current: string, latest: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map(Number)
  const [ma, mi, pa] = parse(current)
  const [mb, mj, pb] = parse(latest)
  if (mb !== ma) return mb > ma
  if (mj !== mi) return mj > mi
  return pb > pa
}

/** HTTP GET with redirect following — returns parsed JSON. */
function fetchJSON(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    function get(u: string): void {
      const lib = u.startsWith('https') ? https : http
      lib.get(
        u,
        { headers: { 'User-Agent': 'Neuron-App', Accept: 'application/vnd.github+json' } },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            get(res.headers.location!)
            return
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
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function get(u: string): void {
      const lib = u.startsWith('https') ? https : http
      lib.get(
        u,
        { headers: { 'User-Agent': 'Neuron-App' } },
        (res) => {
          // Follow redirects
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            get(res.headers.location!)
            return
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
function pickAsset(assets: { name: string; browser_download_url: string }[]): string | null {
  const platform = process.platform
  const arch     = process.arch  // 'arm64' | 'x64'

  if (platform === 'darwin') {
    // Prefer arm64 DMG on Apple Silicon, x64 DMG on Intel
    const target = arch === 'arm64'
      ? assets.find(a => a.name.match(/arm64.*\.dmg$/i) || a.name.match(/\.dmg$/i) && a.name.includes('arm64'))
      : assets.find(a => a.name.match(/x64.*\.dmg$/i)   || a.name.match(/\.dmg$/i) && !a.name.includes('arm64'))
    return target?.browser_download_url
      ?? assets.find(a => a.name.endsWith('.dmg'))?.browser_download_url
      ?? null
  }

  if (platform === 'win32') {
    // Prefer NSIS Setup exe
    return assets.find(a => a.name.match(/Setup.*\.exe$/i))?.browser_download_url
      ?? assets.find(a => a.name.endsWith('.exe'))?.browser_download_url
      ?? null
  }

  return null
}

// ── macOS auto-install shell script ──────────────────────────────────────────
function buildMacInstallScript(dmgPath: string): string {
  return `#!/bin/bash
set -e
sleep 3

# Mount DMG
VOLUME=$(hdiutil attach "${dmgPath}" -nobrowse -noautoopen 2>/dev/null | awk 'END{print $NF}')
if [ -z "$VOLUME" ]; then
  echo "Failed to mount DMG" >&2
  exit 1
fi

APP_SRC="$VOLUME/Neuron.app"

# Try to copy without admin first
if cp -fR "$APP_SRC" "/Applications/Neuron.app" 2>/dev/null; then
  echo "Copied without admin"
else
  # Fallback: prompt for admin password via AppleScript
  osascript -e "do shell script \\"cp -fR '$APP_SRC' '/Applications/Neuron.app'\\" with administrator privileges"
fi

hdiutil detach "$VOLUME" -quiet || true

# Clean up DMG
rm -f "${dmgPath}"

# Relaunch app
sleep 1
open -a Neuron
`
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

export function registerUpdaterHandlers(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter

  // ── Get current version ──
  ipcMain.handle('updater:getVersion', () => app.getVersion())

  // ── Check GitHub for latest release ──
  ipcMain.handle('updater:checkGitHub', async () => {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    try {
      const data = await fetchJSON(url) as {
        tag_name: string
        html_url: string
        body?: string
        assets: { name: string; browser_download_url: string }[]
      }

      const latestTag     = data.tag_name ?? ''
      const latestVersion = latestTag.replace(/^v/, '')
      const currentVersion = app.getVersion()
      const updateAvailable = isNewer(currentVersion, latestVersion)
      const downloadUrl    = pickAsset(data.assets)

      return {
        currentVersion,
        latestVersion,
        updateAvailable,
        downloadUrl,
        releaseUrl: data.html_url,
        releaseNotes: data.body ?? ''
      }
    } catch (err) {
      throw new Error(`Could not reach GitHub: ${(err as Error).message}`)
    }
  })

  // ── Download update binary ──
  ipcMain.handle('updater:download', async (_event, downloadUrl: string, version: string) => {
    const platform = process.platform
    const ext      = platform === 'darwin' ? 'dmg' : 'exe'
    const fileName = `Neuron-${version}-update.${ext}`

    // Save to ~/Downloads so the user can find it
    const destPath = join(os.homedir(), 'Downloads', fileName)

    try {
      await downloadFile(downloadUrl, destPath)
      return { success: true, filePath: destPath }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // ── Install update ──
  ipcMain.handle('updater:install', async (_event, filePath: string) => {
    const platform = process.platform

    if (platform === 'darwin') {
      // Write background install script, then quit
      const scriptPath = join(os.tmpdir(), 'neuron_update.sh')
      try {
        writeFileSync(scriptPath, buildMacInstallScript(filePath), { mode: 0o755 })
        // Spawn the script detached so it outlives the app
        spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
        // Give the spawn a moment then quit
        setTimeout(() => app.quit(), 500)
        return { success: true, method: 'script' }
      } catch (err) {
        // Fallback: just open the DMG in Finder
        await shell.openPath(filePath)
        return { success: true, method: 'finder' }
      }
    }

    if (platform === 'win32') {
      // NSIS installer handles everything — just open it
      await shell.openPath(filePath)
      setTimeout(() => app.quit(), 1000)
      return { success: true, method: 'nsis' }
    }

    // Linux / other — open in file manager
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
}
