import React, { useState, useEffect } from "react"
import {
  ArrowLeft,
  Trophy
} from "../components/icons"
import PracticeProblemSolver from "../components/practice/PracticeProblemSolver"
import PracticeTutorDiscussion from "../components/practice/PracticeTutorDiscussion"
import type {
  Subject,
  User,
  PracticeSession,
  PracticeProblem,
  PracticeEvaluationResult,
  PracticeProblemAttempt,
  CalculatorSkin
} from "../types"

interface PracticeSessionPageProps {
  subject: Subject
  user: User | null
  moduleId?: number
  topicId?: number
  problemCount?: number
  calculatorSkin?: CalculatorSkin
  onExit: () => void
}

export default function PracticeSessionPage({
  subject,
  user,
  moduleId,
  topicId,
  problemCount = 5,
  calculatorSkin = "numworks",
  onExit
}: PracticeSessionPageProps): React.JSX.Element {
  const [session, setSession] = useState<PracticeSession | null>(null)
  const [problems, setProblems] = useState<PracticeProblem[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [currentStep, setCurrentStep] = useState<"solving" | "discussion" | "summary">("solving")
  const [latestSubmission, setLatestSubmission] = useState<{
    userAnswer: string
    evaluation: PracticeEvaluationResult
    attempt?: PracticeProblemAttempt
  } | null>(null)

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [isGeneratingVariant, setIsGeneratingVariant] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [sessionStartTime] = useState<number>(Date.now())

  useEffect(() => {
    async function initSession() {
      if (!window.electronAPI.practiceCreateSession) return
      try {
        setLoading(true)
        const res = await window.electronAPI.practiceCreateSession({
          subjectId: subject.id,
          userId: user?.id || 1,
          moduleId,
          topicId,
          problemCount
        })

        setSession(res.session)
        setProblems(res.problems)
      } catch (err) {
        console.error("Failed to initialize practice session:", err)
      } finally {
        setLoading(false)
      }
    }

    initSession()
  }, [subject.id, user?.id, moduleId, topicId, problemCount])

  const currentProblem = problems[currentIndex]

  const handleSubmitAnswer = async (userAnswer: string, timeSpentSeconds: number) => {
    if (!session || !currentProblem || !window.electronAPI.practiceSubmitAttempt) return
    setIsSubmitting(true)
    try {
      const res = await window.electronAPI.practiceSubmitAttempt(
        session.id,
        currentProblem.id,
        userAnswer,
        timeSpentSeconds
      )

      if (res.success && res.evaluation) {
        setLatestSubmission({
          userAnswer,
          evaluation: res.evaluation,
          attempt: res.attempt
        })
        setCurrentStep("discussion")
      }
    } catch (err) {
      console.error("Error submitting practice attempt:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGenerateVariant = async () => {
    if (!currentProblem || !window.electronAPI.practiceGenerateVariant) return
    setIsGeneratingVariant(true)
    try {
      const userStruggles = latestSubmission?.evaluation.identified_errors?.join("; ")
      const res = await window.electronAPI.practiceGenerateVariant(currentProblem.id, userStruggles)
      if (res.success && res.variant) {
        // Insert variant directly as next problem
        const updatedProblems = [...problems]
        updatedProblems.splice(currentIndex + 1, 0, res.variant)
        setProblems(updatedProblems)
        setCurrentIndex(currentIndex + 1)
        setCurrentStep("solving")
        setLatestSubmission(null)
      }
    } catch (err) {
      console.error("Error generating variant:", err)
    } finally {
      setIsGeneratingVariant(false)
    }
  }

  const handleNextProblem = () => {
    if (currentIndex + 1 < problems.length) {
      setCurrentIndex((prev) => prev + 1)
      setCurrentStep("solving")
      setLatestSubmission(null)
    } else {
      handleFinishSession()
    }
  }

  const handleFinishSession = async () => {
    if (session && window.electronAPI.practiceEndSession) {
      await window.electronAPI.practiceEndSession(session.id)
    }
    setCurrentStep("summary")
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <span className="w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Loading Practice Session…</p>
      </div>
    )
  }

  if (!currentProblem && currentStep !== "summary") {
    return (
      <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-lg mx-auto space-y-4">
        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">No Problems in Selection</h3>
        <p className="text-xs text-slate-500">Please select a different module or drop in problem sets first.</p>
        <button
          onClick={onExit}
          className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700"
        >
          Return to Subject
        </button>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary View
  // ──────────────────────────────────────────────────────────────────────────
  if (currentStep === "summary") {
    const totalTimeMinutes = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000))

    return (
      <div className="max-w-xl mx-auto py-8 px-4 animate-in zoom-in-95 duration-200">
        <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-6">
          {/* Trophy Badge */}
          <div className="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-inner">
            <Trophy size={32} />
          </div>

          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Practice Session Complete!</h2>
            <p className="text-xs text-slate-500 mt-1">
              Your performance and topic strengths have been updated in AI memory.
            </p>
          </div>

          {/* Stats Badges */}
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Problems Practiced</span>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-1">
                {problems.length}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Time Spent</span>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono mt-1">
                {totalTimeMinutes}m
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={onExit}
              className="w-full py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm shadow-md transition-all active:scale-98"
            >
              Back to Subject Hub
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Active Session Solving / Discussion View
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={onExit}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Exit Practice</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">
            {subject.name} &bull; Practice Lab
          </span>
        </div>
      </div>

      {/* Main Mode Dispatch */}
      {currentStep === "solving" ? (
        <PracticeProblemSolver
          problem={currentProblem}
          problemIndex={currentIndex}
          totalProblems={problems.length}
          calculatorSkin={calculatorSkin}
          onSubmit={handleSubmitAnswer}
          onSkip={currentIndex + 1 < problems.length ? handleNextProblem : undefined}
          isSubmitting={isSubmitting}
        />
      ) : (
        latestSubmission && (
          <PracticeTutorDiscussion
            problem={currentProblem}
            userAnswer={latestSubmission.userAnswer}
            evaluation={latestSubmission.evaluation}
            attempt={latestSubmission.attempt}
            onNextProblem={handleNextProblem}
            onGenerateVariant={handleGenerateVariant}
            onFinishSession={handleFinishSession}
            isGeneratingVariant={isGeneratingVariant}
            hasNextProblem={currentIndex + 1 < problems.length}
          />
        )
      )}
    </div>
  )
}
