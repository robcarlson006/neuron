import React, { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
      <polygon points="1,0.5 8.5,5 1,9.5" />
    </svg>
  )
}

function PauseIcon(): React.JSX.Element {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
      <rect x="0.5" y="0.5" width="2.5" height="9" rx="1" />
      <rect x="6" y="0.5" width="2.5" height="9" rx="1" />
    </svg>
  )
}

function ResetIcon(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 6A4.5 4.5 0 1 0 3 2.8" />
      <polyline points="1.5,0.5 1.5,3 4,3" fill="currentColor" stroke="none" />
      <path d="M1.5 0.5 L1.5 3 L4 3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export default function PomodoroWidget(): React.JSX.Element | null {
  const {
    pomodoroEnabled,
    pomodoroPhase,
    pomodoroRunning,
    pomodoroStartedAt,
    pomodoroSecondsTotal,
    pomodoroPausedSecondsLeft,
    pomodoroWorkMinutes,
    pausePomodoro,
    resumePomodoro,
    completePomodoroPhase,
    startBreak,
    startWorkAfterBreak,
    resetPomodoro,
    startPomodoro
  } = useAppStore()

  // Force re-render each tick for live countdown display
  const [, setTick] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    completedRef.current = false

    if (pomodoroRunning) {
      intervalRef.current = setInterval(() => {
        setTick(t => t + 1)
        const left = getSecondsLeft()
        if (left <= 0 && !completedRef.current) {
          completedRef.current = true
          completePomodoroPhase()
        }
      }, 250)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [pomodoroRunning, pomodoroStartedAt])

  if (!pomodoroEnabled) return null

  function getSecondsLeft(): number {
    if (pomodoroRunning && pomodoroStartedAt !== null) {
      const elapsed = Math.floor((Date.now() - pomodoroStartedAt) / 1000)
      return Math.max(0, pomodoroSecondsTotal - elapsed)
    }
    return pomodoroPausedSecondsLeft ?? pomodoroSecondsTotal
  }

  const secondsLeft = getSecondsLeft()

  function handlePlayPause(): void {
    if (pomodoroRunning) {
      pausePomodoro(secondsLeft)
    } else {
      resumePomodoro()
    }
  }

  // ── Idle ─────────────────────────────────────────────────────────────────
  if (pomodoroPhase === 'idle') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
        <span className="text-sm leading-none">🍅</span>
        <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
          {formatTime(pomodoroWorkMinutes * 60)}
        </span>
        <button
          onClick={startPomodoro}
          className="w-5 h-5 flex items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/60 transition-colors"
          title="Start Pomodoro"
        >
          <PlayIcon />
        </button>
      </div>
    )
  }

  // ── Work or Break — active (running or paused) ───────────────────────────
  if (pomodoroPhase === 'work' || pomodoroPhase === 'break') {
    const isWork = pomodoroPhase === 'work'
    const borderColor = isWork
      ? 'border-violet-200 dark:border-violet-800'
      : 'border-emerald-200 dark:border-emerald-800'
    const timeColor = isWork
      ? 'text-violet-700 dark:text-violet-300'
      : 'text-emerald-700 dark:text-emerald-300'
    const btnColor = isWork
      ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/60'
      : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'

    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border ${borderColor} shadow-sm flex-shrink-0`}>
        <span className="text-sm leading-none">{isWork ? '🍅' : '☕'}</span>
        <span className={`font-mono text-xs font-semibold tabular-nums ${timeColor} min-w-[38px]`}>
          {formatTime(secondsLeft)}
        </span>
        <button
          onClick={handlePlayPause}
          className={`w-5 h-5 flex items-center justify-center rounded-full transition-colors ${btnColor}`}
          title={pomodoroRunning ? 'Pause' : 'Resume'}
        >
          {pomodoroRunning ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          onClick={resetPomodoro}
          className="w-5 h-5 flex items-center justify-center rounded text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
          title="Reset"
        >
          <ResetIcon />
        </button>
      </div>
    )
  }

  // ── Work done — prompt to start break ────────────────────────────────────
  if (pomodoroPhase === 'work-done') {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 shadow-sm animate-pulse-soft flex-shrink-0">
        <span className="text-sm leading-none">☕</span>
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
          Break time!
        </span>
        <button
          onClick={startBreak}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
        >
          Start <PlayIcon />
        </button>
        <button
          onClick={resetPomodoro}
          className="text-emerald-400 dark:text-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          title="Reset"
        >
          <ResetIcon />
        </button>
      </div>
    )
  }

  // ── Break done — prompt to start next work session ────────────────────────
  if (pomodoroPhase === 'break-done') {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 shadow-sm animate-pulse-soft flex-shrink-0">
        <span className="text-sm leading-none">🍅</span>
        <span className="text-xs font-medium text-violet-700 dark:text-violet-300 whitespace-nowrap">
          Work time!
        </span>
        <button
          onClick={startWorkAfterBreak}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors"
        >
          Start <PlayIcon />
        </button>
        <button
          onClick={resetPomodoro}
          className="text-violet-400 dark:text-violet-600 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          title="Reset"
        >
          <ResetIcon />
        </button>
      </div>
    )
  }

  return null
}
