import {
  adjustTutorTimer,
  formatTutorTimer,
  formatTutorTimerDisplay,
  getTutorTimerState,
  shouldTutorTimerTick,
} from '../../src/lib/tutorTimer'

describe('tutorTimer', () => {
  it('calculates a bounded timer from elapsed time', () => {
    expect(getTutorTimerState(10, 125)).toEqual({
      durationMinutes: 10,
      remainingSeconds: 475,
      isTimeUp: false,
    })
  })

  it('keeps unlimited sessions explicitly unlimited', () => {
    expect(getTutorTimerState(null, 500)).toEqual({
      durationMinutes: null,
      remainingSeconds: 0,
      isTimeUp: false,
    })
  })

  it('marks a duration as finished when elapsed time reaches it', () => {
    expect(getTutorTimerState(5, 301)).toEqual({
      durationMinutes: 5,
      remainingSeconds: 0,
      isTimeUp: true,
    })
  })

  it('adjusts duration without resetting elapsed time', () => {
    expect(adjustTutorTimer({
      durationMinutes: 10,
      elapsedSeconds: 125,
      remainingSeconds: 475,
      isTimeUp: false,
    }, 5)).toEqual({
      durationMinutes: 15,
      remainingSeconds: 775,
      isTimeUp: false,
    })
  })

  it('formats remaining time consistently', () => {
    expect(formatTutorTimer(0)).toBe('0:00')
    expect(formatTutorTimer(305)).toBe('5:05')
  })

  it('ticks only while a timed session is neither manually paused nor awaiting AI', () => {
    const active = { durationMinutes: 15, isTimeUp: false, isManualPaused: false, isAiResponding: false }
    expect(shouldTutorTimerTick(active)).toBe(true)
    expect(shouldTutorTimerTick({ ...active, isAiResponding: true })).toBe(false)
    expect(shouldTutorTimerTick({ ...active, isManualPaused: true })).toBe(false)
    expect(shouldTutorTimerTick({ ...active, isTimeUp: true })).toBe(false)
    expect(shouldTutorTimerTick({ ...active, durationMinutes: null })).toBe(false)
  })

  it('formats active, manually paused, and AI-responding timed sessions', () => {
    const timed = { durationMinutes: 15, remainingSeconds: 872, isTimeUp: false }
    expect(formatTutorTimerDisplay({ ...timed, isManualPaused: false, isAiResponding: false })).toBe('14:32')
    expect(formatTutorTimerDisplay({ ...timed, isManualPaused: true, isAiResponding: false })).toBe('Paused (14:32)')
    expect(formatTutorTimerDisplay({ ...timed, isManualPaused: false, isAiResponding: true })).toBe('14:32 (AI responding)')
    expect(formatTutorTimerDisplay({ ...timed, isManualPaused: true, isAiResponding: true })).toBe('Paused (14:32)')
  })

  it('formats unlimited sessions without losing pause or AI-response context', () => {
    const unlimited = { durationMinutes: null, remainingSeconds: 0, isTimeUp: false }
    expect(formatTutorTimerDisplay({ ...unlimited, isManualPaused: false, isAiResponding: false })).toBe('No limit')
    expect(formatTutorTimerDisplay({ ...unlimited, isManualPaused: true, isAiResponding: false })).toBe('Paused')
    expect(formatTutorTimerDisplay({ ...unlimited, isManualPaused: false, isAiResponding: true })).toBe('No limit (AI responding)')
  })
})
