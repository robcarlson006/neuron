import React, { useState, useMemo } from 'react'
import { useAppStore } from '../../store/appStore'
import { parseCardsFromText, getCardTypeLabel } from '../../lib/cardParser'

interface SaveCardsModalProps {
  subjectId: number
  messageContent: string
  messageRole: string
  onClose: () => void
  onSaved: (count: number) => void
}

export default function SaveCardsModal({
  subjectId,
  messageContent,
  onClose,
  onSaved
}: SaveCardsModalProps): React.JSX.Element {
  const { user, addToast } = useAppStore()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [selectedType, setSelectedType] = useState<'flashcard' | 'active_recall' | 'both'>('both')
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())

  const cards = useMemo(() => parseCardsFromText(messageContent), [messageContent])
  const counts = getCardTypeLabel(cards)

  const filteredCards = useMemo(() => {
    return cards.filter((_, i) => selectedCards.has(i))
  }, [cards, selectedCards])

  // Select all by default on first render
  React.useEffect(() => {
    const initial = new Set<number>()
    cards.forEach((c, i) => {
      if (selectedType === 'both' ||
        (selectedType === 'flashcard' && c.type === 'flashcard') ||
        (selectedType === 'active_recall' && c.type === 'active_recall')) {
        initial.add(i)
      }
    })
    setSelectedCards(initial)
  }, [cards.length, selectedType])

  function toggleCard(index: number): void {
    setSelectedCards(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleType(type: 'flashcard' | 'active_recall'): void {
    setSelectedCards(prev => {
      const next = new Set(prev)
      cards.forEach((c, i) => {
        if (c.type === type) {
          if (next.has(i)) next.delete(i)
          else next.add(i)
        }
      })
      return next
    })
  }

  async function handleSave(): Promise<void> {
    if (!user || filteredCards.length === 0 || saving) return
    setSaving(true)
    try {
      const cardData = filteredCards.map(c => ({
        subject_id: subjectId,
        type: c.type,
        front: c.front,
        back: c.back,
        is_manual: 1,
        source: 'chat' as const
      }))
      await window.electronAPI.saveManyCards(cardData, user.id)
      setSaved(true)
      addToast({ type: 'success', title: `Saved ${filteredCards.length} card${filteredCards.length !== 1 ? 's' : ''}!`, message: "They're ready for your next study session." })
      setTimeout(() => { onSaved(filteredCards.length) }, 1200)
    } catch (err) {
      console.error('Save cards error:', err)
      addToast({ type: 'error', title: 'Failed to save cards', message: 'Something went wrong. Try again.' })
    } finally {
      setSaving(false)
    }
  }

  if (cards.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md p-6 animate-slide-up text-center" onClick={e => e.stopPropagation()}>
          <div className="text-3xl mb-3">🤷</div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">No Cards Found</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Could not detect any flashcards or active recall questions in this message. Try asking the AI to generate study cards.
          </p>
          <button onClick={onClose} className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">Got it</button>
        </div>
      </div>
    )
  }

  if (saved) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md p-6 animate-slide-up text-center" onClick={e => e.stopPropagation()}>
          <div className="text-5xl mb-4">✅</div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-1">
            Cards Saved!
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            {filteredCards.length} card{filteredCards.length !== 1 ? 's' : ''} added to your study queue.
          </p>
          <button onClick={onClose} className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 pb-3 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Save Study Cards
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-lg">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Found {cards.length} card{cards.length !== 1 ? 's' : ''}
            {counts.flashcards > 0 && ` · ${counts.flashcards} flashcard${counts.flashcards !== 1 ? 's' : ''}`}
            {counts.recall > 0 && ` · ${counts.recall} recall question${counts.recall !== 1 ? 's' : ''}`}
          </p>

          {/* Type filter pills */}
          <div className="flex gap-1.5 mt-3">
            {(['both', 'flashcard', 'active_recall'] as const).map(t => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors border ${
                  selectedType === t
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-violet-300'
                }`}
              >
                {t === 'both' ? 'All' : t === 'flashcard' ? 'Flashcards' : 'Recall'}
              </button>
            ))}
            {(counts.flashcards > 0 && counts.recall > 0) && (
              <button
                onClick={() => toggleType('flashcard')}
                className="px-2.5 py-1 text-xs rounded-full font-medium border border-slate-200 dark:border-slate-600 text-slate-400 hover:border-violet-300 transition-colors"
              >
                Toggle FC
              </button>
            )}
          </div>
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cards.map((card, i) => {
            const isSelected = selectedCards.has(i)
            const show = selectedType === 'both' || card.type === selectedType

            if (!show) return null

            return (
              <button
                key={i}
                onClick={() => toggleCard(i)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  isSelected
                    ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700'
                    : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center text-xs font-medium ${
                    card.type === 'flashcard'
                      ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  }`}>
                    {card.type === 'flashcard' ? 'FC' : 'AR'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{card.front}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-2">{card.back}</p>
                  </div>
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-violet-600 border-violet-600'
                      : 'border-slate-300 dark:border-slate-500'
                  }`}>
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {filteredCards.length} of {cards.length} selected
            </span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={filteredCards.length === 0 || saving}
              className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white disabled:text-slate-400 rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : `Save ${filteredCards.length} Card${filteredCards.length !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
