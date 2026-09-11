import React from 'react'
import type { AutoGradeResult } from '../lib/semanticEvaluator'

interface AutoGradeFeedbackProps {
  result: AutoGradeResult | null
  loading?: boolean
  suggestedLabel?: string
  onAcceptSuggested?: () => void
  compact?: boolean
}

export default function AutoGradeFeedback({
  result,
  loading = false,
  suggestedLabel,
  onAcceptSuggested,
  compact = false
}: AutoGradeFeedbackProps): React.JSX.Element | null {
  if (loading) {
    return (
      <div
        data-testid="autograde-loading"
        className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-3 animate-pulse"
      >
        <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs">
          ✨
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
          <div className="h-2.5 bg-slate-100 dark:bg-slate-700/50 rounded w-2/3" />
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Grading...</span>
      </div>
    )
  }

  if (!result) return null

  const pct = Math.round(result.score * 100)
  const isHigh = pct >= 80
  const isMid = pct >= 50 && pct < 80
  const badgeColor = isHigh
    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    : isMid
    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'

  const tierBadge =
    result.tierUsed === 'exact'
      ? '🎯 Exact Match'
      : result.tierUsed === 'ai'
      ? '🤖 AI Graded'
      : '⚡ Semantic Match'

  return (
    <div
      data-testid="autograde-feedback"
      className="w-full bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3 animate-fade-in"
    >
      {/* Top row: Grade badge & Source */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Auto-Grader
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
            {tierBadge}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {suggestedLabel && (
            <button
              onClick={onAcceptSuggested}
              title="Click or press Space to accept"
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Suggested: <strong>{suggestedLabel}</strong></span>
              <kbd className="px-1 py-0.5 text-[10px] rounded bg-violet-200/60 dark:bg-violet-800/60 font-mono">
                Space
              </kbd>
            </button>
          )}
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeColor}`}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Feedback text */}
      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
        {result.feedback}
      </p>

      {/* Concept tags */}
      {!compact && (result.matchedConcepts.length > 0 || result.missingConcepts.length > 0) && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap gap-1.5 text-xs">
          {result.matchedConcepts.slice(0, 4).map((c, i) => (
            <span
              key={`matched-${i}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
            >
              <span>✓</span>
              <span>{c}</span>
            </span>
          ))}
          {result.missingConcepts.slice(0, 3).map((c, i) => (
            <span
              key={`missing-${i}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60"
              title="Concept not mentioned"
            >
              <span>+</span>
              <span>{c}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
