import { create } from 'zustand'
import type { User, Subject, Theme, ToastMessage, DailyPlan } from '../types'

export type PomodoroPhase = 'idle' | 'work' | 'work-done' | 'break' | 'break-done'

export type FocusBlockItem = DailyPlan & { subject_name: string }

export interface ActiveFocusBlockState {
  items: FocusBlockItem[]
  activeIndex: number
  remainingSeconds: number
  totalSeconds: number
  isRunning: boolean
  isPaused: boolean
  isOvertime: boolean
  showTimeUpModal: boolean
}

interface AppState {
  user: User | null
  subjects: Subject[]
  theme: Theme
  isLoading: boolean
  error: string | null
  showDemo: boolean

  // Focus Block runtime state
  focusBlock: ActiveFocusBlockState | null

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

  // Toast notifications
  toasts: ToastMessage[]
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
  removeToast: (id: string) => void

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

  // Focus Block actions
  startFocusBlock: (items: FocusBlockItem[], startIndex?: number) => void
  pauseFocusBlock: () => void
  resumeFocusBlock: () => void
  extendFocusBlock: (extraMinutes: number) => void
  tickFocusBlock: () => void
  nextFocusBlockStep: () => void
  endFocusBlock: (markCurrentComplete?: boolean) => void
  dismissFocusBlockTimeUp: () => void
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
    toasts: [],

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
    setTheme: (theme) => set({ theme }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    toggleTheme: () =>
      set((state) => ({
        theme: state.theme === 'light' ? 'dark' : 'light'
      })),
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

    // Toast notifications
    addToast: (toast) => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 8)
      set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
      // Auto-remove after 5 seconds
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
      }, 5000)
    },
    removeToast: (id) =>
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

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
    },

    // Focus Block initial state & actions
    focusBlock: null,

    startFocusBlock: (items: FocusBlockItem[], startIndex = 0) => {
      if (!items || items.length === 0) return
      const validIndex = Math.max(0, Math.min(items.length - 1, startIndex))
      const current = items[validIndex]
      const totalSec = Math.max(60, (current.estimated_minutes || 20) * 60)
      set({
        focusBlock: {
          items,
          activeIndex: validIndex,
          remainingSeconds: totalSec,
          totalSeconds: totalSec,
          isRunning: true,
          isPaused: false,
          isOvertime: false,
          showTimeUpModal: false
        }
      })
    },

    pauseFocusBlock: () => {
      set((state) => {
        if (!state.focusBlock) return {}
        return {
          focusBlock: {
            ...state.focusBlock,
            isPaused: true
          }
        }
      })
    },

    resumeFocusBlock: () => {
      set((state) => {
        if (!state.focusBlock) return {}
        return {
          focusBlock: {
            ...state.focusBlock,
            isPaused: false
          }
        }
      })
    },

    extendFocusBlock: (extraMinutes: number) => {
      set((state) => {
        if (!state.focusBlock) return {}
        const addedSeconds = extraMinutes * 60
        const newRemaining = Math.max(0, state.focusBlock.remainingSeconds) + addedSeconds
        return {
          focusBlock: {
            ...state.focusBlock,
            remainingSeconds: newRemaining,
            totalSeconds: state.focusBlock.totalSeconds + addedSeconds,
            isOvertime: false,
            showTimeUpModal: false,
            isPaused: false,
            isRunning: true
          }
        }
      })
    },

    tickFocusBlock: () => {
      set((state) => {
        if (!state.focusBlock || !state.focusBlock.isRunning || state.focusBlock.isPaused) {
          return {}
        }
        const nextSeconds = state.focusBlock.remainingSeconds - 1
        const justFinished = state.focusBlock.remainingSeconds > 0 && nextSeconds <= 0
        return {
          focusBlock: {
            ...state.focusBlock,
            remainingSeconds: nextSeconds,
            isOvertime: nextSeconds <= 0,
            showTimeUpModal: justFinished ? true : state.focusBlock.showTimeUpModal
          }
        }
      })
    },

    nextFocusBlockStep: () => {
      const { focusBlock } = get()
      if (!focusBlock) return
      const currentItem = focusBlock.items[focusBlock.activeIndex]
      if (currentItem && window.electronAPI?.planCompleteAction) {
        window.electronAPI.planCompleteAction(currentItem.id).catch(console.error)
      }
      const updatedItems = focusBlock.items.map((item, idx) =>
        idx === focusBlock.activeIndex ? { ...item, is_completed: 1 } : item
      )
      const nextIndex = focusBlock.activeIndex + 1
      if (nextIndex < focusBlock.items.length) {
        const nextItem = focusBlock.items[nextIndex]
        const totalSec = Math.max(60, (nextItem.estimated_minutes || 20) * 60)
        set({
          focusBlock: {
            ...focusBlock,
            items: updatedItems,
            activeIndex: nextIndex,
            remainingSeconds: totalSec,
            totalSeconds: totalSec,
            isRunning: true,
            isPaused: false,
            isOvertime: false,
            showTimeUpModal: false
          }
        })
      } else {
        // Finished all steps
        set({ focusBlock: null })
      }
    },

    endFocusBlock: (markCurrentComplete = false) => {
      const { focusBlock } = get()
      if (focusBlock && markCurrentComplete) {
        const currentItem = focusBlock.items[focusBlock.activeIndex]
        if (currentItem && window.electronAPI?.planCompleteAction) {
          window.electronAPI.planCompleteAction(currentItem.id).catch(console.error)
        }
      }
      set({ focusBlock: null })
    },

    dismissFocusBlockTimeUp: () => {
      set((state) => {
        if (!state.focusBlock) return {}
        return {
          focusBlock: {
            ...state.focusBlock,
            showTimeUpModal: false
          }
        }
      })
    }
  }
})
