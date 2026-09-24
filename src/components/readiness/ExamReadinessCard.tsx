import React from 'react'
import type { ExamReadinessResult } from '../../types'
import { Sparkles, AlertCircle, Flame, ArrowRight, BookOpen } from '../icons'

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
  const {
    deadlineLabel,
    daysRemaining,
    projectedScore,
    confidenceMargin,
    tier,
    tierLabel,
    coveragePercent,
    weakTopics,
    totalCards
  } = readiness

  // Color schemes according to tier
  const tierStyles = {
    ready: {
      bgGradient: 'from-emerald-500/10 via-teal-500/5 to-transparent',
      borderColor: 'border-emerald-500/30',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      ringColor: '#10b981',
      textColor: 'text-emerald-600 dark:text-emerald-400'
    },
    proficient: {
      bgGradient: 'from-indigo-500/10 via-blue-500/5 to-transparent',
      borderColor: 'border-indigo-500/30',
      badgeBg: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
      ringColor: '#6366f1',
      textColor: 'text-indigo-600 dark:text-indigo-400'
    },
    borderline: {
      bgGradient: 'from-amber-500/10 via-yellow-500/5 to-transparent',
      borderColor: 'border-amber-500/30',
      badgeBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      ringColor: '#f59e0b',
      textColor: 'text-amber-600 dark:text-amber-400'
    },
    critical: {
      bgGradient: 'from-rose-500/10 via-red-500/5 to-transparent',
      borderColor: 'border-rose-500/30',
      badgeBg: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      ringColor: '#f43f5e',
      textColor: 'text-rose-600 dark:text-rose-400'
    }
  }[tier]

  // Circular gauge calculations
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (projectedScore / 100) * circumference

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 shadow-sm transition-all hover:shadow-md ${tierStyles.borderColor}`}
    >
      {/* Subtle background glow */}
      <div className={`absolute inset-0 bg-gradient-to-br ${tierStyles.bgGradient} pointer-events-none`} />

      <div className="relative p-5 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <Sparkles size={12} className="text-indigo-500" />
                Exam Readiness Predictor
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
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all"
          >
            <Flame size={14} className="text-amber-300" />
            Launch Cram Optimizer
          </button>
        </div>

        {/* Gauge & Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
          {/* Circular Score Gauge */}
          <div className="sm:col-span-4 flex items-center justify-center sm:justify-start gap-4">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 96 96">
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  strokeWidth="8"
                  className="stroke-slate-100 dark:stroke-slate-800"
                  fill="transparent"
                />
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  strokeWidth="8"
                  stroke={tierStyles.ringColor}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                  {projectedScore}%
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  ±{confidenceMargin}%
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${tierStyles.badgeBg}`}>
                {tierLabel}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                FSRS retrievability projection on {readiness.examDate}
              </p>
            </div>
          </div>

          {/* Key Vitals */}
          <div className="sm:col-span-8 grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Curriculum Coverage</div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                {coveragePercent}%
              </div>
              <div className="text-[10px] text-slate-400">Topics with flashcards</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Study Pool</div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                {totalCards}
              </div>
              <div className="text-[10px] text-slate-400">Active cards tracked</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">High-Risk Topics</div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                {weakTopics.length}
              </div>
              <div className="text-[10px] text-slate-400">Needing remediation</div>
            </div>
          </div>
        </div>

        {/* High-Risk Focus Topics List */}
        {weakTopics.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <AlertCircle size={13} className="text-amber-500" />
                Priority Knowledge Gaps Before Exam:
              </span>
              <span className="text-[11px] text-slate-400">Ranked by score impact</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {weakTopics.slice(0, 4).map(topic => (
                <button
                  key={topic.topicTitle}
                  onClick={() => onQuickReviewTopic?.(topic.topicTitle)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200/70 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors"
                >
                  <BookOpen size={12} className="text-amber-600 dark:text-amber-400" />
                  <span className="truncate max-w-[150px]">{topic.topicTitle}</span>
                  <span className="text-[10px] font-bold opacity-75">
                    {topic.cardCount === 0 ? 'Gap' : `${topic.projectedScore}%`}
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
