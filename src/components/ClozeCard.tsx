import React, { useState, useEffect, useCallback } from 'react'
import type { Card } from '../types'
import { parseClozeText } from '../lib/clozeParser'
import LatexText from './LatexText'

interface ClozeCardProps {
  card: Card
  onResult: (quality: number) => void
  onSkip?: () => void
  cardNumber?: number
  totalCards?: number
}

export default function ClozeCard({
  card,
  onResult,
  onSkip,
  cardNumber,
  totalCards
}: ClozeCardProps): React.JSX.Element {
  const [revealedOrdinals, setRevealedOrdinals] = useState<Set<number>>(new Set())

  const textToRender = card.front || card.back
  const { segments, clozes } = parseClozeText(textToRender)

  // All clozes are revealed when every parsed cloze has been clicked
  const allRevealed = clozes.length > 0 && revealedOrdinals.size >= clozes.length
  // Show rating buttons immediately when there are no clozes, or after all are revealed
  const showRatings = clozes.length === 0 || allRevealed

  // Reset when card changes
  useEffect(() => {
    setRevealedOrdinals(new Set())
  }, [card.id])

  const revealCloze = useCallback((ordinal: number) => {
    setRevealedOrdinals(prev => {
      if (prev.has(ordinal)) return prev
      const next = new Set(prev)
      next.add(ordinal)
      return next
    })
  }, [])

  const revealNext = useCallback(() => {
    const nextCloze = clozes.find(c => !revealedOrdinals.has(c.ordinal))
    if (nextCloze) {
      revealCloze(nextCloze.ordinal)
    }
  }, [clozes, revealedOrdinals, revealCloze])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    if (!showRatings) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        revealNext()
      }
    } else {
      if (e.key === '1') { e.preventDefault(); onResult(1) }
      else if (e.key === '2') { e.preventDefault(); onResult(3) }
      else if (e.key === '3') { e.preventDefault(); onResult(4) }
    }
  }, [showRatings, revealNext, onResult])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const progress =
    cardNumber !== undefined && totalCards !== undefined ? (
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
    ) : null

  // Empty text edge case
  if (!textToRender.trim()) {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">
        {progress}
        <div className="w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-10 text-center">
          <p className="text-slate-400 dark:text-slate-500 italic">Empty card</p>
        </div>
        <RatingButtons onResult={onResult} />
        {onSkip && (
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

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">
      {progress}

      {/* Card with inline cloze blanks */}
      <div className="w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 min-h-[200px] flex flex-col">
        <div className="flex-1">
          <p className="text-lg leading-relaxed dark:text-slate-100 whitespace-pre-wrap">
            {segments.length === 0 ? (
              <LatexText>{textToRender}</LatexText>
            ) : (
              segments.map((seg, i) => {
                if (seg.type === 'text') {
                  return <LatexText key={i}>{seg.content}</LatexText>
                }
                if (seg.type === 'cloze' && seg.ordinal != null) {
                  const isRevealed = revealedOrdinals.has(seg.ordinal)
                  return (
                    <span
                      key={i}
                      onClick={() => !isRevealed && seg.ordinal != null && revealCloze(seg.ordinal)}
                      className={`
                        inline-block cursor-pointer transition-all duration-200 rounded px-1.5 py-0.5 mx-0.5
                        ${isRevealed
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-semibold border border-green-300 dark:border-green-700'
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-500 dark:text-purple-400 border border-dashed border-purple-300 dark:border-purple-600 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                        }
                      `}
                      role="button"
                      tabIndex={0}
                      aria-label={isRevealed ? `Revealed: ${seg.answer}` : 'Hidden cloze, click to reveal'}
                      onKeyDown={(e) => {
                        if ((e.key === ' ' || e.key === 'Enter') && !isRevealed) {
                          e.preventDefault()
                          e.stopPropagation()
                          revealCloze(seg.ordinal!)
                        }
                      }}
                    >
                      {isRevealed ? seg.answer : ' [...] '}
                    </span>
                  )
                }
                return null
              })
            )}
          </p>
        </div>

        {/* Status message below the card text */}
        {!showRatings && (
          <div className="mt-6">
            {clozes.length > revealedOrdinals.size ? (
              <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                {revealedOrdinals.size > 0
                  ? `${revealedOrdinals.size} of ${clozes.length} revealed — keep going`
                  : `Click a blank or press Space to reveal — ${clozes.length} cloze${clozes.length > 1 ? 's' : ''}`}
              </p>
            ) : (
              clozes.length > 0 && (
                <p className="text-center text-xs text-blue-500 dark:text-blue-400 animate-pulse">
                  All revealed — rate your recall
                </p>
              )
            )}
          </div>
        )}
      </div>

      {/* Rating buttons */}
      {showRatings && (
        <RatingButtons onResult={onResult} />
      )}

      {/* Skip button -- only shown before rating */}
      {!showRatings && onSkip && (
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

// --- Sub-components ---

interface RatingButtonsProps {
  onResult: (quality: number) => void
}

function RatingButtons({ onResult }: RatingButtonsProps): React.JSX.Element {
  return (
    <div className="w-full space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 text-center">
        How well did you know it?
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => onResult(1)}
          className="flex-1 py-3 px-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-800 flex flex-col items-center gap-1"
        >
          <span>Again</span>
          <kbd className="text-xs font-mono opacity-50">1</kbd>
        </button>
        <button
          onClick={() => onResult(3)}
          className="flex-1 py-3 px-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-medium text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors border border-amber-200 dark:border-amber-800 flex flex-col items-center gap-1"
        >
          <span>Hard</span>
          <kbd className="text-xs font-mono opacity-50">2</kbd>
        </button>
        <button
          onClick={() => onResult(4)}
          className="flex-1 py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors border border-emerald-200 dark:border-emerald-800 flex flex-col items-center gap-1"
        >
          <span>Good</span>
          <kbd className="text-xs font-mono opacity-50">3</kbd>
        </button>
      </div>
    </div>
  )
}
