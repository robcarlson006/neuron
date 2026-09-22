import React, { useState } from 'react'
import type { SyllabusModule, ModuleTopic, ModuleCardGenOptions, ModuleTutorStats } from '../../types'
import GenerateCardsModal from './GenerateCardsModal'

interface CurriculumViewProps {
  modules: (SyllabusModule & { topics?: ModuleTopic[] })[]
  subjectName?: string
  moduleTutorStats?: Record<number, ModuleTutorStats>
  onStartTutor: (moduleId?: number, selectedTopics?: string[], mode?: string) => void
  onStartSpacedReview?: (moduleId?: number, selectedTopics?: string[]) => void
  onGenerateCards: (moduleId: number, options?: ModuleCardGenOptions) => void
  onToggleTopic: (topicId: number, studied: boolean) => void
  loadingCards?: Record<number, boolean>
}

const DEPTH_NAMES: Record<number, string> = {
  1: 'Beginner',
  2: 'Foundational',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Mastery'
}

function formatDepthLevel(depth: number): string {
  const rounded = Math.round(depth)
  return DEPTH_NAMES[rounded] || `Level ${rounded}`
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return '< 1m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = Math.floor(minutes / 60)
  const rem = Math.round(minutes % 60)
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function CurriculumView({
  modules,
  subjectName,
  moduleTutorStats,
  onStartTutor,
  onStartSpacedReview,
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

  function selectNewTopics(moduleId: number, topics: ModuleTopic[]): void {
    const newTopicIds = topics
      .filter(t => Boolean(t.has_new_material || t.is_gap))
      .map(t => t.id)
    setSelectedTopicsByModule(prev => ({
      ...prev,
      [moduleId]: new Set(newTopicIds)
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

  // Find all uncompleted or active new/gap topics across all modules
  const allNewTopics = modules.flatMap(mod =>
    (mod.topics || [])
      .filter(t => Boolean(t.has_new_material || t.is_gap))
      .map(t => ({ moduleId: mod.id, moduleTitle: mod.title, topic: t }))
  )

  return (
    <div className="space-y-2">
      {/* Top Banner: New Content Available */}
      {allNewTopics.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-amber-50 via-amber-100/40 to-purple-50 dark:from-amber-950/40 dark:via-amber-900/20 dark:to-purple-950/30 border border-amber-300/80 dark:border-amber-700/60 shadow-xs flex items-center justify-between gap-3 flex-wrap transition-all mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 flex items-center justify-center text-base font-bold shadow-xs shrink-0">
              ✨
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                  New Content Added
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200">
                  {allNewTopics.length} new topic{allNewTopics.length > 1 ? 's' : ''} to review
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                Recently added study materials introduced new topics and concepts to your curriculum.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const allNewTitles = allNewTopics.map(item => item.topic.title)
                onStartTutor(undefined, allNewTitles, 'new_content')
              }}
              className="px-3.5 py-1.5 sm:py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>🎓</span>
              <span>Study New Content ({allNewTopics.length})</span>
            </button>
          </div>
        </div>
      )}
      {modules.map((mod, index) => {
        const isExpanded = expandedModule === mod.id
        const isInProgress = mod.status === 'in_progress'
        const isCompleted = mod.status === 'completed'
        const isPending = mod.status === 'pending'
        const modTopics = mod.topics || []
        const selectedSet = selectedTopicsByModule[mod.id] || new Set<number>()
        const selectedCount = selectedSet.size
        const completedCount = modTopics.filter(t => Boolean(t.completed || (t as ModuleTopic & { studied?: boolean }).studied)).length
        const stats = moduleTutorStats?.[mod.id]

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

                {/* Module-level Tutor Stats Quick Summary */}
                {stats && stats.sessionCount > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span
                      title={`Tutor used ${stats.sessionCount} time${stats.sessionCount > 1 ? 's' : ''} on this module`}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60"
                    >
                      <span>🎓</span>
                      <span>{stats.sessionCount} {stats.sessionCount === 1 ? 'session' : 'sessions'}</span>
                    </span>
                    <span
                      title={`Total time spent with Tutor on this module: ${formatMinutes(stats.totalMinutes)}`}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-sky-100/80 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60"
                    >
                      <span>⏱️</span>
                      <span>{formatMinutes(stats.totalMinutes)}</span>
                    </span>
                    <span
                      title={`Average Tutor Difficulty / Depth: ${formatDepthLevel(stats.avgDepthLevel)}`}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-purple-100/80 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60"
                    >
                      <span>📊</span>
                      <span>{formatDepthLevel(stats.avgDepthLevel)}</span>
                    </span>
                  </div>
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
                {/* Module-level Tutor Stats Detailed Activity Card */}
                {stats && stats.sessionCount > 0 && (
                  <div className="mx-4 mt-3 mb-1 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-sm font-bold shadow-xs">
                        🎓
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span>AI Tutor Study History</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {stats.lastStudiedAt ? `Last active ${formatRelativeTime(stats.lastStudiedAt)}` : 'Studied with AI Tutor'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-center px-2">
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sessions</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{stats.sessionCount}</span>
                      </div>
                      <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
                      <div className="text-center px-2">
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Time Spent</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">{formatMinutes(stats.totalMinutes)}</span>
                      </div>
                      <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
                      <div className="text-center px-2">
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Difficulty</span>
                        <span className="font-bold text-purple-600 dark:text-purple-400 text-xs">{formatDepthLevel(stats.avgDepthLevel)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Topics */}
                {modTopics.length > 0 && (
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between pb-1">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        Topics ({completedCount}/{modTopics.length} completed)
                      </p>
                      {modTopics.length > 1 && (
                        <div className="flex items-center gap-2 text-[11px]">
                          {modTopics.some(t => Boolean(t.has_new_material || t.is_gap)) && (
                            <>
                              <button
                                type="button"
                                onClick={() => selectNewTopics(mod.id, modTopics)}
                                className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
                              >
                                Select new content
                              </button>
                              <span className="text-slate-300 dark:text-slate-600">·</span>
                            </>
                          )}
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
                              {Boolean(topic.is_gap) && !topicCompleted && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onStartTutor(mod.id, [topic.title], 'new_content')
                                  }}
                                  title="Newly added learning gap. Click to study with AI Tutor."
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 flex items-center gap-1 hover:bg-purple-200 dark:hover:bg-purple-900 transition-colors cursor-pointer flex-shrink-0"
                                >
                                  <span>✨ New</span>
                                  <span className="text-[9px] opacity-75 font-normal">· Study</span>
                                </button>
                              )}
                              {Boolean(topic.has_new_material) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onStartTutor(mod.id, [topic.title], 'new_content')
                                  }}
                                  title="New materials have added new concepts. Click to study with AI Tutor."
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 flex items-center gap-1 hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors cursor-pointer flex-shrink-0"
                                >
                                  <span>⚠️ New Content</span>
                                  <span className="text-[9px] opacity-75 font-normal">· Study</span>
                                </button>
                              )}
                            </label>

                            {/* Completed indicator & Retention badge with toggle option */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {topicCompleted ? (
                                <div className="flex items-center gap-1.5">
                                  {/* Retention Status Indicator */}
                                  {topic.retention_status === 'overdue' ? (
                                    <span
                                      title={`Retention decayed to ${Math.round((topic.retrievability ?? 0.5) * 100)}% (${topic.days_overdue ?? 1}d overdue). Memory requires review!`}
                                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 flex items-center gap-1 animate-pulse"
                                    >
                                      <span>⚠️</span> {Math.round((topic.retrievability ?? 0.5) * 100)}% Due
                                    </span>
                                  ) : topic.retention_status === 'fading' ? (
                                    <span
                                      title={`Retention at ${Math.round((topic.retrievability ?? 0.75) * 100)}%. Memory fading - review soon.`}
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1"
                                    >
                                      <span>⏳</span> {Math.round((topic.retrievability ?? 0.75) * 100)}% Fading
                                    </span>
                                  ) : topic.retrievability !== undefined ? (
                                    <span
                                      title={`Retention high at ${Math.round(topic.retrievability * 100)}%. Next review due ${topic.next_review_due || 'later'}.`}
                                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                    >
                                      {Math.round(topic.retrievability * 100)}%
                                    </span>
                                  ) : null}

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
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {Boolean((topic as any).last_studied_at || (topic as any).studied || topic.retrievability !== undefined) && (
                                    <span
                                      title="You have completed tutor work on this topic"
                                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 flex items-center gap-1"
                                    >
                                      <span>⚡</span> Studied in Tutor
                                    </span>
                                  )}
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
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-4 py-3 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700 flex-wrap">
                  <button
                    onClick={() => {
                      const chosenTopicTitles = modTopics.length > 0
                        ? (selectedCount > 0
                            ? modTopics.filter(t => selectedSet.has(t.id)).map(t => t.title)
                            : modTopics.map(t => t.title))
                        : []
                      onStartTutor(mod.id, chosenTopicTitles)
                    }}
                    className="flex-1 min-w-[120px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm"
                  >
                    🎓 {selectedCount > 0 ? `Start Tutor (${selectedCount} topic${selectedCount > 1 ? 's' : ''})` : 'Start Tutor'}
                  </button>

                  {/* Study New Content Button if module has new or gap topics */}
                  {modTopics.some(t => Boolean(t.has_new_material || t.is_gap)) && (
                    <button
                      type="button"
                      onClick={() => {
                        const newTitles = modTopics
                          .filter(t => Boolean(t.has_new_material || t.is_gap))
                          .map(t => t.title)
                        onStartTutor(mod.id, newTitles, 'new_content')
                      }}
                      title="Launch AI Tutor focusing on all new and updated topics in this module"
                      className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      <span>✨</span>
                      <span>Study New Content ({modTopics.filter(t => Boolean(t.has_new_material || t.is_gap)).length})</span>
                    </button>
                  )}

                  {/* Spaced Review Button if module has due or fading topics */}
                  {modTopics.some(t => t.retention_status === 'overdue' || t.retention_status === 'fading') && onStartSpacedReview && (
                    <button
                      onClick={() => {
                        const dueTitles = modTopics
                          .filter(t => t.retention_status === 'overdue' || t.retention_status === 'fading')
                          .map(t => t.title)
                        onStartSpacedReview(mod.id, dueTitles)
                      }}
                      title="Launch a focused spaced repetition drill on decaying topics in this module"
                      className="px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      <span>⚡</span> Spaced Review
                    </button>
                  )}

                  <button
                    onClick={() => setModalModule(mod)}
                    disabled={loadingCards?.[mod.id]}
                    className="flex-1 min-w-[120px] px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
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
