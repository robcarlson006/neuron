import React, { useEffect, useRef } from 'react'
import LoadingProgressBar from '../common/LoadingProgressBar'
import type { HighlightCardDraft } from '../../types'

interface HighlightCardPreviewModalProps {
  draft: HighlightCardDraft
  feedback: string
  generating: boolean
  message: string
  error: boolean
  onDraftChange: (draft: HighlightCardDraft) => void
  onFeedbackChange: (feedback: string) => void
  onRevise: () => void
  onSave: () => void
  onClose: () => void
}

export default function HighlightCardPreviewModal({
  draft,
  feedback,
  generating,
  message,
  error,
  onDraftChange,
  onFeedbackChange,
  onRevise,
  onSave,
  onClose
}: HighlightCardPreviewModalProps): React.JSX.Element {
  const feedbackRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !generating) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    feedbackRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [generating, onClose])

  return (
    <div data-testid="highlight-card-preview-modal" className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Flashcard preview">
      <div className="w-full max-w-xl rounded-2xl border border-violet-200 bg-white p-5 shadow-2xl dark:border-violet-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Highlight card</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Flashcard preview</h2>
          </div>
          <button type="button" onClick={onClose} disabled={generating} className="text-sm text-slate-400 hover:text-slate-700 disabled:opacity-40 dark:hover:text-white">Close</button>
        </div>

        {generating && <LoadingProgressBar label="Revising flashcard…" sublabel="The current card will remain available until the revision finishes." size="sm" className="mb-4" />}

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Editable AI card preview</div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="highlight-card-front">Front</label>
          <textarea id="highlight-card-front" aria-label="Flashcard front" value={draft.front} onChange={(event) => onDraftChange({ ...draft, front: event.target.value })} className="min-h-16 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="highlight-card-back">Back</label>
          <textarea id="highlight-card-back" aria-label="Flashcard back" value={draft.back} onChange={(event) => onDraftChange({ ...draft, back: event.target.value })} className="min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="highlight-card-feedback">Optional feedback</label>
          <textarea ref={feedbackRef} id="highlight-card-feedback" aria-label="Flashcard feedback" value={feedback} onChange={(event) => onFeedbackChange(event.target.value)} placeholder="Tell the AI what to improve, if anything…" className="min-h-16 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>

        {message && <p className={`mt-3 text-xs ${error ? 'text-rose-600' : 'text-emerald-600'}`}>{message}</p>}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={generating} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300">Close</button>
          <button type="button" onClick={onRevise} disabled={generating || !feedback.trim()} className="rounded-lg border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-40 dark:text-indigo-300">Revise with feedback</button>
          <button type="button" onClick={onSave} disabled={generating || !draft.front.trim() || !draft.back.trim()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save card</button>
        </div>
      </div>
    </div>
  )
}
