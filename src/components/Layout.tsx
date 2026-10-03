import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import StealthRecordingIndicator from './classes/StealthRecordingIndicator'
import PomodoroWidget from './PomodoroWidget'
import { useAppStore } from '../store/appStore'

export default function Layout({ onNewClass }: { onNewClass?: () => void }): React.JSX.Element {
  const [timerOpen, setTimerOpen] = useState(false)
  const { pomodoroEnabled, pomodoroRunning, pomodoroPhase, setPomodoroEnabled } = useAppStore()

  function toggleTimer(): void {
    if (!pomodoroEnabled) setPomodoroEnabled(true)
    setTimerOpen(open => !open)
  }

  const activeTimer = pomodoroRunning || pomodoroPhase === 'work-done' || pomodoroPhase === 'break-done'

  return (
    <div className="relative flex h-full w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <StealthRecordingIndicator />
      <Sidebar onNewClass={onNewClass} />
      <main className="flex-1 min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden flex flex-col">
        <div className="sticky top-0 z-30 flex min-h-[56px] items-center justify-end border-b border-slate-200/80 bg-slate-50/92 px-3 py-2 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/92 sm:px-5">
          <div className="relative flex items-center gap-1.5">
            {timerOpen && (
              <div id="global-study-timer" className="absolute right-full top-1/2 mr-1.5 flex max-w-[calc(100vw-5rem)] -translate-y-1/2 items-center rounded-xl bg-slate-50/95 dark:bg-slate-950/95">
                <PomodoroWidget />
              </div>
            )}
            <button
              type="button"
              onClick={toggleTimer}
              aria-expanded={timerOpen}
              aria-controls="global-study-timer"
              aria-label={timerOpen ? 'Close study timer' : 'Open study timer'}
              className={`group flex min-h-[32px] items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 dark:focus:ring-offset-slate-950 ${
                timerOpen || activeTimer
                  ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-200'
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span className="text-sm" aria-hidden="true">🍅</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.13em]">Study timer</span>
              <svg className={`ml-0.5 h-3.5 w-3.5 transition-transform ${timerOpen ? '-rotate-90' : 'rotate-90'}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
