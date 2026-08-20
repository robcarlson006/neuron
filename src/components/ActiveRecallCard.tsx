import React, { useState, useEffect, useCallback } from 'react'
import type { Card } from '../types'
import LatexText from './LatexText'

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

  // Reset state when card changes
  useEffect(() => {
    setPhase('question')
    setAnswer('')
  }, [card.id])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (phase === 'question') {
      // Enter (without Shift) reveals the answer; Shift+Enter inserts a newline normally
      if (tag === 'TEXTAREA' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        setPhase('revealed')
      }
      return
    }
    if (phase === 'revealed') {
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '1') { e.preventDefault(); onResult(1) }
      else if (e.key === '2') { e.preventDefault(); onResult(2) }
      else if (e.key === '3') { e.preventDefault(); onResult(3) }
      else if (e.key === '4') { e.preventDefault(); onResult(4) }
    }
  }, [phase, onResult])

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
              onClick={() => setPhase('revealed')}
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
              How did you do?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => onResult(1)}
                className="flex-1 py-3 px-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-800 flex flex-col items-center gap-1"
              >
                <span>Wrong</span>
                <kbd className="text-xs font-mono opacity-50">1</kbd>
              </button>
              <button
                onClick={() => onResult(3)}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-medium text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors border border-amber-200 dark:border-amber-800 flex flex-col items-center gap-1"
              >
                <span>Partially Right</span>
                <kbd className="text-xs font-mono opacity-50">2</kbd>
              </button>
              <button
                onClick={() => onResult(5)}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors border border-emerald-200 dark:border-emerald-800 flex flex-col items-center gap-1"
              >
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
