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
