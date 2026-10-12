/**
 * IPC handlers for concept extraction, retrieval, and coverage rollups.
 */

import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { callAIMessages } from './aiHandlers'
import { getApiKey, getAIConfig } from './aiConfigStore'
import {
  buildConceptExtractionPrompt,
  parseExtractedConcepts
} from '../../src/lib/coverage/conceptExtractor'
import {
  computeTopicRollup,
  computeConceptMastery
} from '../../src/lib/coverage/conceptCoverage'
import type {
  TopicConcept,
  TopicCoverageRollup
} from '../../src/types'
import { deriveConceptLearningState, type ConceptAssessmentEvidence, type ConceptLearningState } from '../../src/lib/learningState'

let db: Database.Database

function loadConceptAssessmentEvidence(
  database: Database.Database,
  conceptId: number,
  userId: number,
  subjectId: number
): ConceptAssessmentEvidence[] {
  const rubricRows = database.prepare(`
    SELECT ca.id, ca.score_10, ca.assistance_level, ca.misconception, ca.created_at,
      ta.outcome, ta.task_type, ta.idempotency_key, ta.id AS turn_id
    FROM concept_assessments ca LEFT JOIN tutor_turn_assessments ta ON ta.id = ca.assessment_id
    WHERE ca.concept_id = ? AND ca.user_id = ? ORDER BY ca.created_at
  `).all(conceptId, userId) as Array<{
    id: number; score_10: number; assistance_level: string | null; misconception: string | null;
    created_at: string; outcome: ConceptAssessmentEvidence['outcome'] | null; task_type: string | null;
    idempotency_key: string | null; turn_id: number | null
  }>
  const linkedTurnIds = new Set(rubricRows.map(row => row.turn_id).filter((id): id is number => id != null))
  const turnRows = database.prepare(`
    SELECT ta.id, ta.outcome, ta.score, ta.assistance_level, ta.misconception,
      ta.task_type, ta.idempotency_key, ta.created_at
    FROM tutor_turn_assessments ta JOIN tutor_sessions ts ON ts.id = ta.session_id
    WHERE ta.concept_id = ? AND ts.user_id = ? AND ts.subject_id = ? ORDER BY ta.created_at
  `).all(conceptId, userId, subjectId) as Array<{
    id: number; outcome: ConceptAssessmentEvidence['outcome']; score: number | null;
    assistance_level: string | null; misconception: string | null; task_type: string | null;
    idempotency_key: string | null; created_at: string
  }>
  const all: ConceptAssessmentEvidence[] = rubricRows.map(row => ({
    id: row.turn_id ?? row.id,
    outcome: row.outcome || 'unassessed',
    score: row.score_10,
    scoreScale: 10,
    assistanceLevel: row.assistance_level as ConceptAssessmentEvidence['assistanceLevel'],
    questionKey: row.idempotency_key || `legacy-assessment:${row.id}`,
    taskType: row.task_type,
    misconception: row.misconception,
    occurredAt: row.created_at
  }))
  for (const row of turnRows) {
    if (linkedTurnIds.has(row.id)) continue
    all.push({
      id: row.id,
      outcome: row.outcome,
      score: row.score,
      scoreScale: 1,
      assistanceLevel: row.assistance_level as ConceptAssessmentEvidence['assistanceLevel'],
      questionKey: row.idempotency_key,
      taskType: row.task_type,
      misconception: row.misconception,
      occurredAt: row.created_at
    })
  }
  all.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  let previousAt: string | undefined
  return all.map(item => {
    const delayedEnough = Boolean(previousAt && Date.parse(item.occurredAt) - Date.parse(previousAt) >= 86_400_000)
    previousAt = item.occurredAt
    const correct = item.outcome === 'correct' || (item.outcome === 'unassessed' && (item.score ?? 0) / (item.scoreScale || 1) >= 0.8)
    return { ...item, delayedReview: delayedEnough && correct }
  })
}

export function setConceptCoverageDatabase(database: Database.Database): void {
  db = database
}

export function registerConceptCoverageHandlers(): void {
  // Shared authoritative state projection for every concept-bearing surface.
  // It is rebuilt from the existing stable inventory and persisted evidence;
  // legacy free-text probabilities are intentionally excluded.
  ipcMain.handle(
    'concepts:getLearningStates',
    (_event, subjectId: number, userId?: number, topicId?: number): ConceptLearningState[] => {
      if (!db || !subjectId) return []
      const resolvedUserId = userId || 1
      const concepts = db.prepare(`
        SELECT c.id, c.label, p.introduced_at
        FROM topic_concepts c
        LEFT JOIN concept_progress p ON p.concept_id = c.id AND p.user_id = ?
        WHERE c.subject_id = ? AND c.status = 'active' AND (? IS NULL OR c.topic_id = ?)
        ORDER BY c.teach_order, c.id
      `).all(resolvedUserId, subjectId, topicId ?? null, topicId ?? null) as Array<{
        id: number; label: string; introduced_at: string | null
      }>
      const states: ConceptLearningState[] = []
      for (const concept of concepts) {
          const evidence = loadConceptAssessmentEvidence(db, concept.id, resolvedUserId, subjectId)
        states.push(deriveConceptLearningState({
          conceptId: concept.id,
          conceptLabel: concept.label,
          introducedAt: concept.introduced_at,
          assessments: evidence
        }))
      }
      return states
    }
  )

  // 1. Get all concepts for a topic with user progress attached
  ipcMain.handle(
    'concepts:getForTopic',
    async (_event, topicId: number, userId?: number): Promise<TopicConcept[]> => {
      if (!db || !topicId) return []
      const resolvedUserId = userId || 1

      try {
        const rows = db.prepare(`
          SELECT
            c.id, c.topic_id, c.subject_id, c.label, c.summary,
            c.key_points_json, c.source_chunk_ids_json, c.sort_order,
            c.teach_order, c.prerequisite_ids_json, c.content_hash,
            c.status, c.created_at,
            COALESCE(p.state, 'unseen') AS progress_state,
            p.introduced_at, p.last_assessed_at
          FROM topic_concepts c
          LEFT JOIN concept_progress p ON p.concept_id = c.id AND p.user_id = ?
          WHERE c.topic_id = ? AND c.status = 'active'
          ORDER BY c.teach_order ASC, c.id ASC
        `).all(resolvedUserId, topicId) as Array<{
          id: number
          topic_id: number
          subject_id: number
          label: string
          summary: string | null
          key_points_json: string
          source_chunk_ids_json: string
          sort_order: number
          teach_order: number
          prerequisite_ids_json: string
          content_hash: string
          status: 'active' | 'superseded'
          created_at: string
          progress_state: 'unseen' | 'introduced' | 'assessed'
          introduced_at: string | null
          last_assessed_at: string | null
        }>

        // Also fetch assessment history for each concept to compute mastery score
        const concepts: TopicConcept[] = []
        for (const row of rows) {
          const assessments = loadConceptAssessmentEvidence(db, row.id, resolvedUserId, row.subject_id)

          const scores = assessments.map(a => (a.score ?? 0) * (a.scoreScale === 1 ? 10 : 1)).reverse()
          const mastery = computeConceptMastery(scores)
          const learningState = deriveConceptLearningState({
            conceptId: row.id,
            conceptLabel: row.label,
            introducedAt: row.introduced_at,
            assessments
          })

          concepts.push({
            id: row.id,
            topic_id: row.topic_id,
            subject_id: row.subject_id,
            label: row.label,
            summary: row.summary || undefined,
            key_points: JSON.parse(row.key_points_json || '[]'),
            source_chunk_ids: JSON.parse(row.source_chunk_ids_json || '[]'),
            sort_order: row.sort_order,
            teach_order: row.teach_order,
            prerequisite_ids: JSON.parse(row.prerequisite_ids_json || '[]'),
            content_hash: row.content_hash,
            status: row.status,
            created_at: row.created_at,
            progress_state: row.progress_state,
            introduced_at: row.introduced_at || undefined,
            last_assessed_at: row.last_assessed_at || undefined,
            mastery_score_10: mastery.masteryScore10,
            assessment_count: mastery.count,
            learning_state: learningState
          })
        }

        return concepts
      } catch (err) {
        console.warn('Failed to get concepts for topic:', err)
        return []
      }
    }
  )

  // 2. Get coverage rollups for all topics in a subject
  ipcMain.handle(
    'concepts:getTopicRollups',
    async (_event, subjectId: number, userId?: number): Promise<Record<number, TopicCoverageRollup>> => {
      if (!db || !subjectId) return {}
      const resolvedUserId = userId || 1

      try {
        const topics = db.prepare(`
          SELECT t.id FROM module_topics t
          JOIN syllabus_modules m ON m.id = t.module_id
          WHERE m.subject_id = ?
        `).all(subjectId) as Array<{ id: number }>

        const result: Record<number, TopicCoverageRollup> = {}
        for (const t of topics) {
          const concepts = await (async () => {
            const rows = db.prepare(`
              SELECT
                c.id, c.topic_id, c.subject_id, c.label, c.summary,
                c.key_points_json, c.source_chunk_ids_json, c.sort_order,
                c.teach_order, c.prerequisite_ids_json, c.content_hash,
                c.status, c.created_at,
                COALESCE(p.state, 'unseen') AS progress_state,
                p.introduced_at, p.last_assessed_at
              FROM topic_concepts c
              LEFT JOIN concept_progress p ON p.concept_id = c.id AND p.user_id = ?
              WHERE c.topic_id = ? AND c.status = 'active'
              ORDER BY c.teach_order ASC
            `).all(resolvedUserId, t.id) as any[]

            if (rows.length === 0) return []

            return rows.map((r) => {
              const assessments = loadConceptAssessmentEvidence(db, r.id, resolvedUserId, r.subject_id)
              const mastery = computeConceptMastery(assessments.map(a => (a.score ?? 0) * (a.scoreScale === 1 ? 10 : 1)).reverse())
              const learningState = deriveConceptLearningState({
                conceptId: r.id,
                conceptLabel: r.label,
                introducedAt: r.introduced_at,
                assessments
              })
              return {
                id: r.id,
                topic_id: r.topic_id,
                subject_id: r.subject_id,
                label: r.label,
                summary: r.summary || undefined,
                key_points: JSON.parse(r.key_points_json || '[]'),
                source_chunk_ids: JSON.parse(r.source_chunk_ids_json || '[]'),
                sort_order: r.sort_order,
                teach_order: r.teach_order,
                prerequisite_ids: JSON.parse(r.prerequisite_ids_json || '[]'),
                content_hash: r.content_hash,
                status: r.status,
                created_at: r.created_at,
                progress_state: r.progress_state,
                mastery_score_10: mastery.masteryScore10,
                assessment_count: mastery.count,
                learning_state: learningState
              } as TopicConcept
            })
          })()

          result[t.id] = computeTopicRollup(t.id, concepts)
        }

        return result
      } catch (err) {
        console.warn('Failed to get topic rollups:', err)
        return {}
      }
    }
  )

  // 3. Extract concepts for a topic from source material chunks (lazy extraction)
  ipcMain.handle(
    'concepts:extractForTopic',
    async (_event, topicId: number, options?: { forceReextract?: boolean }): Promise<TopicConcept[]> => {
      if (!db || !topicId) return []

      try {
        const topicRow = db.prepare(`
          SELECT t.id, t.title, t.module_id, m.subject_id, t.source_material_ids
          FROM module_topics t
          JOIN syllabus_modules m ON m.id = t.module_id
          WHERE t.id = ?
        `).get(topicId) as { id: number; title: string; module_id: number; subject_id: number; source_material_ids?: string | null } | undefined

        if (!topicRow) return []

        // If active concepts already exist and forceReextract is false, return them
        const existing = db.prepare(`
          SELECT COUNT(*) AS count FROM topic_concepts
          WHERE topic_id = ? AND status = 'active'
        `).get(topicId) as { count: number }

        if (existing.count > 0 && !options?.forceReextract) {
          // Return existing concepts
          const rows = db.prepare(`
            SELECT * FROM topic_concepts WHERE topic_id = ? AND status = 'active' ORDER BY teach_order ASC
          `).all(topicId) as any[]
          return rows.map((r) => ({
            ...r,
            key_points: JSON.parse(r.key_points_json || '[]'),
            source_chunk_ids: JSON.parse(r.source_chunk_ids_json || '[]'),
            prerequisite_ids: JSON.parse(r.prerequisite_ids_json || '[]')
          }))
        }

        // Use topic-specific source IDs first, then the module's assigned
        // materials. Never silently substitute the first 40 chunks in the
        // whole subject: that can omit selected sources and include unrelated
        // material in the concept inventory.
        let sourceMaterialIds: number[] = []
        try {
          const parsed = JSON.parse(topicRow.source_material_ids || '[]')
          if (Array.isArray(parsed)) sourceMaterialIds = parsed.map(Number).filter(Number.isInteger)
        } catch { /* fall back to the module assignment */ }
        if (!sourceMaterialIds.length) {
          sourceMaterialIds = (db.prepare(`
            SELECT id FROM materials WHERE subject_id = ? AND module_id = ? ORDER BY sort_order, id
          `).all(topicRow.subject_id, topicRow.module_id) as Array<{ id: number }>).map(row => row.id)
        }
        if (!sourceMaterialIds.length) return []
        const placeholders = sourceMaterialIds.map(() => '?').join(',')
        const chunks = db.prepare(`
          SELECT c.id, c.chunk_index, c.title, c.text
          FROM document_chunks c
          JOIN materials mat ON mat.id = c.material_id
          WHERE mat.subject_id = ? AND mat.id IN (${placeholders})
          ORDER BY mat.sort_order, mat.id, c.chunk_index
          LIMIT 40
        `).all(topicRow.subject_id, ...sourceMaterialIds) as Array<{ id: string; chunk_index: number; title: string; text: string }>

        if (chunks.length === 0) {
          return []
        }

        // Call AI for concept extraction
        const apiKey = getApiKey()
        const aiConfig = getAIConfig()
        let extractedRaw = ''
        if (apiKey) {
          const prompt = buildConceptExtractionPrompt(topicRow.title, chunks)
          extractedRaw = await callAIMessages(
            [
              { role: 'system', content: 'You are an educational decomposition expert. Return valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            { ...aiConfig, apiKey },
            { type: 'json_object' }
          )
        }

        const conceptsParsed = parseExtractedConcepts(extractedRaw, chunks)

        // Begin transaction to save concepts
        const insertConcept = db.prepare(`
          INSERT INTO topic_concepts (
            topic_id, subject_id, label, summary, key_points_json,
            source_chunk_ids_json, sort_order, teach_order, prerequisite_ids_json,
            content_hash, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `)

        if (options?.forceReextract) {
          db.prepare(`UPDATE topic_concepts SET status = 'superseded' WHERE topic_id = ?`).run(topicId)
        }

        const savedConcepts: TopicConcept[] = []
        // First pass: insert all concepts with empty prerequisites so we get primary IDs
        const insertedIds: number[] = []
        for (let i = 0; i < conceptsParsed.length; i++) {
          const c = conceptsParsed[i]
          const res = insertConcept.run(
            topicRow.id,
            topicRow.subject_id,
            c.label,
            c.summary || null,
            JSON.stringify(c.key_points),
            JSON.stringify(c.source_chunk_ids),
            i + 1,
            c.teach_order,
            '[]',
            c.content_hash
          )
          insertedIds.push(Number(res.lastInsertRowid))
        }

        // Second pass: map resolved_prereq_indices to generated IDs and update
        const updatePrereqs = db.prepare(`UPDATE topic_concepts SET prerequisite_ids_json = ? WHERE id = ?`)
        for (let i = 0; i < conceptsParsed.length; i++) {
          const c = conceptsParsed[i]
          const prereqIds = (c.resolved_prereq_indices || []).map((idx) => insertedIds[idx]).filter(Boolean)
          updatePrereqs.run(JSON.stringify(prereqIds), insertedIds[i])

          savedConcepts.push({
            id: insertedIds[i],
            topic_id: topicRow.id,
            subject_id: topicRow.subject_id,
            label: c.label,
            summary: c.summary,
            key_points: c.key_points,
            source_chunk_ids: c.source_chunk_ids,
            sort_order: i + 1,
            teach_order: c.teach_order,
            prerequisite_ids: prereqIds,
            content_hash: c.content_hash,
            status: 'active',
            created_at: new Date().toISOString(),
            progress_state: 'unseen',
            mastery_score_10: null,
            assessment_count: 0
          })
        }

        return savedConcepts
      } catch (err) {
        console.warn('Failed to extract concepts for topic:', err)
        return []
      }
    }
  )
}
