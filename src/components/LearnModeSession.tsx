import React, { useState, useEffect, useRef, useCallback } from 'react'
import LatexText from './LatexText'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LCard {
  id: number
  front: string
  back: string
}

interface QueueItem {
  card: LCard
  phase: 1 | 2 // 1 = Multiple Choice, 2 = Written Answer
  uid: number  // unique per appearance in queue — forces effect re-runs
}

interface Choice {
  text: string
  isCorrect: boolean
}

interface Props {
  cards: LCard[]
  allCards: LCard[]
  storageKey: string
  onComplete: (cleared: number, total: number) => void
}

// ─── Persistence ──────────────────────────────────────────────────────────────

interface SavedProgress {
  v: 1
  clearedCount: number
  queue: Array<{ cardId: number; phase: 1 | 2 }>
}

function loadProgress(
  storageKey: string,
  cards: LCard[]
): { queue: QueueItem[]; clearedCount: number } | null {
  try {
    const raw = localStorage.getItem(`learn-progress-${storageKey}`)
    if (!raw) return null
    const saved: SavedProgress = JSON.parse(raw)
    if (saved.v !== 1) return null

    const cardMap = new Map(cards.map(c => [c.id, c]))
    const queue: QueueItem[] = []
    for (const item of saved.queue) {
      const card = cardMap.get(item.cardId)
      if (card) queue.push({ card, phase: item.phase, uid: nextUid() })
    }
    if (queue.length === 0) return null

    return { queue, clearedCount: saved.clearedCount }
  } catch {
    return null
  }
}

function saveProgress(
  storageKey: string,
  queue: QueueItem[],
  clearedCount: number
): void {
  const data: SavedProgress = {
    v: 1,
    clearedCount,
    queue: queue.map(item => ({ cardId: item.card.id, phase: item.phase })),
  }
  localStorage.setItem(`learn-progress-${storageKey}`, JSON.stringify(data))
}

function clearProgress(storageKey: string): void {
  localStorage.removeItem(`learn-progress-${storageKey}`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _uid = 0
const nextUid = () => ++_uid

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = []
  for (let i = 0; i <= m; i++) {
    dp[i] = []
    for (let j = 0; j <= n; j++) {
      if (i === 0) {
        dp[i][j] = j
      } else if (j === 0) {
        dp[i][j] = i
      } else if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }
  return dp[m][n]
}

function stringSimilarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return (max - levenshtein(a, b)) / max
}

function buildChoices(card: LCard, allCards: LCard[]): Choice[] {
  const pool = allCards.filter(
    c => c.id !== card.id && c.back.trim() !== card.back.trim()
  )
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const all: Choice[] = [
    { text: card.back, isCorrect: true },
    ...shuffled.slice(0, 3).map(c => ({ text: c.back, isCorrect: false })),
  ]
  return all.sort(() => Math.random() - 0.5)
}

const LETTERS = ['A', 'B', 'C', 'D']

// ─── Component ────────────────────────────────────────────────────────────────

export default function LearnModeSession({
  cards,
  allCards,
  storageKey,
  onComplete,
}: Props): React.JSX.Element {
  const total = cards.length

  // Queue state — restored from localStorage if available
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const saved = loadProgress(storageKey, cards)
    if (saved) return saved.queue
    return [...cards].sort(() => Math.random() - 0.5).map(card => ({ card, phase: 1 as const, uid: nextUid() }))
  })
  const [currentIdx, setCurrentIdx] = useState(0)
  const [clearedCount, setClearedCount] = useState<number>(() => {
    const saved = loadProgress(storageKey, cards)
    return saved?.clearedCount ?? 0
  })

  // MC state
  const [choices, setChoices] = useState<Choice[]>([])
  const [mcSelectedIdx, setMcSelectedIdx] = useState<number | null>(null)
  const [mcAnswered, setMcAnswered] = useState(false)

  // Written state
  const [writtenInput, setWrittenInput] = useState('')
  const [writtenAnswered, setWrittenAnswered] = useState(false)
  const [writtenResult, setWrittenResult] = useState<'correct' | 'incorrect' | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ─── Refs for keyboard handlers (avoid stale closures) ────────────────────

  const queueRef = useRef(queue)
  const currentIdxRef = useRef(currentIdx)
  const clearedCountRef = useRef(clearedCount)
  const mcAnsweredRef = useRef(mcAnswered)
  const mcResultRef = useRef<boolean | null>(null)
  const writtenAnsweredRef = useRef(writtenAnswered)
  const writtenResultRef = useRef<'correct' | 'incorrect' | null>(writtenResult)
  const writtenInputRef = useRef(writtenInput)

  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { currentIdxRef.current = currentIdx }, [currentIdx])
  useEffect(() => { clearedCountRef.current = clearedCount }, [clearedCount])
  useEffect(() => { mcAnsweredRef.current = mcAnswered }, [mcAnswered])
  useEffect(() => { writtenAnsweredRef.current = writtenAnswered }, [writtenAnswered])
  useEffect(() => { writtenResultRef.current = writtenResult }, [writtenResult])
  useEffect(() => { writtenInputRef.current = writtenInput }, [writtenInput])

  // ─── Persist progress to localStorage on every queue/cleared change ───────

  useEffect(() => {
    if (queue.length > 0) saveProgress(storageKey, queue, clearedCount)
  }, [queue, clearedCount, storageKey])

  const currentItem = queue[currentIdx] ?? null

  // ─── Init MC choices when item changes (phase 1) ──────────────────────────

  useEffect(() => {
    if (!currentItem || currentItem.phase !== 1) return
    setChoices(buildChoices(currentItem.card, allCards))
    setMcSelectedIdx(null)
    setMcAnswered(false)
    mcAnsweredRef.current = false
    mcResultRef.current = null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.uid])

  // ─── Init written state when item changes (phase 2) ───────────────────────

  useEffect(() => {
    if (!currentItem || currentItem.phase !== 2) return
    setWrittenInput('')
    setWrittenAnswered(false)
    setWrittenResult(null)
    writtenAnsweredRef.current = false
    writtenResultRef.current = null
    writtenInputRef.current = ''
    requestAnimationFrame(() => inputRef.current?.focus())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.uid])

  // ─── Advance queue after an answer ────────────────────────────────────────

  const advance = useCallback(
    (wasCorrect: boolean) => {
      const q = [...queueRef.current]
      const idx = currentIdxRef.current
      const item = q[idx]
      if (!item) return

      q.splice(idx, 1) // Remove current item

      let newCleared = clearedCountRef.current

      if (item.phase === 1) {
        // Phase 1: always re-insert (promoted or retried)
        const insertAt = Math.min(idx + 3, q.length)
        q.splice(insertAt, 0, {
          card: item.card,
          phase: wasCorrect ? 2 : 1,
          uid: nextUid(),
        })
      } else {
        // Phase 2
        if (wasCorrect) {
          // Card is cleared — do not re-insert
          newCleared += 1
          setClearedCount(newCleared)
          clearedCountRef.current = newCleared
        } else {
          // Demote back to phase 1
          const insertAt = Math.min(idx + 4, q.length)
          q.splice(insertAt, 0, { card: item.card, phase: 1, uid: nextUid() })
        }
      }

      queueRef.current = q

      if (q.length === 0) {
        clearProgress(storageKey)
        setQueue(q)
        onComplete(newCleared, total)
        return
      }

      setQueue(q)
      if (idx >= q.length) {
        currentIdxRef.current = 0
        setCurrentIdx(0)
      }
      // else currentIdx stays — next item slides into the same position
    },
    [total, onComplete, storageKey]
  )

  // ─── Overturn (override incorrect written answer as correct) ──────────────

  const handleOverturn = useCallback(() => {
    if (!writtenAnsweredRef.current) return
    const q = [...queueRef.current]
    const idx = currentIdxRef.current
    const item = q[idx]
    if (!item || item.phase !== 2) return

    q.splice(idx, 1)
    const newCleared = clearedCountRef.current + 1
    setClearedCount(newCleared)
    clearedCountRef.current = newCleared
    queueRef.current = q

    if (q.length === 0) {
      clearProgress(storageKey)
      setQueue(q)
      onComplete(newCleared, total)
      return
    }

    setQueue(q)
    if (idx >= q.length) {
      currentIdxRef.current = 0
      setCurrentIdx(0)
    }
    // State reset is handled by the uid-keyed useEffect above
  }, [total, onComplete, storageKey])

  // ─── MC handlers ──────────────────────────────────────────────────────────

  const handleMCSelect = useCallback(
    (idx: number) => {
      if (mcAnsweredRef.current || choices.length === 0) return
      const correct = choices[idx]?.isCorrect ?? false
      setMcSelectedIdx(idx)
      setMcAnswered(true)
      mcAnsweredRef.current = true
      mcResultRef.current = correct
    },
    [choices]
  )

  const handleMCNext = useCallback(() => {
    if (!mcAnsweredRef.current || mcResultRef.current === null) return
    advance(mcResultRef.current)
  }, [advance])

  // ─── Written handlers ─────────────────────────────────────────────────────

  const handleWrittenSubmit = useCallback(() => {
    if (writtenAnsweredRef.current) return
    const item = queueRef.current[currentIdxRef.current]
    if (!item || item.phase !== 2) return

    const user = writtenInputRef.current.trim().toLowerCase()
    const correct = item.card.back.trim().toLowerCase()

    let result: 'correct' | 'spelling' | 'incorrect'
    if (user === correct) {
      result = 'correct'
    } else {
      result = stringSimilarity(user, correct) >= 0.85 ? 'correct' : 'incorrect'
    }

    setWrittenResult(result)
    setWrittenAnswered(true)
    writtenAnsweredRef.current = true
    writtenResultRef.current = result
  }, [])

  const handleWrittenNext = useCallback(() => {
    if (!writtenAnsweredRef.current || writtenResultRef.current === null) return
    const wasCorrect = writtenResultRef.current === 'correct'
    advance(wasCorrect)
  }, [advance])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const item = queueRef.current[currentIdxRef.current]
      if (!item) return

      if (item.phase === 1) {
        if (mcAnsweredRef.current) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleMCNext()
          }
        } else {
          const n = parseInt(e.key)
          if (n >= 1 && n <= 4) handleMCSelect(n - 1)
        }
      } else if (writtenAnsweredRef.current) {
        // Skip if this is the same keydown event that just triggered the submit
        // (textarea onKeyDown fires first, sets writtenAnsweredRef.current = true,
        // then this global handler fires on the same event)
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'TEXTAREA') return
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          handleWrittenNext()
        } else if (e.key === '0') {
          e.preventDefault()
          handleOverturn()
        }
      }
      // Written input (not yet answered) is handled by the textarea's onKeyDown
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleMCNext, handleMCSelect, handleWrittenNext, handleOverturn])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!currentItem) return <></>

  const progressPercent = total > 0 ? (clearedCount / total) * 100 : 0
  const correctChoiceIdx = choices.findIndex(c => c.isCorrect)
  const mcWasCorrect =
    mcSelectedIdx !== null && (choices[mcSelectedIdx]?.isCorrect ?? false)

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 text-xs">
        <span className="text-slate-400 dark:text-slate-500 font-medium">
          {clearedCount} / {total} cleared
        </span>
        <span className="px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full font-medium tracking-wide">
          Learn Mode
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mb-6">
        <div
          className="h-1.5 bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Phase indicator */}
      <div className="text-center mb-3">
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${
            currentItem.phase === 1
              ? 'text-blue-500 dark:text-blue-400'
              : 'text-amber-500 dark:text-amber-400'
          }`}
        >
          {currentItem.phase === 1 ? 'Step 1 · Multiple Choice' : 'Step 2 · Written Answer'}
        </span>
      </div>

      {/* Question */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 mb-5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-3">
          Question
        </span>
        <p className="text-xl font-semibold text-slate-900 dark:text-slate-50 leading-relaxed">
          <LatexText>{currentItem.card.front}</LatexText>
        </p>
      </div>

      {/* ── MC Phase ─────────────────────────────────────────────────── */}
      {currentItem.phase === 1 && (
        <>
          <div className="space-y-3 mb-4">
            {choices.map((choice, idx) => {
              const isCorrectChoice = idx === correctChoiceIdx
              const isSelected = idx === mcSelectedIdx

              let btnCls =
                'w-full text-left px-5 py-4 rounded-xl border-2 transition-all duration-150 flex items-center gap-3'
              let letterCls =
                'w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-xs font-bold border'
              let textCls = 'flex-1 text-sm font-medium'

              if (!mcAnswered) {
                btnCls +=
                  ' border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 cursor-pointer'
                letterCls +=
                  ' border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                textCls += ' text-slate-700 dark:text-slate-300'
              } else if (isCorrectChoice) {
                btnCls += ' border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 cursor-default'
                letterCls += ' border-emerald-500 bg-emerald-500 text-white'
                textCls += ' text-emerald-700 dark:text-emerald-300'
              } else if (isSelected) {
                btnCls += ' border-red-400 bg-red-50 dark:bg-red-900/30 cursor-default'
                letterCls += ' border-red-400 bg-red-400 text-white'
                textCls += ' text-red-600 dark:text-red-400'
              } else {
                btnCls +=
                  ' border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-40 cursor-default'
                letterCls +=
                  ' border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-400'
                textCls += ' text-slate-400 dark:text-slate-500'
              }

              return (
                <button
                  key={idx}
                  className={btnCls}
                  onClick={() => handleMCSelect(idx)}
                  disabled={mcAnswered}
                >
                  <span className={letterCls}>
                    {mcAnswered && isCorrectChoice
                      ? '✓'
                      : mcAnswered && isSelected
                        ? '✗'
                        : LETTERS[idx]}
                  </span>
                  <span className={textCls}>
                    <LatexText>{choice.text}</LatexText>
                  </span>
                </button>
              )
            })}
          </div>

          {mcAnswered ? (
            <div
              className={`rounded-xl px-5 py-3.5 flex items-center justify-between border ${
                mcWasCorrect
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}
            >
              <span
                className={`text-sm font-semibold flex items-center gap-2 ${
                  mcWasCorrect
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                <span className="text-base">{mcWasCorrect ? '✓' : '✗'}</span>
                {mcWasCorrect ? 'Correct! Now try writing it.' : "Not quite — we'll revisit this."}
              </span>
              <button
                onClick={handleMCNext}
                autoFocus
                className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
              >
                Next →
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-slate-300 dark:text-slate-600 mt-4">
              Press{' '}
              <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded text-slate-400 dark:text-slate-500">
                1
              </kbd>
              –
              <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded text-slate-400 dark:text-slate-500">
                {choices.length}
              </kbd>{' '}
              to select
            </p>
          )}
        </>
      )}

      {/* ── Written Phase ─────────────────────────────────────────────── */}
      {currentItem.phase === 2 && (
        <>
          <div className="mb-4">
            <textarea
              ref={inputRef}
              value={writtenInput}
              onChange={e => {
                setWrittenInput(e.target.value)
                writtenInputRef.current = e.target.value
              }}
              disabled={writtenAnswered}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!writtenAnswered) handleWrittenSubmit()
                }
              }}
              placeholder="Type your answer…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 placeholder-slate-400 dark:placeholder-slate-500 text-sm resize-none focus:outline-none focus:border-violet-400 dark:focus:border-violet-500 transition-colors disabled:opacity-60"
            />

            {!writtenAnswered && (
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">
                    Enter
                  </kbd>{' '}
                  to submit ·{' '}
                  <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">
                    Shift+Enter
                  </kbd>{' '}
                  for new line
                </p>
                <button
                  onClick={handleWrittenSubmit}
                  className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Submit
                </button>
              </div>
            )}
          </div>

          {writtenAnswered && writtenResult && (
            <>
              <div
                className={`rounded-xl px-5 py-4 border ${
                  writtenResult === 'correct'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold mb-1 ${
                        writtenResult === 'correct'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {writtenResult === 'correct' && '✓ Correct!'}
                      {writtenResult === 'incorrect' && '✗ Incorrect'}
                    </p>

                    {writtenResult === 'incorrect' && (
                      <div className="mt-1.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">
                          Correct answer:
                        </span>
                        <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 font-medium leading-relaxed">
                          <LatexText>{currentItem.card.back}</LatexText>
                        </p>
                      </div>
                    )}

                  </div>

                  <button
                    onClick={handleWrittenNext}
                    autoFocus
                    className="flex-shrink-0 bg-violet-600 hover:bg-violet-700 text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    Continue →
                  </button>
                </div>
              </div>

              {/* Overturn button — only shown when marked incorrect */}
              {writtenResult === 'incorrect' && (
                <div className="flex items-center justify-center mt-3">
                  <button
                    onClick={handleOverturn}
                    className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  >
                    <span>↩</span>
                    Override: I was correct
                    <kbd className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-400 dark:text-slate-500 ml-1">
                      0
                    </kbd>
                  </button>
                </div>
              )}

              {/* Keyboard hint after answering */}
              <p className="text-center text-xs text-slate-300 dark:text-slate-600 mt-3">
                <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">
                  Enter
                </kbd>{' '}
                to continue
                {writtenResult === 'incorrect' && (
                  <>
                    {' '}·{' '}
                    <kbd className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">
                      0
                    </kbd>{' '}
                    to override
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
