import React, { useState, useMemo } from 'react'
import type { ExamReadinessResult, CramOptimizationResult } from '../../types'
import { generateCramOptimizationPlan, type CardWithSchedule } from '../../lib/readinessEngine'
import { X, Flame, Clock, CheckCircle2, Play, Calendar } from '../icons'

interface CramOptimizerModalProps {
  isOpen: boolean
  readiness: ExamReadinessResult
  cards: CardWithSchedule[]
  subjectName?: string
  onClose: () => void
  onStartCramSession: (cardIds: number[], dayTitle: string) => void
  onApplyDailyPlan?: (cramResult: CramOptimizationResult) => void
}

export default function CramOptimizerModal({
  isOpen,
  readiness,
  cards,
  subjectName,
  onClose,
  onStartCramSession,
  onApplyDailyPlan
}: CramOptimizerModalProps): React.JSX.Element | null {
  const [dailyMinutes, setDailyMinutes] = useState<number>(45)
  const [appliedToast, setAppliedToast] = useState<boolean>(false)

  // Recalculate plan dynamically when dailyMinutes changes
  const cramPlan = useMemo(() => {
    return generateCramOptimizationPlan({
      readiness,
      cards,
      dailyMinutes
    })
  }, [readiness, cards, dailyMinutes])

  if (!isOpen) return null

  const handleStartToday = () => {
    if (cramPlan.dailyPlan.length > 0) {
      const todayPlan = cramPlan.dailyPlan[0]
      onStartCramSession(todayPlan.cardIds, todayPlan.focusTitle)
    }
  }

  const handleApply = () => {
    onApplyDailyPlan?.(cramPlan)
    setAppliedToast(true)
    setTimeout(() => setAppliedToast(false), 3000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cram-optimizer-title"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] transition-all transform animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-purple-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Flame size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Cram Schedule Optimizer
                </span>
                <span className="text-xs text-slate-400">• {readiness.daysRemaining} days remaining</span>
              </div>
              <h2 id="cram-optimizer-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {subjectName ? `${subjectName} — ` : ''}{readiness.deadlineLabel}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
          <div className="rounded-2xl border border-indigo-200/50 bg-indigo-500/5 p-4 dark:border-indigo-800/50">
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Review plan estimate</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              About {dailyMinutes} minutes per day for {cramPlan.daysCount} {cramPlan.daysCount === 1 ? 'day' : 'days'}, covering {cramPlan.totalCardsToReview} cards.
              This is a time and card schedule, not an exam score prediction.
            </div>
          </div>

          {/* Time Budget Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="daily-minutes-slider" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-500" />
                How much time can you study per day?
              </label>
              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
                {dailyMinutes} minutes
              </span>
            </div>

            <input
              id="daily-minutes-slider"
              type="range"
              min={15}
              max={180}
              step={15}
              value={dailyMinutes}
              onChange={e => setDailyMinutes(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />

            <div className="flex justify-between text-[11px] text-slate-400 px-1 font-medium">
              <span>15 min (Quick)</span>
              <span>45 min (Balanced)</span>
              <span>90 min (Intensive)</span>
              <span>180 min (Full Cram)</span>
            </div>
          </div>

          {/* Daily Schedule Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Calendar size={13} />
                Optimized High-Yield Daily Schedule
              </h4>
              <span className="text-[11px] text-slate-400">
                {cramPlan.totalCardsToReview} cards scheduled
              </span>
            </div>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {cramPlan.dailyPlan.map(day => (
                <div
                  key={day.dayNumber}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-3 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center">
                      D{day.dayNumber}
                    </span>
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {day.focusTitle}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {day.topics.map(t => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-200/70 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right space-y-0.5">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {day.targetCardCount} cards
                    </div>
                    <div className="text-[10px] text-slate-400">~{day.estimatedMinutes} min</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          <div>
            {appliedToast && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-fade-in">
                <CheckCircle2 size={14} /> Plan applied to Daily Schedule!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleApply}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Add to Daily Plan
            </button>

            <button
              onClick={handleStartToday}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all"
            >
              <Play size={13} className="fill-white" />
              Start Day 1 Cram Session
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
