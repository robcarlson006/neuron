export interface TutorTimerState {
  durationMinutes: number | null
  elapsedSeconds: number
  remainingSeconds: number
  isTimeUp: boolean
}

export function getTutorTimerState(
  durationMinutes: number | null,
  elapsedSeconds: number,
): Pick<TutorTimerState, 'durationMinutes' | 'remainingSeconds' | 'isTimeUp'> {
  if (durationMinutes === null) {
    return { durationMinutes: null, remainingSeconds: 0, isTimeUp: false }
  }

  const safeDuration = Math.max(1, Math.round(durationMinutes))
  const safeElapsed = Math.max(0, Math.round(elapsedSeconds))
  const remainingSeconds = Math.max(0, safeDuration * 60 - safeElapsed)

  return {
    durationMinutes: safeDuration,
    remainingSeconds,
    isTimeUp: remainingSeconds === 0,
  }
}

export function adjustTutorTimer(
  current: TutorTimerState,
  deltaMinutes: number,
): Pick<TutorTimerState, 'durationMinutes' | 'remainingSeconds' | 'isTimeUp'> {
  const baseDuration = current.durationMinutes ?? 15
  return getTutorTimerState(baseDuration + deltaMinutes, current.elapsedSeconds)
}

export function formatTutorTimer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  return `${Math.floor(safeSeconds / 60)}:${(safeSeconds % 60).toString().padStart(2, '0')}`
}
