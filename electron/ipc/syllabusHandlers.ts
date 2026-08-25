import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { callAIMessages } from './aiHandlers'
import { getAIConfig, getApiKey } from './aiConfigStore'
import type { SyllabusModule, ModuleTopic } from '../../src/types'

let db: Database.Database

export function setSyllabusDatabase(database: Database.Database): void {
  db = database
}

/** Strip markdown code fences from an AI response and parse it as JSON. */
function parseAIJson<T>(responseText: string): T {
  let cleaned = responseText.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return JSON.parse(cleaned)
}

/**
 * Full syllabus generation from ALL of a subject's materials. Destructive by
 * design (it is only ever triggered by an explicit user action), but preserves
 * module completion statuses by matching module titles before/after the rebuild,
 * and marks every material as syllabus_processed.
 */
async function generateFromAllMaterials(subjectId: number) {
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as
    { name: string; time_commitment_minutes: number; subject_type?: string; total_pages?: number; total_chapters?: number } | undefined
  if (!subject) throw new Error('Subject not found')

    const materials = db.prepare(
      'SELECT id, filename, content_text FROM materials WHERE subject_id = ? AND content_text IS NOT NULL'
    ).all(subjectId) as { id: number; filename: string; content_text: string }[]

    if (materials.length === 0) throw new Error('No materials with content found')

    // Build condensed material text (truncated to fit context window)
    const materialSummaries = materials.map(m =>
      `[File: ${m.filename}]\n${m.content_text.substring(0, 4000)}`
    ).join('\n\n---\n\n')

    const weeklyHours = subject.time_commitment_minutes || 60
    const hoursPerWeek = Math.max(1, Math.round(weeklyHours / 60))
    const isBook = subject?.subject_type === 'book'

    let prompt: string
    if (isBook) {
      prompt = `You are an expert curriculum designer. Create a detailed syllabus for a book called "${subject.name}" based on the following source materials.

The student reads approximately ${hoursPerWeek} hour(s) per week.

SOURCE MATERIALS:
${materialSummaries}

Based on these materials, generate a syllabus broken into chapters and topics. Each module represents one book chapter. Each topic is a specific concept from that chapter.

The book has approximately ${subject.total_pages || '?'} pages across ${subject.total_chapters || '?'} chapters. Distribute pages evenly.

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
        { "title": "Topic title", "description": "What this topic covers" }
      ]
    }
  ]
}

Rules:
- Create one module per chapter
- Each module should have 2-5 topics
- Chapters should progress logically
- Each chapter needs prerequisites field (e.g., "Read Chapters 1-2 first")
- Estimate reasonable page ranges based on total pages and chapters
- Return ONLY valid JSON. No markdown. No commentary.`
    } else {
      prompt = `You are an expert curriculum designer. Create a detailed syllabus for "${subject.name}" based on the following source materials.

The student can commit approximately ${hoursPerWeek} hour(s) per week to this class.

SOURCE MATERIALS:
${materialSummaries}

Based on these materials, organize the content into major topics and subtopics. Each module represents one key subject topic. Each topic within a module is a specific subtopic, concept, or skill to master.

Respond in JSON format:
{
  "modules": [
    {
      "title": "Topic Name",
      "description": "Brief description of what this topic covers",
      "hours_estimated": ${hoursPerWeek},
      "prerequisites": "Start here — no prerequisites",
      "topics": [
        { "title": "Subtopic title", "description": "What this subtopic covers" }
      ]
    }
  ]
}

Rules:
- Organize and sort materials logically by topic
- The title of each module must be the descriptive topic name (do NOT use "Week 1", "Week 2", "Module 1", etc.)
- Create 4-12 topic modules depending on the material volume
- Each module should have 2-5 subtopics
- Topics should progress logically (foundations first, then advanced)
- Subtopics should be specific, teachable concepts
- Each module needs prerequisites field (e.g., "Complete [Previous Topic] first")
- Return ONLY valid JSON. No markdown. No commentary.`
    }

    const config = getAIConfig()
    const apiKey = getApiKey()
    if (!apiKey) throw new Error('AI API key not configured. Go to Settings to configure your AI provider.')

    const responseText = await callAIMessages(
      [{ role: 'user', content: prompt }],
      { ...config, apiKey },
      { type: 'json_object' }
    )

    const parsed = parseAIJson<{
      modules: {
        title: string
        description?: string
        week_number?: number
        chapter_number?: number
        chapter_title?: string
        page_start?: number
        page_end?: number
        hours_estimated?: number
        prerequisites?: string
        topics?: { title: string; description?: string }[]
      }[]
    }>(responseText)

    if (!parsed.modules || !Array.isArray(parsed.modules)) {
      throw new Error('Invalid syllabus response: missing modules array')
    }

    // Snapshot completion statuses before the wipe so student progress on
    // matching titles survives regeneration.
    const previousStatuses = db.prepare(
      'SELECT title, status FROM syllabus_modules WHERE subject_id = ?'
    ).all(subjectId) as { title: string; status: string }[]

    // Insert modules and topics in a transaction
    const insertSyllabus = db.transaction((modules: typeof parsed.modules) => {
      // Clear existing syllabus for regeneration
      db.prepare('DELETE FROM module_topics WHERE module_id IN (SELECT id FROM syllabus_modules WHERE subject_id = ?)').run(subjectId)
      db.prepare('DELETE FROM syllabus_modules WHERE subject_id = ?').run(subjectId)

      for (let i = 0; i < modules.length; i++) {
        const mod = modules[i]
        const previousStatus =
          previousStatuses.find(p => p.title === mod.title)?.status || 'pending'
        const modResult = db.prepare(`
          INSERT INTO syllabus_modules
            (subject_id, title, description, week_number, status, hours_estimated, sort_order,
             chapter_number, chapter_title, page_start, page_end, prerequisites)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          subjectId, mod.title, mod.description || null,
          null,
          previousStatus,
          mod.hours_estimated || hoursPerWeek, i,
          isBook ? (mod.chapter_number || i + 1) : null,
          isBook ? mod.title : null,
          isBook ? (mod.page_start || null) : null,
          isBook ? (mod.page_end || null) : null,
          mod.prerequisites || null
        )

        const moduleId = modResult.lastInsertRowid as number

        if (mod.topics && Array.isArray(mod.topics)) {
          for (let j = 0; j < mod.topics.length; j++) {
            const topic = mod.topics[j]
            db.prepare(`
              INSERT INTO module_topics (module_id, title, description, sort_order)
              VALUES (?, ?, ?, ?)
            `).run(moduleId, topic.title, topic.description || null, j)
          }
        }
      }

      // Every material has now been folded into this fresh syllabus.
      db.prepare('UPDATE materials SET syllabus_processed = 1 WHERE subject_id = ?').run(subjectId)
    })

    insertSyllabus(parsed.modules)

    // Mark subject as having syllabus generated
    db.prepare('UPDATE subjects SET syllabus_generated = 1 WHERE id = ?').run(subjectId)

    // Return all modules with topic counts
    return listModulesWithCounts(subjectId)
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
    // Snapshot completion statuses so a manual save that reuses titles keeps progress.
    const previousStatuses = db.prepare(
      'SELECT title, status FROM syllabus_modules WHERE subject_id = ?'
    ).all(subjectId) as { title: string; status: string }[]

    const insertSyllabus = db.transaction(() => {
      db.prepare('DELETE FROM module_topics WHERE module_id IN (SELECT id FROM syllabus_modules WHERE subject_id = ?)').run(subjectId)
      db.prepare('DELETE FROM syllabus_modules WHERE subject_id = ?').run(subjectId)
      db.prepare('UPDATE subjects SET syllabus_generated = 1 WHERE id = ?').run(subjectId)

      for (let i = 0; i < modules.length; i++) {
        const mod = modules[i]
        const previousStatus =
          previousStatuses.find(p => p.title === mod.title)?.status || 'pending'
        const modResult = db.prepare(`
          INSERT INTO syllabus_modules
            (subject_id, title, description, week_number, status, hours_estimated, sort_order,
             page_start, page_end, chapter_number, chapter_title, prerequisites)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          subjectId, mod.title, mod.description || null,
          mod.week_number || null, previousStatus, mod.hours_estimated || 1, i,
          mod.page_start ?? null, mod.page_end ?? null,
          mod.chapter_number ?? null, mod.chapter_title ?? null,
          mod.prerequisites ?? null
        )

        const moduleId = modResult.lastInsertRowid as number
        for (let j = 0; j < mod.topics.length; j++) {
          const topic = mod.topics[j]
          db.prepare(`
            INSERT INTO module_topics (module_id, title, description, sort_order)
            VALUES (?, ?, ?, ?)
          `).run(moduleId, topic.title, topic.description || null, j)
        }
      }
    })
    insertSyllabus()

    return listModulesWithCounts(subjectId)
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

    let cleaned = responseText.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    return JSON.parse(cleaned)
  })

  // ── Get single module with topics ──────────────────────────────────────

  ipcMain.handle('syllabus:getModule', (_event, moduleId: number) => {
    const mod = db.prepare('SELECT * FROM syllabus_modules WHERE id = ?').get(moduleId) as SyllabusModule | undefined
    if (!mod) return null
    const topics = db.prepare(
      'SELECT * FROM module_topics WHERE module_id = ? ORDER BY sort_order ASC'
    ).all(moduleId) as ModuleTopic[]
    return { ...mod, topics }
  })
}

// ── Shared helpers ───────────────────────────────────────────────────────

function listModulesWithCounts(subjectId: number) {
  return db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM module_topics t WHERE t.module_id = m.id) as topic_count
    FROM syllabus_modules m
    WHERE m.subject_id = ?
    ORDER BY m.sort_order ASC
  `).all(subjectId)
}

interface NewModuleInput {
  title: string
  description?: string | null
  week_number?: number | null
  chapter_number?: number | null
  chapter_title?: string | null
  page_start?: number | null
  page_end?: number | null
  hours_estimated?: number | null
  prerequisites?: string | null
  topics?: { title: string; description?: string | null }[]
}

interface UpdateFromMaterialsResult {
  modules: ReturnType<typeof listModulesWithCounts>
  new_module_count: number
  new_topic_count: number
  processed_material_count: number
  needs_updates: boolean
}

/**
 * Incrementally fold unprocessed materials into an existing syllabus WITHOUT
 * touching any existing module or topic rows. The AI proposes brand-new modules
 * and/or extra topics appended to existing ones; nothing is ever deleted here.
 *
 * If explicit materialIds are given they are used, otherwise every material of
 * the subject with syllabus_processed = 0 is picked up. When the subject has no
 * syllabus at all, this delegates to a full generation instead.
 */
async function updateFromMaterials(
  subjectId: number,
  materialIds: number[]
): Promise<UpdateFromMaterialsResult> {
  const subject = db.prepare('SELECT id, name, subject_type FROM subjects WHERE id = ?').get(subjectId) as
    { id: number; name: string; subject_type?: string } | undefined
  if (!subject) throw new Error('Subject not found')

  const isBook = subject.subject_type === 'book'

  // ── Select materials to process ──
  let materials: { id: number; filename: string; content_text: string }[]
  if (materialIds.length > 0) {
    materials = db.prepare(
      `SELECT id, filename, content_text FROM materials
       WHERE subject_id = ? AND content_text IS NOT NULL AND id IN (${materialIds.map(() => '?').join(',')})`
    ).all(subjectId, ...materialIds) as typeof materials
  } else {
    materials = db.prepare(
      `SELECT id, filename, content_text FROM materials
       WHERE subject_id = ? AND content_text IS NOT NULL AND syllabus_processed = 0`
    ).all(subjectId) as typeof materials
  }

  // No syllabus yet (or no modules for some reason) → full generation covers it.
  const moduleCount = db.prepare(
    'SELECT COUNT(*) as count FROM syllabus_modules WHERE subject_id = ?'
  ).get(subjectId) as { count: number }

  if (moduleCount.count === 0 || materials.length === 0) {
    await generateFromAllMaterials(subjectId)
    const modules = listModulesWithCounts(subjectId)
    return {
      modules,
      new_module_count: modules.length,
      new_topic_count: (modules as { topic_count: number }[]).reduce((sum, m) => sum + m.topic_count, 0),
      processed_material_count: materials.length,
      needs_updates: true
    }
  }

  // ── Build AI context: existing modules WITH their topics ──
  const existingModules = listModulesWithCounts(subjectId) as (SyllabusModule & { topic_count: number })[]
  const existingContext = existingModules.map(m => {
    const topics = db.prepare(
      'SELECT title FROM module_topics WHERE module_id = ? ORDER BY sort_order ASC'
    ).all(m.id) as { title: string }[]
    return `- ${m.title}: ${m.description || ''}\n  Topics: ${topics.map(t => t.title).join('; ') || '(none)'}`
  }).join('\n')

  const materialText = materials.map(m =>
    `[File: ${m.filename}]\n${m.content_text.substring(0, 3000)}`
  ).join('\n\n---\n\n')

  const prompt = `You are an expert curriculum designer. A student is studying "${subject.name}" and has added NEW study materials to their ${isBook ? 'book' : 'subject'}.

EXISTING SYLLABUS — these modules already exist and MUST NOT be replaced or restructured:
${existingContext}

NEW MATERIALS:
${materialText}

Integrate the new material into the syllabus INCREMENTALLY:
1. If the new material covers entirely new ground, propose new modules that continue logically after the existing ones.
2. If the new material deepens or extends an EXISTING module's coverage, propose additional topics to APPEND to that module (its existing topics stay untouched).
3. You may blend old and new: e.g. a synthesis topic in an existing module that connects prior topics with concepts from the new material.
4. NEVER propose rewording, reordering, merging or deleting existing modules or their topics.

Respond in JSON:
{
  "needs_updates": true,
  "new_modules": [
    {
      "title": "${isBook ? 'Chapter Title' : 'Descriptive Topic Name'}",
      "description": "Description",
      ${isBook ? '"chapter_number": 5,\n      "page_start": 120,\n      "page_end": 150,' : ''}
      "hours_estimated": 2,
      "prerequisites": "Start here or reference prior topics",
      "topics": [
        { "title": "Subtopic title", "description": "What this subtopic covers" }
      ]
    }
  ],
  "appended_topics": [
    {
      "module_title": "Title of an EXISTING module exactly as listed above",
      "topics": [
        { "title": "New topic title", "description": "What this topic adds" }
      ]
    }
  ],
  "existing_module_assignments": [
    { "material_filename": "filename.pdf", "module_title": "Existing module this material primarily belongs to" }
  ]
}

Rules:
- Use empty arrays when nothing is needed; set needs_updates accordingly.
- ${isBook ? 'New modules represent chapters' : 'New modules represent major topics (do NOT use "Week 1", "Week 2", etc. - use the descriptive topic name)'}
- Each appended topic must be genuinely NEW relative to the module's listed topics — never duplicate them.
- New modules must have 2-5 topics each.
- Every new material filename should appear in existing_module_assignments unless it spans several modules.
- Return ONLY valid JSON. No markdown.`

  const config = getAIConfig()
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('AI API key not configured')

  const responseText = await callAIMessages(
    [{ role: 'user', content: prompt }],
    { ...config, apiKey },
    { type: 'json_object' }
  )

  const parsed = parseAIJson<{
    needs_updates?: boolean
    new_modules?: NewModuleInput[]
    appended_topics?: { module_title: string; topics: { title: string; description?: string }[] }[]
    existing_module_assignments?: { material_filename: string; module_title: string }[]
  }>(responseText)

  const newModules = Array.isArray(parsed.new_modules) ? parsed.new_modules : []
  const appendedTopics = Array.isArray(parsed.appended_topics) ? parsed.appended_topics : []

  // ── Apply inserts atomically. Existing rows are only read, never deleted. ──
  const applyUpdates = db.transaction(() => {
    let newModuleCount = 0
    let newTopicCount = 0

    // Continue the sort_order / chapter sequences after the current tail.
    const tail = db.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS sort_next,
              COALESCE(MAX(chapter_number), 0) AS chapter_next
       FROM syllabus_modules WHERE subject_id = ?`
    ).get(subjectId) as { sort_next: number; chapter_next: number }

    for (let i = 0; i < newModules.length; i++) {
      const mod = newModules[i]
      if (!mod?.title) continue
      const modResult = db.prepare(`
        INSERT INTO syllabus_modules
          (subject_id, title, description, week_number, status, hours_estimated, sort_order,
           chapter_number, chapter_title, page_start, page_end, prerequisites)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        subjectId, mod.title, mod.description || null,
        null,
        mod.hours_estimated || 1, tail.sort_next + i + 1,
        mod.chapter_number ?? (isBook ? tail.chapter_next + i + 1 : null),
        isBook ? mod.title : null,
        mod.page_start ?? null, mod.page_end ?? null,
        mod.prerequisites ?? null
      )
      newModuleCount++

      const moduleId = modResult.lastInsertRowid as number
      const topics = Array.isArray(mod.topics) ? mod.topics : []
      for (let j = 0; j < topics.length; j++) {
        db.prepare(
          'INSERT INTO module_topics (module_id, title, description, sort_order) VALUES (?, ?, ?, ?)'
        ).run(moduleId, topics[j].title, topics[j].description || null, j)
        newTopicCount++
      }
    }

    // Append topics to EXISTING modules — insert-only, after their current max.
    for (const group of appendedTopics) {
      if (!group?.module_title || !Array.isArray(group.topics) || group.topics.length === 0) continue
      const targetModule = db.prepare(
        'SELECT id FROM syllabus_modules WHERE subject_id = ? AND title = ?'
      ).get(subjectId, group.module_title) as { id: number } | undefined
      if (!targetModule) continue

      const topicTail = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS next FROM module_topics WHERE module_id = ?'
      ).get(targetModule.id) as { next: number }

      group.topics.forEach((topic, j) => {
        db.prepare(
          'INSERT INTO module_topics (module_id, title, description, sort_order) VALUES (?, ?, ?, ?)'
        ).run(targetModule.id, topic.title, topic.description || null, topicTail.next + 1 + j)
        newTopicCount++
      })
    }

    // Assign materials to modules where the AI suggested a fit.
    for (const assignment of parsed.existing_module_assignments || []) {
      const material = materials.find(m => m.filename === assignment.material_filename)
      if (!material || !assignment.module_title) continue
      const targetModule = db.prepare(
        'SELECT id FROM syllabus_modules WHERE subject_id = ? AND title = ?'
      ).get(subjectId, assignment.module_title) as { id: number } | undefined
      if (targetModule) {
        db.prepare('UPDATE materials SET module_id = ? WHERE id = ?').run(targetModule.id, material.id)
      }
    }

    // Everything selected has now been folded in — don't process it again.
    db.prepare(
      `UPDATE materials SET syllabus_processed = 1 WHERE subject_id = ?
       AND id IN (${materials.map(() => '?').join(',')})`
    ).run(subjectId, ...materials.map(m => m.id))
    db.prepare('UPDATE subjects SET syllabus_generated = 1 WHERE id = ?').run(subjectId)

    return { newModuleCount, newTopicCount }
  })

  const { newModuleCount, newTopicCount } = applyUpdates()

  return {
    modules: listModulesWithCounts(subjectId),
    new_module_count: newModuleCount,
    new_topic_count: newTopicCount,
    processed_material_count: materials.length,
    needs_updates: newModuleCount > 0 || newTopicCount > 0
  }
}
