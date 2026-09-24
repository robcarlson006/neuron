import React, { useState, useEffect, useCallback } from 'react'

export interface QuickCardCandidate {
  type: 'flashcard' | 'active_recall'
  front: string
  back: string
  concept: string
}

interface QuickCardModalProps {
  isOpen: boolean
  isLoading: boolean
  snippet: string
  initialCard?: QuickCardCandidate | null
  onSave: (card: QuickCardCandidate) => void
  onClose: () => void
}

export default function QuickCardModal({
  isOpen,
  isLoading,
  snippet,
  initialCard,
  onSave,
  onClose
}: QuickCardModalProps): React.JSX.Element | null {
  const [type, setType] = useState<'flashcard' | 'active_recall'>('flashcard')
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [concept, setConcept] = useState('')

  useEffect(() => {
    if (initialCard) {
      setType(initialCard.type || 'flashcard')
      setFront(initialCard.front || '')
      setBack(initialCard.back || '')
      setConcept(initialCard.concept || '')
    } else if (!isLoading) {
      setType('flashcard')
      setFront('')
      setBack('')
      setConcept('')
    }
  }, [initialCard, isLoading])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        if (front.trim() && back.trim()) {
          onSave({ type, front: front.trim(), back: back.trim(), concept: concept.trim() || 'General' })
        }
      }
    },
    [isOpen, front, back, type, concept, onSave, onClose]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  function handleConfirm(): void {
    if (!front.trim() || !back.trim()) return
    onSave({
      type,
      front: front.trim(),
      back: back.trim(),
      concept: concept.trim() || 'General'
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all transform animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-violet-50/60 via-white to-indigo-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-300 flex items-center justify-center text-sm font-bold shadow-xs">
              🃏
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Turn Dialogue into Study Card
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                In-flight card capture directly from your tutor discussion
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Source Quote Snippet */}
          {snippet && (
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                From Tutor Dialogue
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 italic line-clamp-3 leading-relaxed">
                "{snippet}"
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="py-10 text-center space-y-3">
              <span className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin inline-block" />
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Formulating atomic prompt & concise answer...
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Applying Matuschak atomicity & discrimination rules
              </p>
            </div>
          ) : (
            <>
              {/* Type Switcher */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType('flashcard')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    type === 'flashcard'
                      ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>🃏 Flashcard</span>
                  <span className="text-[10px] opacity-75 font-normal">(Term / Distinction)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('active_recall')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    type === 'active_recall'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>🧠 Active Recall</span>
                  <span className="text-[10px] opacity-75 font-normal">(Why / How Mechanism)</span>
                </button>
              </div>

              {/* Front Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Front (Prompt / Question / Term)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Keep under 15 words</span>
                </label>
                <textarea
                  value={front}
                  onChange={e => setFront(e.target.value)}
                  rows={2}
                  placeholder="e.g. Internal vs External Rotation: Which muscle is responsible for internal rotation?"
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 resize-none"
                />
              </div>

              {/* Back Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Back (Target Answer / Definition)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Concise, single breath (&lt;15 words)</span>
                </label>
                <textarea
                  value={back}
                  onChange={e => setBack(e.target.value)}
                  rows={2}
                  placeholder="e.g. Subscapularis (whereas Infraspinatus and Teres Minor produce external rotation)."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 resize-none"
                />
              </div>

              {/* Concept Tag */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Concept / Topic Tag
                </label>
                <input
                  type="text"
                  value={concept}
                  onChange={e => setConcept(e.target.value)}
                  placeholder="e.g. Rotator Cuff Kinematics"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Press <kbd className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[10px] font-mono shadow-2xs">⌘ + Enter</kbd> to save
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isLoading || !front.trim() || !back.trim()}
              onClick={handleConfirm}
              className="px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>💾</span>
              <span>Save Card</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
