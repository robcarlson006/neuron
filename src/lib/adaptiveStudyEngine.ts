import type { Card } from '../types'

export type AdaptiveStudyPreference = 'adaptive' | 'flashcard' | 'active_recall'

export interface StudyCardInput extends Card {
  interval?: number
  stability?: number | null
  difficulty?: number | null
  ease_factor?: number
  repetitions?: number
  lapses?: number | null
  state?: number | null
  last_reviewed_at?: string
}

export interface AdaptiveModalityResult {
  modality: 'flashcard' | 'active_recall' | 'cloze'
  rationale: string
  isElevated: boolean
}

/**
 * Determines whether a card should be presented in Active Recall (typed answer)
 * or Flashcard (flip & rate) mode based on cognitive mastery and session state.
 */
export function determineCardStudyModality(
  card: StudyCardInput,
  preference: AdaptiveStudyPreference = 'adaptive',
  sessionLapseIds: Set<number> = new Set(),
  manualOverrides: Map<number, 'flashcard' | 'active_recall'> = new Map()
): AdaptiveModalityResult {
  // Cloze deletion cards are always presented with cloze interaction
  if (card.type === 'cloze') {
    return {
      modality: 'cloze',
      rationale: 'Cloze deletion fill-in-the-blank prompt',
      isElevated: false
    }
  }

  // Honor in-session manual override if user explicitly flipped the mode for this card
  const override = manualOverrides.get(card.id)
  if (override) {
    return {
      modality: override,
      rationale: 'Manually chosen for this review',
      isElevated: override === 'active_recall'
    }
  }

  // User-enforced preferences
  if (preference === 'flashcard') {
    return {
      modality: 'flashcard',
      rationale: 'Fixed flashcard study mode active',
      isElevated: false
    }
  }

  if (preference === 'active_recall') {
    return {
      modality: 'active_recall',
      rationale: 'Fixed active recall mode active',
      isElevated: true
    }
  }

  // ── Adaptive Decision Logic ────────────────────────────────────────────────

  // 1. In-session lapse escalation: card was forgotten earlier in the current session
  if (sessionLapseIds.has(card.id)) {
    return {
      modality: 'active_recall',
      rationale: 'Struggled earlier in session — typed recall reinforces retrieval pathways',
      isElevated: true
    }
  }

  const stability = card.stability ?? (card.interval && card.interval > 0 ? card.interval : 0)
  const repetitions = card.repetitions ?? 0
  const easeFactor = card.ease_factor ?? 2.5
  const lapses = card.lapses ?? 0

  // 2. Fresh / unlearned cards with zero repetitions: active recall creates stronger initial encoding
  if (repetitions === 0) {
    return {
      modality: 'active_recall',
      rationale: 'New or unmastered concept — typed recall builds foundational retrieval',
      isElevated: true
    }
  }

  // 3. Low stability / high lapse count: prevent passive recognition illusion
  if (lapses > 1 || (card.stability !== undefined && card.stability !== null && card.stability < 3) || easeFactor < 1.9) {
    return {
      modality: 'active_recall',
      rationale: 'Challenging concept — open-ended response solidifies understanding',
      isElevated: true
    }
  }

  // 4. Mastered or high stability cards: rapid flip mode maximizes velocity
  if (stability >= 14 || (card.interval && card.interval >= 21)) {
    return {
      modality: 'flashcard',
      rationale: 'Mastered card — rapid flip review optimizes study speed',
      isElevated: false
    }
  }

  // 5. Default based on original card type if in intermediate stability (4 - 13 days)
  if (card.type === 'active_recall') {
    return {
      modality: 'active_recall',
      rationale: 'Author-designated active recall exercise',
      isElevated: true
    }
  }

  return {
    modality: 'flashcard',
    rationale: 'Stable retention — standard flip review',
    isElevated: false
  }
}
