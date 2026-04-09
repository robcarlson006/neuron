import { create } from 'zustand'
import type { User, Subject, Theme } from '../types'

interface AppState {
  user: User | null
  subjects: Subject[]
  theme: Theme
  isLoading: boolean
  error: string | null
  showDemo: boolean

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
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  subjects: [],
  theme: 'light',
  isLoading: false,
  error: null,
  showDemo: false,

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
  setShowDemo: (show) => set({ showDemo: show })
}))
