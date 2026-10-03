import React, { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { CalendarSource, GoogleCalendarRuntimeStatus } from '../../types'

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
  const [googleAccounts, setGoogleAccounts] = useState<Array<{ id: number; status: string; last_synced_at?: string; last_error?: string }>>([])
  const [runtimeStatus, setRuntimeStatus] = useState<GoogleCalendarRuntimeStatus | null>(null)
  const [runtimeError, setRuntimeError] = useState('')

  useEffect(() => {
    if (!isOpen || !user) return
    setRuntimeError('')
    const googleApi = window.electronAPI?.googleCalendar
    if (!googleApi?.getStatus) {
      setRuntimeError('Neuron must be restarted to load the Google Calendar integration.')
      return
    }
    void googleApi.getStatus(user.id).then(status => {
      setRuntimeStatus(status)
      setGoogleAccounts(status.accounts)
      if (status.integrationVersion !== googleApi.ipcVersion || !status.handlerRegistered || !status.schemaReady) setRuntimeError(status.error || 'Neuron must be restarted to finish loading Google Calendar.')
    }).catch(() => setRuntimeError('Neuron must be fully quit and reopened before Google Calendar can be connected.'))
  }, [isOpen, user])

  if (!isOpen) return null

  const handleSyncSource = async (sourceId: number) => {
    setSyncingId(sourceId)
    try {
      const source = sources.find(item => item.id === sourceId)
      const res = source?.type === 'google_oauth' && source.google_account_id
        ? await window.electronAPI.googleCalendar.syncAccount(user!.id, source.google_account_id)
        : await window.electronAPI.calendar.syncSource(sourceId)
      if (res.success || res.partial) {
        addToast({
          type: res.partial ? 'info' : 'success',
          title: res.partial ? 'Calendar Partially Synced' : 'Calendar Synced',
          message: res.partial ? (res.warning || `Updated ${res.eventCount} events with some calendar warnings.`) : `Updated ${res.eventCount} events from Google Calendar.`
        })
        onSyncComplete()
      } else {
        addToast({
          type: 'error',
          title: `Sync Failed${res.stage ? ` · ${res.stage.replace('_', ' ')}` : ''}`,
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

  const handleConnectGoogle = async (replaceAccountId?: number) => {
    if (!user) return
    try {
      const status = await window.electronAPI.googleCalendar.getStatus(user.id)
      setRuntimeStatus(status)
      if (status.integrationVersion !== window.electronAPI.googleCalendar.ipcVersion || !status.handlerRegistered || !status.schemaReady) {
        setRuntimeError(status.error || 'Neuron must be restarted before connecting Google Calendar.')
        return
      }
      if (!status.clientIdConfigured) {
        setRuntimeError(status.error || 'Google Calendar is not configured. Open Settings and add a Google OAuth client ID.')
        return
      }
    } catch {
      setRuntimeError('Neuron must be fully quit and reopened before Google Calendar can be connected.')
      return
    }
    setConnecting(true)
    try {
      const result = await window.electronAPI.googleCalendar.connect(user.id, replaceAccountId)
      setGoogleAccounts(previous => [...previous.filter(account => account.id !== result.account.id), result.account])
      const sync = result.sync
      addToast({
        type: sync.success ? 'success' : sync.partial ? 'info' : 'error',
        title: sync.success ? 'Google Calendar connected' : sync.partial ? 'Google Calendar connected with warnings' : 'Google authorization succeeded; sync needs attention',
        message: sync.success ? `Synced ${sync.eventCount} events from ${sync.calendarCount} calendars.` : sync.warning || sync.error || 'Authorization succeeded, but calendar import needs attention.'
      })
      onSyncComplete()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Google Calendar connection failed', message: err.message || 'Could not complete Google authorization.' })
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnectGoogle = async (accountId: number) => {
    if (!user || !confirm('Disconnect this Google account and remove its imported calendar events?')) return
    await window.electronAPI.googleCalendar.disconnect(user.id, accountId)
    setGoogleAccounts(previous => previous.filter(account => account.id !== accountId))
    addToast({ type: 'info', title: 'Google Calendar disconnected', message: 'Imported Google calendars and events were removed.' })
    onSyncComplete()
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
          <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Connect with Google</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">Read-only access to all calendars you choose in Google. Neuron imports the past 12 months and next 24 months.</p>
            </div>
            <button type="button" onClick={() => void handleConnectGoogle()} disabled={connecting} className="btn-primary w-full text-xs">
              {connecting ? 'Waiting for Google authorization…' : runtimeError ? 'Check Google Calendar setup' : 'Connect Google Calendar'}
            </button>
            {runtimeError && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">{runtimeError}<div className="mt-1">Open Settings → Advanced → Google Calendar setup to configure the client ID, or fully quit and reopen Neuron if an update was just installed.</div></div>}
            {!runtimeError && runtimeStatus && <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Google Calendar authorization is ready.</p>}
            {googleAccounts.map(account => {
              const accountSources = sources.filter(source => source.type === 'google_oauth' && source.google_account_id === account.id)
              return <div key={account.id} className="space-y-2 rounded-lg border border-blue-200/70 bg-white/70 p-3 dark:border-blue-900/50 dark:bg-slate-900/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">Google account · {account.status === 'connected' ? 'Connected' : 'Reauthorization required'}</span>
                  <div className="flex gap-2">
                    {account.status !== 'connected' && <button type="button" onClick={() => void handleConnectGoogle(account.id)} className="text-xs text-blue-700 hover:underline dark:text-blue-300">Reconnect</button>}
                    <button type="button" onClick={() => void window.electronAPI.googleCalendar.syncAccount(user!.id, account.id).then(result => { addToast({ type: result.success ? 'success' : result.partial ? 'info' : 'error', title: result.success ? 'Google calendars synced' : result.partial ? 'Google calendars partially synced' : `Google sync failed${result.stage ? ` · ${result.stage.replace('_', ' ')}` : ''}`, message: result.success ? `Updated ${result.eventCount} events.` : result.warning || result.error || 'Sync failed.' }); onSyncComplete() })} className="text-xs text-blue-700 hover:underline dark:text-blue-300">Sync</button>
                    <button type="button" onClick={() => void handleDisconnectGoogle(account.id)} className="text-xs text-red-600 hover:underline">Disconnect</button>
                  </div>
                </div>
                {account.last_error && <p className="text-[11px] text-red-600 dark:text-red-400">{account.last_error}</p>}
                {accountSources.length > 0 && <div className="space-y-1">{accountSources.map(source => <label key={source.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"><input type="checkbox" checked={source.enabled !== 0 && source.enabled !== false} onChange={event => void window.electronAPI.googleCalendar.setSourceEnabled(user!.id, source.id, event.target.checked).then(onSyncComplete)} />{source.name}</label>)}</div>}
              </div>
            })}
          </section>

          {/* Existing Connected Sources */}
          {sources.filter(source => source.type !== 'google_oauth').length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Connected Calendars
              </h3>
              <div className="space-y-2">
                {sources.filter(source => source.type !== 'google_oauth').map(s => (
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
