import { buildFocusBlockPrompt } from '../../electron/ipc/tutorHandlers'

describe('buildFocusBlockPrompt with Calendar Context', () => {
  test('injects post-event lock-in directives when context is post_event', () => {
    const prompt = buildFocusBlockPrompt({
      availableMinutes: 30,
      subjectBriefs: 'Class: Macroeconomics (id: 1)\n- Due Flashcards: 5\n- Recorded Struggles/Weaknesses: Fiscal Policy',
      completedText: '',
      contextType: 'post_event',
      eventTitle: 'ECON 201 Lecture',
      subjectName: 'Macroeconomics',
      subjectId: 1,
      lectureTopic: 'IS-LM Model & Fiscal Multipliers'
    })

    expect(prompt).toContain('POST-LECTURE CONCEPT LOCK-IN SPRINT')
    expect(prompt).toContain('IS-LM Model & Fiscal Multipliers')
    expect(prompt).toContain('Free Recall')
    expect(prompt).toContain('Socratic')
    expect(prompt).toContain('30 MINUTES TOTAL')
  })

  test('injects pre-event primer directives when context is pre_event', () => {
    const prompt = buildFocusBlockPrompt({
      availableMinutes: 15,
      subjectBriefs: 'Class: Organic Chemistry (id: 2)\n- Due Flashcards: 8',
      completedText: '',
      contextType: 'pre_event',
      eventTitle: 'CHEM 220 Seminar',
      subjectName: 'Organic Chemistry',
      subjectId: 2
    })

    expect(prompt).toContain('PRE-CLASS PRIMER')
    expect(prompt).toContain('Organic Chemistry')
    expect(prompt).toContain('CHEM 220 Seminar')
    expect(prompt).toContain('15 MINUTES TOTAL')
  })

  test('builds standard prompt when no calendar context is provided', () => {
    const prompt = buildFocusBlockPrompt({
      availableMinutes: 45,
      subjectBriefs: 'Class: Physics (id: 3)\n- Due Flashcards: 2',
      completedText: ''
    })

    expect(prompt).not.toContain('POST-LECTURE CONCEPT LOCK-IN')
    expect(prompt).not.toContain('PRE-CLASS PRIMER')
    expect(prompt).toContain('45 MINUTES TOTAL')
  })
})
