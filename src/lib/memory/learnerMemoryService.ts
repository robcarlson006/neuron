import type {
  AdaptiveConceptState,
  EvidenceRef,
  LearnerMemoryStatus,
  LearnerMemoryType,
  MemoryRef,
  TutorTurnAssessment
} from '../../types'
import { defaultAdaptiveState, updateAdaptiveState, type AdaptiveEvidence } from '../adaptiveTutorEngine'

export interface MemoryDatabase {
  prepare(sql: string): {
    run(...params: unknown[]): { lastInsertRowid?: number | bigint; changes?: number }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
  transaction<T>(fn: () => T): () => T
}

export interface LearningEventInput {
  userId: number
  subjectId: number
  sessionId?: number
  messageId?: string
  concept: string
  outcome: 'correct' | 'partial' | 'incorrect' | 'unassessed'
  score?: number
  confidence?: number
  assistanceLevel?: string
  evidence?: EvidenceRef[]
}

export interface MemoryCandidateInput {
  userId: number
  subjectId: number
  memoryType: LearnerMemoryType
  memoryKey: string
  value: Record<string, unknown>
  confidence: number
  status?: LearnerMemoryStatus
  sourceSessionId?: number
  evidence?: EvidenceRef[]
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5))
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export class LearnerMemoryService {
  constructor(private readonly db: MemoryDatabase) {}

  getAdaptiveState(userId: number, subjectId: number, concept: string): AdaptiveConceptState | null {
    const row = this.db.prepare(`
      SELECT id, user_id, subject_id, concept, score, uncertainty, observations,
        correct_count, partial_count, incorrect_count, last_outcome, last_assistance,
        last_task_type, retention, misconception_risk, last_assessed_at
      FROM adaptive_concept_states
      WHERE user_id = ? AND subject_id = ? AND LOWER(concept) = LOWER(?)
      LIMIT 1
    `).get(userId, subjectId, concept) as Record<string, unknown> | undefined
    if (!row) return null
    return {
      id: Number(row.id), userId: Number(row.user_id), subjectId: Number(row.subject_id), concept: String(row.concept),
      score: Number(row.score), uncertainty: Number(row.uncertainty), observations: Number(row.observations),
      correctCount: Number(row.correct_count), partialCount: Number(row.partial_count), incorrectCount: Number(row.incorrect_count),
      lastOutcome: row.last_outcome as AdaptiveConceptState['lastOutcome'],
      lastAssistance: row.last_assistance as AdaptiveConceptState['lastAssistance'],
      lastTaskType: row.last_task_type ? String(row.last_task_type) : undefined,
      retention: row.retention == null ? undefined : Number(row.retention),
      misconceptionRisk: row.misconception_risk == null ? undefined : Number(row.misconception_risk),
      lastAssessedAt: row.last_assessed_at ? String(row.last_assessed_at) : undefined
    }
  }

  saveAdaptiveState(state: AdaptiveConceptState): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO adaptive_concept_states (
        user_id, subject_id, concept, score, uncertainty, observations, correct_count,
        partial_count, incorrect_count, last_outcome, last_assistance, last_task_type,
        retention, misconception_risk, last_assessed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, subject_id, concept) DO UPDATE SET
        score = excluded.score, uncertainty = excluded.uncertainty, observations = excluded.observations,
        correct_count = excluded.correct_count, partial_count = excluded.partial_count,
        incorrect_count = excluded.incorrect_count, last_outcome = excluded.last_outcome,
        last_assistance = excluded.last_assistance, last_task_type = excluded.last_task_type,
        retention = excluded.retention, misconception_risk = excluded.misconception_risk,
        last_assessed_at = excluded.last_assessed_at, updated_at = excluded.updated_at
    `).run(
      state.userId, state.subjectId, state.concept, state.score, state.uncertainty, state.observations,
      state.correctCount, state.partialCount, state.incorrectCount, state.lastOutcome, state.lastAssistance,
      state.lastTaskType || null, state.retention ?? null, state.misconceptionRisk ?? null,
      state.lastAssessedAt || now, now
    )
  }

  recordTutorAssessment(assessment: TutorTurnAssessment): { id: number; state: AdaptiveConceptState | null; duplicate: boolean } {
    const key = assessment.idempotencyKey || `${assessment.sessionId}:${assessment.studentMessageId || assessment.createdAt || assessment.concept}`
    const existing = this.db.prepare('SELECT id FROM tutor_turn_assessments WHERE idempotency_key = ?').get(key) as { id: number } | undefined
    if (existing) return { id: existing.id, state: null, duplicate: true }
    const now = new Date().toISOString()
    const result = this.db.prepare(`
      INSERT INTO tutor_turn_assessments (
        session_id, student_message_id, tutor_message_id, concept, outcome, score, confidence,
        assistance_level, task_type, task_difficulty, evidence_span, misconception,
        followed_scaffold, changed_goal, source_evidence_json, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assessment.sessionId, assessment.studentMessageId || null, assessment.tutorMessageId || null,
      assessment.concept.trim() || 'General', assessment.outcome, assessment.score,
      clamp(assessment.confidence), assessment.assistanceLevel || 'unassessed', assessment.taskType || null,
      assessment.taskDifficulty ?? null, assessment.evidenceSpan || null, assessment.misconception || null,
      assessment.followedScaffold == null ? null : assessment.followedScaffold ? 1 : 0,
      assessment.changedGoal == null ? null : assessment.changedGoal ? 1 : 0,
      JSON.stringify(assessment.sourceEvidence || []), key, now
    )
    const state = this.getAdaptiveStateForAssessment(assessment)
    this.recordTaskProfile(assessment)
    return { id: Number(result.lastInsertRowid || 0), state, duplicate: false }
  }

  private recordTaskProfile(assessment: TutorTurnAssessment): void {
    const session = this.db.prepare('SELECT subject_id FROM tutor_sessions WHERE id = ?').get(assessment.sessionId) as { subject_id: number | null } | undefined
    if (!session?.subject_id || !assessment.taskType) return
    const taskKey = `${assessment.concept.trim().toLowerCase()}::${assessment.taskType}`
    const initialDifficulty = assessment.taskDifficulty ?? 50
    this.db.prepare(`
      INSERT INTO tutor_task_profiles (subject_id, concept, task_type, task_key, difficulty, observations, success_count, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(subject_id, task_key) DO UPDATE SET
        difficulty = CASE
          WHEN excluded.success_count = 1 AND tutor_task_profiles.success_count = 1 THEN tutor_task_profiles.difficulty
          ELSE (tutor_task_profiles.difficulty * tutor_task_profiles.observations + excluded.difficulty) / (tutor_task_profiles.observations + 1)
        END,
        observations = tutor_task_profiles.observations + 1,
        success_count = tutor_task_profiles.success_count + excluded.success_count,
        updated_at = excluded.updated_at
    `).run(
      session.subject_id, assessment.concept.trim(), assessment.taskType, taskKey, initialDifficulty,
      assessment.outcome === 'correct' ? 1 : 0, new Date().toISOString()
    )
  }

  attachAssessmentEvidence(assessmentId: number, evidence: EvidenceRef[]): void {
    this.db.prepare('UPDATE tutor_turn_assessments SET source_evidence_json = ? WHERE id = ?')
      .run(JSON.stringify(evidence), assessmentId)
    const assessment = this.db.prepare('SELECT session_id, student_message_id FROM tutor_turn_assessments WHERE id = ?').get(assessmentId) as { session_id: number; student_message_id: string | null } | undefined
    if (assessment?.student_message_id) {
      this.db.prepare('UPDATE learning_events SET evidence_json = ? WHERE session_id = ? AND message_id = ?').run(JSON.stringify(evidence), assessment.session_id, assessment.student_message_id)
    }
  }

  private getAdaptiveStateForAssessment(assessment: TutorTurnAssessment): AdaptiveConceptState | null {
    const session = this.db.prepare('SELECT user_id, subject_id FROM tutor_sessions WHERE id = ?').get(assessment.sessionId) as { user_id: number | null; subject_id: number | null } | undefined
    if (!session?.user_id || !session.subject_id) return null
    const previous = this.getAdaptiveState(session.user_id, session.subject_id, assessment.concept)
      || defaultAdaptiveState(session.user_id, session.subject_id, assessment.concept)
    const evidence: AdaptiveEvidence = {
      outcome: assessment.outcome,
      confidence: assessment.confidence,
      assistanceLevel: assessment.assistanceLevel,
      taskType: assessment.taskType,
      taskDifficulty: assessment.taskDifficulty
    }
    const next = updateAdaptiveState(previous, evidence)
    this.saveAdaptiveState(next)
    this.recordLearningEvent({
      userId: session.user_id,
      subjectId: session.subject_id,
      sessionId: assessment.sessionId,
      messageId: assessment.studentMessageId,
      concept: assessment.concept,
      outcome: assessment.outcome,
      score: assessment.score ?? undefined,
      confidence: assessment.confidence,
      assistanceLevel: assessment.assistanceLevel,
      evidence: assessment.sourceEvidence
    })
    return next
  }

  recordLearningEvent(input: LearningEventInput): number {
    const evidence = input.evidence || []
    const result = this.db.prepare(`
      INSERT INTO learning_events (
        user_id, subject_id, session_id, message_id, concept, outcome, score,
        confidence, assistance_level, evidence_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.userId,
      input.subjectId,
      input.sessionId || null,
      input.messageId || null,
      input.concept.trim(),
      input.outcome,
      input.score ?? null,
      clamp(input.confidence ?? 0.5),
      input.assistanceLevel || 'none',
      JSON.stringify(evidence)
    )
    const eventId = Number(result.lastInsertRowid || 0)
    return eventId
  }

  upsertMemory(input: MemoryCandidateInput): number {
    const key = normalizeKey(input.memoryKey)
    const status = input.status || 'active'
    const existing = this.db.prepare(`
      SELECT id FROM learner_memory_items
      WHERE user_id = ? AND subject_id = ? AND memory_type = ? AND memory_key = ? AND status = ?
      LIMIT 1
    `).get(input.userId, input.subjectId, input.memoryType, key, status) as { id: number } | undefined

    const now = new Date().toISOString()
    let id: number
    if (existing) {
      this.db.prepare(`
        UPDATE learner_memory_items
        SET value_json = ?, confidence = ?, source_session_id = COALESCE(?, source_session_id),
            last_verified_at = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(input.value), clamp(input.confidence), input.sourceSessionId || null, now, now, existing.id)
      id = existing.id
    } else {
      const result = this.db.prepare(`
        INSERT INTO learner_memory_items (
          user_id, subject_id, memory_type, memory_key, value_json, confidence,
          status, source_session_id, last_verified_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.userId,
        input.subjectId,
        input.memoryType,
        key,
        JSON.stringify(input.value),
        clamp(input.confidence),
        status,
        input.sourceSessionId || null,
        now,
        now,
        now
      )
      id = Number(result.lastInsertRowid || 0)
    }

    if (input.evidence?.length) {
      const insertLink = this.db.prepare(`
        INSERT INTO memory_evidence_links (memory_id, material_id, chunk_index, relation)
        VALUES (?, ?, ?, 'supports')
      `)
      for (const item of input.evidence) insertLink.run(id, item.materialId, item.chunkIndex)
    }
    return id
  }

  retrieveForTurn(userId: number, subjectId: number, query: string, limit = 8): MemoryRef[] {
    const terms = normalizeKey(query).split(/[^a-z0-9]+/).filter(term => term.length >= 3)
    const rows = this.db.prepare(`
      SELECT id, memory_type, memory_key, value_json, confidence, status, updated_at, source_session_id
      FROM learner_memory_items
      WHERE user_id = ? AND subject_id = ? AND status IN ('active', 'uncertain')
      ORDER BY confidence DESC, updated_at DESC
      LIMIT 100
    `).all(userId, subjectId) as Array<{
      id: number; memory_type: LearnerMemoryType; memory_key: string; value_json: string;
      confidence: number; status: LearnerMemoryStatus; updated_at: string; source_session_id: number | null
    }>

    const memoryRefs = rows
      .map(row => {
        const haystack = `${row.memory_key} ${row.value_json}`.toLowerCase()
        const overlap = terms.filter(term => haystack.includes(term)).length
        const relevance = terms.length ? overlap / terms.length : 0
        const score = relevance * 0.65 + clamp(row.confidence) * 0.25 + (row.status === 'active' ? 0.1 : 0)
        return { row, score }
      })
      .filter(item => item.score >= 0.12)
      .sort((a, b) => b.score - a.score || b.row.updated_at.localeCompare(a.row.updated_at))
      .slice(0, Math.max(1, limit))
      .map(({ row }) => ({
        id: row.id,
        memoryType: row.memory_type,
        memoryKey: row.memory_key,
        value: JSON.parse(row.value_json || '{}') as Record<string, unknown>,
        confidence: row.confidence,
        status: row.status,
        updatedAt: row.updated_at,
        provenance: { sessionId: row.source_session_id || undefined }
      }))

    // Adaptive concept state is learner memory too, but it is kept in a
    // numeric read model so it can be updated without pretending that a
    // probability is a durable semantic fact.
    try {
      const adaptiveRows = this.db.prepare(`
        SELECT id, concept, score, uncertainty, observations, last_outcome,
          last_assistance, retention, misconception_risk, updated_at
        FROM adaptive_concept_states
        WHERE user_id = ? AND subject_id = ?
        ORDER BY updated_at DESC
        LIMIT 40
      `).all(userId, subjectId) as Array<{
        id: number; concept: string; score: number; uncertainty: number; observations: number;
        last_outcome: string; last_assistance: string; retention: number | null;
        misconception_risk: number | null; updated_at: string
      }>
      const adaptiveRefs = adaptiveRows
        .map(row => {
          const haystack = row.concept.toLowerCase()
          const overlap = terms.filter(term => haystack.includes(term)).length
          const relevance = terms.length ? overlap / terms.length : 0.05
          return { row, score: relevance * 0.7 + (1 - row.uncertainty) * 0.2 + (row.retention !== null && row.retention < 0.5 ? 0.1 : 0) }
        })
        .filter(item => !terms.length || item.score >= 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, Math.min(4, limit)))
        .map(({ row }) => ({
          id: row.id,
          memoryType: 'session_state' as const,
          memoryKey: `adaptive state: ${row.concept}`,
          value: {
            concept: row.concept,
            challengeScore: row.score,
            uncertainty: row.uncertainty,
            observations: row.observations,
            lastOutcome: row.last_outcome,
            lastAssistance: row.last_assistance,
            retention: row.retention,
            misconceptionRisk: row.misconception_risk
          },
          confidence: Math.max(0, Math.min(1, 1 - row.uncertainty)),
          status: 'active' as const,
          updatedAt: row.updated_at
        }))
      return [...adaptiveRefs, ...memoryRefs].slice(0, Math.max(1, limit))
    } catch {
      // Databases created before the adaptive migration still use the legacy
      // memory path until the next application startup applies migrations.
      return memoryRefs
    }
  }

  consolidateSession(sessionId: number): void {
    const session = this.db.prepare(`
      SELECT user_id, subject_id FROM tutor_sessions WHERE id = ?
    `).get(sessionId) as { user_id: number | null; subject_id: number } | undefined
    if (!session) return
    const userId = session.user_id || 1
    const events = this.db.prepare(`
      SELECT concept, outcome, score FROM learning_events
      WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as Array<{ concept: string; outcome: string; score: number | null }>
    const concepts = Array.from(new Set(events.map(event => event.concept).filter(Boolean)))
    const openLoops = events.filter(event => event.outcome === 'incorrect' || event.outcome === 'partial').map(event => event.concept)
    const misconceptions = this.db.prepare(`
      SELECT concept FROM student_misconceptions
      WHERE user_id = ? AND subject_id = ? AND remediation_status IN ('active', 'inoculating')
      ORDER BY occurrence_count DESC, last_observed_at DESC LIMIT 12
    `).all(userId, session.subject_id) as Array<{ concept: string }>
    const nextTargets = this.db.prepare(`
      SELECT concept FROM adaptive_concept_states
      WHERE user_id = ? AND subject_id = ? AND (score < 45 OR retention IS NOT NULL AND retention < 0.5)
      ORDER BY uncertainty ASC, updated_at ASC LIMIT 12
    `).all(userId, session.subject_id) as Array<{ concept: string }>
    const summary = concepts.length
      ? `Session covered: ${concepts.join(', ')}.`
      : 'No structured concept outcomes were recorded for this session.'
    this.db.prepare(`
      INSERT INTO session_summaries (session_id, user_id, subject_id, summary, open_loops_json, concepts_json, unresolved_misconceptions_json, next_retrieval_targets_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET summary = excluded.summary, open_loops_json = excluded.open_loops_json, concepts_json = excluded.concepts_json, unresolved_misconceptions_json = excluded.unresolved_misconceptions_json, next_retrieval_targets_json = excluded.next_retrieval_targets_json, updated_at = excluded.updated_at
    `).run(sessionId, userId, session.subject_id, summary, JSON.stringify(openLoops), JSON.stringify(concepts), JSON.stringify(misconceptions.map(item => item.concept)), JSON.stringify(nextTargets.map(item => item.concept)), new Date().toISOString())
  }

  resolveConflict(memoryId: number, resolution: 'active' | 'uncertain' | 'superseded' | 'resolved', supersedesId?: number): void {
    this.db.prepare(`
      UPDATE learner_memory_items SET status = ?, supersedes_id = COALESCE(?, supersedes_id), updated_at = ? WHERE id = ?
    `).run(resolution, supersedesId || null, new Date().toISOString(), memoryId)
  }
}
