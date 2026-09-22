import React, { useState, useRef } from "react"
import { Send, Calculator as CalcIcon, Sparkles, Star, Tag } from "../icons"
import LatexText from "../LatexText"
import MarkdownRenderer from "../MarkdownRenderer"
import MathKeyboard from "./MathKeyboard"
import { hasMathInput } from "../../lib/mathFormatter"
import CalculatorWidget from "../calculator/CalculatorWidget"
import type { PracticeProblem, CalculatorSkin } from "../../types"

interface PracticeProblemSolverProps {
  problem: PracticeProblem
  problemIndex: number
  totalProblems: number
  calculatorSkin?: CalculatorSkin
  onSubmit: (userAnswer: string, timeSpentSeconds: number) => void
  onSkip?: () => void
  isSubmitting?: boolean
}

export default function PracticeProblemSolver({
  problem,
  problemIndex,
  totalProblems,
  calculatorSkin = "numworks",
  onSubmit,
  onSkip,
  isSubmitting = false
}: PracticeProblemSolverProps): React.JSX.Element {
  const [userAnswer, setUserAnswer] = useState<string>("")
  const [showCalculator, setShowCalculator] = useState<boolean>(false)
  const [startTime] = useState<number>(Date.now())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const principles: string[] = (() => {
    try {
      return JSON.parse(problem.principles_json || "[]")
    } catch {
      return []
    }
  })()

  const handleInsertSnippet = (snippet: string) => {
    if (!textareaRef.current) {
      setUserAnswer((prev) => prev + snippet)
      return
    }

    const textarea = textareaRef.current
    const start = textarea.selectionStart || 0
    const end = textarea.selectionEnd || 0
    const text = textarea.value
    const updated = text.substring(0, start) + snippet + text.substring(end)
    setUserAnswer(updated)

    // Re-focus and restore cursor position after snippet
    setTimeout(() => {
      textarea.focus()
      const nextPos = start + snippet.length
      textarea.setSelectionRange(nextPos, nextPos)
    }, 0)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!userAnswer.trim() || isSubmitting) return
    const timeSpent = Math.max(1, Math.round((Date.now() - startTime) / 1000))
    onSubmit(userAnswer, timeSpent)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto w-full">
      {/* Main Problem & Solver Column */}
      <div className="flex-1 space-y-6">
        {/* Problem Header Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
          {/* Metadata bar */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full font-bold bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300">
                Problem {problemIndex + 1} of {totalProblems}
              </span>
              {problem.is_ai_generated === 1 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold">
                  <Sparkles size={11} />
                  <span>AI Variant</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Cognitive / DOK Badge */}
              {problem.webbs_dok && (
                <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
                  {problem.webbs_dok}
                </span>
              )}
              {problem.blooms_revised && (
                <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                  {problem.blooms_revised}
                </span>
              )}

              {/* Difficulty Stars */}
              <div className="flex items-center gap-0.5" title={`Difficulty: ${problem.difficulty}/5`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={13}
                    className={s <= problem.difficulty ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-700"}
                  />
                ))}
              </div>

              {/* Calculator Toggle Button */}
              <button
                type="button"
                onClick={() => setShowCalculator(!showCalculator)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all ${
                  showCalculator
                    ? "bg-amber-500 text-slate-950 border-amber-600 shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                }`}
              >
                <CalcIcon size={13} />
                <span>Calculator</span>
              </button>
            </div>
          </div>

          {/* Title & Statement */}
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">
            {problem.title}
          </h2>

          {/* Stimulus vignette if distinct from problem text */}
          {problem.stimulus && (
            <div className="mb-3 p-3.5 rounded-xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-serif">
              <span className="text-[10px] uppercase font-bold tracking-wider text-violet-600 dark:text-violet-400 block mb-1">Scenario / Context:</span>
              <MarkdownRenderer content={problem.stimulus} />
            </div>
          )}

          <div className="text-base text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-slate-50/80 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800/60">
            <MarkdownRenderer content={problem.stem_lead_in || problem.problem_text} />
          </div>

          {/* Diagnostic Options (if present) */}
          {(() => {
            let optionsObj: Record<string, string> | null = null
            if (problem.options_json) {
              try {
                optionsObj = JSON.parse(problem.options_json)
              } catch {}
            }
            if (!optionsObj || Object.keys(optionsObj).length === 0) return null

            return (
              <div className="mt-4 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Diagnostic Options:
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(optionsObj).map(([key, text]) => {
                    const isSelected = userAnswer.startsWith(`Option ${key}:`) || userAnswer.trim() === key || userAnswer.trim() === text
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setUserAnswer(`Option ${key}: ${text}`)
                        }}
                        className={`w-full text-left p-3 rounded-xl border text-sm transition-all flex items-start gap-3 ${
                          isSelected
                            ? "bg-violet-50 dark:bg-violet-950/50 border-violet-500 text-violet-950 dark:text-violet-100 font-medium shadow-xs"
                            : "bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-violet-300 dark:hover:border-violet-700"
                        }`}
                      >
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold shrink-0 ${
                          isSelected
                            ? "bg-violet-600 text-white"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                        }`}>
                          {key}
                        </span>
                        <div className="flex-1">
                          <MarkdownRenderer content={text} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Principles / Tags */}
          {principles.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mt-4">
              <Tag size={12} className="text-slate-400 mr-1" />
              {principles.map((pr, idx) => (
                <span
                  key={idx}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium"
                >
                  {pr}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Answer / Working Area */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Your Answer & Steps
            </label>
            <span className="text-[11px] text-slate-400">
              Use standard text or LaTeX math ($...$, $$...$$)
            </span>
          </div>

          {/* Math Keyboard Palette */}
          <MathKeyboard onInsert={handleInsertSnippet} />

          {/* Input Textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Show your step-by-step working and final answer (e.g. Setting MR = MC, 100 - 2Q = 20, Q* = 40, P* = 60)..."
              rows={6}
              className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Live LaTeX Preview if user used math symbols */}
          {hasMathInput(userAnswer) && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Live Math Preview:</span>
              <div className="text-sm text-slate-800 dark:text-slate-200">
                <LatexText>{userAnswer}</LatexText>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Skip Problem
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={!userAnswer.trim() || isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-violet-600 hover:bg-violet-700 active:scale-98 shadow-md transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Evaluating Solution…</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                  <span>Submit Solution & Discuss</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Floating / Side Calculator Panel */}
      {showCalculator && (
        <div className="w-full lg:w-80 shrink-0 animate-in slide-in-from-right-4 duration-200">
          <CalculatorWidget
            skin={calculatorSkin}
            onClose={() => setShowCalculator(false)}
            isFloating={false}
          />
        </div>
      )}
    </div>
  )
}
