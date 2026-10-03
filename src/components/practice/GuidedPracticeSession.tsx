import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Lightbulb, Sparkles } from '../icons'
import MarkdownRenderer from '../MarkdownRenderer'
import type { PracticeProblem, PracticeSession, Subject, User } from '../../types'

interface GuidedPracticeSessionProps {
  subject: Subject
  user: User | null
  moduleId?: number
  topicId?: number
  problemCount?: number
  onExit: () => void
}

type GuidedEvaluation = {
  status?: string
  feedback?: string
  learner_prompt?: string
  next_move?: string
  identified_errors?: string[]
}

export default function GuidedPracticeSession({
  subject, user, moduleId, topicId, problemCount = 3, onExit
}: GuidedPracticeSessionProps): React.JSX.Element {
  const [session, setSession] = useState<PracticeSession | null>(null)
  const [problems, setProblems] = useState<PracticeProblem[]>([])
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState('orient')
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [learnerPrompt, setLearnerPrompt] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<GuidedEvaluation | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [assistance, setAssistance] = useState('none')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [answerRevealed, setAnswerRevealed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const result = await window.electronAPI.practiceCreateGuidedSession({
          subjectId: subject.id,
          userId: user?.id || 1,
          moduleId,
          topicId,
          problemCount,
          mode: 'guided'
        })
        if (!cancelled) {
          setSession(result.session)
          setProblems(result.problems)
        }
      } catch (error) {
        console.error('Failed to create guided practice session:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [subject.id, user?.id, moduleId, topicId, problemCount])

  const problem = problems[index]
  const subgoals = useMemo(() => {
    if (!problem?.subgoals_json) return []
    try { return JSON.parse(problem.subgoals_json) as string[] } catch { return [] }
  }, [problem])

  const submitStep = async (): Promise<void> => {
    if (!session || !problem || !answer.trim() || busy) return
    setBusy(true)
    try {
      const result = await window.electronAPI.practiceSubmitGuidedStep(session.id, problem.id, phase, answer)
      if (!result.success) throw new Error(result.error || 'Guided evaluation failed.')
      const nextEvaluation = (result.evaluation || {}) as GuidedEvaluation
      const nextState = (result.state || {}) as { phase?: string; hintLevel?: number; assistanceLevel?: string }
      setEvaluation(nextEvaluation)
      setPhase(nextState.phase || 'feedback')
      setHintLevel(nextState.hintLevel || hintLevel)
      setAssistance(nextState.assistanceLevel || assistance)
      setAnswer('')
    } catch (error) {
      console.error(error)
    } finally {
      setBusy(false)
    }
  }

  const requestHint = async (): Promise<void> => {
    if (!session || !problem || busy) return
    setBusy(true)
    try {
      const result = await window.electronAPI.practiceRequestGuidedHint(session.id, problem.id, answer)
      if (!result.success) throw new Error(result.error || 'Hint request failed.')
      setHint(result.hint || null)
      setLearnerPrompt(result.learnerPrompt || null)
      setHintLevel(result.hintLevel || hintLevel)
      setAssistance(result.assistanceLevel || assistance)
    } catch (error) {
      console.error(error)
    } finally {
      setBusy(false)
    }
  }

  const submitExplanation = async (): Promise<void> => {
    if (!session || !problem || !explanation.trim() || busy) return
    setBusy(true)
    try {
      const result = await window.electronAPI.practiceRecordGuidedExplanation(session.id, problem.id, explanation)
      if (!result.success) throw new Error(result.error || 'Could not save explanation.')
      setPhase('reattempt')
      setExplanation('')
      setEvaluation({ feedback: 'Good. Now solve the problem again in your own words, using the principle you just explained.', next_move: 'retry' })
    } catch (error) {
      console.error(error)
    } finally {
      setBusy(false)
    }
  }

  const nextProblem = async (): Promise<void> => {
    if (index + 1 >= problems.length) {
      if (session) await window.electronAPI.practiceEndSession(session.id, JSON.stringify({ mode: 'guided' }))
      setComplete(true)
      return
    }
    setIndex(index + 1)
    if (session) void window.electronAPI.practiceBeginGuidedProblem(session.id, problems[index + 1].id)
    setPhase('orient')
    setHint(null)
    setLearnerPrompt(null)
    setEvaluation(null)
    setHintLevel(0)
    setAssistance('none')
    setAnswerRevealed(false)
  }

  const tryTransfer = async (): Promise<void> => {
    if (!session || !problem || busy) return
    setBusy(true)
    try {
      const started = await window.electronAPI.practiceStartGuidedTransfer(session.id, problem.id)
      if (!started.success) throw new Error(started.error || 'Could not start transfer practice.')
      const variant = await window.electronAPI.practiceGenerateVariant(problem.id, evaluation?.identified_errors?.join('; '))
      if (!variant.success || !variant.variant) throw new Error(variant.error || 'Could not generate a transfer problem.')
      setProblems(current => [...current.slice(0, index + 1), variant.variant!, ...current.slice(index + 1)])
      setIndex(index + 1)
      await window.electronAPI.practiceBeginGuidedProblem(session.id, variant.variant.id)
      setPhase('orient')
      setHint(null)
      setLearnerPrompt(null)
      setEvaluation(null)
      setHintLevel(0)
      setAssistance('none')
      setAnswerRevealed(false)
    } catch (error) {
      console.error(error)
    } finally {
      setBusy(false)
    }
  }

  const revealAnswer = async (): Promise<void> => {
    if (!session || !problem || busy) return
    setBusy(true)
    try {
      const result = await window.electronAPI.practiceRevealGuidedAnswer(session.id, problem.id)
      if (!result.success) throw new Error(result.error || 'Could not reveal the solution.')
      setAnswerRevealed(true)
      setAssistance('direct_answer')
    } catch (error) {
      console.error(error)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="py-16 text-center text-sm text-slate-500">Preparing your guided walkthrough…</div>
  if (!problem || complete) {
    return <div className="max-w-xl mx-auto py-16 text-center space-y-4"><CheckCircle2 size={42} className="mx-auto text-emerald-500" /><h2 className="text-2xl font-bold">Guided walkthrough complete</h2><p className="text-sm text-slate-500">Your hints, explanations, retries, and transfer practice were recorded for future review.</p><button onClick={onExit} className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold">Return to Practice Lab</button></div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onExit} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Practice Lab</button>
        <span className="text-xs font-bold uppercase tracking-wider text-violet-600">Guided walkthrough · {index + 1}/{problems.length}</span>
      </div>
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 text-white p-5">
        <p className="text-[11px] uppercase tracking-widest font-bold text-violet-200">{phase.replace('_', ' ')}</p>
        <h1 className="text-xl font-bold mt-1">{problem.title}</h1>
        <p className="text-sm text-violet-100 mt-2">Work independently first. Neuron will give you the smallest useful next step when you need it.</p>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        {problem.stimulus && <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-950/30 text-sm"><MarkdownRenderer content={problem.stimulus} /></div>}
        <div className="text-base leading-7"><MarkdownRenderer content={problem.stem_lead_in || problem.problem_text} /></div>
        {subgoals.length > 0 && <p className="text-xs text-slate-500">Checkpoint {Math.min(subgoals.length, 1)} of {subgoals.length}: Neuron will check your next meaningful step.</p>}
      </div>
      {hint && <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-5 text-sm"><div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200"><Lightbulb size={16} /> Hint level {hintLevel}</div><div className="mt-2"><MarkdownRenderer content={hint} /></div>{learnerPrompt && <p className="mt-3 font-semibold text-amber-900 dark:text-amber-100">{learnerPrompt}</p>}</div>}
      {evaluation?.feedback && <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-5 text-sm"><p className="font-bold mb-2">Tutor feedback</p><MarkdownRenderer content={evaluation.feedback} />{evaluation.learner_prompt && <p className="mt-3 font-semibold text-violet-700 dark:text-violet-300">Next: {evaluation.learner_prompt}</p>}</div>}
      {answerRevealed && <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-5 text-sm"><p className="font-bold text-rose-800 dark:text-rose-200 mb-2">Reference derivation (answer revealed)</p><MarkdownRenderer content={problem.solution_steps || problem.final_answer || 'No reference solution was stored.'} /></div>}
      {(phase === 'explain' || phase === 'reattempt') && <div className="rounded-2xl border border-violet-200 bg-violet-50 dark:bg-violet-950/30 p-5"><p className="text-sm font-bold mb-2">Explain the principle in your own words</p><textarea value={explanation} onChange={event => setExplanation(event.target.value)} rows={3} className="w-full rounded-xl border border-violet-200 bg-white p-3 text-sm" placeholder="Why does this method or relationship work here?" /><button onClick={() => void submitExplanation()} disabled={!explanation.trim() || busy} className="mt-3 px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold disabled:opacity-50">Save explanation</button></div>}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Your plan, working, or next step</label>
        <textarea value={answer} onChange={event => setAnswer(event.target.value)} rows={6} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm font-mono" placeholder="Write what you would do next and show your working…" />
        <div className="flex flex-wrap justify-between gap-2">
          <button onClick={() => void requestHint()} disabled={busy || hintLevel >= 4} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-300 text-amber-700 text-xs font-bold disabled:opacity-50"><Lightbulb size={14} /> {hintLevel >= 4 ? 'Maximum help shown' : 'I’m stuck — give me a hint'}</button>
          <div className="flex gap-2"><button onClick={() => void nextProblem()} disabled={busy} className="px-4 py-2 rounded-xl text-slate-500 text-xs font-bold">Skip</button>{hintLevel >= 4 && !answerRevealed && <button onClick={() => void revealAnswer()} disabled={busy} className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold">Show reference solution</button>}{(phase === 'explain' || phase === 'reattempt') && <button onClick={() => void tryTransfer()} disabled={busy} className="px-4 py-2 rounded-xl border border-violet-300 text-violet-700 text-xs font-bold">Try a transfer problem</button>}<button onClick={() => void submitStep()} disabled={busy || !answer.trim()} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold disabled:opacity-50"><Sparkles size={14} /> {busy ? 'Thinking…' : 'Submit next step'}</button></div>
        </div>
        <p className="text-[11px] text-slate-400">Support used: {assistance === 'none' ? 'none yet' : assistance} · Hint level {hintLevel}</p>
      </div>
    </div>
  )
}
