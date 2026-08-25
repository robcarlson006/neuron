import React from 'react'
import type { SyllabusModule, ModuleTopic } from '../../types'

interface CurriculumViewProps {
  modules: (SyllabusModule & { topics?: ModuleTopic[] })[]
  onStartTutor: (moduleId: number) => void
  onGenerateCards: (moduleId: number) => void
  onToggleTopic: (topicId: number, studied: boolean) => void
  loadingCards?: Record<number, boolean>
}

export default function CurriculumView({
  modules,
  onStartTutor,
  onGenerateCards,
  onToggleTopic,
  loadingCards
}: CurriculumViewProps): React.JSX.Element {
  const [expandedModule, setExpandedModule] = React.useState<number | null>(
    modules.find(m => m.status === 'in_progress')?.id ?? null
  )

  function toggleModule(id: number): void {
    setExpandedModule(prev => prev === id ? null : id)
  }

  if (modules.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 dark:text-slate-500">
        <p className="text-sm">No modules yet. Upload materials and generate a syllabus to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {modules.map((mod, index) => {
        const isExpanded = expandedModule === mod.id
        const isInProgress = mod.status === 'in_progress'
        const isCompleted = mod.status === 'completed'
        const isPending = mod.status === 'pending'

        return (
          <div
            key={mod.id}
            className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-all"
          >
            {/* Module header */}
            <button
              onClick={() => toggleModule(mod.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors
                ${isCompleted
                  ? 'bg-emerald-50 dark:bg-emerald-900/20'
                  : isInProgress
                  ? 'bg-sky-50 dark:bg-sky-900/20'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
            >
              {/* Status icon */}
              <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm
                ${isCompleted ? 'bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-300' : ''}
                ${isInProgress ? 'bg-sky-100 dark:bg-sky-800 text-sky-600 dark:text-sky-300' : ''}
                ${isPending ? 'bg-slate-100 dark:bg-slate-700 text-slate-400' : ''}
              ">
                {isCompleted ? '✓' : isInProgress ? '●' : String(index + 1)}
              </span>

              {/* Module info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium truncate
                    ${isCompleted ? 'text-emerald-700 dark:text-emerald-300' : ''}
                    ${isInProgress ? 'text-sky-700 dark:text-sky-300' : ''}
                    ${isPending ? 'text-slate-600 dark:text-slate-400' : ''}
                  `}>
                    {mod.chapter_number ? `Ch. ${mod.chapter_number}: ` : ''}
                    {mod.title}
                  </span>
                  {mod.hours_estimated && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400">
                      ~{mod.hours_estimated}h
                    </span>
                  )}
                </div>
                {mod.description && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{mod.description}</p>
                )}
              </div>

              {/* Status badge */}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium
                ${isCompleted ? 'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600 dark:text-emerald-300' : ''}
                ${isInProgress ? 'bg-sky-100 dark:bg-sky-800/50 text-sky-600 dark:text-sky-300' : ''}
                ${isPending ? 'bg-slate-100 dark:bg-slate-700 text-slate-400' : ''}
              `}>
                {isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Pending'}
              </span>

              {/* Expand arrow */}
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                {/* Topics */}
                {mod.topics && mod.topics.length > 0 && (
                  <div className="px-4 py-3 space-y-1.5">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Topics</p>
                    {mod.topics.map(topic => {
                      const studied = (topic as ModuleTopic & { studied?: boolean }).studied
                      return (
                        <div
                          key={topic.id}
                          className="flex items-center gap-2.5 py-1.5"
                        >
                          <button
                            onClick={() => onToggleTopic(topic.id, !studied)}
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0
                              ${studied
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400'
                              }`}
                          >
                            {studied && <span className="text-[9px]">✓</span>}
                          </button>
                          <span className={`text-sm ${studied ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'}`}>
                            {topic.title}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-4 py-3 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700">
                  <button
                    onClick={() => onStartTutor(mod.id)}
                    disabled={isCompleted}
                    className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    🎓 Start Tutor
                  </button>
                  <button
                    onClick={() => onGenerateCards(mod.id)}
                    disabled={loadingCards?.[mod.id]}
                    className="flex-1 px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    {loadingCards?.[mod.id] ? '⏳ Generating...' : '🃏 Generate Cards'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
