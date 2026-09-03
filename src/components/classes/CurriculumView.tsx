import React, { useState } from 'react'
import type { SyllabusModule, ModuleTopic, ModuleCardGenOptions } from '../../types'
import GenerateCardsModal from './GenerateCardsModal'

interface CurriculumViewProps {
  modules: (SyllabusModule & { topics?: ModuleTopic[] })[]
  subjectName?: string
  onStartTutor: (moduleId: number, selectedTopics?: string[]) => void
  onGenerateCards: (moduleId: number, options?: ModuleCardGenOptions) => void
  onToggleTopic: (topicId: number, studied: boolean) => void
  loadingCards?: Record<number, boolean>
}

export default function CurriculumView({
  modules,
  subjectName,
  onStartTutor,
  onGenerateCards,
  onToggleTopic,
  loadingCards
}: CurriculumViewProps): React.JSX.Element {
  const [expandedModule, setExpandedModule] = useState<number | null>(
    modules.find(m => m.status === 'in_progress')?.id ?? null
  )
  const [modalModule, setModalModule] = useState<(SyllabusModule & { topics?: ModuleTopic[] }) | null>(null)
  const [selectedTopicsByModule, setSelectedTopicsByModule] = useState<Record<number, Set<number>>>({})

  function toggleModule(id: number): void {
    setExpandedModule(prev => prev === id ? null : id)
  }

  function toggleTopicSelection(moduleId: number, topicId: number): void {
    setSelectedTopicsByModule(prev => {
      const currentSet = new Set(prev[moduleId] || [])
      if (currentSet.has(topicId)) {
        currentSet.delete(topicId)
      } else {
        currentSet.add(topicId)
      }
      return { ...prev, [moduleId]: currentSet }
    })
  }

  function selectAllTopics(moduleId: number, topics: ModuleTopic[]): void {
    setSelectedTopicsByModule(prev => ({
      ...prev,
      [moduleId]: new Set(topics.map(t => t.id))
    }))
  }

  function clearTopicSelection(moduleId: number): void {
    setSelectedTopicsByModule(prev => ({
      ...prev,
      [moduleId]: new Set()
    }))
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
        const modTopics = mod.topics || []
        const selectedSet = selectedTopicsByModule[mod.id] || new Set<number>()
        const selectedCount = selectedSet.size
        const completedCount = modTopics.filter(t => Boolean(t.completed || (t as ModuleTopic & { studied?: boolean }).studied)).length

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
              <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium
                ${isCompleted ? 'bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-300' : ''}
                ${isInProgress ? 'bg-sky-100 dark:bg-sky-800 text-sky-600 dark:text-sky-300' : ''}
                ${isPending ? 'bg-slate-100 dark:bg-slate-700 text-slate-400' : ''}
              `}>
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
                {modTopics.length > 0 && (
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between pb-1">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Topics ({completedCount}/{modTopics.length} completed)
                      </p>
                      {modTopics.length > 1 && (
                        <div className="flex items-center gap-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => selectAllTopics(mod.id, modTopics)}
                            className="text-violet-600 dark:text-violet-400 hover:underline font-medium"
                          >
                            Select all
                          </button>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <button
                            type="button"
                            onClick={() => clearTopicSelection(mod.id)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      {modTopics.map(topic => {
                        const topicCompleted = Boolean(topic.completed || (topic as ModuleTopic & { studied?: boolean }).studied)
                        const isSelected = selectedSet.has(topic.id)

                        return (
                          <div
                            key={topic.id}
                            className={`flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors ${
                              isSelected
                                ? 'bg-violet-50 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-800/50'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700/40 border border-transparent'
                            }`}
                          >
                            <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTopicSelection(mod.id, topic.id)}
                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 cursor-pointer flex-shrink-0"
                              />
                              <span className={`text-sm truncate ${
                                topicCompleted
                                  ? 'text-slate-600 dark:text-slate-300'
                                  : 'text-slate-800 dark:text-slate-200'
                              }`}>
                                {topic.title}
                              </span>
                            </label>

                            {/* Completed indicator badge with toggle option */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {topicCompleted ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onToggleTopic(topic.id, false)
                                  }}
                                  title="Completed. Click to mark as uncompleted."
                                  className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/90 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700/60 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 transition-colors"
                                >
                                  <span>✓</span> Completed
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onToggleTopic(topic.id, true)
                                  }}
                                  title="Mark as completed"
                                  className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-0.5 rounded-full transition-colors"
                                >
                                  Mark complete
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-4 py-3 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700">
                  <button
                    onClick={() => {
                      const chosenTopicTitles = modTopics.length > 0
                        ? (selectedCount > 0
                            ? modTopics.filter(t => selectedSet.has(t.id)).map(t => t.title)
                            : modTopics.map(t => t.title))
                        : []
                      onStartTutor(mod.id, chosenTopicTitles)
                    }}
                    className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
                  >
                    🎓 {selectedCount > 0 ? `Start Tutor (${selectedCount} topic${selectedCount > 1 ? 's' : ''})` : 'Start Tutor'}
                  </button>
                  <button
                    onClick={() => setModalModule(mod)}
                    disabled={loadingCards?.[mod.id]}
                    className="flex-1 px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    {loadingCards?.[mod.id] ? '⏳ Generating...' : '🃏 Generate Cards'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Card Generation Modal */}
      {modalModule && (
        <GenerateCardsModal
          isOpen={!!modalModule}
          module={modalModule}
          subjectName={subjectName}
          isGenerating={!!loadingCards?.[modalModule.id]}
          onClose={() => setModalModule(null)}
          onGenerate={async (options) => {
            const modId = modalModule.id
            await onGenerateCards(modId, options)
            setModalModule(null)
          }}
        />
      )}
    </div>
  )
}
