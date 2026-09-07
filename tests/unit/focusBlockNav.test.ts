import { navigateToFocusBlockItem } from '../../src/lib/focusBlockNav'
import type { FocusBlockItem } from '../../src/types'

describe('focusBlockNav', () => {
  const navigateMock = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    delete (window as any).electronAPI
  })

  test('navigates to study route for flashcards', async () => {
    const item: FocusBlockItem = {
      id: 1,
      user_id: 1,
      subject_id: 42,
      subject_name: 'Biology',
      plan_date: '2026-09-06',
      suggested_action: 'Review flashcards',
      action_type: 'flashcards',
      estimated_minutes: 15,
      priority: 1,
      is_completed: 0,
      created_at: '2026-09-06 10:00:00'
    }

    await navigateToFocusBlockItem(item, navigateMock)
    expect(navigateMock).toHaveBeenCalledWith('/study/42')
  })

  test('navigates to subject route for syllabus_read', async () => {
    const item: FocusBlockItem = {
      id: 2,
      user_id: 1,
      subject_id: 42,
      subject_name: 'Biology',
      plan_date: '2026-09-06',
      suggested_action: 'Read chapter 3',
      action_type: 'syllabus_read',
      estimated_minutes: 20,
      priority: 2,
      is_completed: 0,
      created_at: '2026-09-06 10:00:00'
    }

    await navigateToFocusBlockItem(item, navigateMock)
    expect(navigateMock).toHaveBeenCalledWith('/subject/42')
  })

  test('navigates to tutor route with config for tutor_drill', async () => {
    const item: FocusBlockItem = {
      id: 3,
      user_id: 1,
      subject_id: 42,
      subject_name: 'Biology',
      plan_date: '2026-09-06',
      suggested_action: 'Cellular Respiration drill',
      action_type: 'tutor_drill',
      target_topic: 'Cellular Respiration',
      estimated_minutes: 25,
      priority: 1,
      is_completed: 0,
      created_at: '2026-09-06 10:00:00'
    }

    await navigateToFocusBlockItem(item, navigateMock)
    expect(navigateMock).toHaveBeenCalledTimes(1)
    const callArg = navigateMock.mock.calls[0][0] as string
    expect(callArg.startsWith('/tutor/42?config=')).toBe(true)
    const configParam = new URLSearchParams(callArg.split('?')[1]).get('config')
    expect(configParam).not.toBeNull()
    const parsed = JSON.parse(configParam!)
    expect(parsed.duration_minutes).toBe(25)
    expect(parsed.depth_level).toBe(3)
    expect(parsed.target_topic).toBe('Cellular Respiration')
  })

  test('adapts depth level based on concept mastery when available', async () => {
    ;(window as any).electronAPI = {
      getConceptMastery: jest.fn().mockResolvedValue([
        { concept: 'Cellular Respiration', mastery_prob: 0.85 }
      ])
    }

    const item: FocusBlockItem = {
      id: 4,
      user_id: 1,
      subject_id: 42,
      subject_name: 'Biology',
      plan_date: '2026-09-06',
      suggested_action: 'Cellular Respiration drill',
      action_type: 'tutor_drill',
      target_topic: 'Cellular Respiration',
      estimated_minutes: 20,
      priority: 1,
      is_completed: 0,
      created_at: '2026-09-06 10:00:00'
    }

    await navigateToFocusBlockItem(item, navigateMock, 1)
    const callArg = navigateMock.mock.calls[0][0] as string
    const configParam = new URLSearchParams(callArg.split('?')[1]).get('config')
    const parsed = JSON.parse(configParam!)
    expect(parsed.depth_level).toBe(5)
  })
})
