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
}

export default function App(): React.JSX.Element {
  const { user, setUser, setSubjects, theme, showDemo, setShowDemo } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateVersion, setUpdateVersion] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [updateFailed, setUpdateFailed] = useState(false)

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
    api.onUpdateDownloaded((version) => {
      setUpdateVersion(version)
      setUpdateReady(true)
    })
    api.onUpdateError(() => {
      setUpdateFailed(true)
    })
  }, [])

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
      {/* Update banner — shown after update is downloaded and ready to install */}
      {updateReady && !dismissed && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm">
          {updateFailed ? (
            <>
              <span>Update install failed. Please install manually.</span>
              <button
                onClick={() => api.openReleasePage('https://github.com/robcarlson006/neuron/releases/latest')}
                className="bg-white text-emerald-700 font-semibold px-3 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
              >
                Download
              </button>
            </>
          ) : (
            <>
              <span>⬆ Neuron {updateVersion} is ready to install</span>
              <button
                onClick={() => { setUpdateFailed(false); api.installUpdate() }}
                className="bg-white text-emerald-700 font-semibold px-3 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
              >
                Restart & Update
              </button>
            </>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="opacity-70 hover:opacity-100 transition-opacity ml-1"
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
              <Route path="/" element={<Dashboard onNewClass={() => setShowClassWizard(true)} />} />
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
