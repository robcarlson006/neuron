import React, { useEffect, useState, useMemo, useRef } from 'react'
import type { TutorSession } from '../../types'

interface TutorChatSidebarProps {
  subjectId?: number | null
  currentSessionId?: number | null
  isOpen: boolean
  onToggleOpen: () => void
  onSelectSession: (sessionId: number, session: TutorSession) => void
  onNewSession: () => void
  className?: string
}

export default function TutorChatSidebar({
  subjectId,
  currentSessionId,
  isOpen,
  onToggleOpen,
  onSelectSession,
  onNewSession,
  className = ''
}: TutorChatSidebarProps): React.JSX.Element {
  const [sessions, setSessions] = useState<TutorSession[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [scope, setScope] = useState<'current' | 'all'>(subjectId && subjectId > 0 ? 'current' : 'all')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const editInputRef = useRef<HTMLInputElement>(null)

  // Load sessions
  const loadSessions = async (): Promise<void> => {
    try {
      setLoading(true)
      const targetSubjectId = scope === 'current' ? subjectId : undefined
      const res = await window.electronAPI.tutorListSessions(targetSubjectId, 60)
      setSessions(res || [])
    } catch (err) {
      console.error('Failed to load tutor sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [subjectId, scope, currentSessionId])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  // Handle pin toggle
  const handleTogglePin = async (e: React.MouseEvent, session: TutorSession): Promise<void> => {
    e.stopPropagation()
    const nextPinned = !session.is_pinned
    try {
      await window.electronAPI.tutorToggleSessionPin(session.id, nextPinned)
      setSessions(prev =>
        prev.map(s => (s.id === session.id ? { ...s, is_pinned: nextPinned ? 1 : 0 } : s))
      )
    } catch (err) {
      console.error('Failed to toggle pin:', err)
    }
  }

  // Handle rename
  const handleStartRename = (e: React.MouseEvent, session: TutorSession): void => {
    e.stopPropagation()
    setEditingId(session.id)
    setEditTitle(session.title || session.subject_name || `Session #${session.id}`)
  }

  const handleSaveRename = async (sessionId: number): Promise<void> => {
    if (!editTitle.trim()) {
      setEditingId(null)
      return
    }
    try {
      await window.electronAPI.tutorUpdateSessionTitle(sessionId, editTitle.trim())
      setSessions(prev =>
        prev.map(s => (s.id === sessionId ? { ...s, title: editTitle.trim() } : s))
      )
    } catch (err) {
      console.error('Failed to rename session:', err)
    } finally {
      setEditingId(null)
    }
  }

  // Handle delete
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number): Promise<void> => {
    e.stopPropagation()
    try {
      await window.electronAPI.tutorDeleteSession(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      setDeletingId(null)
      if (currentSessionId === sessionId) {
        onNewSession()
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  // Filter & Group sessions
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const q = searchQuery.toLowerCase()
    return sessions.filter(s => {
      const matchTitle = (s.title || '').toLowerCase().includes(q)
      const matchPreview = (s.last_message_preview || '').toLowerCase().includes(q)
      const matchSubject = (s.subject_name || '').toLowerCase().includes(q)
      return matchTitle || matchPreview || matchSubject
    })
  }, [sessions, searchQuery])

  const groupedSessions = useMemo(() => {
    const pinned: TutorSession[] = []
    const today: TutorSession[] = []
    const yesterday: TutorSession[] = []
    const prev7Days: TutorSession[] = []
    const earlier: TutorSession[] = []

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - 86400000
    const startOf7Days = startOfToday - 6 * 86400000

    for (const session of filteredSessions) {
      if (session.is_pinned) {
        pinned.push(session)
        continue
      }

      const timestamp = session.last_message_at
        ? typeof session.last_message_at === 'number'
          ? session.last_message_at
          : new Date(session.last_message_at).getTime()
        : new Date(session.started_at).getTime()

      if (timestamp >= startOfToday) {
        today.push(session)
      } else if (timestamp >= startOfYesterday) {
        yesterday.push(session)
      } else if (timestamp >= startOf7Days) {
        prev7Days.push(session)
      } else {
        earlier.push(session)
      }
    }

    return [
      { label: 'Pinned', items: pinned, icon: '📌' },
      { label: 'Today', items: today },
      { label: 'Yesterday', items: yesterday },
      { label: 'Previous 7 Days', items: prev7Days },
      { label: 'Earlier', items: earlier }
    ].filter(g => g.items.length > 0)
  }, [filteredSessions])

  const formatSessionDate = (session: TutorSession): string => {
    const timestamp = session.last_message_at
      ? typeof session.last_message_at === 'number'
        ? session.last_message_at
        : new Date(session.last_message_at).getTime()
      : new Date(session.started_at).getTime()

    const d = new Date(timestamp)
    const diffHours = (Date.now() - timestamp) / 3600000
    if (diffHours < 1) {
      const mins = Math.max(1, Math.round((Date.now() - timestamp) / 60000))
      return `${mins}m ago`
    }
    if (diffHours < 24) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  if (!isOpen) {
    return (
      <div className="flex-shrink-0 flex items-start p-2 border-r border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm z-10">
        <button
          onClick={onToggleOpen}
          title="Open Conversation History"
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
            <path d="M9 3v18"/>
            <path d="m14 9 3 3-3 3"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <aside
      className={`flex flex-col w-72 md:w-80 flex-shrink-0 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 select-none transition-all z-20 ${className}`}
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Conversations
          </span>
          {sessions.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
              {sessions.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onNewSession}
            title="Start New Chat"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"/>
              <path d="M12 5v14"/>
            </svg>
            <span>New Chat</span>
          </button>

          <button
            onClick={onToggleOpen}
            title="Collapse Sidebar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2"/>
              <path d="M9 3v18"/>
              <path d="m16 15-3-3 3-3"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Scope Selector (Only if viewing within a subject) */}
      {subjectId && subjectId > 0 && (
        <div className="px-3 pt-2.5 pb-1 flex gap-1">
          <button
            onClick={() => setScope('current')}
            className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${
              scope === 'current'
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            This Class
          </button>
          <button
            onClick={() => setScope('all')}
            className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${
              scope === 'all'
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            All Classes
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="px-3 py-2">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500 pointer-events-none"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-100 dark:bg-slate-800/80 border border-transparent focus:border-violet-500 focus:bg-white dark:focus:bg-slate-900 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4 divide-y divide-slate-100 dark:divide-slate-800/40 scrollbar-thin">
        {loading && sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400 text-xs">
            <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            Loading history...
          </div>
        ) : groupedSessions.length === 0 ? (
          <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-xs">
            {searchQuery ? (
              <p>No conversations found matching &ldquo;{searchQuery}&rdquo;</p>
            ) : (
              <div className="space-y-2">
                <p>No past conversations yet.</p>
                <button
                  onClick={onNewSession}
                  className="text-violet-600 dark:text-violet-400 font-semibold hover:underline"
                >
                  Start a new session →
                </button>
              </div>
            )}
          </div>
        ) : (
          groupedSessions.map(group => (
            <div key={group.label} className="pt-2.5 first:pt-0">
              <div className="px-2 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                {group.icon && <span>{group.icon}</span>}
                <span>{group.label}</span>
                <span className="text-[10px] text-slate-400/80 font-normal">({group.items.length})</span>
              </div>

              <div className="space-y-0.5">
                {group.items.map(session => {
                  const isActive = session.id === currentSessionId
                  const isEditing = session.id === editingId
                  const isDeleting = session.id === deletingId

                  const displayTitle =
                    session.title ||
                    session.last_message_preview ||
                    (session.subject_name ? `${session.subject_name} Session` : `Session #${session.id}`)

                  return (
                    <div
                      key={session.id}
                      onClick={() => !isEditing && onSelectSession(session.id, session)}
                      className={`group relative rounded-xl px-2.5 py-2 text-xs cursor-pointer transition-all flex flex-col gap-1 border ${
                        isActive
                          ? 'bg-violet-50/90 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800 text-slate-900 dark:text-slate-50 shadow-sm'
                          : 'border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {/* Top row: Title + Actions */}
                      <div className="flex items-center justify-between gap-1.5">
                        {isEditing ? (
                          <div
                            className="flex items-center gap-1 w-full"
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editTitle}
                              onChange={e => setEditTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveRename(session.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="flex-1 px-2 py-0.5 text-xs bg-white dark:bg-slate-900 border border-violet-500 rounded outline-none"
                            />
                            <button
                              onClick={() => handleSaveRename(session.id)}
                              className="p-1 text-emerald-600 hover:text-emerald-700"
                              title="Save"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 text-slate-400 hover:text-slate-600"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {session.is_pinned ? (
                                <span className="text-amber-500 flex-shrink-0 text-[11px]" title="Pinned">
                                  📌
                                </span>
                              ) : null}
                              <span
                                className={`font-medium truncate ${
                                  isActive
                                    ? 'text-violet-900 dark:text-violet-200 font-semibold'
                                    : 'text-slate-800 dark:text-slate-200'
                                }`}
                                title={displayTitle}
                              >
                                {displayTitle}
                              </span>
                            </div>

                            {/* Hover / Active Actions */}
                            <div
                              className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${
                                isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                onClick={e => handleTogglePin(e, session)}
                                title={session.is_pinned ? 'Unpin' : 'Pin to top'}
                                className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${
                                  session.is_pinned ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
                                }`}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill={session.is_pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                                </svg>
                              </button>

                              <button
                                onClick={e => handleStartRename(e, session)}
                                title="Rename"
                                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                </svg>
                              </button>

                              {isDeleting ? (
                                <div className="flex items-center gap-1 bg-red-50 dark:bg-red-950/60 p-0.5 rounded border border-red-200 dark:border-red-900">
                                  <button
                                    onClick={e => handleDeleteSession(e, session.id)}
                                    className="px-1 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded"
                                    title="Confirm Delete"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={e => {
                                      e.stopPropagation()
                                      setDeletingId(null)
                                    }}
                                    className="px-1 py-0.5 text-[10px] text-slate-400 hover:text-slate-600 rounded"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    setDeletingId(session.id)
                                  }}
                                  title="Delete Conversation"
                                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18"/>
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Bottom meta row: Subject badge, message count, date */}
                      {!isEditing && (
                        <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {session.subject_name && scope === 'all' && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium truncate max-w-[110px]">
                                {session.subject_name}
                              </span>
                            )}
                            {session.phase === 'complete' && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                ✓ Done
                              </span>
                            )}
                            {session.message_count !== undefined && session.message_count > 0 && (
                              <span>{session.message_count} msg{session.message_count !== 1 ? 's' : ''}</span>
                            )}
                          </div>
                          <span className="flex-shrink-0">{formatSessionDate(session)}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
