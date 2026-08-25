import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import DemoTour from './components/DemoTour'
import KeyboardShortcutsModal, { useKeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import UnifiedSubjectDetail from './pages/UnifiedSubjectDetail'
import StudySession from './pages/StudySession'
import Calendar from './pages/Calendar'
import Diagnostics from './pages/Diagnostics'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import TutorHub from './pages/tutor/TutorHub'
import TutorSession from './pages/tutor/TutorSession'
import GeneralChat from './pages/tutor/GeneralChat'
import ToastContainer from './components/tutor/ToastContainer'
import ClassCreationWizard from './pages/classes/ClassCreationWizard'

const api = window.electronAPI

/** Redirect /class/:id → /subject/:id */
function ClassRedirect(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/subject/${id}`} replace />
}export default function App(): React.JSX.Element {
  const { user, setUser, setSubjects, theme, showDemo, setShowDemo } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateVersion, setUpdateVersion] = useState('')
  const [updateDownloadUrl, setUpdateDownloadUrl] = useState<string | null>(null)
  const [updateReleaseUrl, setUpdateReleaseUrl] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadedPath, setDownloadedPath] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [updateFailed, setUpdateFailed] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function init(): Promise<void> {
      try {
        const u = await api.getUser()
        setUser(u)
        if (u) {
          const subs = await api.getSubjects(u.id)
          setSubjects(subs)
          // Check if demo has been shown before
          const demoShown = await api.getMeta('demo_shown')
          if (!demoShown) {
            setShowDemo(true)
          }
        }
      } catch (err) {
        console.error('Init error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [setUser, setSubjects, setShowDemo])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  // Listen for auto-update events from main process
  useEffect(() => {
    api.onUpdaterAvailable((info) => {
      setUpdateVersion(info.latestVersion)
      setUpdateDownloadUrl(info.downloadUrl)
      setUpdateReleaseUrl(info.releaseUrl)
      setUpdateAvailable(true)
      setDismissed(false)
    })
    api.onUpdateAvailable((version) => {
      setUpdateVersion(version)
      setUpdateAvailable(true)
      setDismissed(false)
    })
    api.onUpdaterDownloaded((data) => {
      setDownloadedPath(data.filePath)
      setUpdateVersion(data.version)
      setDownloading(false)
      setUpdateReady(true)
      setDismissed(false)
    })
    api.onUpdateDownloaded((version) => {
      setUpdateVersion(version)
      setDownloading(false)
      setUpdateReady(true)
      setDismissed(false)
    })
    api.onDownloadProgress((pct) => {
      setDownloadProgress(pct)
    })
    api.onUpdaterError((msg) => {
      setErrorMessage(msg)
      setUpdateFailed(true)
      setDownloading(false)
    })
    api.onUpdateError((msg) => {
      setErrorMessage(msg)
      setUpdateFailed(true)
      setDownloading(false)
    })
  }, [])

  async function handleStartDownload(): Promise<void> {
    if (!updateDownloadUrl) {
      api.openReleasePage(updateReleaseUrl || 'https://github.com/robmcarlson006/neuron/releases/latest')
      return
    }
    setDownloading(true)
    setDownloadProgress(0)
    setUpdateFailed(false)
    try {
      const res = await api.downloadUpdate(updateDownloadUrl, updateVersion)
      if (res.success && res.filePath) {
        setDownloadedPath(res.filePath)
        setUpdateReady(true)
      } else {
        setUpdateFailed(true)
        setErrorMessage(res.error || 'Download failed.')
      }
    } catch (err) {
      setUpdateFailed(true)
      setErrorMessage((err as Error).message || 'Download error')
    } finally {
      setDownloading(false)
    }
  }

  async function handleInstall(): Promise<void> {
    setUpdateFailed(false)
    try {
      if (downloadedPath) {
        await api.installDownloadedUpdate(downloadedPath)
      } else {
        await api.installUpdate()
      }
    } catch (err) {
      setUpdateFailed(true)
      setErrorMessage((err as Error).message || 'Install failed')
    }
  }

  async function handleDemoComplete(): Promise<void> {
    setShowDemo(false)
    try {
      await api.setMeta('demo_shown', 'true')
    } catch (err) {
      console.error('Failed to save demo state:', err)
    }
  }

  // Called from Settings to replay the tour
  async function handleStartDemo(): Promise<void> {
    // Clear the meta flag so the demo is shown again
    try {
      await api.setMeta('demo_shown', 'false')
    } catch {
      // ignore
    }
    setShowDemo(true)
  }

  const [shortcutsOpen, , closeShortcuts] = useKeyboardShortcutsModal()

  // ── Class Wizard ──
  const [showClassWizard, setShowClassWizard] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Loading Neuron...</p>
        </div>
      </div>
    )
  }

  // After onboarding completes, user is set — check via Onboarding's own submit
  // which triggers setUser in store, but we also need to trigger demo check there.
  // We handle it by passing onUserCreated to Onboarding.
  async function handleUserCreated(): Promise<void> {
    setShowDemo(true)
  }

  return (
    <HashRouter>
      {/* Update banner — shown when update is available, downloading, or ready to install */}
      {(updateAvailable || updateReady || updateFailed) && !dismissed && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-slate-900/95 text-white dark:bg-slate-800/95 border border-slate-700/80 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md text-sm animate-in fade-in slide-in-from-bottom-3 duration-300">
          {updateFailed ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-rose-400 text-base">⚠️</span>
                <span>{errorMessage || 'Update failed. Please download manually.'}</span>
              </div>
              <button
                onClick={() => api.openReleasePage(updateReleaseUrl || 'https://github.com/robmcarlson006/neuron/releases/latest')}
                className="bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 font-medium px-3 py-1 rounded-lg transition-colors text-xs"
              >
                Download Page ↗
              </button>
            </>
          ) : updateReady ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-base">✓</span>
                <span>Neuron {updateVersion ? `v${updateVersion}` : ''} ready to install</span>
              </div>
              <button
                onClick={handleInstall}
                className="bg-emerald-500 text-white hover:bg-emerald-600 font-semibold px-3 py-1 rounded-lg shadow transition-colors text-xs"
              >
                Restart & Update
              </button>
            </>
          ) : downloading ? (
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span>Downloading v{updateVersion}… {downloadProgress}%</span>
              <div className="w-24 bg-slate-700 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full transition-all duration-200"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-base">⬆</span>
                <span>Neuron {updateVersion ? `v${updateVersion}` : ''} is available</span>
              </div>
              <button
                onClick={handleStartDownload}
                className="bg-emerald-500 text-white hover:bg-emerald-600 font-semibold px-3 py-1 rounded-lg shadow transition-colors text-xs"
              >
                Update Now
              </button>
            </>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-slate-400 hover:text-slate-200 transition-colors ml-1 p-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Demo tour overlay — shown on first launch and when triggered from Settings */}
      {showDemo && user && (
        <DemoTour onComplete={handleDemoComplete} />
      )}

      <ErrorBoundary>
        <Routes>
          {!user ? (
            <>
              <Route path="/onboarding" element={<Onboarding onUserCreated={handleUserCreated} />} />
              <Route path="*" element={<Navigate to="/onboarding" replace />} />
            </>
          ) : (
            <Route element={<Layout onNewClass={() => setShowClassWizard(true)} />}>
              <Route path="/" element={<Dashboard onNewSubject={() => setShowClassWizard(true)} onNewClass={() => setShowClassWizard(true)} />} />
              <Route path="/class/:id" element={<ClassRedirect />} />
              <Route path="/subject/:id" element={<UnifiedSubjectDetail />} />
              <Route path="/study/:subjectId" element={<StudySession />} />
              <Route path="/study" element={<StudySession />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/diagnostics/:subjectId" element={<Diagnostics />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/tutor" element={<TutorHub />} />
              <Route path="/tutor/general" element={<GeneralChat />} />
              <Route path="/tutor/:classId" element={<TutorSession />} />
              <Route path="/settings" element={<Settings onStartDemo={handleStartDemo} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          )}
        </Routes>
      </ErrorBoundary>

      {/* Class Creation Wizard Modal */}
      {showClassWizard && user && (
        <ClassCreationWizard onClose={() => setShowClassWizard(false)} />
      )}

      <ToastContainer />
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={closeShortcuts} />
    </HashRouter>
  )
}
