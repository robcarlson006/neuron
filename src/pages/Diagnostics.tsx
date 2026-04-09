import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import type { Card, CardSchedule, DiagnosticSummary } from '../types'
import LatexText from '../components/LatexText'

interface DiagCard extends Card {
  interval: number
  repetitions: number
  ease_factor: number
  due_date: string
}

interface DiagResult {
  card: DiagCard
  quality: number   // SM-2 quality 0-5
  skipped: boolean
}

type Phase = 'loading' | 'intro' | 'question' | 'revealed' | 'results' | 'error'


// SM-2 quality mapping for the 5 diagnostic options
// Anki-style: < 3 resets the card, ≥ 3 advances it
const RATING_OPTIONS = [
  { label: "Don't know it", sublabel: 'Complete blank', quality: 0, color: 'red' },
  { label: 'Know a little', sublabel: 'Vague idea only', quality: 1, color: 'orange' },
  { label: "I'm okay at this", sublabel: 'Got it with effort', quality: 2, color: 'amber' },
  { label: 'Know it well',  sublabel: 'Got it confidently', quality: 4, color: 'emerald' },
  { label: 'Mastered',      sublabel: 'Instant recall', quality: 5, color: 'violet' },
] as const

type RatingColor = typeof RATING_OPTIONS[number]['color']

const ratingClasses: Record<RatingColor, { btn: string; active: string }> = {
  red:     { btn: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40',     active: 'bg-red-500 text-white border-red-500' },
  orange:  { btn: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-100',          active: 'bg-orange-500 text-white border-orange-500' },
  amber:   { btn: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40', active: 'bg-amber-500 text-white border-amber-500' },
  emerald: { btn: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40', active: 'bg-emerald-500 text-white border-emerald-500' },
  violet:  { btn: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/40',   active: 'bg-violet-600 text-white border-violet-600' },
}

export default function Diagnostics(): React.JSX.Element {
  const { subjectId } = useParams<{ subjectId: string }>()
  const { user, subjects } = useAppStore()
  const navigate = useNavigate()
  const subject = subjects.find(s => s.id === Number(subjectId))

  const [phase, setPhase] = useState<Phase>('loading')
  const [diagCards, setDiagCards] = useState<DiagCard[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [results, setResults] = useState<DiagResult[]>([])
  const [answer, setAnswer] = useState('')
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null)
  const [error, setError] = useState('')

  // Ref to always have latest phase + submitRating in event listener
  const handlerRef = useRef<{ phase: Phase; onRate: (q: number) => void; onReveal: () => void }>({
    phase: 'loading',
    onRate: () => {},
    onReveal: () => {}
  })

  useEffect(() => {
    if (user && subjectId) loadCards()
  }, [user, subjectId])

  // Keep a stable ref so the keydown listener (empty deps) always calls latest functions
  handlerRef.current.phase = phase
  handlerRef.current.onReveal = () => setPhase('revealed')
  // onRate will be pointed to submitRating after it's defined below

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    const { phase: p, onRate, onReveal } = handlerRef.current
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && p === 'question') {
        e.preventDefault()
        onReveal()
      }
      return
    }
    if (p === 'question' && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      onReveal()
    }
    if (p === 'revealed') {
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < RATING_OPTIONS.length) {
        e.preventDefault()
        onRate(RATING_OPTIONS[idx].quality)
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  async function loadCards(): Promise<void> {
    if (!user) return
    try {
      const allCards = await window.electronAPI.getCards(Number(subjectId)) as Card[]
      const schedules = await window.electronAPI.getAllSchedules(user.id, Number(subjectId)) as CardSchedule[]
      const scheduleMap = new Map(schedules.map(s => [s.card_id, s]))

      let combined: DiagCard[] = allCards.map(c => {
        const s = scheduleMap.get(c.id) || { interval: 1, repetitions: 0, ease_factor: 2.5, due_date: '', last_reviewed_at: undefined }
        return { ...c, ...s }
      })

      if (combined.length === 0) {
        setError('No cards found for this subject. Add cards first.')
        setPhase('error')
        return
      }

      // Weight toward weaker cards (lower ease_factor = harder)
      combined = combined.sort((a, b) => a.ease_factor - b.ease_factor)

      // Shuffle
      for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]]
      }

      setDiagCards(combined)
      setPhase('intro')
    } catch {
      setError('Failed to load cards.')
      setPhase('error')
    }
  }

  // Save a single card's review to the DB immediately (so progress is never lost on exit)
  async function saveCardReview(card: DiagCard, quality: number): Promise<void> {
    if (!user) return
    const schedule: CardSchedule = {
      id: 0,
      card_id: card.id,
      user_id: user.id,
      interval: card.interval,
      repetitions: card.repetitions,
      ease_factor: card.ease_factor,
      due_date: card.due_date
    }
    await window.electronAPI.processReview({
      cardId: card.id,
      userId: user.id,
      quality,
      wasCorrect: quality >= 3,
      currentSchedule: schedule
    })
  }

  function submitRating(quality: number): void {
    const card = diagCards[currentIdx]
    if (!card) return

    // Save immediately — progress persists even if user exits
    saveCardReview(card, quality)

    const result: DiagResult = { card, quality, skipped: false }
    const newResults = [...results, result]
    setResults(newResults)
    setAnswer('')

    if (currentIdx + 1 >= diagCards.length) {
      finalizeDiagnostics(newResults)
    } else {
      setCurrentIdx(i => i + 1)
      setPhase('question')
    }
  }
  // Point the stable keyboard ref to the latest submitRating on every render
  handlerRef.current.onRate = submitRating

  function handleSkip(): void {
    const card = diagCards[currentIdx]
    if (!card) return

    // Skipped = quality 0, saves immediately
    saveCardReview(card, 0)

    const newResults = [...results, { card, quality: 0, skipped: true }]
    setResults(newResults)
    setAnswer('')

    if (currentIdx + 1 >= diagCards.length) {
      finalizeDiagnostics(newResults)
    } else {
      setCurrentIdx(i => i + 1)
      setPhase('question')
    }
  }

  async function finalizeDiagnostics(allResults: DiagResult[]): Promise<void> {
    if (!user) return

    const strong: string[] = []
    const moderate: string[] = []
    const weak: string[] = []
    let correctCount = 0
    let incorrectCount = 0

    for (const r of allResults) {
      const label = r.card.front.slice(0, 60)
      if (r.quality >= 4) {
        strong.push(label); correctCount++
      } else if (r.quality >= 2) {
        moderate.push(label)
        if (r.quality >= 3) correctCount++; else incorrectCount++
      } else {
        weak.push(label); incorrectCount++
      }
    }

    const diagSummary: DiagnosticSummary = {
      strong, moderate, weak,
      totalCards: allResults.length,
      correctCount,
      incorrectCount
    }

    // Reviews are already saved per-card above; just save the summary record
    await window.electronAPI.saveDiagnostics({
      subject_id: Number(subjectId),
      user_id: user.id,
      summary_json: JSON.stringify(diagSummary)
    })

    setSummary(diagSummary)
    setPhase('results')
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">Diagnostic Error</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="btn-secondary">Go Back</button>
        </div>
      </div>
    )
  }

  // ── Intro ────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-md text-center page-enter">
          <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">🔬</span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Diagnostic Test
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-1 font-medium">{subject?.name}</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">
            You'll go through {diagCards.length} cards. For each one, see the question, reveal
            the answer, then rate yourself honestly. Your SM-2 review schedule will be seeded
            from your ratings.
          </p>

          {/* Rating scale preview */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6 text-left space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">Rating Scale</p>
            {RATING_OPTIONS.map((opt, i) => (
              <div key={opt.quality} className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-300 dark:text-slate-600 w-3">{i + 1}</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{opt.label}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">— {opt.sublabel}</span>
              </div>
            ))}
          </div>

          <button onClick={() => setPhase('question')} className="btn-primary w-full py-3 text-base">
            Start Diagnostic
          </button>
          <button onClick={() => navigate(-1)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Results ──────────────────────────────────────────────────────────
  if (phase === 'results' && summary) {
    const scorePercent = Math.round((summary.correctCount / summary.totalCards) * 100)
    return (
      <div className="p-8 max-w-3xl mx-auto page-enter">
        <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Diagnostic Results
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          {subject?.name} · {summary.totalCards} cards tested
        </p>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 text-center mb-5">
            <div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.correctCount}</div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mt-0.5">Correct</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500 dark:text-red-400">{summary.incorrectCount}</div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mt-0.5">Needs Work</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{scorePercent}%</div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mt-0.5">Score</div>
            </div>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${
                scorePercent >= 80 ? 'bg-emerald-500' : scorePercent >= 50 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-3">
            SM-2 schedules have been seeded from your self-ratings.
          </p>
        </div>

        <div className="space-y-4">
          {summary.strong.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-sm p-5">
              <h3 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Strong — Know it well / Mastered ({summary.strong.length})
              </h3>
              <ul className="space-y-1">
                {summary.strong.map((t, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-400">· {t}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.moderate.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-800 shadow-sm p-5">
              <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                Moderate — Okay at this ({summary.moderate.length})
              </h3>
              <ul className="space-y-1">
                {summary.moderate.map((t, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-400">· {t}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.weak.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-800 shadow-sm p-5">
              <h3 className="font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                Needs Work — Don't know / Know a little ({summary.weak.length})
              </h3>
              <ul className="space-y-1">
                {summary.weak.map((t, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-400">· {t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={() => navigate(`/subject/${subjectId}`)} className="btn-secondary flex-1">
            Back to Subject
          </button>
          <button onClick={() => navigate(`/study/${subjectId}`)} className="btn-primary flex-1">
            Start Studying
          </button>
        </div>
      </div>
    )
  }

  // ── Session (question / revealed) ────────────────────────────────────
  const card = diagCards[currentIdx]
  if (!card) return <div />

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="h-0.5 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-0.5 bg-violet-500 transition-all duration-300"
            style={{ width: `${(currentIdx / diagCards.length) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-8 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Exit
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {currentIdx + 1} / {diagCards.length}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              card.type === 'flashcard'
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
            }`}>
              {card.type === 'flashcard' ? 'Flashcard' : 'Active Recall'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-2xl space-y-5">
          {/* Question card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-3">
              Question
            </span>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-50 leading-relaxed">
              <LatexText>{card.front}</LatexText>
            </p>
          </div>

          {phase === 'question' && (
            <>
              {/* Optional answer */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-2">
                  Your Answer{' '}
                  <span className="normal-case font-normal text-slate-300 dark:text-slate-600">
                    — optional
                  </span>
                </label>
                <textarea
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors text-sm resize-none min-h-[100px]"
                  placeholder="Think it through, then reveal the answer..."
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  autoFocus
                />
              </div>

              <p className="text-xs text-slate-300 dark:text-slate-600 text-center -mt-3">
                <kbd>Space</kbd> or <kbd>Enter</kbd> to reveal · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> inside text box
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={() => setPhase('revealed')}
                  className="btn-primary flex-1 py-3"
                >
                  Reveal Answer →
                </button>
              </div>
            </>
          )}

          {phase === 'revealed' && (
            <>
              {/* User's answer if typed */}
              {answer.trim() && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-2">Your Answer</span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{answer}</p>
                </div>
              )}

              {/* Model answer */}
              <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-200 dark:border-violet-800 p-6">
                <span className="text-xs font-medium uppercase tracking-wide text-violet-500 dark:text-violet-400 block mb-2">
                  Model Answer
                </span>
                <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed"><LatexText>{card.back}</LatexText></p>
              </div>

              {/* 5-option rating */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3 text-center">
                  How well did you know this? Be honest — it affects your review schedule.
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {RATING_OPTIONS.map((opt, i) => {
                    const cls = ratingClasses[opt.color]
                    return (
                      <button
                        key={opt.quality}
                        onClick={() => submitRating(opt.quality)}
                        className={`py-3 px-2 rounded-xl border font-medium text-xs transition-colors flex flex-col items-center gap-1.5 ${cls.btn}`}
                      >
                        <span className="font-mono text-base opacity-40">{i + 1}</span>
                        <span className="font-semibold text-center leading-tight">{opt.label}</span>
                        <span className="font-normal opacity-70 text-center leading-tight">{opt.sublabel}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-2">
                  Press <kbd>1</kbd>–<kbd>5</kbd> to rate
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
