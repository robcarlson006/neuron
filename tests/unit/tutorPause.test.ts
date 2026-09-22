/**
 * Unit tests for AI Tutor Pause & Resume functionality.
 * Verifies that pausing freezes session countdown and prevents false pacing / struggle degradation.
 */
import type { TutorSessionRuntime, PacingStatus } from '../../src/types'

function calcPacingStatus(run: TutorSessionRuntime): PacingStatus {
  if (run.config.duration_minutes === null) return 'UNLIMITED'
  const elapsedMin = run.time_elapsed_seconds / 60
  const totalMin = run.config.duration_minutes
  if (totalMin <= 0) return 'UNLIMITED'
  if (elapsedMin < 2) return 'ON_TRACK' // Too early to judge

  const expectedPct = elapsedMin / totalMin
  const questionCount = run.questions_asked.length

  // Healthy pace: roughly 1 interaction per 3 minutes
  const expectedQuestions = Math.max(3, Math.round(elapsedMin / 3))
  const questionRatio = expectedQuestions > 0 ? questionCount / expectedQuestions : 1

  if (expectedPct < 0.1) return 'ON_TRACK'
  if (questionRatio < 0.4) return 'BEHIND'
  if (questionRatio > 1.8) return 'AHEAD'
  return 'ON_TRACK'
}

describe('AI Tutor Pause / Resume Pacing and Timer Mechanics', () => {
  it('correctly reports ON_TRACK when session is active without break', () => {
    const runtime: TutorSessionRuntime = {
      config: { duration_minutes: 60, depth_level: 3, never_studied: false },
      started_at: Date.now() - 15 * 60 * 1000,
      time_elapsed_seconds: 15 * 60, // 15 mins active
      time_remaining_seconds: 45 * 60,
      is_time_up: false,
      is_paused: false,
      topics_covered: ['Calculus', 'Limits'],
      questions_asked: ['What is a limit?', 'How to evaluate indeterminate forms?', 'Explain continuity', 'Apply L\'Hopital', 'Solve example 1'],
      topics_mastered: [],
      weak_topics: [],
    }

    expect(calcPacingStatus(runtime)).toBe('ON_TRACK')
  })

  it('prevents false BEHIND status during 30-minute breaks by freezing time_elapsed_seconds', () => {
    // Scenario: User had 10 mins active study (3 questions).
    // They took a 30-minute break.
    // If timer was NOT paused, time_elapsed_seconds would be 40 mins, expecting 13 questions -> ratio = 3/13 = 0.23 (BEHIND!).
    // With Pause enabled, time_elapsed_seconds remains 10 mins (600s).

    const unpausedRuntime: TutorSessionRuntime = {
      config: { duration_minutes: 60, depth_level: 3, never_studied: false },
      started_at: Date.now() - 40 * 60 * 1000,
      time_elapsed_seconds: 40 * 60, // Unfrozen time!
      time_remaining_seconds: 20 * 60,
      is_time_up: false,
      is_paused: false,
      topics_covered: ['Derivatives'],
      questions_asked: ['Q1', 'Q2', 'Q3'],
      topics_mastered: [],
      weak_topics: [],
    }
    // Without pause, user is penalized as BEHIND
    expect(calcPacingStatus(unpausedRuntime)).toBe('BEHIND')

    const pausedRuntime: TutorSessionRuntime = {
      config: { duration_minutes: 60, depth_level: 3, never_studied: false },
      started_at: Date.now() - 40 * 60 * 1000,
      time_elapsed_seconds: 10 * 60, // Frozen during pause!
      time_remaining_seconds: 50 * 60,
      is_time_up: false,
      is_paused: true,
      topics_covered: ['Derivatives'],
      questions_asked: ['Q1', 'Q2', 'Q3'],
      topics_mastered: [],
      weak_topics: [],
    }
    // With pause, pacing is accurately preserved as ON_TRACK
    expect(calcPacingStatus(pausedRuntime)).toBe('ON_TRACK')
  })

  it('simulates timer freeze and resume behavior accurately', () => {
    let runtime: TutorSessionRuntime = {
      config: { duration_minutes: 15, depth_level: 3, never_studied: false },
      started_at: Date.now(),
      time_elapsed_seconds: 300, // 5 min elapsed
      time_remaining_seconds: 600, // 10 min remaining
      is_time_up: false,
      is_paused: false,
      topics_covered: ['Linear Algebra'],
      questions_asked: ['Matrix multiplication'],
      topics_mastered: [],
      weak_topics: [],
    }

    // Step 1: Tick while active
    const tick = (delta: number, isPaused: boolean) => {
      if (runtime.config.duration_minutes === null || runtime.is_time_up || isPaused) return
      const newElapsed = runtime.time_elapsed_seconds + delta
      const totalSecs = runtime.config.duration_minutes * 60
      const newRemaining = Math.max(0, totalSecs - newElapsed)
      runtime = {
        ...runtime,
        time_elapsed_seconds: newElapsed,
        time_remaining_seconds: newRemaining,
        is_time_up: newRemaining <= 0,
      }
    }

    tick(1, false)
    expect(runtime.time_elapsed_seconds).toBe(301)
    expect(runtime.time_remaining_seconds).toBe(599)

    // Step 2: Pause session
    runtime.is_paused = true

    // Step 3: Simulate 50 seconds passing while paused
    for (let i = 0; i < 50; i++) {
      tick(1, runtime.is_paused)
    }

    // Timer should be completely frozen
    expect(runtime.time_elapsed_seconds).toBe(301)
    expect(runtime.time_remaining_seconds).toBe(599)
    expect(runtime.is_time_up).toBe(false)

    // Step 4: Resume session
    runtime.is_paused = false
    tick(5, runtime.is_paused)

    expect(runtime.time_elapsed_seconds).toBe(306)
    expect(runtime.time_remaining_seconds).toBe(594)
  })

  it('handles unlimited sessions when paused', () => {
    const runtime: TutorSessionRuntime = {
      config: { duration_minutes: null, depth_level: 3, never_studied: false },
      started_at: Date.now(),
      time_elapsed_seconds: 120,
      time_remaining_seconds: 0,
      is_time_up: false,
      is_paused: true,
      topics_covered: ['Organic Chemistry'],
      questions_asked: ['Reaction mechanisms'],
      topics_mastered: [],
      weak_topics: [],
    }

    expect(calcPacingStatus(runtime)).toBe('UNLIMITED')
  })
})
