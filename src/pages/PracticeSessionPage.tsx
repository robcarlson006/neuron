import React, { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Trophy } from '../components/icons'
import PracticeProblemSolver from '../components/practice/PracticeProblemSolver'
import MarkdownRenderer from '../components/MarkdownRenderer'
import type { CalculatorSkin, PracticeEvaluationResult, PracticeProblem, PracticeProblemAttempt, PracticeSession, Subject, User } from '../types'

interface PracticeSessionPageProps { subject: Subject; user: User | null; moduleId?: number; topicId?: number; problemCount?: number; mode?: 'standard' | 'guided'; difficulty?: number; learningGoal?: 'recommended' | 'reinforce' | 'review' | 'transfer'; calculatorSkin?: CalculatorSkin; onExit: () => void }
interface HintItem { level: number; hint: string; learnerPrompt?: string }

export default function PracticeSessionPage({ subject, user, moduleId, topicId, problemCount = 5, difficulty, learningGoal, calculatorSkin = 'numworks', onExit }: PracticeSessionPageProps): React.JSX.Element {
  const [session, setSession] = useState<PracticeSession | null>(null)
  const [problems, setProblems] = useState<PracticeProblem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [submission, setSubmission] = useState<{ userAnswer: string; evaluation: PracticeEvaluationResult; attempt?: PracticeProblemAttempt } | null>(null)
  const [hints, setHints] = useState<HintItem[]>([])
  const [solutionRevealed, setSolutionRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isHinting, setIsHinting] = useState(false)
  const [isGeneratingVariant, setIsGeneratingVariant] = useState(false)
  const [complete, setComplete] = useState(false)
  const [startedAt] = useState(Date.now())

  useEffect(() => {
    let cancelled = false
    async function create(): Promise<void> {
      try {
        const result = await window.electronAPI.practiceCreateSession({ subjectId: subject.id, userId: user?.id || 1, moduleId, topicId, problemCount, difficulty, learningGoal })
        if (!cancelled) { setSession(result.session); setProblems(result.problems) }
      } catch (error) { console.error('Failed to initialize practice session:', error) } finally { if (!cancelled) setLoading(false) }
    }
    void create()
    return () => { cancelled = true }
  }, [subject.id, user?.id, moduleId, topicId, problemCount, difficulty, learningGoal])

  const problem = problems[currentIndex]
  const finish = async (): Promise<void> => { if (session) await window.electronAPI.practiceEndSession?.(session.id); setComplete(true) }
  const next = (): void => { if (currentIndex + 1 < problems.length) { setCurrentIndex(index => index + 1); setSubmission(null); setHints([]); setSolutionRevealed(false) } else void finish() }

  const submitAnswer = async (answer: string, seconds: number): Promise<void> => {
    if (!session || !problem) return
    setIsSubmitting(true)
    try {
      const result = await window.electronAPI.practiceSubmitAttempt(session.id, problem.id, answer, seconds)
      if (result.success && result.evaluation) setSubmission({ userAnswer: answer, evaluation: result.evaluation, attempt: result.attempt })
    } catch (error) { console.error('Error submitting practice attempt:', error) } finally { setIsSubmitting(false) }
  }

  const requestHint = async (learnerResponse: string): Promise<void> => {
    if (!session || !problem || hints.length >= 4) return
    setIsHinting(true)
    try {
      const result = await window.electronAPI.practiceRequestGuidedHint(session.id, problem.id, learnerResponse)
      if (result.success && result.hint) setHints(current => [...current, { level: result.hintLevel || current.length + 1, hint: result.hint || '', learnerPrompt: result.learnerPrompt }])
    } catch (error) { console.error('Error requesting practice hint:', error) } finally { setIsHinting(false) }
  }

  const revealSolution = async (): Promise<void> => {
    if (!session || !problem) return
    await window.electronAPI.practiceRevealGuidedAnswer?.(session.id, problem.id)
    setSolutionRevealed(true)
  }

  const generateVariant = async (): Promise<void> => {
    if (!problem) return
    setIsGeneratingVariant(true)
    try {
      const result = await window.electronAPI.practiceGenerateVariant(problem.id, submission?.evaluation.identified_errors?.join('; '))
      if (result.success && result.variant) {
        setProblems(current => [...current.slice(0, currentIndex + 1), result.variant!, ...current.slice(currentIndex + 1)])
        setCurrentIndex(index => index + 1)
        setSubmission(null)
        setHints([])
        setSolutionRevealed(false)
      }
    } catch (error) { console.error('Error generating practice variant:', error) } finally { setIsGeneratingVariant(false) }
  }

  if (loading) return <div className="py-20 text-center text-sm text-slate-500">Preparing your practice session…</div>
  if (complete) return <div className="mx-auto max-w-xl py-16 text-center"><div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm dark:border-slate-800 dark:bg-slate-900"><Trophy size={38} className="mx-auto text-amber-500" /><h1 className="mt-5 text-2xl font-semibold text-slate-950 dark:text-white">Practice session complete</h1><p className="mt-2 text-sm leading-6 text-slate-500">Your attempts, hints, and areas for review have been recorded.</p><div className="mt-8 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">Problems practiced</p><p className="mt-1 text-2xl font-semibold">{problems.length}</p></div><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">Time spent</p><p className="mt-1 text-2xl font-semibold">{Math.max(1, Math.round((Date.now() - startedAt) / 60000))}m</p></div></div><button onClick={onExit} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700"><CheckCircle2 size={15} /> Return to Practice Lab</button></div></div>
  if (!problem) return <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 p-10 text-center dark:border-slate-800"><h2 className="font-semibold text-slate-950 dark:text-white">No problems in this selection</h2><p className="mt-2 text-sm text-slate-500">Choose another scope or add more problems to the library.</p><button onClick={onExit} className="mt-5 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white">Return to Practice Lab</button></div>

  return <div className="space-y-6 pb-12"><div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800"><button onClick={onExit} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft size={15} /> Exit practice</button><span className="text-xs font-semibold text-slate-400">{subject.name}</span></div><PracticeProblemSolver problem={problem} problemIndex={currentIndex} totalProblems={problems.length} calculatorSkin={calculatorSkin} onSubmit={submitAnswer} onSkip={currentIndex + 1 < problems.length ? next : undefined} onNextProblem={next} onFinishSession={() => void finish()} onGenerateVariant={generateVariant} onRequestHint={requestHint} onRevealSolution={revealSolution} onRetry={() => setSubmission(null)} hints={hints} evaluation={submission?.evaluation || null} attempt={submission?.attempt} isSubmitting={isSubmitting} isHinting={isHinting} isGeneratingVariant={isGeneratingVariant} hasNextProblem={currentIndex + 1 < problems.length} />{solutionRevealed && <div className="mx-auto max-w-4xl rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm dark:border-rose-900/60 dark:bg-rose-950/30"><h2 className="font-semibold text-rose-900 dark:text-rose-200">Reference solution</h2>{problem.solution_steps && <div className="mt-3 leading-6 text-rose-950 dark:text-rose-100"><MarkdownRenderer content={problem.solution_steps} /></div>}{problem.final_answer && <p className="mt-4 font-semibold text-rose-900 dark:text-rose-200">Final answer: {problem.final_answer}</p>}</div>}</div>
}
