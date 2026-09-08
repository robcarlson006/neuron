import React, { useState, useEffect } from 'react'
import type { HardwareProfile, LocalModelInfo, DownloadProgress, LocalEngineStatus } from '../types'

interface LocalAISectionProps {
  onSelectModel?: (baseUrl: string, modelName: string) => void
  currentBaseUrl?: string
  currentModel?: string
}

export default function LocalAISection({
  onSelectModel,
  currentBaseUrl,
  currentModel
}: LocalAISectionProps): React.JSX.Element {
  const [profile, setProfile] = useState<HardwareProfile | null>(null)
  const [models, setModels] = useState<LocalModelInfo[]>([])
  const [engineStatus, setEngineStatus] = useState<LocalEngineStatus>({ isRunning: false })
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadProgress>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [startingModelId, setStartingModelId] = useState<string | null>(null)

  const loadData = async () => {
    try {
      if (!window.electronAPI) return
      const [p, m, status] = await Promise.all([
        window.electronAPI.getHardwareProfile(),
        window.electronAPI.listLocalModels(),
        window.electronAPI.getLocalEngineStatus()
      ])
      setProfile(p)
      setModels(m)
      setEngineStatus(status)
    } catch (err) {
      console.error('Failed to load local AI status:', err)
    }
  }

  useEffect(() => {
    loadData()

    if (!window.electronAPI?.onLocalDownloadProgress) {
      return undefined
    }

    const cleanup = window.electronAPI.onLocalDownloadProgress((progress) => {
      setDownloadProgress((prev) => ({
        ...prev,
        [progress.modelId]: progress
      }))

      if (progress.status === 'completed' || progress.status === 'cancelled' || progress.status === 'error') {
        // Refresh model list to reflect download status
        window.electronAPI.listLocalModels().then(setModels).catch(() => {})
      }
    })

    return () => {
      if (typeof cleanup === 'function') {
        cleanup()
      }
    }
  }, [])

  const handleDownload = async (modelId: string) => {
    setActionError(null)
    try {
      const res = await window.electronAPI.downloadLocalModel(modelId)
      if (!res.success && res.error) {
        setActionError(res.error)
      }
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  const handleCancelDownload = async (modelId: string) => {
    setActionError(null)
    try {
      await window.electronAPI.cancelModelDownload(modelId)
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  const handleDelete = async (modelId: string) => {
    if (!confirm('Are you sure you want to delete this downloaded model file to free disk space?')) return
    setActionError(null)
    try {
      const res = await window.electronAPI.deleteLocalModel(modelId)
      if (res.success) {
        const updated = await window.electronAPI.listLocalModels()
        setModels(updated)
      } else if (res.error) {
        setActionError(res.error)
      }
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  const handleStartAndSelect = async (model: LocalModelInfo) => {
    setActionError(null)
    setStartingModelId(model.id)
    try {
      const res = await window.electronAPI.startLocalEngine(model.id)
      if (res.success && res.port) {
        const localUrl = `http://127.0.0.1:${res.port}`
        onSelectModel?.(localUrl, model.name)
        const updatedStatus = await window.electronAPI.getLocalEngineStatus()
        setEngineStatus(updatedStatus)
      } else if (res.error) {
        setActionError(res.error)
      }
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setStartingModelId(null)
    }
  }

  const handleStopEngine = async () => {
    setActionError(null)
    try {
      await window.electronAPI.stopLocalEngine()
      const updatedStatus = await window.electronAPI.getLocalEngineStatus()
      setEngineStatus(updatedStatus)
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'light':
        return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Light Tier</span>
      case 'balanced':
        return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Balanced Tier</span>
      case 'high':
        return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">High-Performance Tier</span>
      default:
        return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">Standard Tier</span>
    }
  }

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Local AI & Hardware Specs</h2>
            {profile && getTierBadge(profile.tier)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Run open-weights language models directly on your hardware without internet access.
          </p>
        </div>
        {engineStatus.isRunning && (
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-lg text-xs font-medium border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Engine Active (Port {engineStatus.port})
            <button
              onClick={handleStopEngine}
              className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold underline"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 font-bold hover:underline">✕</button>
        </div>
      )}

      {/* Hardware Profile Summary */}
      {profile && (
        <div className="mb-5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-2.5">
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">Processor</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 truncate block" title={profile.cpuModel}>
                {profile.cpuModel.replace(/Intel\(R\)\s+Core\(TM\)\s+/, '').replace(/CPU\s+@\s+.*$/, '')} ({profile.cpuCores} cores)
              </span>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">Memory (RAM)</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {profile.totalMemoryGb} GB ({profile.freeMemoryGb} GB free)
              </span>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">Platform & Arch</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {profile.platform} ({profile.arch})
              </span>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">Recommended Model</span>
              <span className="font-semibold text-violet-600 dark:text-violet-400">
                {profile.recommendedModelId === 'qwen-2.5-3b' ? 'Qwen 2.5 3B (Balanced)' : profile.recommendedModelId === 'qwen-2.5-1.5b' ? 'Qwen 2.5 1.5B (Light)' : 'Qwen 2.5 7B (High Quality)'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800/80 pt-2 leading-relaxed">
            💡 <strong className="text-slate-700 dark:text-slate-300">Recommendation: </strong>
            {profile.tierReason}
          </p>
        </div>
      )}

      {/* Model Catalog & Downloader */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
          <span>Available Models</span>
          <span>Explicit Download Only</span>
        </div>

        {models.map((model) => {
          const prog = downloadProgress[model.id]
          const isDownloading = prog?.status === 'downloading' || model.status === 'downloading'
          const isReady = model.status === 'ready'
          const isCurrentActive =
            (currentModel?.toLowerCase().includes('qwen') || currentModel?.toLowerCase().includes('3b')) &&
            (currentBaseUrl?.includes('8080') || currentBaseUrl?.includes('11434'))

          return (
            <div
              key={model.id}
              className={`p-4 rounded-xl border transition-all ${
                model.isRecommended
                  ? 'bg-violet-50/40 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800'
                  : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{model.name}</span>
                    {model.isRecommended && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                        Recommended
                      </span>
                    )}
                    {isReady && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                        ✓ Downloaded
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{model.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                    <span>File size: <strong className="text-slate-600 dark:text-slate-300">{model.sizeDisplay}</strong></span>
                    <span>•</span>
                    <span>Requirement: <strong className="text-slate-600 dark:text-slate-300">{model.ramRequirementDisplay}</strong></span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isDownloading ? (
                    <button
                      type="button"
                      onClick={() => handleCancelDownload(model.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      Cancel
                    </button>
                  ) : isReady ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleStartAndSelect(model)}
                        disabled={startingModelId === model.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isCurrentActive
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-violet-600 text-white hover:bg-violet-700'
                        }`}
                      >
                        {startingModelId === model.id ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Starting...
                          </span>
                        ) : isCurrentActive ? (
                          '✓ Active Model'
                        ) : (
                          'Use Model'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(model.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        title="Delete model file"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownload(model.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-white transition-colors flex items-center gap-1.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Download ({model.sizeDisplay})
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar if downloading */}
              {isDownloading && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">
                      Downloading... {prog?.percent || 0}%
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 tabular-nums font-mono text-[11px]">
                      {prog?.bytesDownloaded ? (prog.bytesDownloaded / (1024 * 1024)).toFixed(1) : 0} MB /{' '}
                      {prog?.totalBytes ? (prog.totalBytes / (1024 * 1024)).toFixed(1) : model.sizeDisplay}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-violet-600 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${prog?.percent || 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
