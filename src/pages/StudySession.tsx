import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import FlashCard from '../components/FlashCard'
import ActiveRecallCard from '../components/ActiveRecallCard'
import MultipleChoiceCard from '../components/MultipleChoiceCard'
import type { Card, CardSchedule, SessionSummary } from '../types'

interface StudyCard extends Card {
  interval: number
  repetitions: number
  ease_factor: number
  due_date: string
  last_reviewed_at?: string
}

type EmptyReason = 'no-cards' | 'new-cards' | 'all-caught-up'

export default function StudySession(): React.JSX.Element {
  const { subjectId } = useParams<{ subjectId?: string }>()
  const [searchParams] = useSearchParams()
  const isMCMode = searchParams.get('mode') === 'mc'
  const typeFilter = searchParams.get('type') as 'flashcard' | 'active_recall' | null
  const { user } = useAppStore()
  const navigate = useNavigate()

  const [cards, setCards] = useState<StudyCard[]>([])
  const [allCards, setAllCards] = useState<StudyCard[]>([]) // full pool for MC distractors
  const [skippedCards, setSkippedCards] = useState<StudyCard[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const cardStartTimeRef = useRef<number>(Date.now())
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<'studying' | 'skipped' | 'done'>('studying')
  const [emptyReason, setEmptyReason] = useState<EmptyReason>('no-cards')
  const [summary, setSummary] = useState<SessionSummary>({
    total: 0,
    correct: 0,
    incorrect: 0,
    skipped: 0,
    cardsReviewed: []
  })

  useEffect(() => {
    if (user) loadCards()
  }, [user])

  async function loadCards(studyAll = false): Promise<void> {
    if (!user) return
    setLoading(true)
    try {
      const subjectIdNum = subjectId ? Number(subjectId) : undefined

      if (isMCMode) {
        // MC mode always uses all cards as the pool
        const all = await window.electronAPI.getAllCardsWithSchedule(user.id, subjectIdNum)
        if (all.length === 0) {
          setEmptyReason('no-cards')
          setCards([])
        } else {
          // Shuffle for MC
          const shuffled = [...all].sort(() => Math.random() - 0.5) as StudyCard[]
          setCards(shuffled)
          setAllCards(all as StudyCard[])
        }
        setSummary({ total: all.length, correct: 0, incorrect: 0, skipped: 0, cardsReviewed: [] })
        setSkippedCards([])
        setCurrentIdx(0)
        setPhase('studying')
        return
      }

      if (studyAll) {
        const all = await window.electronAPI.getAllCardsWithSchedule(user.id, subjectIdNum)
        const filtered = typeFilter ? (all as StudyCard[]).filter(c => c.type === typeFilter) : all as StudyCard[]
        setCards(filtered)
        setSummary({ total: filtered.length, correct: 0, incorrect: 0, skipped: 0, cardsReviewed: [] })
        setSkippedCards([])
        setCurrentIdx(0)
        setPhase('studying')
        return
      }

      const due = await window.electronAPI.getDueCards(user.id, subjectIdNum)
      const filteredDue = typeFilter ? (due as StudyCard[]).filter(c => c.type === typeFilter) : due as StudyCard[]

      if (filteredDue.length === 0) {
        const all = await window.electronAPI.getAllCardsWithSchedule(user.id, subjectIdNum)
        const filteredAll = typeFilter ? (all as StudyCard[]).filter(c => c.type === typeFilter) : all as StudyCard[]
        if (filteredAll.length === 0) {
          setEmptyReason('no-cards')
        } else {
          const hasNewCards = filteredAll.some((c: StudyCard) => c.repetitions === 0)
          setEmptyReason(hasNewCards ? 'new-cards' : 'all-caught-up')
        }
        setCards([])
      } else {
        setCards(filteredDue)
      }

      setSummary({ total: due.length, correct: 0, incorrect: 0, skipped: 0, cardsReviewed: [] })
    } catch (err) {
      console.error('Load cards error:', err)
    } finally {
      setLoading(false)
    }
  }

  const currentCards = phase === 'studying' ? cards : skippedCards
  const currentCard = currentCards[currentIdx]

  // Reset timer whenever the current card changes
  useEffect(() => {
    cardStartTimeRef.current = Date.now()
  }, [currentIdx, phase])

  // SM2 review — only used in normal mode
  async function processReview(quality: number): Promise<void> {
    if (!currentCard || !user) return

    const responseTimeMs = Date.now() - cardStartTimeRef.current

    const schedule: CardSchedule = {
      id: 0,
      card_id: currentCard.id,
      user_id: user.id,
      interval: currentCard.interval,
      repetitions: currentCard.repetitions,
      ease_factor: currentCard.ease_factor,
      due_date: currentCard.due_date,
      last_reviewed_at: currentCard.last_reviewed_at
    }

    await window.electronAPI.processReview({
      cardId: currentCard.id,
      userId: user.id,
      quality,
      wasCorrect: quality >= 3,
      responseTimeMs,
      currentSchedule: schedule
    })

    setSummary(prev => ({
      ...prev,
      correct: quality >= 3 ? prev.correct + 1 : prev.correct,
      incorrect: quality < 3 ? prev.incorrect + 1 : prev.incorrect,
      cardsReviewed: [...prev.cardsReviewed, {
        cardId: currentCard.id,
        quality,
        wasCorrect: quality >= 3
      }]
    }))

    advance()
  }

  // MC review — logs to mc_review_log, never touches SM2
  async function handleMCResult(wasCorrect: boolean): Promise<void> {
    if (!currentCard || !user) return

    await window.electronAPI.saveMCReview({
      cardId: currentCard.id,
      userId: user.id,
      wasCorrect
    })

    setSummary(prev => ({
      ...prev,
      correct: wasCorrect ? prev.correct + 1 : prev.correct,
      incorrect: !wasCorrect ? prev.incorrect + 1 : prev.incorrect,
      cardsReviewed: [...prev.cardsReviewed, {
        cardId: currentCard.id,
        quality: wasCorrect ? 5 : 1,
        wasCorrect
      }]
    }))

    advance()
  }

  function handleSkip(): void {
    if (!currentCard) return
    setSummary(prev => ({ ...prev, skipped: prev.skipped + 1 }))
    setSkippedCards(prev => [...prev, currentCard])
    advance()
  }

  function advance(): void {
    const nextIdx = currentIdx + 1
    const list = phase === 'studying' ? cards : skippedCards

    if (nextIdx >= list.length) {
      if (phase === 'studying' && skippedCards.length > 0) {
        setPhase('skipped')
        setCurrentIdx(0)
      } else {
        setPhase('done')
      }
    } else {
      setCurrentIdx(nextIdx)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading cards...</p>
        </div>
      </div>
    )
  }

  if (cards.length === 0) {
    if (emptyReason === 'no-cards') {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">📭</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mb-2">
              No cards yet
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Import some cards to get started studying.
            </p>
            <button
              onClick={() => navigate(subjectId ? `/subject/${subjectId}` : '/')}
              className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              {subjectId ? 'Go to Subject' : 'Back to Dashboard'}
            </button>
          </div>
        </div>
      )
    }

    if (emptyReason === 'new-cards') {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
          <div className="w-full max-w-md page-enter">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <span className="text-3xl">🧠</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mb-2">
                Cards are ready!
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                These cards are freshly imported and haven't been reviewed yet.
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-violet-200 dark:border-violet-800 shadow-sm p-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 dark:bg-violet-900/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm">⚡</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-50 text-sm mb-1">
                      Recommended: Run a Diagnostic First
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      A quick diagnostic helps Neuron understand what you already know, so it can schedule reviews more intelligently from day one — instead of treating everything as a blank slate.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(subjectId ? `/diagnostics/${subjectId}` : '/diagnostics')}
                  className="w-full mt-4 bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
                >
                  Run Diagnostic Test →
                </button>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 text-center">
                  Prefer to jump straight in?
                </p>
                <button
                  onClick={() => loadCards(true)}
                  className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Study All Cards Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // all-caught-up
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-sm page-enter">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">🎉</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mb-2">
            All caught up!
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            No cards are due right now. Your next review is scheduled and on its way.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => loadCards(true)}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Study More Anyway
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const reviewed = summary.correct + summary.incorrect
    const accuracy = reviewed > 0 ? Math.round((summary.correct / reviewed) * 100) : 0

    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md page-enter">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">
              {accuracy >= 80 ? '🏆' : accuracy >= 60 ? '👍' : '💪'}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mb-1">
              {isMCMode ? 'Practice Complete!' : 'Session Complete!'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              You answered {reviewed} question{reviewed !== 1 ? 's' : ''}
              {summary.skipped > 0 ? ` and skipped ${summary.skipped}` : ''}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-5">
            <div className="grid grid-cols-3 gap-4 text-center mb-5">
              <div className="space-y-1">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.correct}</div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Correct</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-red-500 dark:text-red-400">{summary.incorrect}</div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Incorrect</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-slate-500 dark:text-slate-400">{summary.skipped}</div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Skipped</div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-slate-500 dark:text-slate-400">Accuracy</span>
                <span className={`font-semibold ${
                  accuracy >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                  accuracy >= 60 ? 'text-amber-500' : 'text-red-500'
                }`}>{accuracy}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ${
                    accuracy >= 80 ? 'bg-emerald-500' : accuracy >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${accuracy}%` }}
                />
              </div>
            </div>

            {isMCMode && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
                Multiple choice results are tracked separately and don't affect your spaced repetition schedule.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => navigate('/')} className="btn-secondary flex-1">
              Dashboard
            </button>
            {subjectId && (
              <button onClick={() => navigate(`/subject/${subjectId}`)} className="btn-primary flex-1">
                View Subject
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const totalReviewed = summary.correct + summary.incorrect + summary.skipped
  const progressPercent = summary.total > 0 ? (totalReviewed / summary.total) * 100 : 0

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Top bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="h-0.5 bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-0.5 transition-all duration-300 ${isMCMode ? 'bg-blue-500' : 'bg-violet-500'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between px-8 py-4">
          <button
            onClick={() => navigate(subjectId ? `/subject/${subjectId}` : '/')}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Exit session
          </button>

          <div className="flex items-center gap-3 text-sm">
            {isMCMode && (
              <span className="text-blue-600 dark:text-blue-400 font-medium text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded-full border border-blue-200 dark:border-blue-800">
                Multiple Choice
              </span>
            )}
            {phase === 'skipped' && (
              <span className="text-amber-500 dark:text-amber-400 font-medium text-xs px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 rounded-full">
                Reviewing skipped
              </span>
            )}
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{summary.correct} correct</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="text-red-500 font-medium">{summary.incorrect} incorrect</span>
            {!isMCMode && (
              <>
                <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">·</span>
                <span className="text-slate-400 dark:text-slate-500 text-xs hidden sm:inline">
                  <kbd className="font-mono">Space</kbd> to flip · <kbd className="font-mono">1</kbd><kbd className="font-mono">2</kbd><kbd className="font-mono">3</kbd> to rate
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center p-8">
        {isMCMode ? (
          <MultipleChoiceCard
            card={currentCard}
            allCards={allCards}
            onResult={handleMCResult}
            onSkip={phase === 'studying' ? handleSkip : undefined}
            cardNumber={currentIdx + 1}
            totalCards={currentCards.length}
          />
        ) : currentCard.type === 'flashcard' ? (
          <FlashCard
            card={currentCard}
            onResult={processReview}
            onSkip={phase === 'studying' ? handleSkip : undefined}
            cardNumber={currentIdx + 1}
            totalCards={currentCards.length}
          />
        ) : (
          <ActiveRecallCard
            card={currentCard}
            onResult={processReview}
            onSkip={phase === 'studying' ? handleSkip : undefined}
            cardNumber={currentIdx + 1}
            totalCards={currentCards.length}
          />
        )}
      </div>
    </div>
  )
}
