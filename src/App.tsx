import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import Layout from './components/Layout'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import SubjectDetail from './pages/SubjectDetail'
import StudySession from './pages/StudySession'
import Calendar from './pages/Calendar'
import Diagnostics from './pages/Diagnostics'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'

const api = window.electronAPI

export default function App(): React.JSX.Element {
  const { user, setUser, setSubjects, theme } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateVersion, setUpdateVersion] = useState('')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    async function init(): Promise<void> {
      try {
        const u = await api.getUser()
        setUser(u)
        if (u) {
          const subs = await api.getSubjects(u.id)
          setSubjects(subs)
        }
      } catch (err) {
        console.error('Init error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [setUser, setSubjects])

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
  }, [])

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

  return (
    <HashRouter>
      {/* Update banner — shown after update is downloaded and ready to install */}
      {updateReady && !dismissed && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm">
          <span>⬆ Neuron {updateVersion} is ready to install</span>
          <button
            onClick={() => api.installUpdate()}
            className="bg-white text-emerald-700 font-semibold px-3 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            Restart & Update
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="opacity-70 hover:opacity-100 transition-opacity ml-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <Routes>
        {!user ? (
          <>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </>
        ) : (
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/subject/:id" element={<SubjectDetail />} />
            <Route path="/study/:subjectId" element={<StudySession />} />
            <Route path="/study" element={<StudySession />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/diagnostics/:subjectId" element={<Diagnostics />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </HashRouter>
  )
}
