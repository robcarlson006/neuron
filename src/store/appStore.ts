import { create } from 'zustand'
import type { User, Subject, Theme } from '../types'

export type PomodoroPhase = 'idle' | 'work' | 'work-done' | 'break' | 'break-done'

interface AppState {
  user: User | null
  subjects: Subject[]
  theme: Theme
  isLoading: boolean
  error: string | null
  showDemo: boolean

  // Pomodoro settings (persisted to localStorage)
  pomodoroEnabled: boolean
  pomodoroWorkMinutes: number
  pomodoroBreakMinutes: number

  // Pomodoro runtime state
  pomodoroPhase: PomodoroPhase
  pomodoroRunning: boolean
  pomodoroStartedAt: number | null  // ms timestamp when current run began
  pomodoroSecondsTotal: number      // total seconds for the current run
  pomodoroPausedSecondsLeft: number | null  // seconds remaining when paused

  // Actions
  setUser: (user: User | null) => void
  setSubjects: (subjects: Subject[]) => void
  setTheme: (theme: Theme) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  toggleTheme: () => void
  updateSubject: (subject: Subject) => void
  removeSubject: (subjectId: number) => void
  addSubject: (subject: Subject) => void
  setShowDemo: (show: boolean) => void

  // Pomodoro actions
  setPomodoroEnabled: (enabled: boolean) => void
  setPomodoroSettings: (workMinutes: number, breakMinutes: number) => void
  startPomodoro: () => void
  resumePomodoro: () => void
  pausePomodoro: (secondsLeft: number) => void
  completePomodoroPhase: () => void
  startBreak: () => void
  startWorkAfterBreak: () => void
  resetPomodoro: () => void
}

function loadPomodoroSettings(): { enabled: boolean; workMinutes: number; breakMinutes: number } {
  try {
    const enabled = localStorage.getItem('pomodoro_enabled') === 'true'
    const work = parseInt(localStorage.getItem('pomodoro_work') || '25', 10)
    const brk = parseInt(localStorage.getItem('pomodoro_break') || '5', 10)
    return {
      enabled,
      workMinutes: isNaN(work) || work < 1 ? 25 : Math.min(work, 60),
      breakMinutes: isNaN(brk) || brk < 1 ? 5 : Math.min(brk, 15)
    }
  } catch {
    return { enabled: false, workMinutes: 25, breakMinutes: 5 }
  }
}

export const useAppStore = create<AppState>((set, get) => {
  const pom = loadPomodoroSettings()

  return {
    user: null,
    subjects: [],
    theme: 'light',
    isLoading: false,
    error: null,
    showDemo: false,

    // Pomodoro settings
    pomodoroEnabled: pom.enabled,
    pomodoroWorkMinutes: pom.workMinutes,
    pomodoroBreakMinutes: pom.breakMinutes,

    // Pomodoro runtime
    pomodoroPhase: 'idle',
    pomodoroRunning: false,
    pomodoroStartedAt: null,
    pomodoroSecondsTotal: pom.workMinutes * 60,
    pomodoroPausedSecondsLeft: null,

    setUser: (user) => set({ user }),
    setSubjects: (subjects) => set({ subjects }),
    setTheme: (theme) => {
      set({ theme })
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    },
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    toggleTheme: () =>
      set((state) => {
        const newTheme: Theme = state.theme === 'light' ? 'dark' : 'light'
        if (newTheme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        return { theme: newTheme }
      }),
    updateSubject: (subject) =>
      set((state) => ({
        subjects: state.subjects.map((s) => (s.id === subject.id ? subject : s))
      })),
    removeSubject: (subjectId) =>
      set((state) => ({
        subjects: state.subjects.filter((s) => s.id !== subjectId)
      })),
    addSubject: (subject) =>
      set((state) => ({
        subjects: [subject, ...state.subjects]
      })),
    setShowDemo: (show) => set({ showDemo: show }),

    // Pomodoro actions
    setPomodoroEnabled: (enabled) => {
      try { localStorage.setItem('pomodoro_enabled', String(enabled)) } catch {}
      set({ pomodoroEnabled: enabled })
    },
    setPomodoroSettings: (workMinutes, breakMinutes) => {
      try {
        localStorage.setItem('pomodoro_work', String(workMinutes))
        localStorage.setItem('pomodoro_break', String(breakMinutes))
      } catch {}
      set((state) => ({
        pomodoroWorkMinutes: workMinutes,
        pomodoroBreakMinutes: breakMinutes,
        // Reset total seconds only if currently idle so idle display updates
        pomodoroSecondsTotal:
          state.pomodoroPhase === 'idle' ? workMinutes * 60 : state.pomodoroSecondsTotal
      }))
    },
    startPomodoro: () => {
      const { pomodoroWorkMinutes } = get()
      set({
        pomodoroPhase: 'work',
        pomodoroRunning: true,
        pomodoroStartedAt: Date.now(),
        pomodoroSecondsTotal: pomodoroWorkMinutes * 60,
        pomodoroPausedSecondsLeft: null
      })
    },
    resumePomodoro: () => {
      const { pomodoroPausedSecondsLeft, pomodoroSecondsTotal } = get()
      const remaining = pomodoroPausedSecondsLeft ?? pomodoroSecondsTotal
      set({
        pomodoroRunning: true,
        pomodoroStartedAt: Date.now(),
        pomodoroSecondsTotal: remaining,
        pomodoroPausedSecondsLeft: null
      })
    },
    pausePomodoro: (secondsLeft) => {
      set({ pomodoroRunning: false, pomodoroPausedSecondsLeft: secondsLeft })
    },
    completePomodoroPhase: () => {
      set((state) => {
        if (!state.pomodoroRunning) return {}
        return {
          pomodoroPhase: state.pomodoroPhase === 'work' ? 'work-done' : 'break-done',
          pomodoroRunning: false,
          pomodoroStartedAt: null,
          pomodoroPausedSecondsLeft: null
        }
      })
    },
    startBreak: () => {
      const { pomodoroBreakMinutes } = get()
      set({
        pomodoroPhase: 'break',
        pomodoroRunning: true,
        pomodoroStartedAt: Date.now(),
        pomodoroSecondsTotal: pomodoroBreakMinutes * 60,
        pomodoroPausedSecondsLeft: null
      })
    },
    startWorkAfterBreak: () => {
      const { pomodoroWorkMinutes } = get()
      set({
        pomodoroPhase: 'work',
        pomodoroRunning: true,
        pomodoroStartedAt: Date.now(),
        pomodoroSecondsTotal: pomodoroWorkMinutes * 60,
        pomodoroPausedSecondsLeft: null
      })
    },
    resetPomodoro: () => {
      const { pomodoroWorkMinutes } = get()
      set({
        pomodoroPhase: 'idle',
        pomodoroRunning: false,
        pomodoroStartedAt: null,
        pomodoroSecondsTotal: pomodoroWorkMinutes * 60,
        pomodoroPausedSecondsLeft: null
      })
    }
  }
})
