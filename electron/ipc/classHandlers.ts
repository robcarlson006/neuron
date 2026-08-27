import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { callAIMessages } from './aiHandlers'
import { getAIConfig, getApiKey } from './aiConfigStore'
import { safeParseAIJson, safeParseAICards } from '../../src/lib/jsonRepair'
import { consolidateCardTopics } from '../../src/lib/topicClustering'
import { getOrCreateMaterialFolder } from './materialFolderHelper'
import type { ClassCreationData, Subject } from '../../src/types'

let db: Database.Database

export function setClassDatabase(database: Database.Database): void {
  db = database
}

export function registerClassHandlers(): void {
  // ── Create a class (subject + materials + deadlines + optional syllabus) ──

  ipcMain.handle('class:create', async (_event, userId: number, data: ClassCreationData) => {
    if (!data.name?.trim()) throw new Error('Class name is required')

    // 1. Create the subject (extended with class metadata)
    const subjectResult = db.prepare(`
      INSERT INTO subjects (user_id, name, status, course_code, subject_type, time_commitment_minutes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      data.name.trim(),
      data.status || 'active',
      data.courseCode || null,
      data.subjectType || 'class',
      data.timeCommitmentMinutes || 60,
      new Date().toISOString()
    )

    const subjectId = subjectResult.lastInsertRowid as number
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as Subject

    // 2. Save materials
    const savedMaterials: { id: number; filename: string; fileType: string }[] = []
    if (data.materials?.length > 0) {
      const insertMaterial = db.prepare(`
        INSERT INTO materials (subject_id, filename, file_type, content_text, uploaded_at)
        VALUES (?, ?, ?, ?, ?)
      `)

      for (const material of data.materials) {
        const result = insertMaterial.run(
          subjectId,
          material.filename,
          material.fileType,
          material.contentText,
          new Date().toISOString()
        )
        savedMaterials.push({
          id: result.lastInsertRowid as number,
          filename: material.filename,
          fileType: material.fileType
        })
      }
    }

    // 3. Save deadlines
    const savedDeadlines: { id: number; label: string }[] = []
    const deadlines = data.deadlines ?? []
    if (deadlines.length > 0) {
      const insertDeadline = db.prepare(`
        INSERT INTO deadlines (subject_id, label, deadline_date, deadline_type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)

      for (const dl of deadlines) {
        const result = insertDeadline.run(
          subjectId,
          dl.label,
          dl.deadline_date,
          dl.deadline_type,
          new Date().toISOString()
        )
        savedDeadlines.push({
          id: result.lastInsertRowid as number,
          label: dl.label
        })
      }
    }

    // 4. Generate syllabus if requested
    let syllabusModules: unknown[] = []
    if (data.syllabusOption === 'generate' && savedMaterials.length > 0) {
      try {
        syllabusModules = await generateSyllabusForClass(subjectId)
      } catch (err) {
        console.error('Syllabus generation failed (non-fatal):', err)
        // Non-fatal - class was created, user can generate syllabus later
      }

      // Fire-and-forget card generation
      if (syllabusModules.length > 0) {
        generateCardsAsync(subjectId, savedMaterials.map(m => m.id)).catch(err =>
          console.error('Background card generation error:', err)
        )
      }
    }

    return {
      success: true,
      subject,
      materials: savedMaterials,
      deadlines: savedDeadlines,
      syllabusModules,
      syllabusGenerated: data.syllabusOption === 'generate' && syllabusModules.length > 0
    }
  })

  // ── Add materials to an existing class ──────────────────────────────────

  ipcMain.handle('class:addMaterials', async (_event, subjectId: number, materials: {
    filename: string
    fileType: string
    contentText: string
    filePath?: string
  }[]) => {
    if (!materials?.length) throw new Error('No materials provided')

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as Subject | undefined
    if (!subject) throw new Error('Subject not found')

    const insertMaterial = db.prepare(`
      INSERT INTO materials (subject_id, filename, file_type, content_text, uploaded_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    const savedMaterials: { id: number; filename: string }[] = []
    for (const material of materials) {
      const result = insertMaterial.run(
        subjectId,
        material.filename,
        material.fileType,
        material.contentText,
        new Date().toISOString()
      )
      savedMaterials.push({
        id: result.lastInsertRowid as number,
        filename: material.filename
      })
    }

    // Fire-and-forget card generation for new materials
    generateCardsAsync(subjectId, savedMaterials.map(m => m.id)).catch(err =>
      console.error('Background card generation for new materials error:', err)
    )

    return {
      success: true,
      materials: savedMaterials,
      materialCount: savedMaterials.length
    }
  })
}

// ── Internal syllabus generation helper ────────────────────────────────────

async function generateSyllabusForClass(subjectId: number): Promise<unknown[]> {
  // Get the subject and its materials
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as
    { name: string; time_commitment_minutes: number; subject_type?: string; total_pages?: number; total_chapters?: number } | undefined
  if (!subject) throw new Error('Subject not found')

  const materials = db.prepare(
    'SELECT id, filename, content_text FROM materials WHERE subject_id = ? AND content_text IS NOT NULL'
  ).all(subjectId) as { id: number; filename: string; content_text: string }[]

  if (materials.length === 0) throw new Error('No materials found')

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

Respond in JSON format:
{
  "modules": [
    {
      "title": "Chapter title",
      "description": "Brief description",
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
- Return ONLY valid JSON. No markdown. No commentary.`
  } else {
    prompt = `You are an expert curriculum designer. Create a detailed syllabus for "${subject.name}" based on the following source materials.

The student can commit approximately ${hoursPerWeek} hour(s) per week.

SOURCE MATERIALS:
${materialSummaries}

Based on these materials, organize the content into major topics and subtopics. Each module represents one key subject topic (e.g. "Cell Structure & Function", "Linear Equations", etc.). Each topic within a module is a specific subtopic or concept to master.

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
- Create 4-12 topic modules depending on material volume
- Each module should have 2-5 subtopics
- Topics should progress logically (foundational concepts first, then advanced concepts)
- Each module needs prerequisites field
- Return ONLY valid JSON. No markdown. No commentary.`
  }

  const config = getAIConfig()
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('AI API key not configured')

  const responseText = await callAIMessages(
    [{ role: 'user', content: prompt }],
    { ...config, apiKey },
    { type: 'json_object' }
  )

  const parsed = safeParseAIJson<{ modules?: any[] }>(responseText, { modules: [] })

  if (!parsed.modules || !Array.isArray(parsed.modules)) {
    throw new Error('Invalid syllabus response: missing modules array')
  }

  // Insert modules and topics in a transaction
  const insertSyllabus = db.transaction((modules: typeof parsed.modules) => {
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
        null,
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

  // Mark subject as having syllabus generated; all its materials are now folded in
  db.prepare('UPDATE subjects SET syllabus_generated = 1 WHERE id = ?').run(subjectId)
  db.prepare('UPDATE materials SET syllabus_processed = 1 WHERE subject_id = ?').run(subjectId)

  return db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM module_topics t WHERE t.module_id = m.id) as topic_count
    FROM syllabus_modules m
    WHERE m.subject_id = ?
    ORDER BY m.sort_order ASC
  `).all(subjectId)
}

// ── Background card generation (fire-and-forget) ──────────────────────────

async function generateCardsAsync(subjectId: number, materialIds: number[]): Promise<void> {
  try {
    // Dynamic import of renderer-side code — promptBuilders uses no Node.js APIs
    const { buildAutoCardGenerationPrompt } = await import('../../src/lib/promptBuilders')

    for (const materialId of materialIds) {
      const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId) as
        { filename: string; content_text: string } | undefined
      if (!material || !material.content_text || material.content_text.length < 100) continue

      const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId) as
        { name: string } | undefined
      if (!subject) continue

      const existingCards = db.prepare(
        'SELECT front, back FROM cards WHERE subject_id = ? AND material_id IS NOT NULL'
      ).all(subjectId) as { front: string; back: string }[]

      const prompt = buildAutoCardGenerationPrompt(
        material.content_text, subject.name, undefined, undefined, existingCards, 5, 3
      )

      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) continue

      const responseText = await callAIMessages(
        [{ role: 'user', content: prompt }],
        { ...config, apiKey },
        { type: 'json_object' }
      )

      const parsed = safeParseAICards(responseText)

      const rawCards: Partial<Card>[] = []
      for (const fc of (parsed.flashcards || [])) {
        if (fc.front?.trim() && fc.back?.trim()) {
          rawCards.push({
            type: 'flashcard',
            front: fc.front.trim(),
            back: fc.back.trim(),
            concept: fc.concept
          })
        }
      }
      for (const ar of (parsed.active_recall || [])) {
        if (ar.question?.trim() && ar.model_answer?.trim()) {
          rawCards.push({
            type: 'active_recall',
            front: ar.question.trim(),
            back: ar.model_answer.trim(),
            concept: ar.concept
          })
        }
      }

      const consolidated = consolidateCardTopics(rawCards, {
        maxTopics: 4,
        defaultTopic: subject.name
      })

      const folderId = getOrCreateMaterialFolder(db, subjectId, materialId)

      const insertCard = db.prepare(`
        INSERT INTO cards (subject_id, material_id, type, front, back, concept, folder_id, is_manual, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'auto', ?)
      `)
      const insertSchedule = db.prepare(
        'INSERT OR REPLACE INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date, last_reviewed_at) VALUES (?, ?, 1, 0, 1.3, ?, null)'
      )

      const firstUser = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as { id: number } | undefined
      const uid = firstUser?.id ?? 1
      const now = new Date().toISOString()

      db.transaction(() => {
        for (const c of consolidated) {
          const r = insertCard.run(subjectId, materialId, c.type, c.front, c.back, c.concept || subject.name, folderId, now)
          insertSchedule.run(r.lastInsertRowid, uid, now)
        }
      })()
    }
  } catch (err) {
    console.error('Background card generation error:', err)
  }
}
