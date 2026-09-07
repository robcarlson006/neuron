import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { navigateToFocusBlockItem } from '../../lib/focusBlockNav'

export default function FocusBlockTimeUpModal(): React.JSX.Element | null {
  const navigate = useNavigate()
  const {
    user,
    focusBlock,
    extendFocusBlock,
    nextFocusBlockStep,
    endFocusBlock,
    dismissFocusBlockTimeUp
  } = useAppStore()

  if (!focusBlock || !focusBlock.showTimeUpModal) {
    return null
  }

  const currentItem = focusBlock.items[focusBlock.activeIndex]
  const isLastStep = focusBlock.activeIndex >= focusBlock.items.length - 1
  const nextItem = !isLastStep ? focusBlock.items[focusBlock.activeIndex + 1] : null

  async function handleMoveOn(): Promise<void> {
    if (!focusBlock) return
    if (isLastStep) {
      endFocusBlock(true)
      navigate('/tutor')
      return
    }

    const nextIndex = focusBlock.activeIndex + 1
    const targetItem = focusBlock.items[nextIndex]
    nextFocusBlockStep()

    if (targetItem) {
      await navigateToFocusBlockItem(targetItem, navigate, user?.id)
    }
  }

  function handleReturnToHub(): void {
    endFocusBlock(true)
    navigate('/tutor')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-6 text-slate-900 dark:text-slate-100 transform animate-scale-up">
        {/* Header with icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xl font-bold flex-shrink-0">
            ⏰
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {isLastStep ? 'Focus Block Complete!' : `Time's up on Step ${focusBlock.activeIndex + 1}!`}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {currentItem?.suggested_action}
            </p>
          </div>
        </div>

        {/* Status / Next Step Preview */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3.5 mb-6 border border-slate-200/60 dark:border-slate-700">
          {isLastStep ? (
            <div className="text-center py-2">
              <span className="text-2xl mb-1 block">🎉</span>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                You completed all {focusBlock.items.length} steps in this Focus Block!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Great work staying focused. Your study progress has been recorded.
              </p>
            </div>
          ) : (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 block mb-1">
                Next Step ({nextItem?.estimated_minutes} min):
              </span>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {nextItem?.suggested_action}
              </p>
              {nextItem?.learning_objective && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Goal: {nextItem.learning_objective}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {!isLastStep ? (
            <>
              <button
                onClick={handleMoveOn}
                className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Move On to Next Step</span>
                <span>→</span>
              </button>
              <button
                onClick={handleReturnToHub}
                className="w-full py-2.5 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <span>Finish & Return to Hub</span>
                <span>✓</span>
              </button>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => extendFocusBlock(1)}
                  className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  +1 Minute
                </button>
                <button
                  onClick={() => extendFocusBlock(5)}
                  className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  +5 Minutes
                </button>
                <button
                  onClick={dismissFocusBlockTimeUp}
                  className="py-2 px-3 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-medium transition-colors"
                >
                  Stay
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={handleMoveOn}
              className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <span>Wrap Up & View Hub</span>
              <span>✓</span>
            </button>
          )}

          <button
            onClick={handleReturnToHub}
            className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors mt-1"
          >
            End Focus Block early
          </button>
        </div>
      </div>
    </div>
  )
}
