import React, { useState } from "react"
import { X, Sparkles, BookOpen, Layers, Target, AlertCircle } from "../icons"
import type { SyllabusModule, ModuleTopic, PracticeProblem } from "../../types"

interface AutoGeneratePracticeModalProps {
  subjectId: number
  userId: number
  modules: (SyllabusModule & { topics?: ModuleTopic[] })[]
  initialModuleId?: number
  initialTopicId?: number
  onClose: () => void
  onSuccess: (problems: PracticeProblem[]) => void
}

const PROBLEM_COUNT_PRESETS = [3, 5, 8, 12] as const

type FocusMode = 'adaptive' | 'remediate_struggles' | 'foundational' | 'challenge'

const FOCUS_MODES: { id: FocusMode; label: string; desc: string; icon: string }[] = [
  {
    id: 'adaptive',
    label: 'Balanced Curriculum',
    desc: 'Evenly covers fundamental principles, proofs, and real-world applications.',
    icon: '🎯'
  },
  {
    id: 'remediate_struggles',
    label: 'Target Misconceptions',
    desc: 'Focuses on active learning gaps and known pitfalls from your learning profile.',
    icon: '🧠'
  },
  {
    id: 'challenge',
    label: 'Exam Challenge',
    desc: 'Multi-step synthesis problems with higher Depth of Knowledge (DOK 3).',
    icon: '🏆'
  }
]

export default function AutoGeneratePracticeModal({
  subjectId,
  userId,
  modules,
  initialModuleId,
  initialTopicId,
  onClose,
  onSuccess
}: AutoGeneratePracticeModalProps): React.JSX.Element {
  const [selectedModuleId, setSelectedModuleId] = useState<number | undefined>(initialModuleId)
  const [selectedTopicId, setSelectedTopicId] = useState<number | undefined>(initialTopicId)
  const [isAutoCount, setIsAutoCount] = useState<boolean>(true)
  const [problemCount, setProblemCount] = useState<number>(4)
  const [focusMode, setFocusMode] = useState<FocusMode>('adaptive')
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [generationStep, setGenerationStep] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const currentModule = modules.find((m) => m.id === selectedModuleId)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setErrorMessage(null)
    setGenerationStep("Analyzing curriculum materials and syllabus structure...")

    try {
      if (!window.electronAPI.practiceAutonomousGenerate) {
        throw new Error("Practice problem generation handler is not available.")
      }

      // Step progress simulation for polished UX
      const timer1 = setTimeout(() => {
        setGenerationStep("Synthesizing problem blueprints & clamping parameters (CBIT)...")
      }, 1800)

      const timer2 = setTimeout(() => {
        setGenerationStep("Backward verification pass: deriving solutions and validating steps...")
      }, 4200)

      const res = await window.electronAPI.practiceAutonomousGenerate({
        subjectId,
        userId,
        moduleId: selectedModuleId || null,
        topicId: selectedTopicId || null,
        count: isAutoCount ? 4 : problemCount,
        autoCount: isAutoCount,
        difficultyFocus: focusMode
      })

      clearTimeout(timer1)
      clearTimeout(timer2)

      if (!res.success || !res.problems || res.problems.length === 0) {
        throw new Error(res.error || "Failed to generate practice problems.")
      }

      onSuccess(res.problems)
      onClose()
    } catch (err) {
      console.error("Auto generation error:", err)
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setIsGenerating(false)
      setGenerationStep("")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center shadow-xs">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Auto-Generate Practice
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Engineered from your course materials and learning gaps
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Generation Failed</p>
                <p className="opacity-90">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* 1. Curriculum Scope */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <BookOpen size={13} className="text-violet-500" />
              <span>1. Select Curriculum Scope</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {/* Module Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Module
                </label>
                <select
                  value={selectedModuleId || ""}
                  disabled={isGenerating}
                  onChange={(e) => {
                    setSelectedModuleId(e.target.value ? Number(e.target.value) : undefined)
                    setSelectedTopicId(undefined)
                  }}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium"
                >
                  <option value="">All Subject Modules</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Topic Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Topic (Optional)
                </label>
                <select
                  value={selectedTopicId || ""}
                  disabled={isGenerating || !selectedModuleId || !currentModule?.topics?.length}
                  onChange={(e) => setSelectedTopicId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium disabled:opacity-50"
                >
                  <option value="">
                    {selectedModuleId ? "All Topics in Module" : "Select Module First"}
                  </option>
                  {currentModule?.topics?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 2. Quantity Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Layers size={13} className="text-violet-500" />
                <span>2. How many practice problems?</span>
              </label>
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                {isAutoCount ? (
                  <>
                    <span>✨</span>
                    <span>AI Decides</span>
                  </>
                ) : (
                  `${problemCount} Problems`
                )}
              </span>
            </div>

            {/* Quick Preset Buttons with Auto Option */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsAutoCount(true)}
                disabled={isGenerating}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isAutoCount
                    ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-500/30'
                    : 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 border border-violet-200/60 dark:border-violet-800/60'
                }`}
              >
                <span>✨</span>
                <span>Auto (AI Decides)</span>
              </button>
              {PROBLEM_COUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setIsAutoCount(false)
                    setProblemCount(preset)
                  }}
                  disabled={isGenerating}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    !isAutoCount && problemCount === preset
                      ? 'bg-violet-600 text-white shadow-sm ring-2 ring-violet-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Dynamic Auto Explanation OR Count Slider */}
            {isAutoCount ? (
              <div className="p-3 rounded-xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 flex items-start gap-2.5">
                <span className="text-sm">✨</span>
                <div className="text-xs text-violet-950 dark:text-violet-200 leading-relaxed">
                  <span className="font-semibold">Autonomous Sizing Active:</span> The AI will analyze topic concept density, course documents, and existing practice coverage to generate the optimal number of problems (typically 3–5) without repetitive fluff.
                </div>
              </div>
            ) : (
              <div className="pt-1 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={problemCount}
                  disabled={isGenerating}
                  onChange={(e) => setProblemCount(Number(e.target.value))}
                  className="flex-1 accent-violet-600"
                />
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 w-8 text-right">
                  {problemCount}
                </span>
              </div>
            )}
          </div>

          {/* 3. Pedagogical Focus */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Target size={13} className="text-violet-500" />
              <span>3. Pedagogical Focus</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {FOCUS_MODES.map((mode) => {
                const isSelected = focusMode === mode.id
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setFocusMode(mode.id)}
                    disabled={isGenerating}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-violet-500 bg-violet-50/60 dark:bg-violet-950/30 ring-2 ring-violet-500/20"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm">{mode.icon}</span>
                      <span className={`text-xs font-bold ${isSelected ? "text-violet-700 dark:text-violet-300" : "text-slate-800 dark:text-slate-200"}`}>
                        {mode.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                      {mode.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Loading Indicator */}
          {isGenerating && (
            <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/60 flex items-center gap-3 animate-in fade-in">
              <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-violet-900 dark:text-violet-200">
                  Engine in Progress...
                </p>
                <p className="text-[11px] text-violet-700 dark:text-violet-300 font-mono">
                  {generationStep}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 active:scale-98 rounded-xl shadow-md transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>
                  {isAutoCount ? "Generate (AI Decides)" : `Generate ${problemCount} Problems`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
