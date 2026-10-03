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
  const phaseLabel = pomodoroPhase === 'break' || pomodoroPhase === 'break-done' ? 'Break' : 'Focus'

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
      <div className="flex min-h-[36px] items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none flex-shrink-0">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-50 text-sm dark:bg-violet-950/50">🍅</span>
        <span className="flex flex-col leading-tight">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Focus</span>
          <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
          {formatTime(pomodoroWorkMinutes * 60)}
          </span>
        </span>
        <button
          onClick={startPomodoro}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          title="Start Pomodoro"
          aria-label="Start focus timer"
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
      <div className={`flex min-h-[38px] items-center gap-2 rounded-xl bg-white px-2.5 py-1 shadow-sm dark:bg-slate-900 dark:shadow-none border ${borderColor} flex-shrink-0`}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${isWork ? 'bg-violet-50 dark:bg-violet-950/50' : 'bg-emerald-50 dark:bg-emerald-950/50'} text-sm`}>{isWork ? '🍅' : '☕'}</span>
        <span className="flex min-w-[58px] flex-col leading-tight">
          <span className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${timeColor} opacity-80`}>{phaseLabel}</span>
          <span className={`font-mono text-base font-semibold tabular-nums ${timeColor}`}>
            {formatTime(secondsLeft)}
          </span>
        </span>
        <button
          onClick={handlePlayPause}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${btnColor} focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900`}
          title={pomodoroRunning ? 'Pause' : 'Resume'}
          aria-label={pomodoroRunning ? 'Pause focus timer' : 'Resume focus timer'}
        >
          {pomodoroRunning ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          onClick={resetPomodoro}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          title="Reset"
          aria-label="Reset study timer"
        >
          <ResetIcon />
        </button>
      </div>
    )
  }

  // ── Work done — prompt to start break ────────────────────────────────────
  if (pomodoroPhase === 'work-done') {
    return (
      <div className="flex min-h-[36px] items-center gap-2 rounded-xl bg-emerald-50 px-2.5 py-1 border border-emerald-200 dark:bg-emerald-950/35 dark:border-emerald-800 shadow-sm animate-pulse-soft flex-shrink-0">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/70 text-sm dark:bg-emerald-900/50">☕</span>
        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">
          Break time!
        </span>
        <button
          onClick={startBreak}
          className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
          aria-label="Start break"
        >
          Start <PlayIcon />
        </button>
        <button
          onClick={resetPomodoro}
          className="text-emerald-400 dark:text-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          title="Reset"
          aria-label="Reset study timer"
        >
          <ResetIcon />
        </button>
      </div>
    )
  }

  // ── Break done — prompt to start next work session ────────────────────────
  if (pomodoroPhase === 'break-done') {
    return (
      <div className="flex min-h-[36px] items-center gap-2 rounded-xl bg-violet-50 px-2.5 py-1 border border-violet-200 dark:bg-violet-950/35 dark:border-violet-800 shadow-sm animate-pulse-soft flex-shrink-0">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/70 text-sm dark:bg-violet-900/50">🍅</span>
        <span className="text-xs font-semibold text-violet-800 dark:text-violet-200 whitespace-nowrap">
          Work time!
        </span>
        <button
          onClick={startWorkAfterBreak}
          className="flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-violet-700"
          aria-label="Start focus session"
        >
          Start <PlayIcon />
        </button>
        <button
          onClick={resetPomodoro}
          className="text-violet-400 dark:text-violet-600 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
          title="Reset"
          aria-label="Reset study timer"
        >
          <ResetIcon />
        </button>
      </div>
    )
  }

  return null
}
