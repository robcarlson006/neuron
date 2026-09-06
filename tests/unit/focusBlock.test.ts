import { useAppStore, FocusBlockItem } from '../../src/store/appStore'

describe('Focus Block Store & Guided Timer', () => {
  const mockItems: FocusBlockItem[] = [
    {
      id: 1,
      user_id: 1,
      subject_id: 10,
      subject_name: 'Macroeconomics',
      plan_date: '2026-09-04',
      suggested_action: 'Review 14 Due Cards',
      learning_objective: 'Reinforce memory retention',
      action_type: 'flashcards',
      estimated_minutes: 15,
      priority: 1,
      is_completed: 0,
      created_at: '2026-09-04 10:00:00'
    },
    {
      id: 2,
      user_id: 1,
      subject_id: 10,
      subject_name: 'Macroeconomics',
      plan_date: '2026-09-04',
      suggested_action: 'Targeted Socratic Drill: Monetary Policy',
      learning_objective: 'Work through misconceptions on interest rates',
      target_topic: 'Monetary Policy',
      action_type: 'tutor_drill',
      estimated_minutes: 20,
      priority: 2,
      is_completed: 0,
      created_at: '2026-09-04 10:00:00'
    }
  ]

  beforeEach(() => {
    useAppStore.getState().endFocusBlock()
  })

  test('startFocusBlock initializes the sprint with step 1 timer', () => {
    const store = useAppStore.getState()
    store.startFocusBlock(mockItems, 0)

    const state = useAppStore.getState().focusBlock
    expect(state).not.toBeNull()
    expect(state?.items.length).toBe(2)
    expect(state?.activeIndex).toBe(0)
    expect(state?.remainingSeconds).toBe(15 * 60)
    expect(state?.isRunning).toBe(true)
    expect(state?.isPaused).toBe(false)
    expect(state?.showTimeUpModal).toBe(false)
  })

  test('tickFocusBlock counts down and triggers time up modal at 0', () => {
    const store = useAppStore.getState()
    store.startFocusBlock(mockItems, 0)

    // Manually set remaining seconds to 1
    useAppStore.setState({
      focusBlock: {
        ...useAppStore.getState().focusBlock!,
        remainingSeconds: 1
      }
    })

    // Tick 1 second -> reaches 0
    useAppStore.getState().tickFocusBlock()

    const state = useAppStore.getState().focusBlock
    expect(state?.remainingSeconds).toBe(0)
    expect(state?.isOvertime).toBe(true)
    expect(state?.showTimeUpModal).toBe(true)
  })

  test('extendFocusBlock adds extra minutes and dismisses modal', () => {
    const store = useAppStore.getState()
    store.startFocusBlock(mockItems, 0)

    useAppStore.setState({
      focusBlock: {
        ...useAppStore.getState().focusBlock!,
        remainingSeconds: 0,
        showTimeUpModal: true,
        isOvertime: true
      }
    })

    // Extend by 1 minute
    store.extendFocusBlock(1)

    const state = useAppStore.getState().focusBlock
    expect(state?.remainingSeconds).toBe(60)
    expect(state?.showTimeUpModal).toBe(false)
    expect(state?.isOvertime).toBe(false)
  })

  test('nextFocusBlockStep advances to the next task in the sprint', () => {
    const store = useAppStore.getState()
    store.startFocusBlock(mockItems, 0)

    store.nextFocusBlockStep()

    const state = useAppStore.getState().focusBlock
    expect(state?.activeIndex).toBe(1)
    expect(state?.remainingSeconds).toBe(20 * 60)
    expect(state?.showTimeUpModal).toBe(false)
  })

  test('nextFocusBlockStep on the final task finishes the Focus Block', () => {
    const store = useAppStore.getState()
    store.startFocusBlock(mockItems, 1)

    store.nextFocusBlockStep()

    const state = useAppStore.getState().focusBlock
    expect(state).toBeNull()
  })

  test('endFocusBlock clears state cleanly', () => {
    const store = useAppStore.getState()
    store.startFocusBlock(mockItems, 0)
    expect(useAppStore.getState().focusBlock).not.toBeNull()

    store.endFocusBlock()
    expect(useAppStore.getState().focusBlock).toBeNull()
  })
})
