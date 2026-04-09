import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import NeuronLogo from '../components/NeuronLogo'

interface OnboardingProps {
  onUserCreated?: () => void
}

export default function Onboarding({ onUserCreated }: OnboardingProps): React.JSX.Element {
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
      onUserCreated?.()
    } catch (err) {
      setError('Failed to save. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neuron-200 via-neuron-300 to-sky-300 dark:from-neuron-900 dark:via-neuron-950 dark:to-sky-950 flex items-center justify-center p-6">
      <div
        className={`w-full max-w-md transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-10">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mx-auto mb-5">
              <NeuronLogo size={72} className="drop-shadow-lg" />
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
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neuron-100 dark:bg-neuron-900/30 text-neuron-700 dark:text-neuron-300 text-xs font-medium border border-neuron-200 dark:border-neuron-800"
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
              className="w-full bg-neuron-600 hover:bg-neuron-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-neuron-500 focus:ring-offset-2"
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
