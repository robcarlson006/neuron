import React, { useState, useEffect } from 'react'
import AudioDeviceSelector from './classes/AudioDeviceSelector'

interface WhisperModelStatus {
  id: string
  name: string
  description: string
  filename: string
  sizeBytes: number
  sizeDisplay: string
  status: 'not_downloaded' | 'downloading' | 'ready'
  localPath?: string
}

export default function LectureSettingsSection(): React.JSX.Element {
  const [provider, setProvider] = useState<string>('auto')
  const [groqKey, setGroqKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [whisperModels, setWhisperModels] = useState<WhisperModelStatus[]>([])
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, { modelId: string; progress: number; status: string; error?: string }>
  >({})
  const [saved, setSaved] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [testStatus, setTestStatus] = useState<
    Record<string, { testing: boolean; success?: boolean; message?: string }>
  >({})

  const handleTestProvider = async (providerName: string, keyVal: string) => {
    setTestStatus((prev) => ({ ...prev, [providerName]: { testing: true } }))
    try {
      if (!window.electronAPI?.testTranscriptionConnection) {
        setTestStatus((prev) => ({
          ...prev,
          [providerName]: { testing: false, success: false, message: 'Test API not available' }
        }))
        return
      }
      const res = await window.electronAPI.testTranscriptionConnection({
        provider: providerName,
        apiKey: keyVal.trim()
      })
      setTestStatus((prev) => ({
        ...prev,
        [providerName]: { testing: false, success: res.success, message: res.message }
      }))
    } catch (err: any) {
      setTestStatus((prev) => ({
        ...prev,
        [providerName]: { testing: false, success: false, message: err?.message || 'Test failed' }
      }))
    }
  }

  const loadData = async () => {
    if (!window.electronAPI) return
    try {
      const [p, gKey, oKey, gemKey, models] = await Promise.all([
        window.electronAPI.getMeta('transcription_provider'),
        window.electronAPI.getMeta('transcription_groq_key'),
        window.electronAPI.getMeta('transcription_openai_key'),
        window.electronAPI.getMeta('transcription_gemini_key'),
        window.electronAPI.listWhisperModels ? window.electronAPI.listWhisperModels() : Promise.resolve([])
      ])

      if (p) setProvider(p)
      if (gKey) setGroqKey(gKey)
      if (oKey) setOpenaiKey(oKey)
      if (gemKey) setGeminiKey(gemKey)
      if (models) setWhisperModels(models)
    } catch (err) {
      console.error('Failed to load lecture transcription settings:', err)
    }
  }

  useEffect(() => {
    loadData()

    if (!window.electronAPI?.onWhisperDownloadProgress) return

    const cleanup = window.electronAPI.onWhisperDownloadProgress((progress) => {
      setDownloadProgress((prev) => ({
        ...prev,
        [progress.modelId]: progress
      }))

      if (progress.status === 'completed' || progress.status === 'error' || progress.status === 'cancelled') {
        if (window.electronAPI.listWhisperModels) {
          window.electronAPI.listWhisperModels().then(setWhisperModels).catch(() => {})
        }
      }
    })

    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  const handleSave = async () => {
    if (!window.electronAPI) return
    try {
      await Promise.all([
        window.electronAPI.setMeta('transcription_provider', provider),
        window.electronAPI.setMeta('transcription_groq_key', groqKey.trim()),
        window.electronAPI.setMeta('transcription_openai_key', openaiKey.trim()),
        window.electronAPI.setMeta('transcription_gemini_key', geminiKey.trim())
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save settings')
    }
  }

  const handleDownloadModel = async (modelId: string) => {
    setActionError(null)
    try {
      if (!window.electronAPI?.downloadWhisperModel) return
      const res = await window.electronAPI.downloadWhisperModel(modelId)
      if (!res.success && res.error) {
        setActionError(res.error)
      }
    } catch (err: any) {
      setActionError(err?.message || 'Download failed')
    }
  }

  const handleCancelModelDownload = async (modelId: string) => {
    setActionError(null)
    try {
      if (!window.electronAPI?.cancelWhisperDownload) return
      await window.electronAPI.cancelWhisperDownload(modelId)
      setDownloadProgress((prev) => {
        const next = { ...prev }
        delete next[modelId]
        return next
      })
      if (window.electronAPI.listWhisperModels) {
        const updated = await window.electronAPI.listWhisperModels()
        setWhisperModels(updated)
      }
    } catch (err: any) {
      setActionError(err?.message || 'Cancel failed')
    }
  }

  const handleDeleteModel = async (modelId: string) => {
    if (!window.confirm('Delete this local Whisper model file to free disk space?')) return
    setActionError(null)
    try {
      if (!window.electronAPI?.deleteWhisperModel) return
      await window.electronAPI.deleteWhisperModel(modelId)
      if (window.electronAPI.listWhisperModels) {
        const updated = await window.electronAPI.listWhisperModels()
        setWhisperModels(updated)
      }
    } catch (err: any) {
      setActionError(err?.message || 'Delete failed')
    }
  }

  const openLink = (url: string) => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url)
    } else if (window.electronAPI?.openReleasePage) {
      window.electronAPI.openReleasePage(url)
    } else {
      window.open(url, '_blank')
    }
  }

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
      {/* Section Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xl">🎙️</span>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Lecture Recording & Transcription
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Record your lectures, automatically transcribe speech with cloud or offline models, and generate structured Markdown study notes.
        </p>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-400">
          ⚠️ {actionError}
        </div>
      )}

      {/* 1. Default Microphone Selector */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
          Default Microphone Input
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Choose which microphone Neuron listens to. Prevents macOS from defaulting to your iPhone Continuity mic or Microsoft Teams virtual audio.
        </p>
        <div className="max-w-md">
          <AudioDeviceSelector />
        </div>
      </div>

      {/* 2. Transcription Engine Preference */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
          Transcription Engine Preference
        </label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="input w-full max-w-md text-sm"
        >
          <option value="auto">Auto (Fastest available: Groq → Gemini → OpenAI → Local)</option>
          <option value="groq">Groq Cloud Whisper (Ultra-fast ~10x realtime, free tier)</option>
          <option value="openai">OpenAI Whisper API (Standard whisper-1)</option>
          <option value="gemini">Google Gemini Audio (Multimodal transcription)</option>
          <option value="local">Local On-Device Whisper (100% Offline & Private)</option>
        </select>
      </div>

      {/* 3. Cloud Provider Setup & API Keys */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Cloud Transcription Setup
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Cloud APIs transcribe long lectures in seconds with high punctuation accuracy. Click &apos;Get Key&apos; for instant access.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Groq Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 space-y-2 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-800 dark:text-slate-200">
                  <span>⚡ Groq Whisper</span>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.2 rounded-full">
                    Fastest
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openLink('https://console.groq.com/keys')}
                  className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-0.5"
                >
                  Get Key ↗
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Transcribes a 1-hour lecture in ~15 seconds. Free tier included.
              </p>
              <input
                type="password"
                placeholder="gsk_..."
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="input w-full text-xs font-mono"
              />
            </div>
            <div className="pt-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleTestProvider('groq', groqKey)}
                  disabled={!groqKey.trim() || testStatus.groq?.testing}
                  className="px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                >
                  {testStatus.groq?.testing ? 'Testing...' : 'Test Key'}
                </button>
                {testStatus.groq && (
                  <span className={`text-[11px] font-medium ${testStatus.groq.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                    {testStatus.groq.success ? '✓ Connected' : '✗ Failed'}
                  </span>
                )}
              </div>
              {testStatus.groq?.message && !testStatus.groq.success && (
                <p className="text-[10px] text-rose-500 mt-1 leading-tight">{testStatus.groq.message}</p>
              )}
            </div>
          </div>

          {/* OpenAI Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 space-y-2 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                  🌐 OpenAI Whisper
                </span>
                <button
                  type="button"
                  onClick={() => openLink('https://platform.openai.com/api-keys')}
                  className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-0.5"
                >
                  Get Key ↗
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Official OpenAI Whisper-1 API. Highly accurate across dialects.
              </p>
              <input
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="input w-full text-xs font-mono"
              />
            </div>
            <div className="pt-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleTestProvider('openai', openaiKey)}
                  disabled={!openaiKey.trim() || testStatus.openai?.testing}
                  className="px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                >
                  {testStatus.openai?.testing ? 'Testing...' : 'Test Key'}
                </button>
                {testStatus.openai && (
                  <span className={`text-[11px] font-medium ${testStatus.openai.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                    {testStatus.openai.success ? '✓ Connected' : '✗ Failed'}
                  </span>
                )}
              </div>
              {testStatus.openai?.message && !testStatus.openai.success && (
                <p className="text-[10px] text-rose-500 mt-1 leading-tight">{testStatus.openai.message}</p>
              )}
            </div>
          </div>

          {/* Gemini Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 space-y-2 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                  ✨ Google Gemini
                </span>
                <button
                  type="button"
                  onClick={() => openLink('https://aistudio.google.com/app/apikey')}
                  className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-0.5"
                >
                  Get Key ↗
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Gemini 3.6 Flash audio processing. Free in Google AI Studio.
              </p>
              <input
                type="password"
                placeholder="AIza..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="input w-full text-xs font-mono"
              />
            </div>
            <div className="pt-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleTestProvider('gemini', geminiKey)}
                  disabled={!geminiKey.trim() || testStatus.gemini?.testing}
                  className="px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                >
                  {testStatus.gemini?.testing ? 'Testing...' : 'Test Key'}
                </button>
                {testStatus.gemini && (
                  <span className={`text-[11px] font-medium ${testStatus.gemini.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                    {testStatus.gemini.success ? '✓ Connected' : '✗ Failed'}
                  </span>
                )}
              </div>
              {testStatus.gemini?.message && !testStatus.gemini.success && (
                <p className="text-[10px] text-rose-500 mt-1 leading-tight">{testStatus.gemini.message}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              ✓ Settings saved
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
          >
            Save Keys & Preference
          </button>
        </div>
      </div>

      {/* 4. Local On-Device Whisper (One-Click Download) */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Local On-Device Whisper
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-medium">
                100% Offline
              </span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Run Whisper speech-to-text directly on your computer. No internet connection or API keys needed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {whisperModels.map((model) => {
            const progress = downloadProgress[model.id]
            const isDownloading = model.status === 'downloading' || progress?.status === 'downloading'
            const isReady = model.status === 'ready' || progress?.status === 'completed'

            return (
              <div
                key={model.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex flex-col justify-between space-y-3 shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                      {model.name}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                      {model.sizeDisplay}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {model.description}
                  </p>
                </div>

                {/* Progress Bar if downloading */}
                {isDownloading && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>Downloading model...</span>
                      <span className="font-mono">{progress?.progress ?? 0}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-violet-600 h-full transition-all duration-200"
                        style={{ width: `${progress?.progress ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1">
                  {isReady ? (
                    <>
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <span>✓</span> Ready for offline use
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteModel(model.id)}
                        className="text-[11px] text-slate-400 hover:text-rose-500 transition-colors"
                        title="Delete model file"
                      >
                        Delete
                      </button>
                    </>
                  ) : isDownloading ? (
                    <button
                      type="button"
                      onClick={() => handleCancelModelDownload(model.id)}
                      className="text-xs text-rose-500 hover:underline"
                    >
                      Cancel Download
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownloadModel(model.id)}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                    >
                      <span>⬇</span>
                      <span>Download ({model.sizeDisplay})</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
