import React, { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import ExportModal from '../components/ExportModal'
import { ACHIEVEMENT_DEFS } from '../lib/achievements'

// ── Pomodoro config modal ────────────────────────────────────────────────────
function PomodoroModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { pomodoroEnabled, pomodoroWorkMinutes, pomodoroBreakMinutes, setPomodoroEnabled, setPomodoroSettings } = useAppStore()
  const [enabled, setEnabled] = useState(pomodoroEnabled)
  const [workMin, setWorkMin] = useState(pomodoroWorkMinutes)
  const [breakMin, setBreakMin] = useState(pomodoroBreakMinutes)
  const [saved, setSaved] = useState(false)

  function handleSave(): void {
    setPomodoroEnabled(enabled)
    if (enabled) setPomodoroSettings(workMin, breakMin)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-sm mx-4 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍅</span>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Pomodoro Timer</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between mb-5 pb-5 border-b border-slate-100 dark:border-slate-700">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Pomodoro</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Show timer widget in the app</p>
          </div>
          <button
            onClick={() => setEnabled(e => !e)}
            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
              enabled ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-600'
            }`}
            role="switch"
            aria-checked={enabled}
          >
            <span className={`inline-block w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Settings — shown when enabled */}
        <div className={`space-y-5 transition-opacity duration-200 ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {/* Work duration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Work Duration
              </label>
              <span className="text-sm font-semibold text-violet-600 dark:text-violet-400 tabular-nums">
                {workMin} min
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={workMin}
              onChange={e => setWorkMin(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-600 bg-slate-200 dark:bg-slate-700"
            />
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
              <span>1 min</span>
              <span>60 min</span>
            </div>
          </div>

          {/* Break duration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Break Duration
              </label>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {breakMin} min
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={15}
              step={1}
              value={breakMin}
              onChange={e => setBreakMin(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-600 bg-slate-200 dark:bg-slate-700"
            />
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
              <span>1 min</span>
              <span>15 min</span>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              🍅 {workMin} min work → ☕ {breakMin} min break → repeat
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
              saved ? 'bg-emerald-600' : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Local RAG Section ─────────────────────────────────────────────────────────
function LocalRAGSection(): React.JSX.Element {
  const [stats, setStats] = useState<{ totalChunks: number; indexedMaterials: number } | null>(null)
  const [indexing, setIndexing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusType, setStatusType] = useState<'idle' | 'success' | 'error'>('idle')

  const loadStats = async () => {
    try {
      const s = await window.electronAPI.ragGetIndexStats()
      setStats(s)
    } catch {
      // RAG not available
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  async function handleReindexAll(): Promise<void> {
    if (!confirm('Re-index all materials? This will regenerate embeddings for every document. This may take a while.')) return

    setIndexing(true)
    setStatusMessage('Re-indexing all materials...')
    setStatusType('idle')

    try {
      const result = await window.electronAPI.ragReindexAll()
      setStatusMessage(`Done! Indexed ${result.totalChunks} chunks across all materials.`)
      setStatusType('success')
      await loadStats()
    } catch (err) {
      setStatusMessage(`Error: ${(err as Error).message || 'Re-indexing failed.'}`)
      setStatusType('error')
    } finally {
      setIndexing(false)
    }
  }

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">Local RAG</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Vector search across your study materials. Enables AI to retrieve relevant context from your documents.
      </p>

      {/* Stats */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-violet-600 dark:text-violet-400 tabular-nums">
            {stats ? stats.totalChunks : '—'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Chunks Indexed</p>
        </div>
        <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {stats ? stats.indexedMaterials : '—'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Materials Indexed</p>
        </div>
      </div>

      {/* Status message */}
      {statusType === 'success' && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 mb-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="flex-shrink-0">
            <path d="M2.5 7.5L6 11L12.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {statusMessage}
        </div>
      )}
      {statusType === 'error' && (
        <div className="text-sm text-red-500 dark:text-red-400 mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {statusMessage}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleReindexAll}
          disabled={indexing}
          className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
            indexing
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-violet-600 hover:bg-violet-700'
          }`}
        >
          {indexing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Indexing...
            </span>
          ) : (
            'Re-index All'
          )}
        </button>
        <button
          onClick={loadStats}
          disabled={indexing}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Refresh
        </button>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
        Chunks are created from the content_text of uploaded materials. Requires an AI provider configured above to generate embeddings.
      </p>
    </section>
  )
}

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
  const { user, setUser, theme, toggleTheme, pomodoroEnabled, pomodoroWorkMinutes, pomodoroBreakMinutes } = useAppStore()
  const [name, setName] = useState(user?.name || '')
  const [reminderTime, setReminderTime] = useState('09:00')
  const [reminderLoaded, setReminderLoaded] = useState(false)
  const [savedName, setSavedName] = useState(false)
  const [showPomodoroModal, setShowPomodoroModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [userLevelData, setUserLevelData] = useState<{ xp: number; level: number } | null>(null)

  // Version / update state
  const [desiredRetention, setDesiredRetention] = useState(90)
  const [interleave, setInterleave] = useState(true)
  const [savedFSRS, setSavedFSRS] = useState(false)

  // AI Provider state
  const [aiProvider, setAiProvider] = useState('openai-compatible')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.deepseek.com')
  const [aiModel, setAiModel] = useState('deepseek-chat')
  const [aiConfigLoaded, setAiConfigLoaded] = useState(false)
  const [aiConnectionStatus, setAiConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [aiConnectionMessage, setAiConnectionMessage] = useState('')
  const [aiConnectionLatency, setAiConnectionLatency] = useState<number | undefined>()
  const [aiSaved, setAiSaved] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadedPath, setDownloadedPath] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [installMethod, setInstallMethod] = useState('')
  const progressListenerSet = useRef(false)

  const loadUserLevel = async () => {
    try {
      const api = (window as any).electronAPI
      if (api && user?.id) {
        const level = await api.getUserLevel(user.id)
        setUserLevelData(level)
      }
    } catch {}
  }

  useEffect(() => {
    window.electronAPI.getVersion().then(setCurrentVersion).catch(() => {})

    window.electronAPI.getMeta('desired_retention').then(v => {
      if (v) setDesiredRetention(Math.round(parseFloat(v) * 100))
    }).catch(() => {})
    window.electronAPI.getMeta('interleave_queue').then(v => {
      if (v != null) setInterleave(v !== 'false')
    }).catch(() => {})
    window.electronAPI.getMeta('reminder_time').then(v => {
      if (v) setReminderTime(v)
    }).catch(() => {})
    window.electronAPI.getMeta('preferred_arch').then(v => {
      if (v) setPreferredArch(v as 'auto' | 'arm64' | 'x64')
    }).catch(() => {})
    setReminderLoaded(true)

    // Load AI config
    window.electronAPI.getAIConfig().then(cfg => {
      setAiProvider(cfg.provider || 'openai-compatible')
      setAiBaseUrl(cfg.baseUrl || 'https://api.deepseek.com')
      setAiModel(cfg.model || 'deepseek-chat')
      setAiApiKey(cfg.apiKey || '')
      setAiConfigLoaded(true)
    }).catch(() => {
      setAiConfigLoaded(true)
    })

    if (!progressListenerSet.current) {
      progressListenerSet.current = true
      window.electronAPI.onDownloadProgress((pct) => setDownloadProgress(pct))
    }

    loadUserLevel()
  }, [])

  // Persist reminder time changes (skip initial load to avoid overwriting)
  useEffect(() => {
    if (!reminderLoaded) return
    window.electronAPI.setMeta('reminder_time', reminderTime).catch(() => {})
  }, [reminderTime, reminderLoaded])

  async function handleSaveFSRS(): Promise<void> {
    await window.electronAPI.setMeta('desired_retention', (desiredRetention / 100).toString())
    await window.electronAPI.setMeta('interleave_queue', interleave ? 'true' : 'false')
    setSavedFSRS(true)
    setTimeout(() => setSavedFSRS(false), 1500)
  }

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

  // Architecture selector for macOS (for users who want to override auto-detection)
  const [preferredArch, setPreferredArch] = useState<'auto' | 'arm64' | 'x64'>('auto')
  const isMac = navigator.userAgent.includes('Macintosh')
  const detectedArch = typeof process !== 'undefined' && process.arch ? process.arch : 'unknown'

  async function handleSavePreferredArch(): Promise<void> {
    await window.electronAPI.setMeta('preferred_arch', preferredArch)
  }

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

  async function handleTestAIConnection(): Promise<void> {
    setAiConnectionStatus('testing')
    setAiConnectionMessage('')
    setAiConnectionLatency(undefined)
    try {
      const result = await window.electronAPI.testAIConnection()
      setAiConnectionStatus(result.success ? 'success' : 'error')
      setAiConnectionMessage(result.message)
      setAiConnectionLatency(result.latencyMs)
    } catch (err) {
      setAiConnectionStatus('error')
      setAiConnectionMessage((err as Error).message ?? 'Connection test failed')
    }
  }

  async function handleSaveAIConfig(): Promise<void> {
    await window.electronAPI.saveAIConfig({
      provider: aiProvider,
      baseUrl: aiBaseUrl,
      model: aiModel,
      apiKey: aiApiKey
    })
    setAiSaved(true)
    setTimeout(() => setAiSaved(false), 1500)
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

        {/* Data Management */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-3">Data Management</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Export your cards, schedules, and deadlines as a JSON file, or import data from a previous export.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Export / Import Data
            </button>
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

        {/* Study algorithm — FSRS */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">Study Algorithm</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Neuron uses FSRS-5 with Bayesian Knowledge Tracing per concept.
          </p>
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Target Retention</label>
              <span className="text-sm font-semibold text-violet-600 dark:text-violet-400 tabular-nums">{desiredRetention}%</span>
            </div>
            <input
              type="range"
              min={80}
              max={98}
              step={1}
              value={desiredRetention}
              onChange={e => setDesiredRetention(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-600 bg-slate-200 dark:bg-slate-700"
            />
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1">
              <span>80% (fewer reviews)</span>
              <span>98% (fewer lapses)</span>
            </div>
          </div>
          <div className="flex items-center justify-between mb-5 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Interleave Concepts</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Round-robin across folders/concepts instead of blocked practice
              </p>
            </div>
            <button
              onClick={() => setInterleave(v => !v)}
              className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${interleave ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-600'}`}
              role="switch"
              aria-checked={interleave}
            >
              <span className={`inline-block w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${interleave ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <button
            onClick={handleSaveFSRS}
            className={`w-full py-2 rounded-lg text-white text-sm font-medium transition-colors ${savedFSRS ? 'bg-emerald-600' : 'bg-violet-600 hover:bg-violet-700'}`}
          >
            {savedFSRS ? '✓ Saved' : 'Save Algorithm Settings'}
          </button>
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

        {/* Add-ons section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">Add-ons</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Optional features you can enable to enhance your study sessions.
          </p>
          <div className="space-y-3">
            {/* Pomodoro add-on */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:border-slate-200 dark:hover:border-slate-600 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${
                  pomodoroEnabled
                    ? 'bg-violet-100 dark:bg-violet-900/40'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}>
                  🍅
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Pomodoro Timer</p>
                    {pomodoroEnabled && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 font-medium">
                        On · {pomodoroWorkMinutes}m/{pomodoroBreakMinutes}m
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Visual focus timer always visible while studying
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPomodoroModal(true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Configure
              </button>
            </div>
          </div>
        </section>

        {/* AI Provider section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">AI Provider</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Configure your AI provider for card generation and answer evaluation. Compatible with any OpenAI API.
          </p>

          {/* Provider dropdown */}
          <div className="mb-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Provider
            </label>
            <select
              value={aiProvider}
              onChange={e => setAiProvider(e.target.value)}
              className="input w-full"
            >
              <option value="openai-compatible">OpenAI-Compatible</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>

          {/* API key */}
          <div className="mb-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              API Key
            </label>
            <input
              type="password"
              className="input w-full"
              value={aiApiKey}
              onChange={e => setAiApiKey(e.target.value)}
              placeholder={aiConfigLoaded ? 'Enter your API key' : 'Loading...'}
            />
          </div>

          {/* Base URL */}
          <div className="mb-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Base URL
            </label>
            <input
              type="text"
              className="input w-full font-mono text-sm"
              value={aiBaseUrl}
              onChange={e => setAiBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com"
            />
          </div>

          {/* Model */}
          <div className="mb-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
              Model
            </label>
            <input
              type="text"
              className="input w-full font-mono text-sm"
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              placeholder="deepseek-chat"
            />
          </div>

          {/* Connection test result */}
          {aiConnectionStatus === 'testing' && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
              <span className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              Testing connection…
            </div>
          )}
          {aiConnectionStatus === 'success' && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 mb-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="flex-shrink-0">
                <path d="M2.5 7.5L6 11L12.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>
                Connected! Response: "{aiConnectionMessage}"
                {aiConnectionLatency != null && (
                  <span className="text-xs ml-1 opacity-75">({aiConnectionLatency}ms)</span>
                )}
              </span>
            </div>
          )}
          {aiConnectionStatus === 'error' && (
            <div className="text-sm text-red-500 dark:text-red-400 mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              <span className="font-medium">Connection failed:</span> {aiConnectionMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleTestAIConnection}
              disabled={aiConnectionStatus === 'testing'}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Test Connection
            </button>
            <button
              onClick={handleSaveAIConfig}
              className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
                aiSaved ? 'bg-emerald-600' : 'bg-violet-600 hover:bg-violet-700'
              }`}
            >
              {aiSaved ? '✓ Saved' : 'Save'}
            </button>
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

        {/* Local RAG section */}
        <LocalRAGSection />

        {/* Progress & Achievements */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-3">Progress & Achievements</h2>
          {userLevelData ? (
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white font-bold">
                  {userLevelData.level}
                </div>
                <div>
                  <div className="text-sm font-medium dark:text-white">Level {userLevelData.level}</div>
                  <div className="text-xs text-gray-500">{userLevelData.xp} total XP</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-3">Loading progress...</p>
          )}
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {Object.keys(ACHIEVEMENT_DEFS).length} achievements available
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

          {/* Architecture selector (macOS only) */}
          {isMac && (
            <div className="mb-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Download Architecture</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Auto-detected: {detectedArch === 'arm64' ? 'Apple Silicon (arm64)' : detectedArch === 'x64' ? 'Intel (x64)' : 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 dark:text-slate-400">Override:</label>
                  <select
                    value={preferredArch}
                    onChange={e => setPreferredArch(e.target.value as 'auto' | 'arm64' | 'x64')}
                    className="input text-xs px-2 py-1"
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="arm64">Apple Silicon (arm64)</option>
                    <option value="x64">Intel (x64)</option>
                  </select>
                  <button
                    onClick={handleSavePreferredArch}
                    className="px-2 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Change this if the auto-updater downloads the wrong architecture for your Mac.
              </p>
            </div>
          )}

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
                Built with Electron · React · FSRS-5 spaced repetition
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

      {showExportModal && user && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          userId={user.id}
        />
      )}
      {showPomodoroModal && (
        <PomodoroModal onClose={() => setShowPomodoroModal(false)} />
      )}
    </div>
  )
}
