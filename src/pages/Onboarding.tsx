import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import NeuronLogo from '../components/NeuronLogo'
import type { StudyGoal } from '../types'

interface OnboardingProps {
  onUserCreated?: () => void
}

export default function Onboarding({ onUserCreated }: OnboardingProps): React.JSX.Element {
  const { setUser, setSubjects } = useAppStore()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  const [showGoalSelection, setShowGoalSelection] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)

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
      setShowGoalSelection(true)
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

          {!showGoalSelection && (
          /* Form */
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
          )}

          {/* Goal Selection */}
          {showGoalSelection && (
            <div className="text-center">
              <h1 className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-2">
                What are you studying?
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mb-8">
                This helps us personalize your study settings.
              </p>
              <div className="grid gap-3 max-w-md mx-auto">
                {([
                  { value: 'medical' as StudyGoal, label: 'Medical / Health', icon: '\u{1F3E5}', retention: 0.92, interleave: false },
                  { value: 'language' as StudyGoal, label: 'Language Learning', icon: '\u{1F30D}', retention: 0.85, interleave: true },
                  { value: 'stem' as StudyGoal, label: 'STEM / Science', icon: '\u{1F52C}', retention: 0.88, interleave: false },
                  { value: 'humanities' as StudyGoal, label: 'Humanities / History', icon: '\u{1F4DA}', retention: 0.85, interleave: true },
                  { value: 'certification' as StudyGoal, label: 'Certification Prep', icon: '\u{1F4DC}', retention: 0.90, interleave: false },
                  { value: 'other' as StudyGoal, label: 'Other / General', icon: '\u{1F3AF}', retention: 0.90, interleave: false },
                ]).map((goal) => (
                  <button
                    key={goal.value}
                    onClick={() => setSelectedGoal(goal.value)}
                    className={`p-4 rounded-xl border-2 text-left flex items-center gap-4 transition-all ${
                      selectedGoal === goal.value
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                    }`}
                  >
                    <span className="text-2xl">{goal.icon}</span>
                    <div>
                      <div className="font-semibold dark:text-white">{goal.label}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {goal.retention * 100}% target retention
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={async () => {
                  try {
                    const api = (window as any).electronAPI
                    if (api) {
                      await api.saveOnboardingData({ name: name, goal: selectedGoal, hasCompleted: true })
                    }
                  } catch {}
                  onUserCreated?.()
                }}
                disabled={!selectedGoal}
                className="mt-6 px-8 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-xl font-medium transition-colors"
              >
                Start Studying
              </button>
            </div>
          )}

          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-5">
            Your data is stored locally on your device.
          </p>
        </div>
      </div>
    </div>
  )
}
