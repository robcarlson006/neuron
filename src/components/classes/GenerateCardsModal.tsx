import React, { useState, useEffect, useCallback } from 'react'
import type { SyllabusModule, ModuleTopic, ModuleCardGenType, ModuleCardGenOptions } from '../../types'
import { CARD_GEN_PRESETS } from '../../types'

interface GenerateCardsModalProps {
  isOpen: boolean
  module: SyllabusModule & { topics?: ModuleTopic[] }
  subjectName?: string
  isGenerating?: boolean
  onClose: () => void
  onGenerate: (options: ModuleCardGenOptions) => void
}

export default function GenerateCardsModal({
  isOpen,
  module,
  subjectName,
  isGenerating = false,
  onClose,
  onGenerate
}: GenerateCardsModalProps): React.JSX.Element | null {
  const [selectedType, setSelectedType] = useState<ModuleCardGenType>('flashcard')
  const [cardCount, setCardCount] = useState<number>(15)

  // Reset state when modal opens for a new module
  useEffect(() => {
    if (isOpen) {
      setSelectedType('flashcard')
      setCardCount(15)
    }
  }, [isOpen, module.id])

  // Handle keyboard shortcuts (Escape to close, Enter to submit)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || isGenerating) return
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target instanceof HTMLButtonElement)) {
        handleConfirm()
      }
    },
    [isOpen, isGenerating, onClose, selectedType, cardCount]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  function handleConfirm(): void {
    if (isGenerating) return

    const finalCount = Math.max(1, cardCount)

    onGenerate({
      type: selectedType,
      count: finalCount
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-cards-modal-title"
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all transform animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                  {module.chapter_number ? `Chapter ${module.chapter_number}` : 'Curriculum Module'}
                </span>
                {subjectName && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[180px]">
                    {subjectName}
                  </span>
                )}
              </div>
              <h2
                id="generate-cards-modal-title"
                className="text-lg font-bold text-slate-900 dark:text-white line-clamp-1"
              >
                {module.title}
              </h2>
              {module.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {module.description}
                </p>
              )}
            </div>

            <button
              onClick={onClose}
              disabled={isGenerating}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              aria-label="Close dialog"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Card Type Selection */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              1. Choose Card Format
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Flashcards */}
              <button
                type="button"
                onClick={() => setSelectedType('flashcard')}
                disabled={isGenerating}
                className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                  selectedType === 'flashcard'
                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className="text-xl">🃏</span>
                  {selectedType === 'flashcard' && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400"></span>
                  )}
                </div>
                <span className="text-sm font-semibold mb-0.5">Flashcards</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Atomic recall, definitions & cloze deletions
                </span>
              </button>

              {/* Active Recall */}
              <button
                type="button"
                onClick={() => setSelectedType('active_recall')}
                disabled={isGenerating}
                className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                  selectedType === 'active_recall'
                    ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <span className="text-xl">🧠</span>
                  {selectedType === 'active_recall' && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                  )}
                </div>
                <span className="text-sm font-semibold mb-0.5">Active Recall</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Why/How questions, mechanisms & reasoning
                </span>
              </button>
            </div>
          </div>

            {/* Quantity Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  2. How many cards do you want?
                </label>
                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  {cardCount} {selectedType === 'active_recall' ? 'Questions' : 'Cards'}
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-2">
                {CARD_GEN_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCardCount(preset)}
                    disabled={isGenerating}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      cardCount === preset
                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Slider & Stepper */}
              <div className="pt-2 flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={Math.max(100, cardCount)}
                  step={1}
                  value={cardCount}
                  onChange={e => setCardCount(Math.max(1, Number(e.target.value)))}
                  disabled={isGenerating}
                  className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCardCount(prev => Math.max(1, prev - 1))}
                    disabled={isGenerating || cardCount <= 1}
                    className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 text-xs font-bold"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={cardCount}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val)) setCardCount(Math.max(1, val))
                      else if (e.target.value === '') setCardCount(1)
                    }}
                    disabled={isGenerating}
                    className="w-14 text-center text-xs font-semibold bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCardCount(prev => prev + 1)}
                    disabled={isGenerating}
                    className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
          </div>

          {/* Cognitive Science & Deduplication Badges */}
          <div className="space-y-2 pt-1">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100/80 dark:border-indigo-900/40">
              <span className="text-sm">🛡️</span>
              <div className="text-xs leading-relaxed text-indigo-950 dark:text-indigo-200">
                <span className="font-semibold">AI Deduplication Active:</span> Automatically checks your existing deck to guarantee no duplicate questions or cards are created.
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50">
              <span className="text-sm">🧠</span>
              <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-800 dark:text-slate-200">Evidence-Based Learning:</span> Engineered using the Minimum Information Principle, Elaborative Interrogation, and Concept Discrimination.
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isGenerating}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:from-indigo-700 active:to-indigo-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Generating {cardCount} Cards...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>
                  Generate {cardCount} {selectedType === 'active_recall' ? 'Questions' : 'Cards'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
