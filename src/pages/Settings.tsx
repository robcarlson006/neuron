import React, { useState } from 'react'
import { useAppStore } from '../store/appStore'

export default function Settings(): React.JSX.Element {
  const { user, setUser, theme, toggleTheme } = useAppStore()
  const [name, setName] = useState(user?.name || '')
  const [reminderTime, setReminderTime] = useState('09:00')
  const [savedName, setSavedName] = useState(false)

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

  async function handleSaveApiKey(): Promise<void> {
    if (!apiKey.trim()) return
    try {
      await window.electronAPI.saveApiKey(apiKey.trim())
      const masked = await window.electronAPI.getApiKey()
      setApiKeyMasked(masked || '')
      setApiKey('')
      setEditingApiKey(false)
      setSavedKey(true)
      setKeyStatus('unchecked')
      setTimeout(() => setSavedKey(false), 2000)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleCheckApiKey(): Promise<void> {
    setCheckingKey(true)
    try {
      const result = await window.electronAPI.checkApiKey()
      setKeyStatus(result.valid ? 'valid' : 'invalid')
    } catch {
      setKeyStatus('invalid')
    } finally {
      setCheckingKey(false)
    }
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

        {/* About section */}
        <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-3">About</h2>
          <div className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
            <p>
              <span className="font-medium text-slate-700 dark:text-slate-300">Neuron</span>
              {' '}v1.0.0
            </p>
            <p>Built with Electron, React, and Google Gemini AI</p>
            <p>Spaced repetition powered by the SM-2 algorithm</p>
          </div>
        </section>
      </div>
    </div>
  )
}
