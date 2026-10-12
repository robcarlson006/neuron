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

let db: Database.Database

export function setConceptCoverageDatabase(database: Database.Database): void {
  db = database
}

export function registerConceptCoverageHandlers(): void {
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
          const assessments = db.prepare(`
            SELECT score_10 FROM concept_assessments
            WHERE concept_id = ? AND user_id = ?
            ORDER BY created_at DESC
          `).all(row.id, resolvedUserId) as Array<{ score_10: number }>

          const scores = assessments.map((a) => a.score_10)
          const mastery = computeConceptMastery(scores)

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
            assessment_count: mastery.count
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
              const assessments = db.prepare(`
                SELECT score_10 FROM concept_assessments
                WHERE concept_id = ? AND user_id = ?
                ORDER BY created_at DESC
              `).all(r.id, resolvedUserId) as Array<{ score_10: number }>

              const mastery = computeConceptMastery(assessments.map((a) => a.score_10))
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
                assessment_count: mastery.count
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
          SELECT t.id, t.title, t.module_id, m.subject_id
          FROM module_topics t
          JOIN syllabus_modules m ON m.id = t.module_id
          WHERE t.id = ?
        `).get(topicId) as { id: number; title: string; module_id: number; subject_id: number } | undefined

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

        // Gather relevant source chunks from document_chunks for this topic / module / subject
        // 1) By module syllabus materials
        const chunks = db.prepare(`
          SELECT c.id, c.chunk_index, c.title, c.text
          FROM document_chunks c
          JOIN materials mat ON mat.id = c.material_id
          WHERE mat.subject_id = ?
          ORDER BY c.material_id ASC, c.chunk_index ASC
          LIMIT 40
        `).all(topicRow.subject_id) as Array<{ id: string; chunk_index: number; title: string; text: string }>

        if (chunks.length === 0) {
          // If no chunks, synthesize from topic title
          chunks.push({
            id: `topic_${topicId}_chunk_0`,
            chunk_index: 0,
            title: topicRow.title,
            text: `Lecture topic: ${topicRow.title}. Core concepts and essential mechanisms.`
          })
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
