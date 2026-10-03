import { adjustTutorTimer, formatTutorTimer, getTutorTimerState } from '../../src/lib/tutorTimer'

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
})
