import React, { useState, useEffect, useCallback } from 'react'
import type { Card } from '../types'
import LatexText from './LatexText'

interface FlashCardProps {
  card: Card
  onResult: (quality: number) => void
  onSkip?: () => void
  cardNumber?: number
  totalCards?: number
}

type Phase = 'front' | 'revealed'

export default function FlashCard({
  card,
  onResult,
  onSkip,
  cardNumber,
  totalCards
}: FlashCardProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('front')
  const [answer, setAnswer] = useState('')
  const [flipped, setFlipped] = useState(false)

  // Reset when card changes
  useEffect(() => {
    setPhase('front')
    setAnswer('')
    setFlipped(false)
  }, [card.id])

  function reveal(): void {
    setFlipped(true)
    setPhase('revealed')
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      // Allow typing; only intercept Ctrl+Enter to reveal
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && phase === 'front') {
        e.preventDefault()
        reveal()
      }
      return
    }

    if (phase === 'front') {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal() }
      else if (e.key === 's' && onSkip) { e.preventDefault(); onSkip() }
    } else if (phase === 'revealed') {
      if (e.key === '1') { e.preventDefault(); onResult(1) }
      else if (e.key === '2') { e.preventDefault(); onResult(2) }
      else if (e.key === '3') { e.preventDefault(); onResult(3) }
      else if (e.key === '4') { e.preventDefault(); onResult(4) }
    }
  }, [phase, onResult, onSkip])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">
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

      {/* Card with flip animation */}
      <div
        className="card-container w-full"
        style={{ height: '280px' }}
        onClick={phase === 'front' ? reveal : undefined}
        data-testid="flashcard"
      >
        <div className={`card-inner ${flipped ? 'flipped' : ''}`}>
          {/* Front */}
          <div className="card-front">
            <div className="w-full h-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center p-10 text-center">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-5">
                Question
              </span>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-50 text-balance leading-snug">
                <LatexText>{card.front}</LatexText>
              </p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-8 flex items-center gap-2">
                <span>Click to reveal</span>
                <span className="text-slate-200 dark:text-slate-700">·</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 font-mono text-xs">Space</kbd>
              </p>
            </div>
          </div>

          {/* Back */}
          <div className="card-back">
            <div className="w-full h-full bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-200 dark:border-violet-800 shadow-sm flex flex-col items-center justify-center p-10 text-center overflow-auto">
              <span className="text-xs font-medium uppercase tracking-wide text-violet-500 dark:text-violet-400 mb-5">
                Answer
              </span>
              <p className="text-xl text-slate-800 dark:text-slate-100 text-balance leading-relaxed">
                <LatexText>{card.back}</LatexText>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Optional written answer — shown before reveal */}
      {phase === 'front' && (
        <div className="w-full">
          <div className="relative">
            <textarea
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors text-sm resize-none"
              rows={2}
              placeholder="Optional: write your answer here before revealing... (or just think it / say it aloud)"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-300 dark:text-slate-600 mt-1.5 text-center">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or <kbd>Space</kbd> to reveal
          </p>
        </div>
      )}

      {/* Rating buttons — shown after reveal */}
      {phase === 'revealed' && (
        <div className="w-full space-y-3">
          {/* Show their written answer if they typed one */}
          {answer.trim() && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-1">
                Your Answer
              </span>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{answer}</p>
            </div>
          )}

          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center">
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
      )}

      {/* Skip button — only before reveal */}
      {phase === 'front' && onSkip && (
        <button
          onClick={onSkip}
          className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          Skip for now
        </button>
      )}
    </div>
  )
}
