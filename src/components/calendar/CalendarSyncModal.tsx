import React, { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { CalendarSource } from '../../types'

interface CalendarSyncModalProps {
  isOpen: boolean
  onClose: () => void
  onSyncComplete: () => void
  sources: CalendarSource[]
}

const COLOR_PRESETS = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4']

export default function CalendarSyncModal({
  isOpen,
  onClose,
  onSyncComplete,
  sources
}: CalendarSyncModalProps): React.JSX.Element | null {
  const { user, addToast } = useAppStore()
  const [feedUrl, setFeedUrl] = useState('')
  const [feedName, setFeedName] = useState('My Google Calendar')
  const [selectedColor, setSelectedColor] = useState('#8b5cf6')
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  if (!isOpen) return null

  const handleSyncSource = async (sourceId: number) => {
    setSyncingId(sourceId)
    try {
      const res = await window.electronAPI.calendar.syncSource(sourceId)
      if (res.success) {
        addToast({
          type: 'success',
          title: 'Calendar Synced',
          message: `Updated ${res.eventCount} events from Google Calendar.`
        })
        onSyncComplete()
      } else {
        addToast({
          type: 'error',
          title: 'Sync Failed',
          message: res.error || 'Could not fetch calendar feed.'
        })
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Sync Error',
        message: err.message || 'An unexpected error occurred.'
      })
    } finally {
      setSyncingId(null)
    }
  }

  const handleDeleteSource = async (sourceId: number) => {
    if (!confirm('Are you sure you want to disconnect this calendar? All synced events will be removed.')) return
    try {
      await window.electronAPI.calendar.deleteSource(sourceId)
      addToast({
        type: 'info',
        title: 'Calendar Disconnected',
        message: 'The calendar source and its events were removed.'
      })
      onSyncComplete()
    } catch (err: any) {
      console.error(err)
    }
  }

  const handleAddAndSync = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !feedUrl.trim()) return

    const cleanUrl = feedUrl.trim()
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      alert('Please enter a valid URL starting with https://')
      return
    }

    setConnecting(true)
    try {
      const newSource = await window.electronAPI.calendar.saveSource({
        userId: user.id,
        name: feedName.trim() || 'Google Calendar',
        type: 'ical',
        url: cleanUrl,
        color: selectedColor
      })

      const res = await window.electronAPI.calendar.syncSource(newSource.id)
      if (res.success) {
        addToast({
          type: 'success',
          title: 'Calendar Connected!',
          message: `Synced ${res.eventCount} events from Google Calendar.`
        })
        setFeedUrl('')
        setFeedName('My Google Calendar')
        onSyncComplete()
        onClose()
      } else {
        addToast({
          type: 'error',
          title: 'Connection Warning',
          message: res.error || 'Calendar saved, but failed to fetch events. Check the URL.'
        })
        onSyncComplete()
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Connection Error',
        message: err.message || 'Failed to save calendar source.'
      })
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📅</span>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                Google Calendar Sync
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sync lectures, seminars, and routines into Neuron
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6">
          {/* Existing Connected Sources */}
          {sources.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Connected Calendars
              </h3>
              <div className="space-y-2">
                {sources.map(s => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.color || '#8b5cf6' }}
                        />
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {s.name}
                        </p>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                        {s.last_synced_at
                          ? `Last synced: ${new Date(s.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Not synced yet'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSyncSource(s.id)}
                        disabled={syncingId === s.id}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1"
                      >
                        {syncingId === s.id ? (
                          <span className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          '🔄'
                        )}
                        Sync
                      </button>
                      <button
                        onClick={() => handleDeleteSource(s.id)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors text-xs"
                        title="Disconnect"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Calendar Source */}
          <form onSubmit={handleAddAndSync} className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Add Private Google Calendar Link
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Calendar Name
              </label>
              <input
                type="text"
                value={feedName}
                onChange={e => setFeedName(e.target.value)}
                placeholder="e.g. University Schedule"
                className="input text-sm w-full"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Private iCal Address (.ics URL)
              </label>
              <input
                type="url"
                value={feedUrl}
                onChange={e => setFeedUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                className="input text-sm w-full font-mono text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Calendar Accent Color
              </label>
              <div className="flex items-center gap-2">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      selectedColor === c ? 'ring-2 ring-offset-2 ring-violet-500 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* How to find instructions toggle */}
            <div className="bg-violet-50/50 dark:bg-violet-950/20 rounded-xl p-3 border border-violet-100 dark:border-violet-900/30 text-xs">
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="flex items-center justify-between w-full text-violet-700 dark:text-violet-300 font-medium"
              >
                <span>💡 How to find your Google Calendar secret link</span>
                <span>{showGuide ? '▲' : '▼'}</span>
              </button>
              {showGuide && (
                <ol className="list-decimal list-inside space-y-1 mt-2.5 text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                  <li>Open <strong>Google Calendar</strong> on your desktop web browser.</li>
                  <li>In the left sidebar, hover over your calendar and click the <strong>3 dots (⋮)</strong> ➔ <strong>Settings and sharing</strong>.</li>
                  <li>Scroll down to the <strong>Integrate calendar</strong> section.</li>
                  <li>Find the box labeled <strong>Secret address in iCal format</strong>.</li>
                  <li>Click <strong>Copy</strong> and paste the link in the input box above.</li>
                </ol>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-xs py-2 px-4"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={connecting || !feedUrl.trim()}
                className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
              >
                {connecting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Connecting & Syncing...
                  </>
                ) : (
                  'Connect & Sync Events'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
