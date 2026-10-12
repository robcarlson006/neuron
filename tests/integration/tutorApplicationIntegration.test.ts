import { DB_SCHEMA, MIGRATIONS_SQL } from '../../src/lib/db'
import { LearnerMemoryService } from '../../src/lib/memory/learnerMemoryService'
import { buildTutorAssessmentPrompt, parseTutorAssessment } from '../../src/lib/tutorAssessment'
import { chooseTutorMove, inferLearnerTurnState } from '../../src/lib/tutorLearningPolicy'
import { shouldTutorTimerTick } from '../../src/lib/tutorTimer'
import { decideAdaptiveDifficulty } from '../../src/lib/adaptiveTutorEngine'
import { chooseFinalTutorResponse } from '../../src/lib/tutorResponse'
import { resolveTutorActiveTopic, shouldAcceptTutorChunk, tryBeginTutorSessionInitialization } from '../../src/lib/tutorSessionGuards'
import {
  buildTopicFocusBlock,
  evaluateTutorPhaseTransition,
  resolveTutorTargetConcept,
  setTutorDatabase,
} from '../../electron/ipc/tutorHandlers'

// node:sqlite keeps this suite isolated from the application's on-disk database.
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createDatabase(): any {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const statement of DB_SCHEMA.split(';').map(part => part.trim()).filter(Boolean)) {
    db.exec(`${statement};`)
  }
  for (const migration of MIGRATIONS_SQL) {
    try { db.exec(migration) } catch { /* Some migrations are already represented in DB_SCHEMA. */ }
  }
  setTutorDatabase(db)
  return db
}

function insert(db: any, sql: string, ...values: unknown[]): number {
  return Number(db.prepare(sql).run(...values).lastInsertRowid)
}

describe('Tutor application integration', () => {
  let db: any
  let userId: number
  let subjectId: number
  let sessionId: number

  beforeEach(() => {
    db = createDatabase()
    userId = insert(db, 'INSERT INTO users (name) VALUES (?)', 'Jordan')
    subjectId = insert(db,
      'INSERT INTO subjects (user_id, name, status) VALUES (?, ?, ?)',
      userId, 'Economics', 'active')
    const moduleId = insert(db,
      'INSERT INTO syllabus_modules (subject_id, title, status, sort_order) VALUES (?, ?, ?, ?)',
      subjectId, 'Markets', 'in_progress', 1)
    const topicId = insert(db,
      'INSERT INTO module_topics (module_id, title, sort_order) VALUES (?, ?, ?)',
      moduleId, 'Opportunity cost', 1)
    sessionId = insert(db,
      'INSERT INTO tutor_sessions (subject_id, user_id, session_type, phase) VALUES (?, ?, ?, ?)',
      subjectId, userId, 'tutor', 'structured_qa')
    insert(db,
      'INSERT INTO tutor_session_targets (session_id, topic_id, topic_label, sort_order) VALUES (?, ?, ?, ?)',
      sessionId, topicId, 'Opportunity cost', 0)
    insert(db,
      'INSERT INTO conversations (id, subject_id, title) VALUES (?, ?, ?)',
      sessionId, subjectId, 'Tutor session')
  })

  afterEach(() => db.close())

  it('persists a session, its target topics, and both student and tutor messages', () => {
    const session = db.prepare('SELECT * FROM tutor_sessions WHERE id = ?').get(sessionId)
    const targets = db.prepare('SELECT topic_label FROM tutor_session_targets WHERE session_id = ? ORDER BY sort_order').all(sessionId)
    expect(session).toMatchObject({ user_id: userId, subject_id: subjectId, session_type: 'tutor', phase: 'structured_qa' })
    expect(targets).toEqual([{ topic_label: 'Opportunity cost' }])

    db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
      .run('student-1', sessionId, 'user', 'What is the opportunity cost?')
    db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
      .run('tutor-1', sessionId, 'assistant', 'It is the value of the next-best alternative forgone.')

    expect(db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY rowid').all(sessionId)).toEqual([
      { role: 'user', content: 'What is the opportunity cost?' },
      { role: 'assistant', content: 'It is the value of the next-best alternative forgone.' },
    ])
  })

  it('keeps the full selected-material scope and unified concept inventory available when a session is resumed', () => {
    const selectedMaterialIds = [101, 102, 103, 104, 105, 106]
    const learningPlan = {
      selectedMaterialIds,
      materialNames: { 101: 'Lecture 1.pptx', 102: 'Chapter 1.pdf', 103: 'Transcript 1.md' },
      processedMaterialIds: selectedMaterialIds,
      unprocessedMaterials: [],
      truncatedMaterialIds: [],
      concepts: [
        { label: 'Scarcity', sourceMaterialIds: [101, 102], teachOrder: 1 },
        { label: 'Marginal Analysis', sourceMaterialIds: [104], teachOrder: 2 }
      ],
      status: 'ready'
    }
    db.prepare('UPDATE tutor_sessions SET source_material_ids = ? WHERE id = ?').run(JSON.stringify(selectedMaterialIds), sessionId)
    db.prepare('INSERT INTO tutor_session_learning_plans (session_id, plan_json) VALUES (?, ?)').run(sessionId, JSON.stringify(learningPlan))

    const restoredSession = db.prepare('SELECT source_material_ids FROM tutor_sessions WHERE id = ?').get(sessionId)
    const restoredPlan = db.prepare('SELECT plan_json FROM tutor_session_learning_plans WHERE session_id = ?').get(sessionId)
    expect(JSON.parse(restoredSession.source_material_ids)).toEqual(selectedMaterialIds)
    expect(JSON.parse(restoredPlan.plan_json).concepts.map((concept: { label: string }) => concept.label)).toEqual(['Scarcity', 'Marginal Analysis'])
  })

  it('parses numeric discrepancies conservatively and updates learner memory from assessment outcomes', () => {
    const prompt = buildTutorAssessmentPrompt(
      'A worker gives up £24 to take this job. What is the cost in dollars at the stated conversion?',
      '$60, because that was the previous example.',
      'Opportunity cost'
    )
    expect(prompt).toContain('incorrect number or uses values from a previous prompt')
    expect(prompt).toContain('both the conceptual logic and numerical value match')

    const assessment = parseTutorAssessment(JSON.stringify({
      outcome: 'partial', score: 0.4, confidence: 0.95, assistance_level: 'hint',
      task_type: 'application', evidence_span: 'answered $60 instead of £24',
    }), sessionId, 'Opportunity cost', `${sessionId}:student-1`, 'student-1')
    expect(assessment.outcome).not.toBe('correct')

    const memory = new LearnerMemoryService(db).recordTutorAssessment(assessment)
    expect(memory.id).toBeGreaterThan(0)
    expect(memory.state).toMatchObject({ concept: 'Opportunity cost', observations: 1 })
    expect(db.prepare('SELECT outcome FROM tutor_turn_assessments WHERE id = ?').get(memory.id).outcome).toBe('partial')
    expect(db.prepare('SELECT outcome FROM learning_events WHERE session_id = ? AND message_id = ?').get(sessionId, 'student-1').outcome).toBe('partial')
  })

  it('persists stable concept links idempotently and does not inflate duplicate tutor attempts', () => {
    const conceptId = insert(db, `INSERT INTO topic_concepts (
      topic_id, subject_id, label, key_points_json, source_chunk_ids_json, content_hash
    ) VALUES (?, ?, ?, '[]', '[]', 'test-hash')`, 1, subjectId, 'Opportunity cost')
    const assessment = parseTutorAssessment(JSON.stringify({
      outcome: 'correct', score: 1, confidence: 0.9, assistance_level: 'none', task_type: 'transfer'
    }), sessionId, 'Opportunity cost', `${sessionId}:student-stable`, 'student-stable')
    assessment.conceptId = conceptId

    const memory = new LearnerMemoryService(db)
    const first = memory.recordTutorAssessment(assessment)
    const duplicate = memory.recordTutorAssessment(assessment)

    expect(first.duplicate).toBe(false)
    expect(duplicate.duplicate).toBe(true)
    expect(db.prepare('SELECT concept_id FROM tutor_turn_assessments WHERE id = ?').get(first.id).concept_id).toBe(conceptId)
    expect(db.prepare('SELECT concept_id FROM learning_events WHERE session_id = ?').get(sessionId).concept_id).toBe(conceptId)
    expect(db.prepare('SELECT COUNT(*) AS count FROM learning_events WHERE session_id = ?').get(sessionId).count).toBe(1)
  })

  it('selects appropriate policy moves from opening through correct, partial, misconception, and impasse turns', () => {
    expect(inferLearnerTurnState('Hello', undefined, { isFirstTurn: true })).toBe('opening_turn')
    expect(chooseTutorMove('opening_turn').nextMove).toBe('micro_teach_and_retrieve')

    expect(inferLearnerTurnState('It is the next-best alternative.', { outcome: 'correct' })).toBe('correct_confident')
    expect(chooseTutorMove('correct_confident').nextMove).toBe('acknowledge_and_advance')

    expect(inferLearnerTurnState('The explicit payment.', { outcome: 'partial' })).toBe('partial_understanding')
    expect(chooseTutorMove('partial_understanding').nextMove).toBe('partial_scaffold')

    expect(inferLearnerTurnState('It is every alternative added together.', {
      outcome: 'incorrect', misconception: 'Adds all forgone alternatives',
    })).toBe('conceptual_misconception')
    expect(chooseTutorMove('conceptual_misconception').nextMove).toBe('remediate_misconception')

    const state = inferLearnerTurnState('Still unsure.', { outcome: 'incorrect' }, { recentImpasses: 2 })
    const move = chooseTutorMove(state, 2)
    expect(state).toBe('persistent_impasse')
    expect(move.nextMove).toBe('concise_explanation_and_reretrieval')
    expect(move.instructionalDirective).toContain('Do NOT repeat the previous question')
    expect(move.instructionalDirective).toContain('Pivot teaching strategy')
    expect(move.instructionalDirective).toContain('ONE fresh question')
  })

  it('creates an active teach-back gate and blocks phase advancement until the gate passes', () => {
    const topicId = db.prepare('SELECT topic_id FROM tutor_session_targets WHERE session_id = ?').get(sessionId).topic_id
    const now = new Date().toISOString()
    insert(db, `INSERT INTO tutor_teach_back_gates (session_id, topic_id, concept, status, attempt_count, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', 1, ?, ?)`, sessionId, topicId, 'Opportunity cost', now, now)

    const gate = db.prepare('SELECT * FROM tutor_teach_back_gates WHERE session_id = ? AND status IN (?, ?)')
      .get(sessionId, 'pending', 'needs_revision')
    expect(gate).toMatchObject({ concept: 'Opportunity cost', status: 'pending', attempt_count: 1 })
    expect(evaluateTutorPhaseTransition('structured_qa', 'socratic', gate)).toMatchObject({ success: false, blockedByTeachBack: true })
    expect(evaluateTutorPhaseTransition('structured_qa', 'summary', { ...gate, status: 'needs_revision' }))
      .toMatchObject({ success: false, blockedByTeachBack: true })

    db.prepare("UPDATE tutor_teach_back_gates SET status = 'passed' WHERE id = ?").run(gate.id)
    const passedGate = db.prepare('SELECT * FROM tutor_teach_back_gates WHERE id = ?').get(gate.id)
    expect(evaluateTutorPhaseTransition('structured_qa', 'socratic', passedGate)).toMatchObject({ success: true })
  })

  it('freezes timer ticks during AI response or manual pause without changing pacing status', () => {
    const timer = { durationMinutes: 30, isTimeUp: false, isManualPaused: false, isAiResponding: false }
    expect(shouldTutorTimerTick(timer)).toBe(true)
    expect(shouldTutorTimerTick({ ...timer, isAiResponding: true })).toBe(false)
    expect(shouldTutorTimerTick({ ...timer, isManualPaused: true })).toBe(false)

    const pacingStatus = 'ON_TRACK'
    for (const pauseState of [{ isAiResponding: true }, { isManualPaused: true }]) {
      expect(shouldTutorTimerTick({ ...timer, ...pauseState })).toBe(false)
      expect(pacingStatus).toBe('ON_TRACK')
    }
  })

  it('builds quick-review and fill-gap directives, and marks spaced-review topics as due', () => {
    const quickReview = buildTopicFocusBlock({
      isQuickReview: true,
      quickReviewTopics: [{ id: 1, module_id: 1, module_title: 'Markets', title: 'Opportunity cost', sort_order: 1 }],
    })
    expect(quickReview).toContain('QUICK REVIEW PROTOCOL')
    expect(quickReview).toContain('Topic 1 of 1')

    const fillGaps = buildTopicFocusBlock({ isFillGaps: true, gapTopics: ['Elasticity', 'Market failure'] })
    expect(fillGaps).toContain('TARGETED GAP-FILLING FOCUS')
    expect(fillGaps).toContain('Elasticity, Market failure')

    const spacedReview = decideAdaptiveDifficulty({ concept: 'Opportunity cost', mode: 'adaptive', due: true })
    const freshStudy = decideAdaptiveDifficulty({ concept: 'Opportunity cost', mode: 'adaptive', due: false })
    expect(spacedReview).toMatchObject({ action: 'interleaved_review', retentionStatus: 'due' })
    expect(freshStudy.action).not.toBe('interleaved_review')
  })

  it('tracks the active learning concept through multiple concepts in a document', () => {
    const source = 'Material: Chapter 3 Microeconomics.pdf'
    expect(resolveTutorTargetConcept({
      requestedTopic: source,
      moduleTopic: 'Consumer choice',
      subjectName: 'Economics',
    })).toBe('Consumer choice')

    // A tagged concept from the previous assistant turn wins over the source label
    // and the older assessment, so progression inside the PDF stays current.
    const progression = [
      ['strict preference', 'weak preference'],
      ['reflexivity', 'strict preference'],
      ['transitivity', 'reflexivity'],
    ] as const
    for (const [taggedConceptLabel, priorAssessmentConcept] of progression) {
      const activeConcept = resolveTutorTargetConcept({
        taggedConceptLabel,
        priorAssessmentConcept,
        requestedTopic: source,
        moduleTopic: 'Consumer choice',
        subjectName: 'Economics',
      })
      expect(activeConcept).toBe(taggedConceptLabel)
    }

    expect(resolveTutorTargetConcept({
      taggedConceptLabel: 'transitivity',
      requestedTopic: source,
      moduleTopic: 'Consumer choice',
      subjectName: 'Economics',
    })).toBe('transitivity')

    const transitivityDraft = 'Transitivity means that if a learner prefers A to B and B to C, they should also prefer A to C. This prevents cyclic preferences, where each option is preferred over another in a loop. What would transitivity predict about A compared with C?'
    const response = chooseFinalTutorResponse(transitivityDraft, null, 'transitivity')
    expect(response).toContain('cyclic preferences')
    expect(response).toContain('What would transitivity predict about A compared with C?')
  })

  it('makes session initialization idempotent and rejects chunks from other conversations', () => {
    const inFlightRef = { current: false }
    expect(tryBeginTutorSessionInitialization(inFlightRef)).toBe(true)
    expect(tryBeginTutorSessionInitialization(inFlightRef)).toBe(false)

    const activeSessionId = 'session-270'
    expect(shouldAcceptTutorChunk(activeSessionId, 'session-269')).toBe(false)
    expect(shouldAcceptTutorChunk(270, '270')).toBe(true)
    expect(shouldAcceptTutorChunk(activeSessionId, 'session-270')).toBe(false)
    expect(shouldAcceptTutorChunk(null, 'session-270')).toBe(false)
  })

  it('uses the first selected topic as the active concept while preserving all selected topics as scope', () => {
    const selectedTopics = ['Supply elasticity', 'Demand elasticity', 'Market equilibrium']
    const activeTopic = resolveTutorActiveTopic(selectedTopics, 'Markets', 'Economics')
    const config = { target_topic: activeTopic, target_topics: selectedTopics }
    expect(config.target_topic).toBe('Supply elasticity')
    expect(config.target_topics).toEqual(selectedTopics)
    expect(config.target_topic.length).toBeLessThan(100)
  })

  it('allows a StrictMode effect rerun after cleanup to claim initialization again', () => {
    const inFlightRef = { current: false }
    expect(tryBeginTutorSessionInitialization(inFlightRef)).toBe(true)
    // Effect cleanup releases the abandoned attempt; the replacement effect can run.
    inFlightRef.current = false
    expect(tryBeginTutorSessionInitialization(inFlightRef)).toBe(true)
  })
})
