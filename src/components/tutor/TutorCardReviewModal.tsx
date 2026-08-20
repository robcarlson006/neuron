import React, { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { parseCardsFromText } from '../../lib/cardParser'
import type { ParsedCard } from '../../types'

interface TutorCardReviewModalProps {
  sessionId: number
  subjectId: number
  sessionContent: string
  onSaved: (count: number) => void
  onClose: () => void
}

export default function TutorCardReviewModal({
  sessionId,
  subjectId,
  sessionContent,
  onSaved,
  onClose
}: TutorCardReviewModalProps): React.JSX.Element {
  const { user, addToast } = useAppStore()
  const [generating, setGenerating] = useState(true)
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([])
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [duplicateFlags, setDuplicateFlags] = useState<boolean[]>([])
  const [saving, setSaving] = useState(false)

  // Generate cards on mount
  useEffect(() => {
    generateCards()
  }, [])

  async function generateCards(): Promise<void> {
    setGenerating(true)
    try {
      const result = await window.electronAPI.tutorGenerateCards(sessionId, subjectId, sessionContent) as string
      const parsed = parseCardsFromText(result)
      setParsedCards(parsed)
      // Select all by default
      setSelectedCards(new Set(parsed.map((_, i) => i)))

      // Check duplicates
      if (parsed.length > 0) {
        const dupes = await window.electronAPI.tutorCheckDuplicates(
          subjectId,
          parsed.map(c => ({ front: c.front, back: c.back }))
        ) as { isDuplicate: boolean }[]
        setDuplicateFlags(dupes.map(d => d.isDuplicate))
      }
    } catch (err) {
      console.error('Card generation error:', err)
      addToast({ type: 'error', title: 'Card Generation Failed', message: 'Could not generate cards from this session.' })
    } finally {
      setGenerating(false)
    }
  }

  function toggleCard(index: number): void {
    setSelectedCards(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function toggleAll(): void {
    if (selectedCards.size === parsedCards.length) {
      setSelectedCards(new Set())
    } else {
      setSelectedCards(new Set(parsedCards.map((_, i) => i)))
    }
  }

  async function handleSave(): Promise<void> {
    if (!user) return
    setSaving(true)
    try {
      const toSave = parsedCards
        .filter((_, i) => selectedCards.has(i))
        .map(c => ({
          subject_id: subjectId,
          type: c.type,
          front: c.front,
          back: c.back,
          is_manual: 0,
          source: 'tutor' as const
        }))

      if (toSave.length > 0) {
        const result = await window.electronAPI.saveManyCards(toSave, user.id)
        const count = Array.isArray(result) ? result.length : 0
        addToast({ type: 'success', title: 'Cards Saved!', message: `${count} cards added to your card bank.` })
        onSaved(count)
      } else {
        addToast({ type: 'info', title: 'No Cards Selected', message: 'Select at least one card to save.' })
        setSaving(false)
      }
    } catch (err) {
      console.error('Save cards error:', err)
      addToast({ type: 'error', title: 'Save Failed', message: 'Could not save cards.' })
      setSaving(false)
    }
  }

  const flashcardCount = parsedCards.filter(c => c.type === 'flashcard').length
  const recallCount = parsedCards.filter(c => c.type === 'active_recall').length

  // Loading state
  if (generating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg p-8 text-center" onClick={e => e.stopPropagation()}>
          <span className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin inline-block mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Generating study cards from your session...</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">The AI is creating flashcards and active recall questions.</p>
        </div>
      </div>
    )
  }

  // Empty state
  if (parsedCards.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg p-8 text-center" onClick={e => e.stopPropagation()}>
          <div className="text-4xl mb-3">🃏</div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-2">No Cards Generated</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">The AI couldn't generate cards from this session. Try regenerating or go back.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={generateCards} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">Try Again</button>
            <button onClick={onClose} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">Done</button>
          </div>
        </div>
      </div>
    )
  }

  // Main card review
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Review Generated Cards</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
            <span>{parsedCards.length} cards generated</span>
            {flashcardCount > 0 && <span>{flashcardCount} flashcards</span>}
            {recallCount > 0 && <span>{recallCount} active recall</span>}
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>{selectedCards.size} selected</span>
          </div>
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {parsedCards.map((card, index) => {
            const isDuplicate = duplicateFlags[index]
            const isSelected = selectedCards.has(index)

            return (
              <div
                key={index}
                className={`rounded-xl border transition-colors ${
                  isSelected
                    ? 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                } ${isDuplicate ? 'opacity-60' : ''}`}
              >
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleCard(index)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isSelected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </button>

                    {/* Card content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          card.type === 'flashcard'
                            ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        }`}>
                          {card.type === 'flashcard' ? 'FC' : 'AR'}
                        </span>
                        {isDuplicate && (
                          <span className="text-[10px] text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">Possible duplicate</span>
                        )}
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                            {card.front}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                            {card.back}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            onClick={toggleAll}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {selectedCards.size === parsedCards.length ? 'Deselect All' : 'Select All'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={generateCards}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors"
            >
              Regenerate
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleSave}
              disabled={selectedCards.size === 0 || saving}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white disabled:text-slate-400 rounded-xl text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : `Save ${selectedCards.size} Card${selectedCards.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
