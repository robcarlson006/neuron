import { useAppStore } from '../../src/store/appStore'
import type { Subject } from '../../src/types'

const subject = (id: number, name: string): Subject => ({
  id,
  user_id: 1,
  name,
  status: 'active',
  created_at: '2026-01-01'
})

describe('appStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      user: null,
      subjects: [],
      theme: 'light',
      isLoading: false,
      error: null,
      toasts: []
    })
  })

  describe('subject management', () => {
    it('adds a subject to the front of the list', () => {
      useAppStore.getState().addSubject(subject(1, 'History'))
      useAppStore.getState().addSubject(subject(2, 'Biology'))
      expect(useAppStore.getState().subjects.map((s) => s.name)).toEqual(['Biology', 'History'])
    })

    it('updates a subject in place', () => {
      useAppStore.getState().addSubject(subject(1, 'History'))
      useAppStore.getState().updateSubject(subject(1, 'World History'))
      expect(useAppStore.getState().subjects[0].name).toBe('World History')
    })

    it('removes a subject by id', () => {
      useAppStore.getState().addSubject(subject(1, 'History'))
      useAppStore.getState().removeSubject(1)
      expect(useAppStore.getState().subjects).toHaveLength(0)
    })
  })

  describe('theme', () => {
    it('toggles between light and dark', () => {
      expect(useAppStore.getState().theme).toBe('light')
      useAppStore.getState().toggleTheme()
      expect(useAppStore.getState().theme).toBe('dark')
      useAppStore.getState().toggleTheme()
      expect(useAppStore.getState().theme).toBe('light')
    })
  })

  describe('toasts', () => {
    it('adds and removes a toast', () => {
      const id = useAppStore.getState().addToast({ type: 'info', title: 'Hi', message: 'there' })
      // addToast returns void; find the added toast by title.
      const added = useAppStore.getState().toasts.find((t) => t.title === 'Hi')
      expect(added).toBeDefined()
      expect(added?.id).toBeTruthy()
      useAppStore.getState().removeToast(added!.id)
      expect(useAppStore.getState().toasts.find((t) => t.title === 'Hi')).toBeUndefined()
    })
  })

  describe('pomodoro state machine', () => {
    it('starts work, completes to work-done, starts break', () => {
      const s = useAppStore.getState()
      s.startPomodoro()
      expect(useAppStore.getState().pomodoroPhase).toBe('work')
      expect(useAppStore.getState().pomodoroRunning).toBe(true)

      useAppStore.getState().completePomodoroPhase()
      expect(useAppStore.getState().pomodoroPhase).toBe('work-done')
      expect(useAppStore.getState().pomodoroRunning).toBe(false)

      useAppStore.getState().startBreak()
      expect(useAppStore.getState().pomodoroPhase).toBe('break')
      expect(useAppStore.getState().pomodoroRunning).toBe(true)
    })

    it('pause and resume preserves remaining time', () => {
      useAppStore.getState().startPomodoro()
      useAppStore.getState().pausePomodoro(900)
      expect(useAppStore.getState().pomodoroRunning).toBe(false)
      expect(useAppStore.getState().pomodoroPausedSecondsLeft).toBe(900)

      useAppStore.getState().resumePomodoro()
      expect(useAppStore.getState().pomodoroRunning).toBe(true)
      expect(useAppStore.getState().pomodoroSecondsTotal).toBe(900)
    })

    it('resetPomodoro returns to idle', () => {
      useAppStore.getState().startPomodoro()
      useAppStore.getState().resetPomodoro()
      expect(useAppStore.getState().pomodoroPhase).toBe('idle')
      expect(useAppStore.getState().pomodoroRunning).toBe(false)
    })
  })
})
