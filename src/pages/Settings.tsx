import React, { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'

interface SettingsProps {
  onStartDemo?: () => void
}

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'

interface UpdateInfo {
  latestVersion: string
  downloadUrl: string | null
  releaseUrl: string
}

export default function Settings({ onStartDemo }: SettingsProps): React.JSX.Element {
  const { user, setUser, theme, toggleTheme } = useAppStore()
  const [name, setName] = useState(user?.name || '')
  const [reminderTime, setReminderTime] = useState('09:00')
  const [savedName, setSavedName] = useState(false)

  // Version / update state
  const [currentVersion, setCurrentVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadedPath, setDownloadedPath] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [installMethod, setInstallMethod] = useState('')
  const progressListenerSet = useRef(false)

  useEffect(() => {
    window.electronAPI.getVersion().then(setCurrentVersion).catch(() => {})

    if (!progressListenerSet.current) {
      progressListenerSet.current = true
      window.electronAPI.onDownloadProgress((pct) => setDownloadProgress(pct))
    }
  }, [])

  async function handleCheckForUpdates(): Promise<void> {
    setUpdateStatus('checking')
    setUpdateError('')
    setUpdateInfo(null)
    try {
      const result = await window.electronAPI.checkGitHub()
      if (result.updateAvailable) {
        setUpdateInfo({
          latestVersion: result.latestVersion,
          downloadUrl: result.downloadUrl,
          releaseUrl: result.releaseUrl
        })
        setUpdateStatus('available')
      } else {
        setUpdateStatus('up-to-date')
      }
    } catch (err) {
      setUpdateError((err as Error).message ?? 'Could not check for updates.')
      setUpdateStatus('error')
    }
  }

  async function handleDownload(): Promise<void> {
    if (!updateInfo?.downloadUrl) {
      // No direct download — open releases page
      window.electronAPI.openReleasePage(updateInfo!.releaseUrl)
      return
    }
    setUpdateStatus('downloading')
    setDownloadProgress(0)
    const result = await window.electronAPI.downloadUpdate(
      updateInfo.downloadUrl,
      updateInfo.latestVersion
    )
    if (result.success && result.filePath) {
      setDownloadedPath(result.filePath)
      setUpdateStatus('downloaded')
    } else {
      setUpdateError(result.error ?? 'Download failed.')
      setUpdateStatus('error')
    }
  }

  async function handleInstall(): Promise<void> {
    if (!downloadedPath) return
    setUpdateStatus('installing')
    const result = await window.electronAPI.installDownloadedUpdate(downloadedPath)
    if (result.success) {
      setInstallMethod(result.method)
      // On mac/script the app will quit automatically; show message in case it doesn't
    } else {
      setUpdateError('Install failed. Try opening the file manually.')
      setUpdateStatus('error')
    }
  }

  function handleCancelDownload(): void {
    if (downloadedPath) {
      window.electronAPI.cleanupUpdateFile(downloadedPath).catch(() => {})
    }
    setUpdateStatus('idle')
    setUpdateInfo(null)
    setDownloadedPath('')
    setDownloadProgress(0)
  }

  const isMac = navigator.userAgent.includes('Macintosh')

  async function handleSaveName(): Promise<void> {
    if (!name.trim() || !user) return
    try {
      const updated = await window.electronAPI.saveUser(name.trim())
      setUser(updated)
      setSavedName(true)
      setTimeout(() => setSavedName(false), 2000)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSaveApiKey(): Promise<void> {
    if (!apiKey.trim()) return
    try {
      await window.electronAPI.saveApiKey(apiKey.trim())
      const masked = await window.electronAPI.getApiKey()
      setApiKeyMasked(masked || '')
      setApiKey('')
      setEditingApiKey(false)
      setSavedKey(true)
      setKeyStatus('unchecked')
      setTimeout(() => setSavedKey(false), 2000)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleCheckApiKey(): Promise<void> {
    setCheckingKey(true)
    try {
      const result = await window.electronAPI.checkApiKey()
      setKeyStatus(result.valid ? 'valid' : 'invalid')
    } catch {
      setKeyStatus('invalid')
    } finally {
      setCheckingKey(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl page-enter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your preferences and account.</p>
      </div>

      <div className="space-y-5">
        {/* Profile section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">Profile</h2>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Display Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
              />
              <button
                onClick={handleSaveName}
                disabled={!name.trim() || name === user?.name}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex-shrink-0 ${
                  savedName
                    ? 'bg-emerald-600 text-white'
                    : 'bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white'
                }`}
              >
                {savedName ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
        </section>

        {/* Appearance section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Theme</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Currently using {theme === 'light' ? 'light' : 'dark'} mode
              </p>
            </div>
            {/* Toggle switch */}
            <button
              onClick={toggleTheme}
              className={`relative inline-flex items-center h-7 w-12 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                theme === 'dark' ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={theme === 'dark'}
            >
              <span
                className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${
                  theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            {theme === 'light' ? 'Switch right to enable dark mode' : 'Switch left to enable light mode'}
          </p>
        </section>

        {/* Reminders section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">Reminders</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Daily Study Reminder</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Set a time to be reminded to study each day
              </p>
            </div>
            <input
              type="time"
              className="input w-auto"
              value={reminderTime}
              onChange={e => setReminderTime(e.target.value)}
            />
          </div>
        </section>

        {/* Data Storage section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-2">Data Storage</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Your data is stored locally in SQLite. No data ever leaves your device.
          </p>
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 space-y-1 border border-slate-100 dark:border-slate-700">
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
              macOS: ~/Library/Application Support/neuron/neuron.db
            </p>
            <p className="text-xs font-mono text-slate-400 dark:text-slate-500">
              Linux: ~/.config/neuron/neuron.db
            </p>
            <p className="text-xs font-mono text-slate-400 dark:text-slate-500">
              Windows: %APPDATA%/neuron/neuron.db
            </p>
          </div>
        </section>

        {/* Help section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">Help</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Replay the guided walkthrough to learn about every feature in Neuron.
          </p>
          <button
            onClick={onStartDemo}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shadow-sm"
          >
            <span>🎓</span>
            Start Feature Tour
          </button>
        </section>

        {/* About & Updates section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-4">About & Updates</h2>

          {/* Version row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Neuron
                <span className="ml-2 text-xs font-mono font-normal text-slate-400 dark:text-slate-500">
                  v{currentVersion || '—'}
                </span>
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Built with Electron · React · SM-2 spaced repetition
              </p>
            </div>

            {/* Check for updates button — only when idle / up-to-date / error */}
            {(updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error') && (
              <button
                onClick={handleCheckForUpdates}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Check for Updates
              </button>
            )}
          </div>

          {/* Status messages */}
          {updateStatus === 'checking' && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              Checking GitHub for updates…
            </div>
          )}

          {updateStatus === 'up-to-date' && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M2.5 7.5L6 11L12.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              You're on the latest version.
            </div>
          )}

          {updateStatus === 'error' && (
            <div className="text-sm text-red-500 dark:text-red-400">
              ⚠ {updateError || 'Could not check for updates. Check your internet connection.'}
            </div>
          )}

          {/* Update available */}
          {updateStatus === 'available' && updateInfo && (
            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
                    ⬆ Neuron v{updateInfo.latestVersion} is available
                  </p>
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                    You're on v{currentVersion}
                  </p>
                </div>
                <button
                  onClick={() => window.electronAPI.openReleasePage(updateInfo.releaseUrl)}
                  className="text-xs text-violet-500 hover:underline flex-shrink-0"
                >
                  Release notes ↗
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors"
                >
                  {updateInfo.downloadUrl ? 'Download & Install' : 'Open Download Page ↗'}
                </button>
                <button
                  onClick={handleCancelDownload}
                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          )}

          {/* Downloading */}
          {updateStatus === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Downloading v{updateInfo?.latestVersion}…</span>
                <span className="font-mono">{downloadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-200"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Saving to ~/Downloads…
              </p>
            </div>
          )}

          {/* Downloaded — ready to install */}
          {updateStatus === 'downloaded' && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  ✓ Download complete — v{updateInfo?.latestVersion} ready
                </p>
                {isMac ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    Neuron will quit, install the update, and relaunch automatically.
                  </p>
                ) : (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    The installer will open. Follow the prompts to complete the update.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                >
                  {isMac ? 'Install & Relaunch' : 'Run Installer'}
                </button>
                <button
                  onClick={handleCancelDownload}
                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Installing */}
          {updateStatus === 'installing' && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              {installMethod === 'script'
                ? 'Installing… app will relaunch shortly.'
                : 'Opening installer…'}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
