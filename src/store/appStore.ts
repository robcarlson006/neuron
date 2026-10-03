import { create } from 'zustand'
import type { User, Subject, Theme, ToastMessage, DailyPlan, CalculatorSkin } from '../types'

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

interface PersistedPomodoroState {
  phase: PomodoroPhase
  running: boolean
  startedAt: number | null
  secondsTotal: number
  pausedSecondsLeft: number | null
  savedAt: number
}

interface PersistedFocusBlockState extends ActiveFocusBlockState {
  savedAt: number
}

const POMODORO_RUNTIME_KEY = 'neuron:pomodoro-runtime'
const FOCUS_BLOCK_RUNTIME_KEY = 'neuron:focus-block-runtime'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* persistence is best effort */ }
}

function clearPersisted(key: string): void {
  try { localStorage.removeItem(key) } catch { /* persistence is best effort */ }
}

function recoverPomodoroState(settings: { workMinutes: number }): Pick<AppState, 'pomodoroPhase' | 'pomodoroRunning' | 'pomodoroStartedAt' | 'pomodoroSecondsTotal' | 'pomodoroPausedSecondsLeft'> {
  const saved = readJson<PersistedPomodoroState>(POMODORO_RUNTIME_KEY)
  if (!saved || saved.phase === 'idle') {
    return { pomodoroPhase: 'idle', pomodoroRunning: false, pomodoroStartedAt: null, pomodoroSecondsTotal: settings.workMinutes * 60, pomodoroPausedSecondsLeft: null }
  }

  if (saved.running && saved.startedAt !== null) {
    const remaining = Math.max(0, saved.secondsTotal - Math.floor((Date.now() - saved.startedAt) / 1000))
    if (remaining <= 0) {
      return { pomodoroPhase: saved.phase === 'break' ? 'break-done' : 'work-done', pomodoroRunning: false, pomodoroStartedAt: null, pomodoroSecondsTotal: saved.secondsTotal, pomodoroPausedSecondsLeft: null }
    }
    return { pomodoroPhase: saved.phase, pomodoroRunning: true, pomodoroStartedAt: saved.startedAt, pomodoroSecondsTotal: saved.secondsTotal, pomodoroPausedSecondsLeft: null }
  }

  return { pomodoroPhase: saved.phase, pomodoroRunning: false, pomodoroStartedAt: null, pomodoroSecondsTotal: saved.secondsTotal, pomodoroPausedSecondsLeft: saved.pausedSecondsLeft }
}

interface AppState {
  user: User | null
  subjects: Subject[]
  theme: Theme
  isLoading: boolean
  error: string | null
  showDemo: boolean
  calculatorSkin: CalculatorSkin

  // Focus Block runtime state
  focusBlock: ActiveFocusBlockState | null

  // Pomodoro settings (persisted to localStorage)
  pomodoroEnabled: boolean
  pomodoroWorkMinutes: number
  pomodoroBreakMinutes: number

  // Auto-grader setting (persisted to localStorage)
  autoGradeEnabled: boolean

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
  setCalculatorSkin: (skin: CalculatorSkin) => void

  // Toast notifications
  toasts: ToastMessage[]
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
  removeToast: (id: string) => void

  // Pomodoro actions
  setPomodoroEnabled: (enabled: boolean) => void
  setPomodoroSettings: (workMinutes: number, breakMinutes: number) => void

  // Auto-grader actions
  setAutoGradeEnabled: (enabled: boolean) => void
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
  const recoveredPomodoro = recoverPomodoroState(pom)
  const recoveredFocusBlock = readJson<PersistedFocusBlockState>(FOCUS_BLOCK_RUNTIME_KEY)

  return {
    user: null,
    subjects: [],
    theme: 'light',
    isLoading: false,
    error: null,
    showDemo: false,
    calculatorSkin: (() => {
      try {
        const saved = localStorage.getItem('calculator_skin')
        return saved === 'ti84' ? 'ti84' : 'numworks'
      } catch {
        return 'numworks'
      }
    })(),
    toasts: [],

    // Pomodoro settings
    pomodoroEnabled: pom.enabled,
    pomodoroWorkMinutes: pom.workMinutes,
    pomodoroBreakMinutes: pom.breakMinutes,

    // Auto-grader setting
    autoGradeEnabled: (() => {
      try { return localStorage.getItem('auto_grade_enabled') !== 'false' } catch { return true }
    })(),

    // Pomodoro runtime
    ...recoveredPomodoro,

    setUser: (user) => set({ user }),
    setSubjects: (subjects) => set({ subjects }),
    setTheme: (theme) => set({ theme }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    toggleTheme: () =>
      set((state) => ({
        theme: state.theme === 'light' ? 'dark' : 'light'
      })),
    setCalculatorSkin: (skin) => {
      try {
        localStorage.setItem('calculator_skin', skin)
      } catch {}
      set({ calculatorSkin: skin })
    },
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

    // Auto-grader actions
    setAutoGradeEnabled: (enabled) => {
      try { localStorage.setItem('auto_grade_enabled', String(enabled)) } catch {}
      set({ autoGradeEnabled: enabled })
    },

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
      const next = {
        pomodoroPhase: 'work',
        pomodoroRunning: true,
        pomodoroStartedAt: Date.now(),
        pomodoroSecondsTotal: pomodoroWorkMinutes * 60,
        pomodoroPausedSecondsLeft: null
      } as const
      writeJson(POMODORO_RUNTIME_KEY, { phase: next.pomodoroPhase, running: next.pomodoroRunning, startedAt: next.pomodoroStartedAt, secondsTotal: next.pomodoroSecondsTotal, pausedSecondsLeft: next.pomodoroPausedSecondsLeft, savedAt: Date.now() })
      set(next)
    },
    resumePomodoro: () => {
      const { pomodoroPausedSecondsLeft, pomodoroSecondsTotal } = get()
      const remaining = pomodoroPausedSecondsLeft ?? pomodoroSecondsTotal
      const next = {
        pomodoroRunning: true,
        pomodoroStartedAt: Date.now(),
        pomodoroSecondsTotal: remaining,
        pomodoroPausedSecondsLeft: null
      } as const
      writeJson(POMODORO_RUNTIME_KEY, { ...get(), ...next, phase: get().pomodoroPhase, running: next.pomodoroRunning, startedAt: next.pomodoroStartedAt, secondsTotal: next.pomodoroSecondsTotal, pausedSecondsLeft: next.pomodoroPausedSecondsLeft, savedAt: Date.now() })
      set(next)
    },
    pausePomodoro: (secondsLeft) => {
      const state = get()
      writeJson(POMODORO_RUNTIME_KEY, { phase: state.pomodoroPhase, running: false, startedAt: null, secondsTotal: state.pomodoroSecondsTotal, pausedSecondsLeft: secondsLeft, savedAt: Date.now() })
      set({ pomodoroRunning: false, pomodoroStartedAt: null, pomodoroPausedSecondsLeft: secondsLeft })
    },
    completePomodoroPhase: () => {
      set((state) => {
        if (!state.pomodoroRunning) return {}
        clearPersisted(POMODORO_RUNTIME_KEY)
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
      const next = {
        pomodoroPhase: 'break',
        pomodoroRunning: true,
        pomodoroStartedAt: Date.now(),
        pomodoroSecondsTotal: pomodoroBreakMinutes * 60,
        pomodoroPausedSecondsLeft: null
      } as const
      writeJson(POMODORO_RUNTIME_KEY, { phase: next.pomodoroPhase, running: next.pomodoroRunning, startedAt: next.pomodoroStartedAt, secondsTotal: next.pomodoroSecondsTotal, pausedSecondsLeft: next.pomodoroPausedSecondsLeft, savedAt: Date.now() })
      set(next)
    },
    startWorkAfterBreak: () => {
      const { pomodoroWorkMinutes } = get()
      const next = {
        pomodoroPhase: 'work',
        pomodoroRunning: true,
        pomodoroStartedAt: Date.now(),
        pomodoroSecondsTotal: pomodoroWorkMinutes * 60,
        pomodoroPausedSecondsLeft: null
      } as const
      writeJson(POMODORO_RUNTIME_KEY, { phase: next.pomodoroPhase, running: next.pomodoroRunning, startedAt: next.pomodoroStartedAt, secondsTotal: next.pomodoroSecondsTotal, pausedSecondsLeft: next.pomodoroPausedSecondsLeft, savedAt: Date.now() })
      set(next)
    },
    resetPomodoro: () => {
      const { pomodoroWorkMinutes } = get()
      clearPersisted(POMODORO_RUNTIME_KEY)
      set({
        pomodoroPhase: 'idle',
        pomodoroRunning: false,
        pomodoroStartedAt: null,
        pomodoroSecondsTotal: pomodoroWorkMinutes * 60,
        pomodoroPausedSecondsLeft: null
      })
    },

    // Focus Block initial state & actions
    focusBlock: recoveredFocusBlock ? { ...recoveredFocusBlock } : null,

    startFocusBlock: (items: FocusBlockItem[], startIndex = 0) => {
      if (!items || items.length === 0) return
      const validIndex = Math.max(0, Math.min(items.length - 1, startIndex))
      const current = items[validIndex]
      const totalSec = Math.max(60, (current.estimated_minutes || 20) * 60)
      const nextFocusBlock = {
        items,
        activeIndex: validIndex,
        remainingSeconds: totalSec,
        totalSeconds: totalSec,
        isRunning: true,
        isPaused: false,
        isOvertime: false,
        showTimeUpModal: false
      }
      writeJson(FOCUS_BLOCK_RUNTIME_KEY, { ...nextFocusBlock, savedAt: Date.now() })
      set({
        focusBlock: {
          ...nextFocusBlock
        }
      })
    },

    pauseFocusBlock: () => {
      set((state) => {
        if (!state.focusBlock) return {}
        const next = {
          focusBlock: {
            ...state.focusBlock,
            isPaused: true
          }
        }
        writeJson(FOCUS_BLOCK_RUNTIME_KEY, { ...next.focusBlock, savedAt: Date.now() })
        return next
      })
    },

    resumeFocusBlock: () => {
      set((state) => {
        if (!state.focusBlock) return {}
        const next = {
          focusBlock: {
            ...state.focusBlock,
            isPaused: false
          }
        }
        writeJson(FOCUS_BLOCK_RUNTIME_KEY, { ...next.focusBlock, savedAt: Date.now() })
        return next
      })
    },

    extendFocusBlock: (extraMinutes: number) => {
      set((state) => {
        if (!state.focusBlock) return {}
        const addedSeconds = extraMinutes * 60
        const newRemaining = Math.max(0, state.focusBlock.remainingSeconds) + addedSeconds
        const next = {
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
        writeJson(FOCUS_BLOCK_RUNTIME_KEY, { ...next.focusBlock, savedAt: Date.now() })
        return next
      })
    },

    tickFocusBlock: () => {
      set((state) => {
        if (!state.focusBlock || !state.focusBlock.isRunning || state.focusBlock.isPaused) {
          return {}
        }
        const nextSeconds = state.focusBlock.remainingSeconds - 1
        const justFinished = state.focusBlock.remainingSeconds > 0 && nextSeconds <= 0
        const next = {
          focusBlock: {
            ...state.focusBlock,
            remainingSeconds: nextSeconds,
            isOvertime: nextSeconds <= 0,
            showTimeUpModal: justFinished ? true : state.focusBlock.showTimeUpModal
          }
        }
        writeJson(FOCUS_BLOCK_RUNTIME_KEY, { ...next.focusBlock, savedAt: Date.now() })
        return next
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
        const nextFocusBlock = {
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
        writeJson(FOCUS_BLOCK_RUNTIME_KEY, { ...nextFocusBlock, savedAt: Date.now() })
        set({
          focusBlock: {
            ...nextFocusBlock
          }
        })
      } else {
        // Finished all steps
        clearPersisted(FOCUS_BLOCK_RUNTIME_KEY)
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
      clearPersisted(FOCUS_BLOCK_RUNTIME_KEY)
      set({ focusBlock: null })
    },

    dismissFocusBlockTimeUp: () => {
      set((state) => {
        if (!state.focusBlock) return {}
        const next = {
          focusBlock: {
            ...state.focusBlock,
            showTimeUpModal: false
          }
        }
        writeJson(FOCUS_BLOCK_RUNTIME_KEY, { ...next.focusBlock, savedAt: Date.now() })
        return next
      })
    }
  }
})
