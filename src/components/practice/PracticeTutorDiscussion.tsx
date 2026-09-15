import React, { useState } from "react"
import { CheckCircle2, ArrowRight, Sparkles, MessageSquare, Send, RotateCw, BookOpen, Lightbulb } from "../icons"
import LatexText from "../LatexText"
import type { PracticeProblem, PracticeEvaluationResult, PracticeProblemAttempt } from "../../types"

interface PracticeTutorDiscussionProps {
  problem: PracticeProblem
  userAnswer: string
  evaluation: PracticeEvaluationResult
  attempt?: PracticeProblemAttempt
  onNextProblem: () => void
  onGenerateVariant: () => void
  onFinishSession: () => void
  isGeneratingVariant?: boolean
  hasNextProblem: boolean
}

export default function PracticeTutorDiscussion({
  problem,
  userAnswer,
  evaluation,
  attempt: _attempt,
  onNextProblem,
  onGenerateVariant,
  onFinishSession,
  isGeneratingVariant = false,
  hasNextProblem
}: PracticeTutorDiscussionProps): React.JSX.Element {
  const [messages, setMessages] = useState<Array<{ role: "tutor" | "user"; text: string }>>([])
  const [inputQuery, setInputQuery] = useState<string>("")
  const [isAsking, setIsAsking] = useState<boolean>(false)

  const isCorrect = evaluation.is_correct

  const handleSendQuery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputQuery.trim() || isAsking) return

    const userText = inputQuery.trim()
    setInputQuery("")
    setMessages((prev) => [...prev, { role: "user", text: userText }])
    setIsAsking(true)

    try {
      const response = await window.electronAPI.evaluateAnswer(
        problem.problem_text,
        problem.solution_steps || problem.final_answer || "",
        `[Follow-up question on this problem]: ${userText}\nStudent earlier wrote: ${userAnswer}`
      )

      setMessages((prev) => [
        ...prev,
        { role: "tutor", text: response.feedback || "Let's review this step together." }
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "tutor", text: "Great question! Let's examine how each variable connects in the equation." }
      ])
    } finally {
      setIsAsking(false)
    }
  }

  const getErrorTypeBadge = () => {
    if (isCorrect) {
      return {
        label: "+100 XP Mastery",
        className: "bg-emerald-200/60 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
      }
    }
    switch (evaluation.error_type) {
      case "execution_slip":
        return {
          label: "Calculation Slip • Setup Correct! 💡",
          className: "bg-amber-200/70 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200"
        }
      case "conceptual_misconception":
        return {
          label: "Conceptual Focus Needed 🎯",
          className: "bg-purple-200/70 dark:bg-purple-900/80 text-purple-900 dark:text-purple-200"
        }
      case "boundary_condition_error":
        return {
          label: "Boundary / Constraint Check 🔍",
          className: "bg-cyan-200/70 dark:bg-cyan-900/80 text-cyan-900 dark:text-cyan-200"
        }
      case "unit_mismatch":
        return {
          label: "Unit / Dimension Check 📏",
          className: "bg-orange-200/70 dark:bg-orange-900/80 text-orange-900 dark:text-orange-200"
        }
      default:
        return {
          label: "Topic Practice",
          className: "bg-amber-200/60 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
        }
    }
  }

  const errorBadge = getErrorTypeBadge()

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      {/* Verdict Banner Card */}
      <div className={`border rounded-2xl p-6 shadow-sm ${
        isCorrect
          ? "bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80"
          : "bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80"
      }`}>
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-xl shrink-0 ${
            isCorrect
              ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300"
              : "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300"
          }`}>
            {isCorrect ? <CheckCircle2 size={24} /> : <Lightbulb size={24} />}
          </div>

          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className={`text-lg font-bold ${
                isCorrect ? "text-emerald-900 dark:text-emerald-200" : "text-amber-900 dark:text-amber-200"
              }`}>
                {isCorrect
                  ? "Solution Correct!"
                  : evaluation.error_type === "execution_slip"
                  ? "Great Conceptual Setup — Check Calculation"
                  : "Let's Break This Down"}
              </h3>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${errorBadge.className}`}>
                {errorBadge.label}
              </span>
            </div>

            <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
              <LatexText>{evaluation.feedback}</LatexText>
            </div>

            {/* Socratic Pedagogical Remedy Coaching Hint */}
            {evaluation.pedagogical_remedy && !isCorrect && (
              <div className="mt-3 p-3 rounded-xl bg-amber-100/70 dark:bg-amber-900/30 border border-amber-300/80 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0">💡 Socratic Clue:</span>
                <div className="leading-relaxed">
                  <LatexText>{evaluation.pedagogical_remedy}</LatexText>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step Analysis & Identified Errors */}
        {(evaluation.step_analysis?.length || evaluation.identified_errors?.length) && (
          <div className="mt-5 pt-4 border-t border-slate-200/70 dark:border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {evaluation.step_analysis && evaluation.step_analysis.length > 0 && (
              <div className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 space-y-1.5">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">Step Verification:</span>
                <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                  {evaluation.step_analysis.map((st, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-violet-500 font-bold">•</span>
                      <span><LatexText>{st}</LatexText></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.identified_errors && evaluation.identified_errors.length > 0 && (
              <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/50 space-y-1.5">
                <span className="font-bold text-rose-800 dark:text-rose-300 block">Identified Slip / Misconception:</span>
                <ul className="space-y-1 text-rose-700 dark:text-rose-400">
                  {evaluation.identified_errors.map((err, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="font-bold">⚠️</span>
                      <span><LatexText>{err}</LatexText></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Target Solution Dropdown */}
      {(problem.solution_steps || problem.final_answer) && (
        <details className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all">
          <summary className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 cursor-pointer select-none flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BookOpen size={14} className="text-violet-500" />
              <span>View Full Reference Derivation & Final Answer</span>
            </span>
            <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 text-sm text-slate-800 dark:text-slate-200">
            {problem.solution_steps && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 font-mono text-xs leading-relaxed">
                <LatexText>{problem.solution_steps}</LatexText>
              </div>
            )}
            {problem.final_answer && (
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-3.5 py-2 rounded-xl">
                <span>Final Answer:</span>
                <LatexText>{problem.final_answer}</LatexText>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Interactive Socratic Follow-Up Chat */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <MessageSquare size={16} className="text-violet-600 dark:text-violet-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Discuss with Socratic AI Tutor
          </h4>
        </div>

        {/* Message Thread */}
        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
          <div className="p-3 rounded-xl bg-violet-50/80 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
            <p className="font-semibold text-violet-900 dark:text-violet-300 mb-1">AI Tutor:</p>
            <p>
              {isCorrect
                ? "You did great on this problem! Do you have any questions about alternative solution methods, or would you like to try a variant or next problem?"
                : "Notice the derivation above. Would you like me to explain any specific step or why a certain formula was applied?"}
            </p>
          </div>

          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl text-xs leading-relaxed max-w-[85%] ${
                m.role === "user"
                  ? "ml-auto bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium"
                  : "mr-auto bg-violet-50/80 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900 text-slate-800 dark:text-slate-200"
              }`}
            >
              <LatexText>{m.text}</LatexText>
            </div>
          ))}

          {isAsking && (
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span>Tutor is thinking…</span>
            </div>
          )}
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSendQuery} className="flex items-center gap-2">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Ask a clarifying question (e.g. 'Why did we set derivative to zero?')..."
            className="flex-1 text-xs px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus-ring-violet-500"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isAsking}
            className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors"
            title="Send question"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

      {/* Action Footer Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onGenerateVariant}
          disabled={isGeneratingVariant}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-xs text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover*bg-amber-900 border border-amber-300 dark:border-amber-800 transition-all shadow-xs"
        >
          {isGeneratingVariant ? (
            <>
              <RotateCw size={14} className="animate-spin" />
              <span>Generating Similar Variant…</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>Practice Similar Problem (AI Variant)</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onFinishSession}
            className="flex-1 sm:flex-none px-4 py-3 rounded-xl font-semibold text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Finish Session
          </button>

          {hasNextProblem && (
            <button
              type="button"
              onClick={onNextProblem}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-xs text-white bg-violet-600 hover:bg-violet-700 active:scale-98 shadow-md transition-all"
            >
              <span>Next Problem</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
