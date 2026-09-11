import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { Card } from '../types'
import LatexText from './LatexText'
import AutoGradeFeedback from './AutoGradeFeedback'
import { evaluateStudentAnswer, type AutoGradeResult } from '../lib/semanticEvaluator'

interface ActiveRecallCardProps {
  card: Card
  onResult: (quality: number) => void
  onSkip?: () => void
  cardNumber?: number
  totalCards?: number
}

type Phase = 'question' | 'revealed'

export default function ActiveRecallCard({
  card,
  onResult,
  onSkip,
  cardNumber,
  totalCards
}: ActiveRecallCardProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('question')
  const [answer, setAnswer] = useState('')
  const [autoGradeResult, setAutoGradeResult] = useState<AutoGradeResult | null>(null)
  const [grading, setGrading] = useState(false)

  // Reset state when card changes
  useEffect(() => {
    setPhase('question')
    setAnswer('')
    setAutoGradeResult(null)
    setGrading(false)
  }, [card.id])

  const revealAnswer = useCallback(async () => {
    setPhase('revealed')
    if (answer.trim()) {
      setGrading(true)
      try {
        const res = await evaluateStudentAnswer(card.front, card.back, answer)
        setAutoGradeResult(res)
      } catch {
        // Fallback silently
      } finally {
        setGrading(false)
      }
    }
  }, [card.front, card.back, answer])

  const handlerRef = useRef<{
    phase: Phase
    suggestedQuality?: number
    onResult: (q: number) => void
  }>({
    phase: 'question',
    onResult
  })

  handlerRef.current.phase = phase
  handlerRef.current.suggestedQuality = autoGradeResult?.quality
  handlerRef.current.onResult = onResult

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    const { phase: p, suggestedQuality, onResult: handleResult } = handlerRef.current

    if (p === 'question') {
      // Enter (without Shift) reveals the answer; Shift+Enter inserts a newline normally
      if (tag === 'TEXTAREA' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        revealAnswer()
      }
      return
    }
    if (p === 'revealed') {
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Space or Enter accepts suggested rating
      if ((e.key === ' ' || e.key === 'Enter') && suggestedQuality !== undefined) {
        e.preventDefault()
        handleResult(suggestedQuality)
        return
      }

      if (e.key === '1') { e.preventDefault(); handleResult(1) }
      else if (e.key === '2') { e.preventDefault(); handleResult(3) }
      else if (e.key === '3') { e.preventDefault(); handleResult(5) }
      else if (e.key === '4') { e.preventDefault(); handleResult(5) }
    }
  }, [revealAnswer])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col gap-5 w-full max-w-2xl mx-auto">
      {/* Progress */}
      {cardNumber !== undefined && totalCards !== undefined && (
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
            <div
              className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(cardNumber / totalCards) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap tabular-nums">
            {cardNumber} / {totalCards}
          </span>
        </div>
      )}

      {/* Question */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-3">
          Active Recall
        </span>
        <p className="text-xl font-semibold text-slate-900 dark:text-slate-50 leading-relaxed">
          <LatexText>{card.front}</LatexText>
        </p>
      </div>

      {phase === 'question' && (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-2">
              Your Answer{' '}
              <span className="normal-case font-normal text-slate-300 dark:text-slate-600">
                — optional, or just think/write it by hand
              </span>
            </label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors text-sm resize-none min-h-[120px]"
              placeholder="Type your answer here, or leave blank if you're writing it by hand..."
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              autoFocus
              data-testid="answer-input"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              <kbd>Enter</kbd> to reveal · <kbd>Shift</kbd>+<kbd>Enter</kbd> for new line
            </p>
          </div>

          <div className="flex gap-3">
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-4 py-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={revealAnswer}
              className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-colors flex-1"
              data-testid="show-answer"
            >
              Show Answer →
            </button>
          </div>
        </>
      )}

      {phase === 'revealed' && (
        <>
          {/* User's typed answer (if any) */}
          {answer.trim() && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-2">
                Your Answer
              </span>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {answer}
              </p>
            </div>
          )}

          {/* Auto-grade feedback */}
          {(answer.trim() || autoGradeResult || grading) && (
            <AutoGradeFeedback
              result={autoGradeResult}
              loading={grading}
              suggestedLabel={
                autoGradeResult !== null
                  ? autoGradeResult.quality === 5
                    ? 'Got It'
                    : autoGradeResult.quality === 3
                    ? 'Partially Right'
                    : 'Wrong'
                  : undefined
              }
              onAcceptSuggested={
                autoGradeResult !== null ? () => onResult(autoGradeResult.quality) : undefined
              }
            />
          )}

          {/* Model answer */}
          <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-200 dark:border-violet-800 p-6">
            <span className="text-xs font-medium uppercase tracking-wide text-violet-500 dark:text-violet-400 block mb-2">
              Model Answer
            </span>
            <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
              <LatexText>{card.back}</LatexText>
            </p>
          </div>

          {/* Self-rating */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3 text-center">
              {autoGradeResult ? 'Press Space to accept suggested, or rate below' : 'How did you do?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onResult(1)}
                className={`flex-1 py-3 px-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition-all border border-red-200 dark:border-red-800 flex flex-col items-center gap-1 relative ${
                  autoGradeResult?.quality === 1
                    ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-slate-900 shadow-md border-violet-400'
                    : ''
                }`}
              >
                {autoGradeResult?.quality === 1 && (
                  <span className="absolute -top-2.5 bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs tracking-tight">
                    Suggested
                  </span>
                )}
                <span>Wrong</span>
                <kbd className="text-xs font-mono opacity-50">1</kbd>
              </button>
              <button
                onClick={() => onResult(3)}
                className={`flex-1 py-3 px-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-medium text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all border border-amber-200 dark:border-amber-800 flex flex-col items-center gap-1 relative ${
                  autoGradeResult?.quality === 3
                    ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-slate-900 shadow-md border-violet-400'
                    : ''
                }`}
              >
                {autoGradeResult?.quality === 3 && (
                  <span className="absolute -top-2.5 bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs tracking-tight">
                    Suggested
                  </span>
                )}
                <span>Partially Right</span>
                <kbd className="text-xs font-mono opacity-50">2</kbd>
              </button>
              <button
                onClick={() => onResult(5)}
                className={`flex-1 py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all border border-emerald-200 dark:border-emerald-800 flex flex-col items-center gap-1 relative ${
                  autoGradeResult?.quality === 5
                    ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-slate-900 shadow-md border-violet-400'
                    : ''
                }`}
              >
                {autoGradeResult?.quality === 5 && (
                  <span className="absolute -top-2.5 bg-violet-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs tracking-tight">
                    Suggested
                  </span>
                )}
                <span>Got It</span>
                <kbd className="text-xs font-mono opacity-50">3</kbd>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
