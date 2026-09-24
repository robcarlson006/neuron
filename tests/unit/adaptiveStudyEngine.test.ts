import {
  determineCardStudyModality,
  type StudyCardInput
} from '../../src/lib/adaptiveStudyEngine'

describe('Unified Hybrid Adaptive Study Engine', () => {
  const baseCard: StudyCardInput = {
    id: 1,
    subject_id: 1,
    type: 'flashcard',
    front: 'What is Mitochondria?',
    back: 'Powerhouse of the cell',
    is_manual: 0,
    created_at: '2026-05-01'
  }

  it('always retains cloze deletion cards in cloze modality', () => {
    const clozeCard: StudyCardInput = { ...baseCard, type: 'cloze' }
    const res = determineCardStudyModality(clozeCard, 'adaptive')
    expect(res.modality).toBe('cloze')
  })

  it('escalates fresh or zero-repetition cards to active recall in adaptive mode', () => {
    const newCard: StudyCardInput = { ...baseCard, repetitions: 0, stability: 0 }
    const res = determineCardStudyModality(newCard, 'adaptive')
    expect(res.modality).toBe('active_recall')
    expect(res.isElevated).toBe(true)
    expect(res.rationale).toContain('New or unmastered concept')
  })

  it('escalates struggling cards with low stability or multiple lapses', () => {
    const strugglingCard: StudyCardInput = {
      ...baseCard,
      repetitions: 3,
      stability: 2,
      lapses: 2,
      ease_factor: 1.8
    }
    const res = determineCardStudyModality(strugglingCard, 'adaptive')
    expect(res.modality).toBe('active_recall')
    expect(res.isElevated).toBe(true)
  })

  it('serves mastered cards in flashcard mode to maximize review velocity', () => {
    const masteredCard: StudyCardInput = {
      ...baseCard,
      repetitions: 6,
      stability: 25,
      interval: 30,
      ease_factor: 2.6,
      lapses: 0
    }
    const res = determineCardStudyModality(masteredCard, 'adaptive')
    expect(res.modality).toBe('flashcard')
    expect(res.isElevated).toBe(false)
    expect(res.rationale).toContain('Mastered card')
  })

  it('escalates cards that failed earlier in the current study session', () => {
    const lapsedInSessionCard: StudyCardInput = {
      ...baseCard,
      repetitions: 5,
      stability: 15,
      interval: 20
    }
    const lapses = new Set<number>([1])
    const res = determineCardStudyModality(lapsedInSessionCard, 'adaptive', lapses)
    expect(res.modality).toBe('active_recall')
    expect(res.isElevated).toBe(true)
    expect(res.rationale).toContain('Struggled earlier in session')
  })

  it('honors fixed mode preferences (force flashcard or force active recall)', () => {
    const card: StudyCardInput = { ...baseCard, repetitions: 0 }

    const flashRes = determineCardStudyModality(card, 'flashcard')
    expect(flashRes.modality).toBe('flashcard')

    const recallRes = determineCardStudyModality(card, 'active_recall')
    expect(recallRes.modality).toBe('active_recall')
  })

  it('honors per-card in-session manual override', () => {
    const card: StudyCardInput = { ...baseCard, repetitions: 10, stability: 40 }
    const overrides = new Map<number, 'flashcard' | 'active_recall'>([[1, 'active_recall']])

    const res = determineCardStudyModality(card, 'adaptive', new Set(), overrides)
    expect(res.modality).toBe('active_recall')
    expect(res.rationale).toContain('Manually chosen')
  })
})
