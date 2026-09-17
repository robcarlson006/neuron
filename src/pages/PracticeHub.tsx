import React, { useState, useEffect } from "react"
import {
  Sparkles,
  Upload,
  Play,
  CheckCircle2,
  Layers,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Trash2,
  Star,
  Plus,
  Search
} from "../components/icons"
import LatexText from "../components/LatexText"
import PracticeUploadModal from "../components/practice/PracticeUploadModal"
import PracticeSessionLauncher from "../components/practice/PracticeSessionLauncher"
import AutoGeneratePracticeModal from "../components/practice/AutoGeneratePracticeModal"
import type { Subject, SyllabusModule, ModuleTopic, PracticeProblem, User } from "../types"

interface PracticeHubProps {
  subject: Subject
  user: User | null
  onStartSession: (moduleId?: number, topicId?: number, count?: number) => void
}

export default function PracticeHub({
  subject,
  user,
  onStartSession
}: PracticeHubProps): React.JSX.Element {
  const [modules, setModules] = useState<(SyllabusModule & { topics?: ModuleTopic[] })[]>([])
  const [problems, setProblems] = useState<PracticeProblem[]>([])
  const [stats, setStats] = useState<{
    totalProblems: number
    totalSessions: number
    totalCompleted: number
    totalCorrect: number
    accuracy: number
  }>({ totalProblems: 0, totalSessions: 0, totalCompleted: 0, totalCorrect: 0, accuracy: 0 })

  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<number | undefined>()
  const [expandedModules, setExpandedModules] = useState<Record<number, boolean>>({})
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false)
  const [showLauncherModal, setShowLauncherModal] = useState<boolean>(false)
  const [showAutoGenModal, setShowAutoGenModal] = useState<boolean>(false)
  const [autoGenTarget, setAutoGenTarget] = useState<{ moduleId?: number; topicId?: number } | null>(null)
  const [previewProblem, setPreviewProblem] = useState<PracticeProblem | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const loadData = async () => {
    setLoading(true)
    try {
      // 1. Load syllabus modules & topics
      if (window.electronAPI.syllabusListModules) {
        const mods = await window.electronAPI.syllabusListModules(subject.id)
        const modsWithTopics: (SyllabusModule & { topics?: ModuleTopic[] })[] = []
        for (const m of mods) {
          const tops = window.electronAPI.syllabusListTopics
            ? await window.electronAPI.syllabusListTopics(m.id, user?.id)
            : []
          modsWithTopics.push({ ...m, topics: tops })
        }
        setModules(modsWithTopics)

        // Expand first module by default
        if (modsWithTopics.length > 0) {
          setExpandedModules((prev) => ({ ...prev, [modsWithTopics[0].id]: true }))
        }
      }

      // 2. Load practice problems
      if (window.electronAPI.practiceListProblems) {
        const probList = await window.electronAPI.practiceListProblems(subject.id)
        setProblems(probList)
      }

      // 3. Load stats
      if (window.electronAPI.practiceGetStats && user?.id) {
        const s = await window.electronAPI.practiceGetStats(subject.id, user.id)
        setStats(s)
      }
    } catch (err) {
      console.error("Failed to load practice hub data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [subject.id, user?.id])

  const toggleModule = (modId: number) => {
    setExpandedModules((prev) => ({ ...prev, [modId]: !prev[modId] }))
  }

  const handleDeleteProblem = async (problemId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm("Are you sure you want to delete this practice problem?")) return
    try {
      if (window.electronAPI.practiceDeleteProblem) {
        await window.electronAPI.practiceDeleteProblem(problemId)
        setProblems((prev) => prev.filter((p) => p.id !== problemId))
        if (previewProblem?.id === problemId) setPreviewProblem(null)
      }
    } catch (err) {
      console.error("Error deleting problem:", err)
    }
  }

  const filteredProblems = problems.filter((p) => {
    if (selectedTopicFilter && p.topic_id !== selectedTopicFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const titleMatch = p.title.toLowerCase().includes(q)
      const textMatch = p.problem_text.toLowerCase().includes(q)
      const principlesMatch = (p.principles_json || "").toLowerCase().includes(q)
      return titleMatch || textMatch || principlesMatch
    }
    return true
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Stat 1: Total Problems */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Problems Available</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">{problems.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <Layers size={18} />
          </div>
        </div>

        {/* Stat 2: Problems Solved */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Solved</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">{stats.totalCompleted}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 size={18} />
          </div>
        </div>

        {/* Stat 3: Accuracy */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Practice Accuracy</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-0.5">
              {stats.accuracy}%
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Sparkles size={18} />
          </div>
        </div>

        {/* Stat 4: Quick Launch Button */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-200">Practice Lab</span>
            <Sparkles size={16} className="text-violet-300" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setShowLauncherModal(true)}
              disabled={problems.length === 0}
              className="flex-1 py-2 px-3 rounded-xl bg-white text-violet-900 hover:bg-violet-50 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              <Play size={13} className="fill-current" />
              <span>Start Drill</span>
            </button>
            <button
              onClick={() => {
                setAutoGenTarget(null)
                setShowAutoGenModal(true)
              }}
              className="p-2 rounded-xl bg-violet-800/80 hover:bg-violet-800 text-white transition-colors"
              title="Auto-Generate Practice Problems"
            >
              <Sparkles size={14} />
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="p-2 rounded-xl bg-violet-800/80 hover:bg-violet-800 text-white transition-colors"
              title="Upload Problem Set"
            >
              <Upload size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Split Curriculum Hierarchy & Problem List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Curriculum Modules & Topics */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <BookOpen size={14} className="text-violet-500" />
              <span>Curriculum Topics</span>
            </h3>
            <button
              onClick={() => setSelectedTopicFilter(undefined)}
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                selectedTopicFilter === undefined
                  ? "bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              View All ({problems.length})
            </button>
          </div>

          <div className="space-y-2.5">
            {modules.map((m) => {
              const isExpanded = !!expandedModules[m.id]
              const modProblems = problems.filter((p) => p.module_id === m.id)

              return (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
                >
                  <div
                    onClick={() => toggleModule(m.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{m.title}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono text-slate-600 dark:text-slate-400">
                        {modProblems.length}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setAutoGenTarget({ moduleId: m.id })
                          setShowAutoGenModal(true)
                        }}
                        title="Auto-generate practice for this module"
                        className="p-1 rounded-md text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/50"
                      >
                        <Sparkles size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onStartSession(m.id, undefined, 5)
                        }}
                        title="Practice this entire module"
                        className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                      >
                        <Play size={12} className="fill-current" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && m.topics && m.topics.length > 0 && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800/60 space-y-1">
                      {m.topics.map((t) => {
                        const topProblems = problems.filter((p) => p.topic_id === t.id)
                        const isSelected = selectedTopicFilter === t.id

                        return (
                          <div
                            key={t.id}
                            onClick={() => setSelectedTopicFilter(isSelected ? undefined : t.id)}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all ${
                              isSelected
                                ? "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-semibold"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <span className="truncate pr-2">{t.title}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] font-mono opacity-60">({topProblems.length})</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setAutoGenTarget({ moduleId: m.id, topicId: t.id })
                                  setShowAutoGenModal(true)
                                }}
                                title="Auto-generate practice for this topic"
                                className="p-1 rounded text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/60"
                              >
                                <Sparkles size={10} />
                              </button>
                              {topProblems.length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onStartSession(m.id, t.id, 5)
                                  }}
                                  title="Drill this topic"
                                  className="p-1 rounded text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                                >
                                  <Play size={10} className="fill-current" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Columns: Problems List & Preview Drawer */}
        <div className="lg:col-span-2 space-y-4">
          {/* Action & Filter Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search practice problems or formulas..."
                className="w-full text-xs pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setAutoGenTarget(selectedTopicFilter ? { topicId: selectedTopicFilter } : null)
                  setShowAutoGenModal(true)
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 font-bold text-xs shadow-xs transition-colors"
                title="Generate practice problems with AI"
              >
                <Sparkles size={13} className="text-violet-600 dark:text-violet-400" />
                <span>Generate with AI</span>
              </button>

              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-xs transition-colors"
              >
                <Plus size={14} />
                <span>Drop Problem Set</span>
              </button>
            </div>
          </div>

          {/* Problems List */}
          {loading ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredProblems.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center mx-auto">
                <Sparkles size={20} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">No practice problems found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Autonomously generate tailored problems from your curriculum, or drop in lecture problem sets and homework exercises!
                </p>
              </div>
              <div className="flex items-center justify-center gap-2.5 pt-1">
                <button
                  onClick={() => {
                    setAutoGenTarget(selectedTopicFilter ? { topicId: selectedTopicFilter } : null)
                    setShowAutoGenModal(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white font-bold text-xs hover:bg-violet-700 shadow-xs"
                >
                  <Sparkles size={13} />
                  <span>Generate with AI</span>
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                >
                  <Upload size={13} />
                  <span>Upload Problem Set</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProblems.map((prob) => {
                const isSelected = previewProblem?.id === prob.id
                const principles: string[] = (() => {
                  try {
                    return JSON.parse(prob.principles_json || "[]")
                  } catch {
                    return []
                  }
                })()

                return (
                  <div
                    key={prob.id}
                    onClick={() => setPreviewProblem(isSelected ? null : prob)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-violet-500 bg-violet-50/40 dark:bg-violet-950/20 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            #{prob.id}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{prob.title}</h4>
                          {prob.is_ai_generated === 1 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-0.5">
                              <Sparkles size={9} /> Variant
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          <LatexText>{prob.problem_text}</LatexText>
                        </div>

                        {principles.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {principles.slice(0, 3).map((pr, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                                {pr}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Difficulty */}
                        <div className="flex items-center gap-0.5 mr-2">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={10}
                              className={s <= prob.difficulty ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-700"}
                            />
                          ))}
                        </div>

                        <button
                          onClick={(e) => handleDeleteProblem(prob.id, e)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                          title="Delete problem"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Preview Details */}
                    {isSelected && (
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs animate-in fade-in duration-150">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 leading-relaxed font-sans text-slate-800 dark:text-slate-200">
                          <LatexText>{prob.problem_text}</LatexText>
                        </div>

                        {prob.solution_steps && (
                          <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/80 font-mono text-[11px] leading-relaxed">
                            <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Solution Derivation:</span>
                            <LatexText>{prob.solution_steps}</LatexText>
                          </div>
                        )}

                        {prob.final_answer && (
                          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                            <span>Answer:</span>
                            <LatexText>{prob.final_answer}</LatexText>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showUploadModal && (
        <PracticeUploadModal
          subjectId={subject.id}
          modules={modules}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => loadData()}
        />
      )}

      {showLauncherModal && (
        <PracticeSessionLauncher
          subjectId={subject.id}
          userId={user?.id || 1}
          modules={modules}
          problems={problems}
          onClose={() => setShowLauncherModal(false)}
          onStartSession={onStartSession}
          onOpenAutoGen={(modId, topId) => {
            setShowLauncherModal(false)
            setAutoGenTarget({ moduleId: modId, topicId: topId })
            setShowAutoGenModal(true)
          }}
        />
      )}

      {showAutoGenModal && (
        <AutoGeneratePracticeModal
          subjectId={subject.id}
          userId={user?.id || 1}
          modules={modules}
          initialModuleId={autoGenTarget?.moduleId}
          initialTopicId={autoGenTarget?.topicId || selectedTopicFilter}
          onClose={() => {
            setShowAutoGenModal(false)
            setAutoGenTarget(null)
          }}
          onSuccess={(newProbs) => {
            setProblems((prev) => [...newProbs, ...prev])
            loadData()
          }}
        />
      )}
    </div>
  )
}
