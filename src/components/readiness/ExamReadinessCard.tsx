import React from 'react'
import type { ExamReadinessResult } from '../../types'
import { AlertCircle, ArrowRight, BookOpen, Flame, Sparkles } from '../icons'

interface ExamReadinessCardProps {
  readiness: ExamReadinessResult
  subjectName?: string
  onOpenCramOptimizer: () => void
  onQuickReviewTopic?: (topicTitle: string) => void
}

export default function ExamReadinessCard({
  readiness,
  subjectName,
  onOpenCramOptimizer,
  onQuickReviewTopic
}: ExamReadinessCardProps): React.JSX.Element {
  const { deadlineLabel, daysRemaining, evidenceStatus, coveragePercent, weakTopics, totalCards } = readiness
  const focusTopics = weakTopics.slice(0, 4)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-white shadow-sm dark:bg-slate-900">
      <div className="relative space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Sparkles size={12} className="text-indigo-500" />
                Study Readiness
              </span>
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} until {deadlineLabel}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {subjectName ? `${subjectName} — ` : ''}{deadlineLabel}
            </h3>
          </div>
          <button
            onClick={onOpenCramOptimizer}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:from-indigo-500 hover:to-violet-500 active:scale-95"
          >
            <Flame size={14} className="text-amber-300" />
            Build a Review Plan
          </button>
        </div>

        {evidenceStatus === 'no_evidence' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            There are no study cards to assess yet. Add cards or link cards to syllabus topics to see review coverage.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Syllabus coverage</div>
              <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                {coveragePercent == null ? 'Not available' : `${coveragePercent}%`}
              </div>
              <div className="text-[10px] text-slate-400">
                {coveragePercent == null ? 'No syllabus topics found' : 'Topics linked to study cards'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Study cards</div>
              <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{totalCards}</div>
              <div className="text-[10px] text-slate-400">Available review evidence</div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Topics to revisit</div>
              <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{focusTopics.length}</div>
              <div className="text-[10px] text-slate-400">Based on scheduled recall</div>
            </div>
          </div>
        )}

        {focusTopics.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <AlertCircle size={13} className="text-amber-500" />
                Suggested review topics
              </span>
              <span className="text-[11px] text-slate-400">Lowest scheduled recall first</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {focusTopics.map(topic => (
                <button
                  key={topic.topicTitle}
                  onClick={() => onQuickReviewTopic?.(topic.topicTitle)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                >
                  <BookOpen size={12} className="text-amber-600 dark:text-amber-400" />
                  <span className="max-w-[150px] truncate">{topic.topicTitle}</span>
                  <span className="text-[10px] font-bold opacity-75">
                    {topic.cardCount === 0 ? 'No cards yet' : `${topic.cardCount} cards`}
                  </span>
                  <ArrowRight size={10} className="opacity-50" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
