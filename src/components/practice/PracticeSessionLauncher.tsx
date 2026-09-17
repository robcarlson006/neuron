import React, { useState } from "react"
import { X, Play, BookOpen, Layers, CheckSquare, Sparkles } from "../icons"
import type { SyllabusModule, ModuleTopic, PracticeProblem } from "../../types"

interface PracticeSessionLauncherProps {
  subjectId: number
  userId: number
  modules: (SyllabusModule & { topics?: ModuleTopic[] })[]
  problems: PracticeProblem[]
  onClose: () => void
  onStartSession: (moduleId?: number, topicId?: number, count?: number) => void
  onOpenAutoGen?: (moduleId?: number, topicId?: number) => void
}

const COUNT_OPTIONS = [
  { label: "3 Problems", value: 3, desc: "Quick drill (~10 min)" },
  { label: "5 Problems", value: 5, desc: "Standard practice (~20 min)" },
  { label: "10 Problems", value: 10, desc: "Deep workout (~45 min)" },
  { label: "All / Unlimited", value: 999, desc: "Continuous practice" }
]

export default function PracticeSessionLauncher({
  subjectId: _subjectId,
  userId: _userId,
  modules,
  problems,
  onClose,
  onStartSession,
  onOpenAutoGen
}: PracticeSessionLauncherProps): React.JSX.Element {
  const [selectedModuleId, setSelectedModuleId] = useState<number | undefined>()
  const [selectedTopicId, setSelectedTopicId] = useState<number | undefined>()
  const [problemCount, setProblemCount] = useState<number>(5)

  const currentModule = modules.find((m) => m.id === selectedModuleId)

  // Filter count of available problems matching selection
  const matchingProblems = problems.filter((p) => {
    if (selectedTopicId) return p.topic_id === selectedTopicId
    if (selectedModuleId) return p.module_id === selectedModuleId
    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Play size={16} className="fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Start Practice Session</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Select curriculum topics and problem count</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Module Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
              <BookOpen size={13} className="text-violet-500" />
              <span>Curriculum Module</span>
            </label>
            <select
              value={selectedModuleId || ""}
              onChange={(e) => {
                setSelectedModuleId(e.target.value ? Number(e.target.value) : undefined)
                setSelectedTopicId(undefined)
              }}
              className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="">All Subject Modules ({problems.length} total problems)</option>
              {modules.map((m) => {
                const count = problems.filter((p) => p.module_id === m.id).length
                return (
                  <option key={m.id} value={m.id}>
                    {m.title} ({count} problems)
                  </option>
                )
              })}
            </select>
          </div>

          {/* Topic Selector */}
          {selectedModuleId && currentModule?.topics && currentModule.topics.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Layers size={13} className="text-violet-500" />
                <span>Specific Topic</span>
              </label>
              <select
                value={selectedTopicId || ""}
                onChange={(e) => setSelectedTopicId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="">All Topics in {currentModule.title}</option>
                {currentModule.topics.map((t) => {
                  const count = problems.filter((p) => p.topic_id === t.id).length
                  return (
                    <option key={t.id} value={t.id}>
                      {t.title} ({count} problems)
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          {/* Problem Count Radio Cards */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
              <CheckSquare size={13} className="text-emerald-500" />
              <span>How Many Problems?</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {COUNT_OPTIONS.map((opt) => {
                const isSelected = problemCount === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProblemCount(opt.value)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-xs font-bold ${isSelected ? "text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-slate-200"}`}>
                        {opt.label}
                      </span>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Problem availability note */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 text-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600 dark:text-slate-400">Available matching problems:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">{matchingProblems.length}</span>
              </div>
              {matchingProblems.length === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  No problems found for this topic yet. Generate some with AI!
                </p>
              )}
            </div>

            {onOpenAutoGen && (
              <button
                type="button"
                onClick={() => onOpenAutoGen(selectedModuleId, selectedTopicId)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/80 font-semibold text-xs transition-colors shrink-0"
              >
                <Sparkles size={12} />
                <span>Generate with AI</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onStartSession(selectedModuleId, selectedTopicId, problemCount)
              onClose()
            }}
            disabled={matchingProblems.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-98 rounded-xl shadow-md transition-all disabled:opacity-50"
          >
            <Play size={14} className="fill-current" />
            <span>Start Practice</span>
          </button>
        </div>
      </div>
    </div>
  )
}
