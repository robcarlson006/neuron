import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { callAIMessages } from './aiHandlers'
import { getAIConfig, getApiKey } from './aiConfigStore'
import { safeParseAIJson } from '../../src/lib/jsonRepair'
import { buildComprehensiveOutline } from '../../src/lib/coverage/documentTopologyParser'
import type { SyllabusModule, ModuleTopic } from '../../src/types'
import { syncModuleCompletionStatus } from './tutorHandlers'

let db: Database.Database

export function setSyllabusDatabase(database: Database.Database): void {
  db = database
}

/** Strip markdown code fences from an AI response and parse it as JSON safely. */
function parseAIJson<T>(responseText: string): T {
  return safeParseAIJson<T>(responseText, {} as T)
}

export interface ParsedReconciledTopic {
  title: string
  description?: string | null
  matched_previous_topic?: string | null
  coverage_delta?: 'identical' | 'deepened' | 'new_topic' | 'new_prerequisite'
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

    for (let i = 0; i < plannedModules.length; i++) {
      const plan = plannedModules[i]
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

      // Re-anchor or insert topics
      for (let j = 0; j < plan.topics.length; j++) {
        const tp = plan.topics[j]
        if (tp.existingTopicId) {
          database.prepare(`
            UPDATE module_topics
            SET module_id = ?, title = ?, description = ?, sort_order = ?,
                has_new_material = ?, is_gap = ?
            WHERE id = ?
          `).run(
            moduleId, tp.topicData.title, tp.topicData.description || null, j,
            tp.hasNewMaterial ? 1 : 0, tp.isGap ? 1 : 0,
            tp.existingTopicId
          )
        } else {
          database.prepare(`
            INSERT INTO module_topics (module_id, title, description, sort_order, has_new_material, is_gap)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            moduleId, tp.topicData.title, tp.topicData.description || null, j,
            tp.hasNewMaterial ? 1 : 0, tp.isGap ? 1 : 0
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
async function reconcileSyllabusFromAI(subjectId: number, targetMaterialIds?: number[]) {
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as
    { id: number; name: string; time_commitment_minutes: number; subject_type?: string; total_pages?: number; total_chapters?: number } | undefined
  if (!subject) throw new Error('Subject not found')

  let materials: { id: number; filename: string; content_text: string }[]
  if (targetMaterialIds && targetMaterialIds.length > 0) {
    materials = db.prepare(
      `SELECT id, filename, content_text FROM materials WHERE subject_id = ? AND content_text IS NOT NULL AND id IN (${targetMaterialIds.map(() => '?').join(',')})`
    ).all(subjectId, ...targetMaterialIds) as typeof materials
  } else {
    materials = db.prepare(
      'SELECT id, filename, content_text FROM materials WHERE subject_id = ? AND content_text IS NOT NULL'
    ).all(subjectId) as typeof materials
  }

  if (materials.length === 0) throw new Error('No materials with content found')

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
    buildComprehensiveOutline(m.content_text, m.filename)
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
- Return ONLY valid JSON. No markdown. No commentary.`

  const config = getAIConfig()
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('AI API key not configured. Go to Settings to configure your AI provider.')

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

  const result = reconcileCurriculum(
    db,
    subjectId,
    parsed.modules,
    actualUserId,
    parsed.material_module_assignments
  )

  return {
    ...result,
    processed_material_count: materials.length
  }
}

/**
 * Full syllabus generation / reconciliation from ALL of a subject's materials.
 * Preserves all topic progress, completed study logs, cards, and practice problems.
 */
async function generateFromAllMaterials(subjectId: number) {
  const result = await reconcileSyllabusFromAI(subjectId)
  return result.modules
}

export function registerSyllabusHandlers(): void {
  // ── AI Syllabus Generation ─────────────────────────────────────────────

  // ── Update syllabus when new materials added ───────────────────────────

  ipcMain.handle('syllabus:generateFromMaterials', async (_event, subjectId: number) => {
    return generateFromAllMaterials(subjectId)
  })

  ipcMain.handle('syllabus:updateFromMaterials', async (_event, subjectId: number, materialIds?: number[]) => {
    return updateFromMaterials(subjectId, materialIds ?? [])
  })

  // ── Reorder modules ────────────────────────────────────────────────────

  ipcMain.handle('syllabus:reorderModules', (_event, subjectId: number, moduleIds: number[]) => {
    const updateOrder = db.transaction((ids: number[]) => {
      for (let i = 0; i < ids.length; i++) {
        db.prepare('UPDATE syllabus_modules SET sort_order = ? WHERE id = ? AND subject_id = ?')
          .run(i, ids[i], subjectId)
      }
    })
    updateOrder(moduleIds)
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

async function updateFromMaterials(
  subjectId: number,
  materialIds?: number[]
): Promise<UpdateFromMaterialsResult> {
  return reconcileSyllabusFromAI(subjectId, materialIds)
}
