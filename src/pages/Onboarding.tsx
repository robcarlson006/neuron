import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export default function Onboarding(): React.JSX.Element {
  const { setUser, setSubjects } = useAppStore()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }

    setLoading(true)
    try {
      const user = await window.electronAPI.saveUser(name.trim())
      const subjects = await window.electronAPI.getSubjects(user.id)
      setSubjects(subjects)
      setUser(user)
    } catch (err) {
      setError('Failed to save. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center p-6">
      <div
        className={`w-full max-w-md transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Neuron icon */}
                <circle cx="14" cy="14" r="4.5" fill="white" opacity="0.95"/>
                <path d="M14 9.5V5M14 18.5V23M9.5 14H5M18.5 14H23" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9"/>
                <path d="M10.5 10.5L7.5 7.5M17.5 17.5L20.5 20.5M17.5 10.5L20.5 7.5M10.5 17.5L7.5 20.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.6"/>
                <circle cx="14" cy="5" r="1.5" fill="white" opacity="0.75"/>
                <circle cx="14" cy="23" r="1.5" fill="white" opacity="0.75"/>
                <circle cx="5" cy="14" r="1.5" fill="white" opacity="0.75"/>
                <circle cx="23" cy="14" r="1.5" fill="white" opacity="0.75"/>
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Welcome to Neuron
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Spaced repetition and active recall for smarter studying
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex gap-2 justify-center mb-8 flex-wrap">
            {[
              { label: 'Smart Flashcards' },
              { label: 'Spaced Repetition' },
              { label: 'Track Progress' }
            ].map(f => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium border border-violet-100 dark:border-violet-800"
              >
                {f.label}
              </span>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
                What's your name?
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                We'll use this to personalize your experience.
              </p>
              <input
                type="text"
                className="input text-base py-2.5"
                placeholder="e.g. Alex Johnson"
                value={name}
                onChange={e => {
                  setName(e.target.value)
                  if (error) setError('')
                }}
                autoFocus
                data-testid="name-input"
              />
              {error && (
                <p className="text-red-500 text-xs mt-1.5">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
              data-testid="submit-onboarding"
            >
              {loading ? 'Setting up your account...' : 'Get Started →'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-5">
            Your data is stored locally on your device.
          </p>
        </div>
      </div>
    </div>
  )
}
