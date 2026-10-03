import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Calculator as CalcIcon, CheckCircle2, Lightbulb, RotateCcw, Send, Sparkles } from '../icons'
import LatexText from '../LatexText'
import MarkdownRenderer from '../MarkdownRenderer'
import MathKeyboard from './MathKeyboard'
import CalculatorWidget from '../calculator/CalculatorWidget'
import { hasMathInput } from '../../lib/mathFormatter'
import type { CalculatorSkin, PracticeEvaluationResult, PracticeProblem, PracticeProblemAttempt } from '../../types'

interface HintItem { level: number; hint: string; learnerPrompt?: string }
interface PracticeProblemSolverProps {
  problem: PracticeProblem
  problemIndex: number
  totalProblems: number
  calculatorSkin?: CalculatorSkin
  onSubmit: (userAnswer: string, timeSpentSeconds: number) => void
  onSkip?: () => void
  onNextProblem?: () => void
  onFinishSession?: () => void
  onGenerateVariant?: () => void
  onRequestHint?: (learnerResponse: string) => void
  onRevealSolution?: () => void
  onRetry?: () => void
  hints?: HintItem[]
  evaluation?: PracticeEvaluationResult | null
  attempt?: PracticeProblemAttempt
  userAnswer?: string
  isSubmitting?: boolean
  isHinting?: boolean
  isGeneratingVariant?: boolean
  hasNextProblem?: boolean
}

export default function PracticeProblemSolver({
  problem, problemIndex, totalProblems, calculatorSkin = 'numworks', onSubmit, onSkip, onNextProblem, onFinishSession,
  onGenerateVariant, onRequestHint, onRevealSolution, onRetry, hints = [], evaluation = null, attempt: _attempt,
  userAnswer: controlledAnswer, isSubmitting = false, isHinting = false, isGeneratingVariant = false, hasNextProblem = false
}: PracticeProblemSolverProps): React.JSX.Element {
  const [localAnswer, setLocalAnswer] = useState('')
  const [showCalculator, setShowCalculator] = useState(false)
  const [startTime, setStartTime] = useState(Date.now())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const answer = controlledAnswer ?? localAnswer
  const setAnswer = (value: string) => setLocalAnswer(value)

  useEffect(() => { setLocalAnswer(''); setStartTime(Date.now()) }, [problem.id])

  const handleInsertSnippet = (snippet: string) => {
    const textarea = textareaRef.current
    if (!textarea) return setAnswer(`${answer}${snippet}`)
    const start = textarea.selectionStart || 0
    const end = textarea.selectionEnd || 0
    setAnswer(`${answer.substring(0, start)}${snippet}${answer.substring(end)}`)
    window.setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + snippet.length, start + snippet.length) }, 0)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!answer.trim() || isSubmitting) return
    onSubmit(answer, Math.max(1, Math.round((Date.now() - startTime) / 1000)))
  }

  const submitLabel = evaluation ? (evaluation.is_correct ? 'Correct — continue' : 'Submit another attempt') : 'Check my answer'

  return <div className="mx-auto w-full max-w-4xl space-y-5">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-violet-600 dark:text-violet-300">Problem {problemIndex + 1} of {totalProblems}</p><div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${((problemIndex + 1) / Math.max(1, totalProblems)) * 100}%` }} /></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => setShowCalculator(value => !value)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${showCalculator ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'}`}><CalcIcon size={13} /> Calculator</button>{onSkip && <button type="button" onClick={onSkip} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Skip</button>}</div></div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-slate-400">{problem.verification_status === 'verified' ? 'Verified practice' : 'Practice problem'}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{problem.title}</h1></div><span className="text-xs font-semibold text-slate-400">Difficulty {problem.difficulty}/5</span></div>{problem.stimulus && <div className="mt-6 rounded-2xl bg-violet-50 p-4 text-sm leading-6 text-slate-700 dark:bg-violet-950/30 dark:text-slate-300"><MarkdownRenderer content={problem.stimulus} /></div>}<div className="mt-5 text-[15px] leading-7 text-slate-800 dark:text-slate-200"><MarkdownRenderer content={problem.stem_lead_in || problem.problem_text} /></div></section>

        {hints.length > 0 && <section className="space-y-3" aria-label="Hints">{hints.map(item => <div key={item.level} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30"><div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200"><Lightbulb size={15} /> Hint {item.level}</div><div className="mt-2 leading-6 text-amber-950 dark:text-amber-100"><MarkdownRenderer content={item.hint} /></div>{item.learnerPrompt && <p className="mt-3 font-semibold text-amber-900 dark:text-amber-200">Try this: {item.learnerPrompt}</p>}</div>)}</section>}

        {evaluation && <section className={`rounded-2xl border p-5 ${evaluation.is_correct ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30' : 'border-violet-200 bg-violet-50 dark:border-violet-900/60 dark:bg-violet-950/30'}`}><div className="flex items-start gap-3"><CheckCircle2 size={20} className={evaluation.is_correct ? 'text-emerald-600' : 'text-violet-600'} /><div className="min-w-0 flex-1"><h2 className="font-semibold text-slate-950 dark:text-white">{evaluation.is_correct ? 'Nice work.' : 'Let’s use this attempt to improve.'}</h2><div className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300"><MarkdownRenderer content={evaluation.feedback} /></div>{evaluation.pedagogical_remedy && !evaluation.is_correct && <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm dark:bg-slate-900/50"><MarkdownRenderer content={evaluation.pedagogical_remedy} /></div>}</div></div><div className="mt-4 flex flex-wrap gap-2">{!evaluation.is_correct && onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-700 dark:text-violet-300"><RotateCcw size={13} /> Try again</button>}{onRevealSolution && <button type="button" onClick={onRevealSolution} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"><BookOpen size={13} /> Show solution</button>}{onGenerateVariant && <button type="button" onClick={onGenerateVariant} disabled={isGeneratingVariant} className="inline-flex items-center gap-2 rounded-lg border border-violet-300 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-700 dark:text-violet-300"><Sparkles size={13} /> {isGeneratingVariant ? 'Making variant…' : 'Try a similar problem'}</button>}</div></section>}

        <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:p-8"><div className="flex items-center justify-between gap-4"><label htmlFor="practice-answer" className="text-sm font-semibold text-slate-900 dark:text-white">Your working</label><span className="text-[11px] text-slate-400">Text or LaTeX math</span></div><div className="mt-4"><MathKeyboard onInsert={handleInsertSnippet} /></div><textarea id="practice-answer" ref={textareaRef} value={answer} onChange={event => setAnswer(event.target.value)} rows={7} placeholder="Show your reasoning and final answer…" className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white" />{hasMathInput(answer) && <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50"><span className="text-[10px] font-semibold text-slate-400">Preview</span><div className="mt-1"><LatexText>{answer}</LatexText></div></div>}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => onRequestHint?.(answer)} disabled={isHinting || hints.length >= 4} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-4 py-2.5 text-xs font-bold text-amber-800 disabled:opacity-50 dark:border-amber-800 dark:text-amber-200"><Lightbulb size={14} /> {isHinting ? 'Thinking…' : hints.length >= 4 ? 'More help is below' : hints.length === 0 ? 'I’m stuck — give me a hint' : 'Show next hint'}</button><button type="submit" disabled={!answer.trim() || isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">{isSubmitting ? 'Checking…' : submitLabel}<Send size={13} /></button></div></form>

        {evaluation && (onNextProblem || onFinishSession) && <div className="flex flex-wrap justify-end gap-2">{hasNextProblem && onNextProblem && <button type="button" onClick={onNextProblem} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-xs font-bold text-white hover:bg-violet-700">Next problem <ArrowRight size={14} /></button>}{!hasNextProblem && onFinishSession && <button type="button" onClick={onFinishSession} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white hover:bg-emerald-700">Finish session <CheckCircle2 size={14} /></button>}</div>}
      </div>
      {showCalculator && <CalculatorWidget skin={calculatorSkin} onClose={() => setShowCalculator(false)} isFloating={false} />}
    </div>
  </div>
}
