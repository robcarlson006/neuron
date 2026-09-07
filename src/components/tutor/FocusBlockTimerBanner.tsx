import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { navigateToFocusBlockItem } from '../../lib/focusBlockNav'

export default function FocusBlockTimerBanner(): React.JSX.Element | null {
  const navigate = useNavigate()
  const {
    user,
    focusBlock,
    tickFocusBlock,
    pauseFocusBlock,
    resumeFocusBlock,
    endFocusBlock,
    nextFocusBlockStep
  } = useAppStore()

  useEffect(() => {
    if (!focusBlock?.isRunning || focusBlock?.isPaused) return

    const interval = setInterval(() => {
      tickFocusBlock()
    }, 1000)

    return () => clearInterval(interval)
  }, [focusBlock?.isRunning, focusBlock?.isPaused, tickFocusBlock])

  if (!focusBlock || !focusBlock.isRunning) {
    return null
  }

  const currentItem = focusBlock.items[focusBlock.activeIndex]
  if (!currentItem) return null

  const isNegative = focusBlock.remainingSeconds < 0
  const absSeconds = Math.abs(focusBlock.remainingSeconds)
  const mins = Math.floor(absSeconds / 60)
  const secs = absSeconds % 60
  const formattedTime = `${isNegative ? '+' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  const progressPercent = Math.min(
    100,
    Math.max(0, ((focusBlock.totalSeconds - Math.max(0, focusBlock.remainingSeconds)) / focusBlock.totalSeconds) * 100)
  )

  const isLastStep = focusBlock.activeIndex === focusBlock.items.length - 1

  async function handleNextOrFinish(): Promise<void> {
    if (!focusBlock) return
    const isTutorPage = window.location.pathname.startsWith('/tutor/') && !window.location.pathname.includes('/general')
    if (currentItem.action_type === 'tutor_drill' && isTutorPage) {
      // Prompt tutor session to show the End Session modal with flashcards option
      window.dispatchEvent(new CustomEvent('focus-block:prompt-end-session', { detail: { isLastStep } }))
      return
    }

    if (isLastStep) {
      endFocusBlock(true)
      navigate('/tutor')
    } else {
      const nextIndex = focusBlock.activeIndex + 1
      const nextItem = focusBlock.items[nextIndex]
      nextFocusBlockStep()
      if (nextItem) {
        await navigateToFocusBlockItem(nextItem, navigate, user?.id)
      }
    }
  }

  function handleEndEarly(): void {
    endFocusBlock(true)
    navigate('/tutor')
  }

  return (
    <aside aria-label="Focus block timer" className="sticky top-0 z-40 w-full flex-shrink-0 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white border-b border-violet-500/30 shadow-lg pl-20 pr-4 py-2.5 transition-all">
      <div className="w-full flex items-center justify-between gap-4">
        {/* Step info & title */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-violet-600/40 text-violet-300 border border-violet-500/40">
            Step {focusBlock.activeIndex + 1}/{focusBlock.items.length}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-violet-300 truncate">
                {currentItem.subject_name}
              </span>
              {currentItem.action_type === 'flashcards' && (
                <span className="text-[10px] text-amber-300 bg-amber-900/40 px-1.5 py-0.2 rounded font-medium border border-amber-500/30">⚡ Due Cards</span>
              )}
              {currentItem.action_type === 'tutor_drill' && (
                <span className="text-[10px] text-violet-300 bg-violet-900/40 px-1.5 py-0.2 rounded font-medium border border-violet-500/30">🎯 Weak Spot Drill</span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-100 truncate max-w-md sm:max-w-lg">
              {currentItem.suggested_action}
            </p>
          </div>
        </div>

        {/* Timer & Controls */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Progress bar */}
          <div className="hidden md:block w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isNegative ? 'bg-red-500' : 'bg-violet-500'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Time display */}
          <div className={`px-2.5 py-1 rounded-lg font-mono text-sm font-bold flex items-center gap-1 ${
            isNegative
              ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
              : 'bg-slate-800 text-violet-200 border border-slate-700'
          }`}>
            <span className="text-xs">⏱️</span>
            <span>{formattedTime}</span>
            {isNegative && <span className="text-[10px] uppercase tracking-wider font-sans">Overtime</span>}
          </div>

          {/* Play/Pause */}
          <button
            onClick={focusBlock.isPaused ? resumeFocusBlock : pauseFocusBlock}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title={focusBlock.isPaused ? 'Resume timer' : 'Pause timer'}
          >
            {focusBlock.isPaused ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M4 2.5l7 4.5-7 4.5V2.5z"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="3" y="2.5" width="2.5" height="9" rx="0.5"/><rect x="8.5" y="2.5" width="2.5" height="9" rx="0.5"/></svg>
            )}
          </button>

          {/* Next Step */}
          <button
            onClick={handleNextOrFinish}
            className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors flex items-center gap-1"
            title={isLastStep ? 'Finish Focus Block' : 'Next Step'}
          >
            {isLastStep ? 'Finish' : 'Next'}
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>

          {/* End Block early */}
          <button
            onClick={handleEndEarly}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="End Focus Block"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
