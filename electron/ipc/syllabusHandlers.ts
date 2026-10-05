import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { callAIMessages } from './aiHandlers'
import { getAIConfig, getApiKey } from './aiConfigStore'
import { safeParseAIJson } from '../../src/lib/jsonRepair'
import { buildComprehensiveOutline, parseDocumentTopology } from '../../src/lib/coverage/documentTopologyParser'
import type { SyllabusModule, ModuleTopic } from '../../src/types'
import type { SyllabusUpdateResult } from '../../src/types'
import { syncModuleCompletionStatus } from './tutorHandlers'

let db: Database.Database
// A subject may only have one curriculum compiler running at a time. This
// prevents a slower response from overwriting a newer response for the same
// subject. The epoch is also checked immediately before persistence.
const syllabusGenerationInFlight = new Map<number, Promise<SyllabusUpdateResult>>()
const syllabusGenerationEpoch = new Map<number, number>()

export function setSyllabusDatabase(database: Database.Database): void {
  db = database
}

function listManualWeeks(subjectId: number): any[] {
  const weeks = db.prepare('SELECT * FROM manual_syllabus_weeks WHERE subject_id = ? ORDER BY sort_order ASC, id ASC').all(subjectId) as any[]
  const materials = db.prepare(`
    SELECT msm.week_id, msm.sort_order, m.*
    FROM manual_syllabus_materials msm
    JOIN materials m ON m.id = msm.material_id
    WHERE m.subject_id = ?
    ORDER BY msm.week_id ASC, msm.sort_order ASC, m.id ASC
  `).all(subjectId) as any[]
  return weeks.map(week => ({ ...week, materials: materials.filter(material => material.week_id === week.id).map(({ week_id: _weekId, sort_order: _sortOrder, ...material }) => material) }))
}

/** Strip markdown code fences from an AI response and parse it as JSON safely. */
function parseAIJson<T>(responseText: string): T {
  if (typeof responseText !== 'string' || responseText.trim().length === 0) {
    throw new Error('AI returned an empty syllabus response')
  }
  return safeParseAIJson<T>(responseText, {} as T)
}

/** Validate the AI intermediate representation before reconciliation mutates
 * any rows.  This intentionally stays independent of the model/provider so a
 * malformed or truncated response can never be interpreted as an empty
 * syllabus (the old fallback was `{ modules: [] }`). */
export function validateParsedCurriculum(
  modules: unknown,
  options?: { validMaterialIds?: Set<number>; subjectId?: number; requireSourceMaterialIds?: boolean }
): asserts modules is ParsedReconciledModule[] {
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error('Invalid syllabus response: modules must be a non-empty array')
  }

  const moduleTitles = new Set<string>()
  let topicCount = 0
  for (const rawModule of modules) {
    if (!rawModule || typeof rawModule !== 'object') throw new Error('Invalid syllabus response: malformed module')
    const mod = rawModule as Record<string, unknown>
    if (typeof mod.title !== 'string' || !mod.title.trim()) throw new Error('Invalid syllabus response: module title is required')
    const moduleKey = normText(mod.title)
    if (moduleTitles.has(moduleKey)) throw new Error(`Invalid syllabus response: duplicate module "${mod.title}"`)
    moduleTitles.add(moduleKey)
    if (!Array.isArray(mod.topics) || mod.topics.length === 0) {
      throw new Error(`Invalid syllabus response: module "${mod.title}" has no topics`)
    }
    if (mod.hours_estimated != null && (typeof mod.hours_estimated !== 'number' || !Number.isFinite(mod.hours_estimated) || mod.hours_estimated <= 0)) {
      throw new Error(`Invalid syllabus response: invalid hours_estimated for "${mod.title}"`)
    }
    const topicTitles = new Set<string>()
    for (const rawTopic of mod.topics) {
      if (!rawTopic || typeof rawTopic !== 'object') throw new Error(`Invalid syllabus response: malformed topic in "${mod.title}"`)
      const topic = rawTopic as Record<string, unknown>
      if (typeof topic.title !== 'string' || !topic.title.trim()) throw new Error(`Invalid syllabus response: topic title is required in "${mod.title}"`)
      const topicKey = normText(topic.title)
      if (topicTitles.has(topicKey)) throw new Error(`Invalid syllabus response: duplicate topic "${topic.title}"`)
      topicTitles.add(topicKey)
      topicCount++
      if (topic.estimated_minutes != null && (typeof topic.estimated_minutes !== 'number' || !Number.isFinite(topic.estimated_minutes) || topic.estimated_minutes <= 0)) {
        throw new Error(`Invalid syllabus response: invalid estimated_minutes for "${topic.title}"`)
      }
      if (topic.source_material_ids != null) {
        if (!Array.isArray(topic.source_material_ids) || topic.source_material_ids.some(id => !Number.isInteger(id) || (options?.validMaterialIds && !options.validMaterialIds.has(id as number)))) {
          throw new Error(`Invalid syllabus response: topic "${topic.title}" references an unknown material`)
        }
      }
      if (options?.requireSourceMaterialIds && (!Array.isArray(topic.source_material_ids) || topic.source_material_ids.length === 0)) {
        throw new Error(`Invalid syllabus response: topic "${topic.title}" is missing source evidence`)
      }
    }
  }
  if (topicCount === 0) throw new Error('Invalid syllabus response: no topics generated')
}

export interface ParsedReconciledTopic {
  title: string
  description?: string | null
  matched_previous_topic?: string | null
  coverage_delta?: 'identical' | 'deepened' | 'new_topic' | 'new_prerequisite'
  concept_type?: string | null
  estimated_minutes?: number | null
  source_material_ids?: number[] | null
}

export interface ParsedReconciledModule {
  title: string
  description?: string | null
  chapter_number?: number | null
  chapter_title?: string | null
  page_start?: number | null
  page_end?: number | null
  hours_estimated?: number | null
  prerequisites?: string | null
  topics: ParsedReconciledTopic[]
}

/** Helper to run commands inside a transaction across better-sqlite3 and node:sqlite */
function runInTransaction<T>(database: any, fn: () => T): T {
  if (typeof database.transaction === 'function') {
    return database.transaction(fn)()
  }
  database.exec('BEGIN')
  try {
    const res = fn()
    database.exec('COMMIT')
    return res
  } catch (err) {
    database.exec('ROLLBACK')
    throw err
  }
}

/** Normalizes a string for robust matching across renames and spacing changes */
function normText(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function conceptFingerprint(str: string): string {
  return normText(str)
    .split(' ')
    .filter(token => token.length > 2)
    .sort()
    .join('-')
}

function persistDocumentChunks(material: { id: number; filename: string; content_text: string }): void {
  const topology = parseDocumentTopology(material.content_text, material.filename)
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO document_chunks
      (id, material_id, chunk_index, title, heading_path, chunk_type, text, char_start, char_end, token_count, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const write = db.transaction(() => {
    db.prepare('DELETE FROM document_chunks WHERE material_id = ?').run(material.id)
    topology.chunks.forEach(chunk => {
      const contentHash = createHash('sha256').update(chunk.text).digest('hex')
      upsert.run(`${material.id}:${chunk.index}:${contentHash.slice(0, 16)}`, material.id, chunk.index, chunk.title, chunk.sectionHeading || '', chunk.type, chunk.text, chunk.charStart, chunk.charEnd, chunk.tokenEstimate, contentHash)
    })
  })
  write()
}

/** Materialize the validated topic plan as a graph-backed curriculum revision.
 * This is deliberately derived from the already-persisted, source-ID-checked
 * topics so legacy module/topic consumers remain compatible during migration. */
function materializeCurriculumGraph(subjectId: number, parsedModules: ParsedReconciledModule[], materialIds: Set<number>): {
  revision: number
  outcomeCount: number
  sourceCoverage: number
} {
  const subject = db.prepare('SELECT curriculum_revision FROM subjects WHERE id = ?').get(subjectId) as { curriculum_revision?: number } | undefined
  const currentRevision = Number(subject?.curriculum_revision || 0)
  const nextRevision = currentRevision + 1
  const sources = db.prepare(`SELECT id, content_text, file_sha256 FROM materials WHERE subject_id = ? AND id IN (${[...materialIds].map(() => '?').join(',')})`).all(subjectId, ...materialIds) as { id: number; content_text?: string; file_sha256?: string | null }[]
  const sourceById = new Map(sources.map(source => [source.id, source]))

  const run = db.transaction(() => {
    const revisionResult = db.prepare(`
      INSERT INTO curriculum_revisions (subject_id, revision_number, parent_revision_id, status, source_hashes_json, applied_at)
      VALUES (?, ?, (SELECT id FROM curriculum_revisions WHERE subject_id = ? ORDER BY revision_number DESC LIMIT 1), 'applied', ?, datetime('now'))
    `).run(subjectId, nextRevision, subjectId, JSON.stringify(sources.map(source => source.file_sha256 || createHash('sha256').update(source.content_text || '').digest('hex'))))
    const revisionId = Number(revisionResult.lastInsertRowid)
    const outcomeIds: number[] = []
    let sourceBackedTopics = 0
    let sortOrder = 0
    const insertEvidence = db.prepare(`INSERT INTO curriculum_evidence (subject_id, revision_id, material_id, content_hash, section, start_offset, end_offset, quote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertOutcome = db.prepare(`INSERT INTO curriculum_outcomes (subject_id, revision_id, topic_id, outcome_key, statement, bloom_level, sort_order, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertPractice = db.prepare(`INSERT INTO curriculum_practice (subject_id, revision_id, outcome_id, kind, instructions, estimated_minutes, retrieval_delay_days, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertMastery = db.prepare(`INSERT INTO curriculum_mastery (subject_id, revision_id, outcome_id, criterion, evidence_kind, target_score) VALUES (?, ?, ?, ?, 'practice', 0.8)`)

    for (const module of parsedModules) {
      const storedModule = db.prepare('SELECT id FROM syllabus_modules WHERE subject_id = ? AND title = ? ORDER BY id DESC LIMIT 1').get(subjectId, module.title) as { id: number } | undefined
      for (const topic of module.topics || []) {
        const storedTopic = storedModule ? db.prepare('SELECT id FROM module_topics WHERE module_id = ? AND title = ? ORDER BY id DESC LIMIT 1').get(storedModule.id, topic.title) as { id: number } | undefined : undefined
        const evidenceIds: number[] = []
        for (const materialId of topic.source_material_ids || []) {
          if (!materialIds.has(materialId)) continue
          const source = sourceById.get(materialId)
          if (!source) continue
          const text = source.content_text || ''
          const needle = topic.title.trim().toLowerCase()
          const found = needle ? text.toLowerCase().indexOf(needle) : -1
          const start = found >= 0 ? found : 0
          const quote = text.slice(start, start + 360).trim()
          const hash = source.file_sha256 || createHash('sha256').update(text).digest('hex')
          const evidence = insertEvidence.run(subjectId, revisionId, materialId, hash, module.title, start, start + quote.length, quote || topic.description || topic.title)
          evidenceIds.push(Number(evidence.lastInsertRowid))
        }
        if (evidenceIds.length > 0) sourceBackedTopics++
        const outcome = insertOutcome.run(subjectId, revisionId, storedTopic?.id || null, `${conceptFingerprint(module.title)}:${conceptFingerprint(topic.title)}`, `Demonstrate understanding of ${topic.title}.`, topic.concept_type || 'concept', sortOrder++, JSON.stringify(evidenceIds))
        const outcomeId = Number(outcome.lastInsertRowid)
        outcomeIds.push(outcomeId)
        insertPractice.run(subjectId, revisionId, outcomeId, 'independent', `Explain or apply ${topic.title} without looking at the source.`, Math.max(5, Math.min(60, Number(topic.estimated_minutes) || 15)), 3, sortOrder)
        insertMastery.run(subjectId, revisionId, outcomeId, `Provide a correct explanation or application of ${topic.title} with at least 80% rubric performance.`)
      }
    }
    const insertPrereq = db.prepare(`INSERT OR IGNORE INTO curriculum_prerequisites (subject_id, revision_id, prerequisite_outcome_id, dependent_outcome_id, relation, rationale) VALUES (?, ?, ?, ?, 'recommended', 'Earlier generated outcome in the ordered curriculum')`)
    for (let i = 1; i < outcomeIds.length; i++) insertPrereq.run(subjectId, revisionId, outcomeIds[i - 1], outcomeIds[i])
    db.prepare('UPDATE subjects SET curriculum_revision = ?, curriculum_schema_version = 2 WHERE id = ?').run(nextRevision, subjectId)
  })
  run()
  return { revision: nextRevision, outcomeCount: parsedModules.reduce((sum, module) => sum + (module.topics?.length || 0), 0), sourceCoverage: parsedModules.reduce((sum, module) => sum + (module.topics || []).filter(topic => (topic.source_material_ids || []).length > 0).length, 0) / Math.max(1, parsedModules.reduce((sum, module) => sum + (module.topics?.length || 0), 0)) }
}

/**
 * Reconciles an existing syllabus with a new curriculum structure:
 * - Updates existing module_topics in place, preserving primary keys, study logs, practice problems, and flashcards.
 * - Marks deepened topics with has_new_material = 1 without wiping their completed status.
 * - Flags newly introduced topics as gaps (is_gap = 1).
 * - Synchronizes module statuses using syncModuleCompletionStatus.
 */
export function reconcileCurriculum(
  database: any,
  subjectId: number,
  parsedModules: ParsedReconciledModule[],
  userId?: number,
  materialModuleAssignments?: { material_filename: string; module_title: string }[]
) {
  validateParsedCurriculum(parsedModules)
  let actualUserId = userId
  if (!actualUserId) {
    try {
      const u = database.prepare('SELECT id FROM users LIMIT 1').get() as { id: number } | undefined
      actualUserId = u?.id || 1
    } catch {
      actualUserId = 1
    }
  }

  const subject = database.prepare('SELECT id, name, subject_type, time_commitment_minutes FROM subjects WHERE id = ?').get(subjectId) as
    { id: number; name: string; subject_type?: string; time_commitment_minutes?: number } | undefined
  const isBook = subject?.subject_type === 'book'
  const hoursPerWeek = Math.max(1, Math.round((subject?.time_commitment_minutes || 60) / 60))

  const existingModules = database.prepare(
    'SELECT * FROM syllabus_modules WHERE subject_id = ? ORDER BY sort_order ASC'
  ).all(subjectId) as (SyllabusModule & { status: string })[]

  const existingTopics = database.prepare(`
    SELECT mt.id, mt.module_id, sm.title as module_title, mt.title, mt.description, mt.sort_order,
      mt.concept_fingerprint,
      CASE WHEN EXISTS (
        SELECT 1 FROM module_topic_study_log sl WHERE sl.topic_id = mt.id AND sl.user_id = ?
      ) THEN 1 ELSE 0 END as completed,
      CASE WHEN EXISTS (
        SELECT 1 FROM practice_problems pp WHERE pp.topic_id = mt.id
      ) THEN 1 ELSE 0 END as has_problems,
      CASE WHEN EXISTS (
        SELECT 1 FROM cards c WHERE c.topic_id = mt.id
      ) THEN 1 ELSE 0 END as has_cards
    FROM module_topics mt
    JOIN syllabus_modules sm ON sm.id = mt.module_id
    WHERE sm.subject_id = ?
    ORDER BY sm.sort_order ASC, mt.sort_order ASC
  `).all(actualUserId, subjectId) as {
    id: number
    module_id: number
    module_title: string
    title: string
    description: string | null
    sort_order: number
    concept_fingerprint?: string | null
    completed: number
    has_problems: number
    has_cards: number
  }[]

  const isInitialGeneration = existingModules.length === 0 && existingTopics.length === 0

  return runInTransaction(database, () => {
    const usedExistingTopicIds = new Set<number>()
    const usedExistingModuleIds = new Set<number>()
    let preservedCompletedCount = 0
    let gapTopicCount = 0
    let updatedTopicCount = 0
    let newModuleCount = 0
    let newTopicCount = 0

    interface PlannedTopic {
      topicData: ParsedReconciledTopic
      existingTopicId?: number
      isGap: boolean
      hasNewMaterial: boolean
      isCompleted: boolean
    }

    interface PlannedModule {
      moduleData: ParsedReconciledModule
      existingModuleId?: number
      topics: PlannedTopic[]
    }

    const plannedModules: PlannedModule[] = []

    for (const newMod of parsedModules) {
      let matchedModule = existingModules.find(
        m => !usedExistingModuleIds.has(m.id) && normText(m.title) === normText(newMod.title)
      )

      const plannedTopics: PlannedTopic[] = []

      for (const newTop of newMod.topics || []) {
        let matchedTopic: typeof existingTopics[0] | undefined = undefined

        // 1. Check AI-specified matched_previous_topic
        if (newTop.matched_previous_topic) {
          const normMatch = normText(newTop.matched_previous_topic)
          matchedTopic = existingTopics.find(
            t => !usedExistingTopicIds.has(t.id) && normText(t.title) === normMatch
          )
        }

        // 1. Stable concept fingerprint match, when available.
        if (!matchedTopic) {
          const fingerprint = conceptFingerprint(newTop.title)
          matchedTopic = existingTopics.find(t => !usedExistingTopicIds.has(t.id) && t.concept_fingerprint && t.concept_fingerprint === fingerprint)
        }

        // 2. Exact or normalized title match
        if (!matchedTopic) {
          const normTitle = normText(newTop.title)
          matchedTopic = existingTopics.find(
            t => !usedExistingTopicIds.has(t.id) && normText(t.title) === normTitle
          )
        }

        // 3. Substring similarity match (for slight renames like "Glycolysis pathway" -> "Glycolysis")
        if (!matchedTopic && newTop.title.length > 5) {
          const normNew = normText(newTop.title)
          matchedTopic = existingTopics.find(t => {
            if (usedExistingTopicIds.has(t.id)) return false
            const normOld = normText(t.title)
            if (normNew.length === 0 || normOld.length === 0) return false
            return (normNew.includes(normOld) || normOld.includes(normNew)) &&
              Math.min(normNew.length, normOld.length) / Math.max(normNew.length, normOld.length) >= 0.65
          })
        }

        if (matchedTopic) {
          usedExistingTopicIds.add(matchedTopic.id)
          const isDeepened = newTop.coverage_delta === 'deepened'
          if (matchedTopic.completed) preservedCompletedCount++
          if (isDeepened) updatedTopicCount++

          plannedTopics.push({
            topicData: newTop,
            existingTopicId: matchedTopic.id,
            isGap: false,
            hasNewMaterial: isDeepened,
            isCompleted: Boolean(matchedTopic.completed)
          })
        } else {
          // Brand-new topic introduced
          const isGap = !isInitialGeneration
          if (isGap) gapTopicCount++
          newTopicCount++

          plannedTopics.push({
            topicData: newTop,
            isGap,
            hasNewMaterial: false,
            isCompleted: false
          })
        }
      }

      // If module wasn't matched by title, match to the existing module that shares the most topics
      if (!matchedModule && plannedTopics.length > 0) {
        const candidateCounts = new Map<number, number>()
        for (const pt of plannedTopics) {
          if (pt.existingTopicId) {
            const oldTopic = existingTopics.find(t => t.id === pt.existingTopicId)
            if (oldTopic && !usedExistingModuleIds.has(oldTopic.module_id)) {
              candidateCounts.set(oldTopic.module_id, (candidateCounts.get(oldTopic.module_id) || 0) + 1)
            }
          }
        }
        let bestModId: number | null = null
        let maxCount = 0
        for (const [modId, count] of candidateCounts.entries()) {
          if (count > maxCount) {
            maxCount = count
            bestModId = modId
          }
        }
        if (bestModId) {
          matchedModule = existingModules.find(m => m.id === bestModId)
        }
      }

      if (matchedModule) {
        usedExistingModuleIds.add(matchedModule.id)
      } else {
        newModuleCount++
      }

      plannedModules.push({
        moduleData: newMod,
        existingModuleId: matchedModule?.id,
        topics: plannedTopics
      })
    }

    // Execute Module and Topic Updates / Inserts
    const activeModuleIds: number[] = []
    const plannedModuleIndex = new Map(plannedModules.map((plan, index) => [plan, index]))
    const orderedPlannedModules = [...plannedModules].sort((a, b) => {
      if (isInitialGeneration) return (plannedModuleIndex.get(a) || 0) - (plannedModuleIndex.get(b) || 0)
      const aExisting = existingModules.find(module => module.id === a.existingModuleId)
      const bExisting = existingModules.find(module => module.id === b.existingModuleId)
      if (aExisting && bExisting) return aExisting.sort_order - bExisting.sort_order
      if (aExisting) return -1
      if (bExisting) return 1
      return (plannedModuleIndex.get(a) || 0) - (plannedModuleIndex.get(b) || 0)
    })

    for (let i = 0; i < orderedPlannedModules.length; i++) {
      const plan = orderedPlannedModules[i]
      const mod = plan.moduleData
      let moduleId: number

      if (plan.existingModuleId) {
        moduleId = plan.existingModuleId
        database.prepare(`
          UPDATE syllabus_modules
          SET title = ?, description = ?, hours_estimated = ?, sort_order = ?,
              chapter_number = ?, chapter_title = ?, page_start = ?, page_end = ?, prerequisites = ?
          WHERE id = ?
        `).run(
          mod.title, mod.description || null,
          mod.hours_estimated || hoursPerWeek, i,
          isBook ? (mod.chapter_number || i + 1) : null,
          isBook ? mod.title : null,
          isBook ? (mod.page_start || null) : null,
          isBook ? (mod.page_end || null) : null,
          mod.prerequisites || null,
          moduleId
        )
      } else {
        const insertRes = database.prepare(`
          INSERT INTO syllabus_modules
            (subject_id, title, description, week_number, status, hours_estimated, sort_order,
             chapter_number, chapter_title, page_start, page_end, prerequisites)
          VALUES (?, ?, ?, null, 'pending', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          subjectId, mod.title, mod.description || null,
          mod.hours_estimated || hoursPerWeek, i,
          isBook ? (mod.chapter_number || i + 1) : null,
          isBook ? mod.title : null,
          isBook ? (mod.page_start || null) : null,
          isBook ? (mod.page_end || null) : null,
          mod.prerequisites || null
        )
        moduleId = Number(insertRes.lastInsertRowid)
      }
      activeModuleIds.push(moduleId)

      // Re-anchor or insert topics. Existing topics retain their manual
      // relative order; newly discovered topics append after them.
      const plannedTopicIndex = new Map(plan.topics.map((topic, index) => [topic, index]))
      const orderedTopics = [...plan.topics].sort((a, b) => {
        if (isInitialGeneration) return (plannedTopicIndex.get(a) || 0) - (plannedTopicIndex.get(b) || 0)
        const aExisting = existingTopics.find(topic => topic.id === a.existingTopicId)
        const bExisting = existingTopics.find(topic => topic.id === b.existingTopicId)
        if (aExisting && bExisting) return aExisting.sort_order - bExisting.sort_order
        if (aExisting) return -1
        if (bExisting) return 1
        return (plannedTopicIndex.get(a) || 0) - (plannedTopicIndex.get(b) || 0)
      })
      for (let j = 0; j < orderedTopics.length; j++) {
        const tp = orderedTopics[j]
        if (tp.existingTopicId) {
          database.prepare(`
            UPDATE module_topics
            SET module_id = ?, title = ?, description = ?, sort_order = ?,
              has_new_material = ?, is_gap = ?, concept_fingerprint = ?, concept_type = ?,
              estimated_minutes = ?, new_content_state = ?, source_material_ids = ?
            WHERE id = ?
          `).run(
            moduleId, tp.topicData.title, tp.topicData.description || null, j,
            tp.hasNewMaterial ? 1 : 0, tp.isGap ? 1 : 0,
            conceptFingerprint(tp.topicData.title), tp.topicData.concept_type || 'concept',
            tp.topicData.estimated_minutes || 15,
            tp.isCompleted ? 'verified' : tp.hasNewMaterial || tp.isGap ? 'unseen' : 'unseen',
            JSON.stringify(tp.topicData.source_material_ids || []),
            tp.existingTopicId
          )
        } else {
          database.prepare(`
            INSERT INTO module_topics
              (module_id, title, description, sort_order, has_new_material, is_gap, concept_fingerprint, concept_type, estimated_minutes, new_content_state, source_material_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            moduleId, tp.topicData.title, tp.topicData.description || null, j,
            tp.hasNewMaterial ? 1 : 0, tp.isGap ? 1 : 0,
            conceptFingerprint(tp.topicData.title), tp.topicData.concept_type || 'concept',
            tp.topicData.estimated_minutes || 15,
            'unseen', JSON.stringify(tp.topicData.source_material_ids || [])
          )
        }
      }
    }

    // Safely handle unmapped topics from previous generation
    const unmappedTopics = existingTopics.filter(t => !usedExistingTopicIds.has(t.id))
    for (const ut of unmappedTopics) {
      if (ut.completed || ut.has_problems || ut.has_cards) {
        // Keep progress and problem links intact by assigning to the last active module
        const fallbackModuleId = activeModuleIds[activeModuleIds.length - 1] || ut.module_id
        database.prepare('UPDATE module_topics SET module_id = ? WHERE id = ?').run(fallbackModuleId, ut.id)
      } else {
        database.prepare('DELETE FROM module_topics WHERE id = ?').run(ut.id)
      }
    }

    // Delete unused empty modules
    if (activeModuleIds.length > 0) {
      const placeholders = activeModuleIds.map(() => '?').join(',')
      database.prepare(`
        DELETE FROM syllabus_modules
        WHERE subject_id = ?
          AND id NOT IN (${placeholders})
          AND id NOT IN (SELECT DISTINCT module_id FROM module_topics)
      `).run(subjectId, ...activeModuleIds)
    }

    // Synchronize module completion statuses
    for (const modId of activeModuleIds) {
      syncModuleCompletionStatus(database, modId, actualUserId)
    }

    // Mark materials and subject as processed
    database.prepare('UPDATE materials SET syllabus_processed = 1 WHERE subject_id = ?').run(subjectId)
    database.prepare('UPDATE subjects SET syllabus_generated = 1 WHERE id = ?').run(subjectId)

    // Apply material assignments if any
    if (materialModuleAssignments && Array.isArray(materialModuleAssignments)) {
      for (const assignment of materialModuleAssignments) {
        if (!assignment?.material_filename || !assignment?.module_title) continue
        const mat = database.prepare('SELECT id FROM materials WHERE subject_id = ? AND filename = ?')
          .get(subjectId, assignment.material_filename) as { id: number } | undefined
        const target = database.prepare('SELECT id FROM syllabus_modules WHERE subject_id = ? AND title = ?')
          .get(subjectId, assignment.module_title) as { id: number } | undefined
        if (mat && target) {
          database.prepare('UPDATE materials SET module_id = ? WHERE id = ?').run(target.id, mat.id)
        }
      }
    }

    const modules = listModulesWithCountsHelper(database, subjectId)

    return {
      modules,
      new_module_count: newModuleCount,
      new_topic_count: newTopicCount,
      preserved_completed_count: preservedCompletedCount,
      gap_topic_count: gapTopicCount,
      updated_topic_count: updatedTopicCount,
      processed_material_count: 0,
      needs_updates: newModuleCount > 0 || newTopicCount > 0 || gapTopicCount > 0 || updatedTopicCount > 0
    }
  })
}

/** Helper to list modules with counts */
function listModulesWithCountsHelper(database: any, subjectId: number) {
  return database.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM module_topics t WHERE t.module_id = m.id) as topic_count
    FROM syllabus_modules m
    WHERE m.subject_id = ?
    ORDER BY m.sort_order ASC
  `).all(subjectId)
}

/**
 * Reconciles syllabus with AI across ALL materials while preserving learner progress.
 */
async function reconcileSyllabusFromAI(subjectId: number, targetMaterialIds?: number[], expectedEpoch?: number) {
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as
    { id: number; name: string; time_commitment_minutes: number; subject_type?: string; total_pages?: number; total_chapters?: number } | undefined
  if (!subject) throw new Error('Subject not found')

  let materials: { id: number; filename: string; content_text: string; file_sha256?: string | null }[]
  if (targetMaterialIds && targetMaterialIds.length > 0) {
    if (targetMaterialIds.some(id => !Number.isInteger(id) || id <= 0)) {
      throw new Error('Invalid material IDs')
    }
    const placeholders = targetMaterialIds.map(() => '?').join(',')
    const selectedCount = db.prepare(`SELECT COUNT(*) as count FROM materials WHERE subject_id = ? AND id IN (${placeholders})`).get(subjectId, ...targetMaterialIds) as { count: number }
    if (Number(selectedCount?.count || 0) !== new Set(targetMaterialIds).size) {
      throw new Error('One or more materials do not belong to this subject')
    }
    materials = db.prepare(
      `SELECT id, filename, content_text, file_sha256 FROM materials WHERE subject_id = ? AND content_text IS NOT NULL AND id IN (${targetMaterialIds.map(() => '?').join(',')}) ORDER BY sort_order ASC, uploaded_at DESC, id DESC`
    ).all(subjectId, ...targetMaterialIds) as typeof materials
  } else {
    materials = db.prepare(
      'SELECT id, filename, content_text, file_sha256 FROM materials WHERE subject_id = ? AND content_text IS NOT NULL ORDER BY sort_order ASC, uploaded_at DESC, id DESC'
    ).all(subjectId) as typeof materials
  }

  if (materials.length === 0) throw new Error('No materials with content found')

  // Keep a bounded, inspectable source representation for evidence and later
  // incremental compilation. This cache is independent of curriculum writes.
  for (const material of materials) persistDocumentChunks(material)

  const validMaterialIds = new Set(materials.map(material => material.id))

  let actualUserId: number = 1
  try {
    const u = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: number } | undefined
    if (u?.id) actualUserId = u.id
  } catch { /* ignore */ }

  // Snapshot existing modules and topics
  const existingModules = db.prepare(
    'SELECT id, title, description, status FROM syllabus_modules WHERE subject_id = ? ORDER BY sort_order ASC'
  ).all(subjectId) as { id: number; title: string; description: string | null; status: string }[]

  const existingTopics = db.prepare(`
    SELECT mt.id, mt.module_id, sm.title as module_title, mt.title,
      CASE WHEN EXISTS (
        SELECT 1 FROM module_topic_study_log sl WHERE sl.topic_id = mt.id AND sl.user_id = ?
      ) THEN 1 ELSE 0 END as completed
    FROM module_topics mt
    JOIN syllabus_modules sm ON sm.id = mt.module_id
    WHERE sm.subject_id = ?
    ORDER BY sm.sort_order ASC, mt.sort_order ASC
  `).all(actualUserId, subjectId) as { id: number; module_id: number; module_title: string; title: string; completed: number }[]

  const materialSummaries = materials.map(m =>
    `[MATERIAL_ID=${m.id} FILENAME=${m.filename}]\n${buildComprehensiveOutline(m.content_text, m.filename)}`
  ).join('\n\n---\n\n')

  const weeklyHours = subject.time_commitment_minutes || 60
  const hoursPerWeek = Math.max(1, Math.round(weeklyHours / 60))
  const isBook = subject?.subject_type === 'book'

  let existingContext = ''
  if (existingTopics.length > 0) {
    existingContext = `
EXISTING SYLLABUS AND STUDENT PROGRESS:
The student already has an existing syllabus and has completed some topics:
${existingModules.map(m => {
  const modTopics = existingTopics.filter(t => t.module_id === m.id)
  return `Module "${m.title}":\n` + (modTopics.length > 0
    ? modTopics.map(t => `  - "${t.title}" [${t.completed ? 'COMPLETED by student' : 'Pending'}]`).join('\n')
    : '  (None)')
}).join('\n\n')}

CRITICAL CONTINUITY REQUIREMENTS:
- You may reorganize modules, create new modules, reorder concepts, or merge/split them to create the best pedagogical sequence across ALL materials.
- For EVERY topic you output:
  * "matched_previous_topic": If this topic covers or corresponds to an existing topic from the list above, provide the EXACT title of that existing topic from the list. If it is genuinely a new topic/concept, provide null.
  * "coverage_delta":
      "identical" - Same scope/concept as the matched previous topic.
      "deepened" - Extends or adds substantial new depth/concepts to the matched previous topic from the new material.
      "new_topic" - Genuinely new topic introduced by the materials.
      "new_prerequisite" - A foundational or prerequisite concept introduced before other concepts.
`
  }

  const prompt = isBook
    ? `You are an expert curriculum designer. Create a detailed syllabus for a book called "${subject.name}" based on the following source materials.
The student reads approximately ${hoursPerWeek} hour(s) per week.
The book has approximately ${subject.total_pages || '?'} pages across ${subject.total_chapters || '?'} chapters.

${existingContext}

SOURCE MATERIALS:
${materialSummaries}

Respond in JSON format:
{
  "modules": [
    {
      "title": "Chapter title",
      "description": "Brief description of what this chapter covers",
      "chapter_number": 1,
      "page_start": 1,
      "page_end": 30,
      "hours_estimated": ${hoursPerWeek},
      "prerequisites": "Start here — no prerequisites",
      "topics": [
        {
          "title": "Topic title",
          "description": "What this topic covers",
          "concept_type": "definition | mechanism | procedure | application | comparison",
          "estimated_minutes": 15,
          "source_material_ids": [],
          "matched_previous_topic": null,
          "coverage_delta": "identical"
        }
      ]
    }
  ]
}

Rules:
- Organize chapters logically.
- Return ONLY valid JSON. No markdown. No commentary.`
    : `You are an expert curriculum designer. Create a detailed, logically ordered syllabus for "${subject.name}" based on the source materials.
The student can commit approximately ${hoursPerWeek} hour(s) per week.

${existingContext}

SOURCE MATERIALS:
${materialSummaries}

Respond in JSON format:
{
  "modules": [
    {
      "title": "Topic Name",
      "description": "Brief description of what this module covers",
      "hours_estimated": ${hoursPerWeek},
      "prerequisites": "Prerequisites description",
      "topics": [
        {
          "title": "Subtopic title",
          "description": "What this subtopic covers",
          "concept_type": "definition | mechanism | procedure | application | comparison",
          "estimated_minutes": 15,
          "source_material_ids": [],
          "matched_previous_topic": null,
          "coverage_delta": "identical"
        }
      ]
    }
  ],
  "material_module_assignments": [
    { "material_filename": "filename.pdf", "module_title": "Module Title" }
  ]
}

Rules:
- Organize materials logically by topic (foundations first, then advanced).
- Module titles must be descriptive topic names (do NOT use "Week 1", "Week 2").
- Each module should have 2-5 subtopics.
- Every topic must identify its concept type, estimated active-retrieval minutes, and at least one supporting MATERIAL_ID.
- Use the MATERIAL_ID values in SOURCE MATERIALS for source_material_ids; never invent IDs.
- Do not merge two distinct concepts merely because their titles are similar; use matched_previous_topic only when the concept identity is clear.
- Return ONLY valid JSON. No markdown. No commentary.`

  const config = getAIConfig()
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('AI API key not configured. Go to Settings to configure your AI provider.')
  const generationStartedAt = Date.now()
  const sourceHashes = materials.map(material => material.file_sha256 || createHash('sha256').update(material.content_text || '').digest('hex'))
  const generationRun = db.prepare(`
    INSERT INTO curriculum_generation_runs (subject_id, requested_revision, provider, model, prompt_version, source_hashes_json, status, started_at)
    VALUES (?, (SELECT curriculum_revision FROM subjects WHERE id = ?), ?, ?, 'curriculum-graph-v1', ?, 'started', datetime('now'))
  `).run(subjectId, subjectId, config.provider, config.model, JSON.stringify(sourceHashes))
  const generationRunId = Number(generationRun.lastInsertRowid)

  const responseText = await callAIMessages(
    [{ role: 'user', content: prompt }],
    { ...config, apiKey },
    { type: 'json_object' }
  )

  const parsed = parseAIJson<{
    modules: ParsedReconciledModule[]
    material_module_assignments?: { material_filename: string; module_title: string }[]
  }>(responseText)

  if (!parsed.modules || !Array.isArray(parsed.modules)) {
    throw new Error('Invalid syllabus response: missing modules array')
  }
  validateParsedCurriculum(parsed.modules, { validMaterialIds, subjectId, requireSourceMaterialIds: true })

  if (parsed.material_module_assignments != null) {
    if (!Array.isArray(parsed.material_module_assignments)) {
      throw new Error('Invalid syllabus response: material assignments must be an array')
    }
    const moduleTitles = new Set(parsed.modules.map(module => normText(module.title)))
    const materialNames = new Set(materials.map(material => material.filename))
    for (const assignment of parsed.material_module_assignments) {
      if (!assignment || typeof assignment.material_filename !== 'string' || typeof assignment.module_title !== 'string' ||
        !materialNames.has(assignment.material_filename) || !moduleTitles.has(normText(assignment.module_title))) {
        throw new Error('Invalid syllabus response: material assignment references an unknown material or module')
      }
    }
  }

  if (expectedEpoch != null && syllabusGenerationEpoch.get(subjectId) !== expectedEpoch) {
    throw new Error('Syllabus generation became stale; existing curriculum was preserved')
  }

  const result = reconcileCurriculum(
    db,
    subjectId,
    parsed.modules,
    actualUserId,
    parsed.material_module_assignments
  )
  const graph = materializeCurriculumGraph(subjectId, parsed.modules, validMaterialIds)
  db.prepare(`
    UPDATE curriculum_generation_runs
    SET resulting_revision = (SELECT id FROM curriculum_revisions WHERE subject_id = ? AND revision_number = ?),
        status = 'applied', validation_score = ?, output_hash = ?, change_summary_json = ?, completed_at = datetime('now'), duration_ms = ?
    WHERE id = ?
  `).run(subjectId, graph.revision, graph.sourceCoverage, createHash('sha256').update(responseText).digest('hex'), JSON.stringify({ new_topic_count: result.new_topic_count, updated_topic_count: result.updated_topic_count, preserved_completed_count: result.preserved_completed_count, source_coverage: graph.sourceCoverage }), Date.now() - generationStartedAt, generationRunId)

  return {
    ...result,
    processed_material_count: materials.length,
    curriculum_revision: graph.revision,
    generation_run_id: generationRunId,
    change_summary: {
      new_outcome_count: result.new_topic_count,
      deepened_outcome_count: result.updated_topic_count,
      preserved_progress_count: result.preserved_completed_count,
      source_coverage: graph.sourceCoverage
    }
  } as SyllabusUpdateResult
}

/**
 * Full syllabus generation / reconciliation from ALL of a subject's materials.
 * Preserves all topic progress, completed study logs, cards, and practice problems.
 */
export async function generateFromAllMaterials(subjectId: number): Promise<SyllabusUpdateResult> {
  return generateSyllabusForSubject(subjectId)
}

/** Shared initial/update path used by class creation and syllabus IPC. */
export function generateSyllabusForSubject(subjectId: number, materialIds?: number[]): Promise<SyllabusUpdateResult> {
  const inFlight = syllabusGenerationInFlight.get(subjectId)
  if (inFlight) return inFlight
  const epoch = (syllabusGenerationEpoch.get(subjectId) ?? 0) + 1
  syllabusGenerationEpoch.set(subjectId, epoch)
  const promise = reconcileSyllabusFromAI(subjectId, materialIds, epoch)
    .finally(() => {
      if (syllabusGenerationInFlight.get(subjectId) === promise) syllabusGenerationInFlight.delete(subjectId)
    })
  syllabusGenerationInFlight.set(subjectId, promise)
  return promise
}

export function registerSyllabusHandlers(): void {
  // ── AI Syllabus Generation ─────────────────────────────────────────────

  // ── Update syllabus when new materials added ───────────────────────────

  ipcMain.handle('syllabus:generateFromMaterials', async (_event, subjectId: number) => {
    return generateSyllabusForSubject(subjectId)
  })

  ipcMain.handle('syllabus:updateFromMaterials', async (_event, subjectId: number, materialIds?: number[]) => {
    return generateSyllabusForSubject(subjectId, materialIds ?? [])
  })

  // ── Reorder modules ────────────────────────────────────────────────────

  ipcMain.handle('syllabus:reorderModules', (_event, subjectId: number, moduleIds: number[]) => {
    const existing = db.prepare('SELECT id FROM syllabus_modules WHERE subject_id = ? ORDER BY sort_order ASC, id ASC').all(subjectId) as { id: number }[]
    const existingIds = existing.map(row => row.id)
    if (!Array.isArray(moduleIds) || moduleIds.length !== existingIds.length || new Set(moduleIds).size !== moduleIds.length || moduleIds.some(id => !existingIds.includes(id))) {
      throw new Error('Module order must contain exactly the modules for this subject')
    }
    const updateOrder = db.transaction((ids: number[]) => {
      for (let i = 0; i < ids.length; i++) {
        db.prepare('UPDATE syllabus_modules SET sort_order = ? WHERE id = ? AND subject_id = ?')
          .run(i, ids[i], subjectId)
      }
    })
    updateOrder(moduleIds)
    return { success: true }
  })

  ipcMain.handle('syllabus:reorderTopics', (_event, moduleId: number, topicIds: number[]) => {
    const module = db.prepare('SELECT id FROM syllabus_modules WHERE id = ?').get(moduleId) as { id: number } | undefined
    if (!module) throw new Error('Module not found')
    const existing = db.prepare('SELECT id FROM module_topics WHERE module_id = ? ORDER BY sort_order ASC, id ASC').all(moduleId) as { id: number }[]
    const existingIds = existing.map(row => row.id)
    if (!Array.isArray(topicIds) || topicIds.length !== existingIds.length || new Set(topicIds).size !== topicIds.length || topicIds.some(id => !existingIds.includes(id))) {
      throw new Error('Topic order must contain exactly the topics for this module')
    }
    db.transaction((ids: number[]) => {
      const update = db.prepare('UPDATE module_topics SET sort_order = ? WHERE id = ? AND module_id = ?')
      ids.forEach((id, index) => update.run(index, id, moduleId))
    })(topicIds)
    return { success: true }
  })

  // ── Save manually created syllabus ─────────────────────────────────────

  ipcMain.handle('syllabus:saveManualSyllabus', (_event, subjectId: number, modules: {
    title: string
    description?: string
    week_number?: number
    hours_estimated?: number
    page_start?: number
    page_end?: number
    chapter_number?: number
    chapter_title?: string
    prerequisites?: string
    topics: { title: string; description?: string }[]
  }[]) => {
    const formattedModules: ParsedReconciledModule[] = modules.map(m => ({
      title: m.title,
      description: m.description || null,
      chapter_number: m.chapter_number ?? null,
      chapter_title: m.chapter_title ?? null,
      page_start: m.page_start ?? null,
      page_end: m.page_end ?? null,
      hours_estimated: m.hours_estimated ?? null,
      prerequisites: m.prerequisites ?? null,
      topics: (m.topics || []).map(t => ({
        title: t.title,
        description: t.description || null,
        matched_previous_topic: t.title,
        coverage_delta: 'identical'
      }))
    }))

    const result = reconcileCurriculum(db, subjectId, formattedModules)
    return result.modules
  })

  // ── User-managed material schedule (kept separate from AI curriculum) ──
  ipcMain.handle('manualSyllabus:list', (_event, subjectId: number) => listManualWeeks(subjectId))

  ipcMain.handle('manualSyllabus:createWeek', (_event, subjectId: number, title: string) => {
    const cleanTitle = String(title || '').trim() || 'New Week'
    const result = db.prepare(`
      INSERT INTO manual_syllabus_weeks (subject_id, title, sort_order)
      VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM manual_syllabus_weeks WHERE subject_id = ?))
    `).run(subjectId, cleanTitle, subjectId)
    return listManualWeeks(subjectId).find(week => week.id === Number(result.lastInsertRowid))
  })

  ipcMain.handle('manualSyllabus:updateWeek', (_event, weekId: number, title: string) => {
    db.prepare('UPDATE manual_syllabus_weeks SET title = ? WHERE id = ?').run(String(title || '').trim() || 'Untitled Week', weekId)
    return { success: true }
  })

  ipcMain.handle('manualSyllabus:deleteWeek', (_event, weekId: number) => {
    db.prepare('DELETE FROM manual_syllabus_weeks WHERE id = ?').run(weekId)
    return { success: true }
  })

  ipcMain.handle('manualSyllabus:assignMaterial', (_event, weekId: number, materialId: number | null) => {
    const week = db.prepare('SELECT subject_id FROM manual_syllabus_weeks WHERE id = ?').get(weekId) as { subject_id: number } | undefined
    if (!week) throw new Error('Manual week not found')
    if (materialId === null) {
      return { success: true }
    }
    const material = db.prepare('SELECT id FROM materials WHERE id = ? AND subject_id = ?').get(materialId, week.subject_id) as { id: number } | undefined
    if (!material) throw new Error('Material does not belong to this subject')
    db.prepare('DELETE FROM manual_syllabus_materials WHERE material_id = ?').run(materialId)
    db.prepare(`
      INSERT INTO manual_syllabus_materials (week_id, material_id, sort_order)
      VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM manual_syllabus_materials WHERE week_id = ?))
    `).run(weekId, materialId, weekId)
    return { success: true }
  })

  ipcMain.handle('manualSyllabus:unassignMaterial', (_event, materialId: number) => {
    db.prepare('DELETE FROM manual_syllabus_materials WHERE material_id = ?').run(materialId)
    return { success: true }
  })

  ipcMain.handle('manualSyllabus:reorderWeeks', (_event, subjectId: number, weekIds: number[]) => {
    const update = db.prepare('UPDATE manual_syllabus_weeks SET sort_order = ? WHERE id = ? AND subject_id = ?')
    const transaction = db.transaction ? db.transaction(() => weekIds.forEach((id, index) => update.run(index, id, subjectId))) : null
    if (transaction) transaction()
    else weekIds.forEach((id, index) => update.run(index, id, subjectId))
    return { success: true }
  })

  ipcMain.handle('manualSyllabus:reorderMaterials', (_event, weekId: number, materialIds: number[]) => {
    const update = db.prepare('UPDATE manual_syllabus_materials SET sort_order = ? WHERE week_id = ? AND material_id = ?')
    const transaction = db.transaction ? db.transaction(() => materialIds.forEach((id, index) => update.run(index, weekId, id))) : null
    if (transaction) transaction()
    else materialIds.forEach((id, index) => update.run(index, weekId, id))
    return { success: true }
  })

  // ── Analyze deadline changes ───────────────────────────────────────────

  ipcMain.handle('syllabus:editDeadline', async (_event, subjectId: number, newDeadline: string) => {
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as
      { name: string; time_commitment_minutes: number } | undefined
    if (!subject) throw new Error('Subject not found')

    const modules = db.prepare(
      'SELECT * FROM syllabus_modules WHERE subject_id = ? ORDER BY sort_order ASC'
    ).all(subjectId) as SyllabusModule[]

    const existingDeadlines = db.prepare(
      'SELECT * FROM deadlines WHERE subject_id = ? ORDER BY deadline_date ASC'
    ).all(subjectId) as { label: string; deadline_date: string; deadline_type: string }[]

    const prompt = `A student is studying "${subject.name}" and has changed their deadline to ${newDeadline}.

Current syllabus modules:
${modules.map(m => `${m.chapter_number ? `Ch. ${m.chapter_number}: ` : ''}${m.title} (${m.hours_estimated}h)`).join('\n')}

Existing deadlines:
${existingDeadlines.map(d => `- ${d.label}: ${d.deadline_date}`).join('\n') || 'None'}

Time commitment: ${Math.max(1, Math.round((subject.time_commitment_minutes || 60) / 60))}h/week

The student needs to complete all material by ${newDeadline}. Analyze whether the current schedule fits the new deadline and propose adjustments if needed.

Respond in JSON:
{
  "fits_deadline": true,
  "proposed_adjustments": "If the schedule doesn't fit, describe what changes you'd make",
  "new_weekly_hours": null,
  "summary": "A brief explanation of whether the deadline is feasible and adjustments."
}

Return ONLY valid JSON. No markdown.`

    const config = getAIConfig()
    const apiKey = getApiKey()
    if (!apiKey) throw new Error('AI API key not configured')

    const responseText = await callAIMessages(
      [{ role: 'user', content: prompt }],
      { ...config, apiKey },
      { type: 'json_object' }
    )

    return parseAIJson(responseText)
  })

  // ── Get single module with topics ──────────────────────────────────────

  ipcMain.handle('syllabus:getModule', (_event, moduleId: number) => {
    const mod = db.prepare('SELECT * FROM syllabus_modules WHERE id = ?').get(moduleId) as SyllabusModule | undefined
    if (!mod) return null
    const topics = db.prepare(`
      SELECT mt.*,
        (
          SELECT COUNT(*) FROM cards c
          WHERE c.subject_id = ?
            AND (
              c.topic_id = mt.id
              OR LOWER(TRIM(c.concept)) = LOWER(TRIM(mt.title))
              OR LOWER(c.concept) LIKE '%' || LOWER(mt.title) || '%'
              OR LOWER(mt.title) LIKE '%' || LOWER(c.concept) || '%'
            )
        ) as card_count
      FROM module_topics mt
      WHERE mt.module_id = ?
      ORDER BY mt.sort_order ASC
    `).all(mod.subject_id, moduleId) as (ModuleTopic & { card_count?: number })[]
    return {
      ...mod,
      topics: topics.map(t => ({
        ...t,
        card_count: Number(t.card_count) || 0
      }))
    }
  })
}

interface UpdateFromMaterialsResult {
  modules: any[]
  new_module_count: number
  new_topic_count: number
  processed_material_count: number
  needs_updates: boolean
  preserved_completed_count?: number
  gap_topic_count?: number
  updated_topic_count?: number
}

export async function updateFromMaterials(
  subjectId: number,
  materialIds?: number[]
): Promise<UpdateFromMaterialsResult> {
  return reconcileSyllabusFromAI(subjectId, materialIds)
}
