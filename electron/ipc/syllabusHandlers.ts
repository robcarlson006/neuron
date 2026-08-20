import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { callAIMessages } from './aiHandlers'
import { getAIConfig, getApiKey } from './aiConfigStore'
import type { SyllabusModule, ModuleTopic } from '../../src/types'

let db: Database.Database

export function setSyllabusDatabase(database: Database.Database): void {
  db = database
}

export function registerSyllabusHandlers(): void {
  // ── AI Syllabus Generation ─────────────────────────────────────────────

  ipcMain.handle('syllabus:generateFromMaterials', async (_event, subjectId: number) => {
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
      prompt = `You are an expert curriculum designer. Create a detailed syllabus for a class called "${subject.name}" based on the following source materials.

The student can commit approximately ${hoursPerWeek} hour(s) per week to this class.

SOURCE MATERIALS:
${materialSummaries}

Based on these materials, generate a syllabus broken into modules and topics. Each module represents one week of study. Each topic within a module is a specific concept or skill to master.

Respond in JSON format:
{
  "modules": [
    {
      "title": "Module title",
      "description": "Brief description of what this module covers",
      "week_number": 1,
      "hours_estimated": ${hoursPerWeek},
      "prerequisites": "Start here — no prerequisites",
      "topics": [
        { "title": "Topic title", "description": "What this topic covers" }
      ]
    }
  ]
}

Rules:
- Create 4-12 modules depending on the material volume
- Each module should have 2-5 topics
- Modules should progress logically (foundations first, then advanced)
- Topics should be specific, teachable concepts
- Each module needs prerequisites field (e.g., "Complete Module 1 first")
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

    let cleaned = responseText.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    const parsed = JSON.parse(cleaned)

    if (!parsed.modules || !Array.isArray(parsed.modules)) {
      throw new Error('Invalid syllabus response: missing modules array')
    }

    // Insert modules and topics in a transaction
    const insertSyllabus = db.transaction((modules: typeof parsed.modules) => {
      // Clear existing syllabus for regeneration
      db.prepare('DELETE FROM module_topics WHERE module_id IN (SELECT id FROM syllabus_modules WHERE subject_id = ?)').run(subjectId)
      db.prepare('DELETE FROM syllabus_modules WHERE subject_id = ?').run(subjectId)

      for (let i = 0; i < modules.length; i++) {
        const mod = modules[i]
        const modResult = db.prepare(`
          INSERT INTO syllabus_modules
            (subject_id, title, description, week_number, status, hours_estimated, sort_order,
             chapter_number, chapter_title, page_start, page_end, prerequisites)
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          subjectId, mod.title, mod.description || null,
          isBook ? null : (mod.week_number || i + 1),
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
    })

    insertSyllabus(parsed.modules)

    // Mark subject as having syllabus generated
    db.prepare('UPDATE subjects SET syllabus_generated = 1 WHERE id = ?').run(subjectId)

    // Return all modules with topic counts
    return db.prepare(`
      SELECT m.*,
        (SELECT COUNT(*) FROM module_topics t WHERE t.module_id = m.id) as topic_count
      FROM syllabus_modules m
      WHERE m.subject_id = ?
      ORDER BY m.sort_order ASC
    `).all(subjectId)
  })

  // ── Update syllabus when new materials added ───────────────────────────

  ipcMain.handle('syllabus:updateFromMaterials', async (_event, subjectId: number, materialIds: number[]) => {
    if (materialIds.length === 0) throw new Error('No materials specified')

    const materials = db.prepare(
      'SELECT id, filename, content_text FROM materials WHERE id IN (' + materialIds.map(() => '?').join(',') + ')'
    ).all(...materialIds) as { id: number; filename: string; content_text: string }[]

    if (materials.length === 0) throw new Error('No materials found')

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as { name: string } | undefined
    if (!subject) throw new Error('Subject not found')

    // Get existing modules for context
    const existingModules = db.prepare(
      'SELECT title, description FROM syllabus_modules WHERE subject_id = ? ORDER BY sort_order ASC'
    ).all(subjectId) as { title: string; description: string }[]

    const existingContext = existingModules.length > 0
      ? `Existing syllabus modules:\n${existingModules.map(m => `- ${m.title}: ${m.description || ''}`).join('\n')}`
      : 'No existing syllabus yet.'

    const materialText = materials.map(m =>
      `[File: ${m.filename}]\n${m.content_text.substring(0, 3000)}`
    ).join('\n\n---\n\n')

    const prompt = `You are an expert curriculum designer. A student is studying "${subject.name}" and has added new materials to their class.

${existingContext}

NEW MATERIALS:
${materialText}

Based on these new materials, should new modules be added to the syllabus? If the new material fits within existing modules, indicate which module it belongs to. If it covers entirely new topics, propose new modules.

Respond in JSON:
{
  "new_modules": [
    {
      "title": "New module title",
      "description": "Description",
      "week_number": null,
      "hours_estimated": 1,
      "topics": [
        { "title": "Topic title", "description": "Description" }
      ]
    }
  ],
  "existing_module_assignments": [
    { "material_filename": "filename", "module_title": "Existing module title" }
  ],
  "needs_new_modules": true
}

If no new modules are needed, set needs_new_modules to false and new_modules to [].
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
    const parsed = JSON.parse(cleaned)

    // Insert any new modules
    if (parsed.needs_new_modules && parsed.new_modules?.length > 0) {
      const maxOrder = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM syllabus_modules WHERE subject_id = ?'
      ).get(subjectId) as { next: number }

      const insertNew = db.transaction((modules: typeof parsed.new_modules) => {
        for (let i = 0; i < modules.length; i++) {
          const mod = modules[i]
          const modResult = db.prepare(`
            INSERT INTO syllabus_modules
              (subject_id, title, description, week_number, status, hours_estimated, sort_order,
               page_start, page_end, chapter_number, chapter_title, prerequisites)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
          `).run(
            subjectId, mod.title, mod.description || null,
            mod.week_number || null, mod.hours_estimated || 1, maxOrder.next + i,
            mod.page_start ?? null, mod.page_end ?? null,
            mod.chapter_number ?? null, mod.chapter_title ?? null,
            mod.prerequisites ?? null
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
      })
      insertNew(parsed.new_modules)
    }

    // Assign materials to modules where suggested
    if (parsed.existing_module_assignments) {
      for (const assignment of parsed.existing_module_assignments) {
        const material = materials.find(m => m.filename === assignment.material_filename)
        if (material) {
          const targetModule = db.prepare(
            'SELECT id FROM syllabus_modules WHERE subject_id = ? AND title = ?'
          ).get(subjectId, assignment.module_title) as { id: number } | undefined
          if (targetModule) {
            db.prepare('UPDATE materials SET module_id = ? WHERE id = ?').run(targetModule.id, material.id)
          }
        }
      }
    }

    return db.prepare(`
      SELECT m.*,
        (SELECT COUNT(*) FROM module_topics t WHERE t.module_id = m.id) as topic_count
      FROM syllabus_modules m
      WHERE m.subject_id = ?
      ORDER BY m.sort_order ASC
    `).all(subjectId)
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
    const insertSyllabus = db.transaction(() => {
      db.prepare('DELETE FROM module_topics WHERE module_id IN (SELECT id FROM syllabus_modules WHERE subject_id = ?)').run(subjectId)
      db.prepare('DELETE FROM syllabus_modules WHERE subject_id = ?').run(subjectId)
      db.prepare('UPDATE subjects SET syllabus_generated = 1 WHERE id = ?').run(subjectId)

      for (let i = 0; i < modules.length; i++) {
        const mod = modules[i]
        const modResult = db.prepare(`
          INSERT INTO syllabus_modules
            (subject_id, title, description, week_number, status, hours_estimated, sort_order,
             page_start, page_end, chapter_number, chapter_title, prerequisites)
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          subjectId, mod.title, mod.description || null,
          mod.week_number || null, mod.hours_estimated || 1, i,
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

    return db.prepare(`
      SELECT m.*,
        (SELECT COUNT(*) FROM module_topics t WHERE t.module_id = m.id) as topic_count
      FROM syllabus_modules m
      WHERE m.subject_id = ?
      ORDER BY m.sort_order ASC
    `).all(subjectId)
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
${modules.map(m => `Week ${m.week_number || '?'}: ${m.title} (${m.hours_estimated}h)`).join('\n')}

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
