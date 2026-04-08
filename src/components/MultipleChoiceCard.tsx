import React, { useState, useEffect, useCallback } from 'react'
import LatexText from './LatexText'

interface MCCard {
  id: number
  front: string
  back: string
}

interface Choice {
  text: string
  isCorrect: boolean
}

interface Props {
  card: MCCard
  allCards: MCCard[]
  onResult: (wasCorrect: boolean) => void
  onSkip?: () => void
  cardNumber: number
  totalCards: number
}

const LETTERS = ['A', 'B', 'C', 'D']

export default function MultipleChoiceCard({
  card,
  allCards,
  onResult,
  onSkip,
  cardNumber,
  totalCards
}: Props): React.JSX.Element {
  const [choices, setChoices] = useState<Choice[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [pendingResult, setPendingResult] = useState<boolean | null>(null)

  // Rebuild choices whenever the card changes
  useEffect(() => {
    const pool = allCards.filter(c => c.id !== card.id && c.back.trim() !== card.back.trim())
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    const distractors = shuffled.slice(0, 3).map(c => ({ text: c.back, isCorrect: false }))
    const all: Choice[] = [{ text: card.back, isCorrect: true }, ...distractors]
    setChoices(all.sort(() => Math.random() - 0.5))
    setSelectedIdx(null)
    setAnswered(false)
    setPendingResult(null)
  }, [card.id])

  const handleSelect = useCallback(
    (idx: number) => {
      if (answered || choices.length === 0) return
      setSelectedIdx(idx)
      setAnswered(true)
      setPendingResult(choices[idx].isCorrect)
    },
    [answered, choices]
  )

  const handleNext = useCallback(() => {
    if (pendingResult !== null) onResult(pendingResult)
  }, [pendingResult, onResult])

  // Keyboard: 1–4 to select, Enter/Space after answering to advance, S to skip
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (answered) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleNext()
        }
        return
      }
      const num = parseInt(e.key)
      if (num >= 1 && num <= choices.length) {
        handleSelect(num - 1)
      } else if ((e.key === 's' || e.key === 'S') && onSkip) {
        onSkip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answered, choices.length, handleSelect, handleNext, onSkip])

  const correctIdx = choices.findIndex(c => c.isCorrect)
  const wasCorrect = selectedIdx !== null && choices[selectedIdx]?.isCorrect

  function choiceClass(idx: number): string {
    const base =
      'w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-150 flex items-center gap-3'
    if (!answered) {
      return `${base} border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 cursor-pointer`
    }
    if (idx === correctIdx) {
      return `${base} border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 cursor-default`
    }
    if (idx === selectedIdx) {
      return `${base} border-red-400 bg-red-50 dark:bg-red-900/30 cursor-default`
    }
    return `${base} border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-50 cursor-default`
  }

  function letterClass(idx: number): string {
    const base = 'w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-xs font-bold border'
    if (!answered) {
      return `${base} border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400`
    }
    if (idx === correctIdx) {
      return `${base} border-emerald-500 bg-emerald-500 text-white`
    }
    if (idx === selectedIdx) {
      return `${base} border-red-400 bg-red-400 text-white`
    }
    return `${base} border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-400`
  }

  function textClass(idx: number): string {
    const base = 'flex-1 text-sm font-medium'
    if (!answered) return `${base} text-slate-700 dark:text-slate-300`
    if (idx === correctIdx) return `${base} text-emerald-700 dark:text-emerald-300`
    if (idx === selectedIdx) return `${base} text-red-600 dark:text-red-400`
    return `${base} text-slate-400 dark:text-slate-500`
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5 text-xs">
        <span className="text-slate-400 dark:text-slate-500 font-medium">
          {cardNumber} / {totalCards}
        </span>
        <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full font-medium tracking-wide">
          Multiple Choice
        </span>
      </div>

      {/* Question */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 mb-5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-3">
          Question
        </span>
        <p className="text-xl font-semibold text-slate-900 dark:text-slate-50 leading-relaxed">
          <LatexText>{card.front}</LatexText>
        </p>
      </div>

      {/* Choices */}
      <div className="space-y-3 mb-4">
        {choices.map((choice, idx) => (
          <button
            key={idx}
            className={choiceClass(idx)}
            onClick={() => handleSelect(idx)}
            disabled={answered}
          >
            <span className={letterClass(idx)}>
              {answered && idx === correctIdx
                ? '✓'
                : answered && idx === selectedIdx
                  ? '✗'
                  : LETTERS[idx]}
            </span>
            <span className={textClass(idx)}>
              <LatexText>{choice.text}</LatexText>
            </span>
          </button>
        ))}
      </div>

      {/* Result bar + Next button */}
      {answered ? (
        <div
          className={`rounded-xl px-5 py-3.5 flex items-center justify-between border ${
            wasCorrect
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}
        >
          <span
            className={`text-sm font-semibold flex items-center gap-2 ${
              wasCorrect
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <span className="text-base">{wasCorrect ? '✓' : '✗'}</span>
            {wasCorrect ? 'Correct!' : 'Incorrect'}
          </span>
          <button
            onClick={handleNext}
            autoFocus
            className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            Next →
          </button>
        </div>
      ) : (
        onSkip && (
          <div className="text-center">
            <button
              onClick={onSkip}
              className="text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Skip
            </button>
          </div>
        )
      )}

      {/* Keyboard hint */}
      {!answered && (
        <p className="text-center text-xs text-slate-300 dark:text-slate-600 mt-4">
          Press <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded text-slate-400 dark:text-slate-500">1</kbd>–
          <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded text-slate-400 dark:text-slate-500">{choices.length}</kbd> to select
        </p>
      )}
    </div>
  )
}
