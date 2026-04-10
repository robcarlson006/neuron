import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SubjectWithStats } from '../types'

interface SubjectCardProps {
  data: SubjectWithStats
  onDelete?: (subjectId: number) => void
  onStatusChange?: (subjectId: number, status: 'active' | 'ongoing' | 'archived') => void
}

export default function SubjectCard({ data, onDelete, onStatusChange }: SubjectCardProps): React.JSX.Element {
  const { subject, masteryPercent, cardsDue, nextDeadline, totalCards } = data
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const daysUntilDeadline = nextDeadline
    ? Math.ceil(
        (new Date(nextDeadline.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null

  const statusBadge: Record<string, string> = {
    active: 'badge-violet',
    ongoing: 'badge-blue',
    archived: 'badge-slate'
  }

  const statusLabel: Record<string, string> = {
    active: 'Active',
    ongoing: 'Ongoing',
    archived: 'Archived'
  }

  const accentColor: Record<string, string> = {
    active: 'border-l-violet-500',
    ongoing: 'border-l-blue-400',
    archived: 'border-l-slate-300 dark:border-l-slate-600'
  }

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  function handleDeleteClick(): void {
    setMenuOpen(false)
    setConfirmDelete(true)
  }

  async function handleConfirmDelete(): Promise<void> {
    setConfirmDelete(false)
    if (onDelete) onDelete(subject.id)
  }

  function handleStatusChange(status: 'active' | 'ongoing' | 'archived'): void {
    setMenuOpen(false)
    if (onStatusChange) onStatusChange(subject.id, status)
  }

  return (
    <>
      <div
        className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${accentColor[subject.status] || 'border-l-slate-300'} shadow-sm p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-fade-in`}
        onClick={() => navigate(`/subject/${subject.id}`)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-50 text-base truncate">
              {subject.name}
            </h3>
            {subject.course_code && (
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                {subject.course_code}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={statusBadge[subject.status] || 'badge-slate'}>
              {statusLabel[subject.status] || subject.status}
            </span>

            {/* Three-dot menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o) }}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="Subject options"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13" r="1.5" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-8 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1.5 min-w-[176px]"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => { setMenuOpen(false); navigate(`/subject/${subject.id}`) }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Open Subject
                  </button>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

                  {/* Status options */}
                  <p className="px-4 pt-1 pb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Set Status
                  </p>
                  {(['active', 'ongoing', 'archived'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                        subject.status === s
                          ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{s === 'active' ? '📗' : s === 'ongoing' ? '📘' : '📦'}</span>
                      <span className="capitalize">{s}</span>
                      {subject.status === s && (
                        <svg className="ml-auto w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                          <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}

                  <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

                  <button
                    onClick={handleDeleteClick}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Delete Subject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mastery progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Mastery
            </span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {Math.round(masteryPercent)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(masteryPercent, 0)}%` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              cardsDue > 0 ? 'bg-amber-400 animate-pulse' : 'bg-slate-200 dark:bg-slate-600'
            }`} />
            <span className={`text-sm font-medium ${
              cardsDue > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}>
              {cardsDue} due
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-600">·</span>

          <span className="text-slate-400 dark:text-slate-500 text-sm">
            {totalCards} cards
          </span>

          {nextDeadline && daysUntilDeadline !== null && (
            <div className={`ml-auto flex items-center gap-1 text-xs font-medium ${
              daysUntilDeadline <= 3
                ? 'text-red-500 dark:text-red-400'
                : daysUntilDeadline <= 7
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1.5" y="2" width="9" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
                <path d="M4 1.5V2.5M8 1.5V2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M1.5 5H10.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span>
                {daysUntilDeadline <= 0
                  ? 'Due today!'
                  : daysUntilDeadline === 1
                  ? 'Tomorrow'
                  : `${daysUntilDeadline}d`}
              </span>
            </div>
          )}
        </div>

        {/* Study Now button */}
        {totalCards > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <SubjectStudyMenu subjectId={subject.id} cardsDue={cardsDue} />
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-2">
              Delete "{subject.name}"?
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              This will permanently delete the subject and all its cards, schedules, and study history. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SubjectStudyMenu({ subjectId, cardsDue }: { subjectId: number; cardsDue: number }): React.JSX.Element {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    window.addEventListener('mousedown', closeMenu)
    return () => window.removeEventListener('mousedown', closeMenu)
  }, [open, closeMenu])

  const base = `/study/${subjectId}`
  const options = [
    { label: 'Study Now', desc: 'Flashcards & active recall with spaced repetition', route: base, dot: 'bg-violet-500' },
    { label: 'Multiple Choice', desc: 'Practice with answer options — no schedule impact', route: `${base}?mode=mc`, dot: 'bg-blue-500' },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="w-full bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
      >
        Study Now{cardsDue > 0 ? ` · ${cardsDue} due` : ''}
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg py-1.5 z-50">
          {options.map(opt => (
            <button
              key={opt.label}
              onClick={(e) => { e.stopPropagation(); setOpen(false); navigate(opt.route) }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-start gap-3"
            >
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${opt.dot}`} />
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{opt.label}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
