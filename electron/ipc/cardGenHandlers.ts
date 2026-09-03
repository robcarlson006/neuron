import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { callAIMessages } from './aiHandlers'
import { getAIConfig, getApiKey } from './aiConfigStore'
import { buildAutoCardGenerationPrompt, buildFlashcardOnlyPrompt, buildActiveRecallOnlyPrompt } from '../../src/lib/promptBuilders'
import { findCardDuplicates } from '../../src/lib/cardDeduplication'
import { safeParseAICards } from '../../src/lib/jsonRepair'
import { consolidateCardTopics } from '../../src/lib/topicClustering'
import { getOrCreateMaterialFolder } from './materialFolderHelper'
import type { Card } from '../../src/types'

let db: Database.Database

export function setCardGenerationDatabase(database: Database.Database): void {
  db = database
}

export function registerCardGenerationHandlers(): void {
  // ── Auto-generate cards from a single material ──────────────────────────

  ipcMain.handle('cards:autoGenerate', async (_event, subjectId: number, materialId: number) => {
    try {
      const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId) as
        { filename: string; content_text: string; module_id: number | null } | undefined
      if (!material) throw new Error('Material not found')

      const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as
        { name: string } | undefined
      if (!subject) throw new Error('Subject not found')

      if (!material.content_text || material.content_text.length < 100) {
        return { success: false, count: 0, error: 'Material content too short (< 100 chars)' }
      }

      let moduleTitle: string | undefined
      if (material.module_id) {
        const mod = db.prepare('SELECT title FROM syllabus_modules WHERE id = ?').get(material.module_id) as
          { title: string } | undefined
        if (mod) moduleTitle = mod.title
      }

      const existingCards = db.prepare(
        'SELECT front, back FROM cards WHERE subject_id = ? AND material_id IS NOT NULL'
      ).all(subjectId) as { front: string; back: string }[]

      const prompt = buildAutoCardGenerationPrompt(
        material.content_text,
        subject.name,
        moduleTitle,
        undefined,
        existingCards,
        8, 4
      )

      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) throw new Error('AI API key not configured. Go to Settings to configure your AI provider.')

      const responseText = await callAIMessages(
        [{ role: 'user', content: prompt }],
        { ...config, apiKey },
        { type: 'json_object' }
      )

      // Parse the response using bulletproof parser
      const parsed = safeParseAICards(responseText)
      let flashcardsData = parsed.flashcards || []
      let activeRecallData = parsed.active_recall || []

      if (parsed.cards && Array.isArray(parsed.cards)) {
        const extraFlashcards = parsed.cards
          .filter(c => c.type === 'flashcard' || !c.type)
          .map(c => ({ front: c.front || '', back: c.back || '', concept: c.concept }))
        const extraActiveRecall = parsed.cards
          .filter(c => c.type === 'active_recall')
          .map(c => ({ question: c.question || c.front || '', model_answer: c.model_answer || c.back || '', concept: c.concept }))
        if (extraFlashcards.length > 0) flashcardsData = [...flashcardsData, ...extraFlashcards]
        if (extraActiveRecall.length > 0) activeRecallData = [...activeRecallData, ...extraActiveRecall]
      }

      const validFlashcards = flashcardsData.filter(fc =>
        typeof fc.front === 'string' && typeof fc.back === 'string' &&
        fc.front.trim().length > 0 && fc.back.trim().length > 0
      )
      const validActiveRecall = activeRecallData.filter(ar =>
        typeof ar.question === 'string' && typeof ar.model_answer === 'string' &&
        ar.question.trim().length > 0 && ar.model_answer.trim().length > 0
      )

      const validatedCards: Partial<Card>[] = []

      for (const fc of validFlashcards) {
        const base = {
          subject_id: subjectId,
          material_id: materialId,
          topic_id: material.module_id || null,
          concept: fc.concept || moduleTitle || null,
          type: 'flashcard' as const,
          front: fc.front.trim(),
          back: fc.back.trim(),
          is_manual: 0 as const,
          source: 'auto'
        }
        const { valid, cards } = validateCardQuality(base)
        if (valid) {
          validatedCards.push(...cards.map(c => ({
            ...base,
            front: c.front,
            back: c.back,
            quality_score: c.quality_score ?? 0.85
          })))
        }
      }

      for (const ar of validActiveRecall) {
        const base = {
          subject_id: subjectId,
          material_id: materialId,
          topic_id: material.module_id || null,
          concept: ar.concept || moduleTitle || null,
          type: 'active_recall' as const,
          front: ar.question.trim(),
          back: ar.model_answer.trim(),
          is_manual: 0 as const,
          source: 'auto'
        }
        const { valid, cards } = validateCardQuality(base)
        if (valid) {
          validatedCards.push(...cards.map(c => ({
            ...base,
            front: c.front,
            back: c.back,
            quality_score: c.quality_score ?? 0.85
          })))
        }
      }

      if (validatedCards.length === 0) {
        return { success: false, count: 0, error: 'No valid cards passed quality check' }
      }

      const savedCards = saveGeneratedCards(validatedCards, db)
      return { success: true, count: savedCards.length, filename: material.filename }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('Card auto-generation error:', errMsg)
      return { success: false, count: 0, error: errMsg }
    }
  })

  // ── Batch generate cards for multiple materials ─────────────────────────

  ipcMain.handle('cards:batchGenerate', async (_event, subjectId: number, materialIds?: number[]) => {
    let materials: { id: number; filename: string }[]

    if (materialIds && materialIds.length > 0) {
      const placeholders = materialIds.map(() => '?').join(',')
      materials = db.prepare(
        `SELECT id, filename FROM materials WHERE id IN (${placeholders}) AND subject_id = ?`
      ).all(...materialIds, subjectId) as { id: number; filename: string }[]
    } else {
      materials = db.prepare(`
        SELECT m.id, m.filename FROM materials m
        WHERE m.subject_id = ? AND m.content_text IS NOT NULL AND LENGTH(m.content_text) > 100
      `).all(subjectId) as { id: number; filename: string }[]
    }

    const results: { materialId: number; filename: string; success: boolean; count: number; error?: string }[] = []
    for (const material of materials) {
      try {
        const handlerResult = await handleAutoGenerate(subjectId, material.id)
        results.push({ materialId: material.id, filename: material.filename, ...handlerResult })
      } catch (err) {
        results.push({
          materialId: material.id,
          filename: material.filename,
          success: false,
          count: 0,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    const totalGenerated = results.reduce((sum, r) => sum + (r.count || 0), 0)
    const failed = results.filter(r => !r.success).length
    return { success: true, results, totalGenerated, totalFailed: failed, totalProcessed: results.length }
  })

  // ── Check generation status for a subject ───────────────────────────────

  ipcMain.handle('cards:generateStatus', (_event, subjectId: number) => {
    const total = db.prepare(
      'SELECT COUNT(*) as count FROM materials WHERE subject_id = ? AND content_text IS NOT NULL'
    ).get(subjectId) as { count: number }

    const withCards = db.prepare(`
      SELECT COUNT(DISTINCT m.id) as count FROM materials m
      INNER JOIN cards c ON c.material_id = m.id
      WHERE m.subject_id = ?
    `).get(subjectId) as { count: number }

    return {
      totalFiles: total.count,
      filesWithCards: withCards.count,
      pending: total.count - withCards.count
    }
  })

  // ── Generate cards from a syllabus module ────────────────────────────────

  type CardType = 'flashcard' | 'active_recall'

  async function generateCardsFromModule(
    subjectId: number,
    moduleId: number,
    cardType: CardType,
    buildPrompt: (text: string, subject?: string, moduleTitle?: string, min?: number, existing?: { front: string; back?: string }[]) => string,
    minCount: number,
    responseKey: 'flashcards' | 'active_recall',
    userId?: number
  ): Promise<{ success: boolean; count: number; module_name?: string; error?: string; duplicates_filtered?: number }> {
    try {
      const mod = db.prepare(`
        SELECT sm.*, GROUP_CONCAT(mt.title, '||') as topic_titles,
               GROUP_CONCAT(mt.description, '||') as topic_descriptions
        FROM syllabus_modules sm
        LEFT JOIN module_topics mt ON mt.module_id = sm.id
        WHERE sm.id = ?
        GROUP BY sm.id
      `).get(moduleId) as {
        id: number; title: string; description?: string
        chapter_number?: number; chapter_title?: string
        topic_titles?: string; topic_descriptions?: string
      } | undefined

      if (!mod) throw new Error('Module not found')

      const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId) as
        { name: string } | undefined
      if (!subject) throw new Error('Subject not found')

      const existingCards = db.prepare(
        'SELECT front, back FROM cards WHERE subject_id = ?'
      ).all(subjectId) as { front: string; back: string }[]

      const materials = db.prepare(`
        SELECT content_text, filename FROM materials
        WHERE subject_id = ? AND (module_id = ? OR module_id IS NULL)
        AND content_text IS NOT NULL AND LENGTH(content_text) > 100
        ORDER BY uploaded_at DESC LIMIT 5
      `).all(subjectId, moduleId) as { content_text: string; filename: string }[]

      const topicText = mod.topic_titles
        ? `Topics covered:\n${mod.topic_titles.split('||').map((t, i) => {
            const desc = mod.topic_descriptions?.split('||')[i]
            return `- ${t}${desc ? `: ${desc}` : ''}`
          }).join('\n')}`
        : ''

      const materialText = materials.length > 0
        ? `\n\nSource material:\n${materials.map(m =>
            `[${m.filename}]: ${m.content_text.substring(0, 3000)}`
          ).join('\n\n')}`
        : ''

      const contextText = `Module: ${mod.title}${mod.chapter_number ? ` (Chapter ${mod.chapter_number})` : ''}
${mod.description || ''}
${topicText}
${materialText}`

      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) throw new Error('AI API key not configured')

      const BATCH_SIZE = 8
      let remaining = Math.max(1, minCount)
      const runningExistingCards = [...existingCards]
      const allCandidateCards: Partial<Card>[] = []
      let totalDuplicatesFiltered = 0

      while (remaining > 0) {
        const batchTarget = Math.min(remaining, BATCH_SIZE)
        const prompt = buildPrompt(contextText, subject.name, mod.title, batchTarget, runningExistingCards)

        const responseText = await callAIMessages(
          [{ role: 'user', content: prompt }],
          { ...config, apiKey },
          { type: 'json_object' }
        )

        const parsed = safeParseAICards(responseText)

        // Build raw card data from the response key
        let rawCards: { front: string; back: string; concept?: string }[] = []
        if (responseKey === 'flashcards') {
          if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
            rawCards = parsed.flashcards
          } else if (parsed.cards && Array.isArray(parsed.cards)) {
            rawCards = (parsed.cards as { type?: string; front?: string; back?: string; concept?: string }[])
              .filter(c => c.type === 'flashcard' || !c.type)
              .map(c => ({ front: c.front || '', back: c.back || '', concept: c.concept }))
          }
        } else {
          if (parsed.active_recall && Array.isArray(parsed.active_recall)) {
            rawCards = parsed.active_recall.map(ar => ({
              front: ar.question,
              back: ar.model_answer,
              concept: ar.concept
            }))
          } else if (parsed.cards && Array.isArray(parsed.cards)) {
            rawCards = (parsed.cards as { type?: string; front?: string; back?: string; question?: string; model_answer?: string; concept?: string }[])
              .filter(c => c.type === 'active_recall')
              .map(c => ({
                front: c.question || c.front || '',
                back: c.model_answer || c.back || '',
                concept: c.concept
              }))
          }
        }

        const validItems = rawCards.filter(c =>
          typeof c.front === 'string' && typeof c.back === 'string' &&
          c.front.trim().length > 0 && c.back.trim().length > 0
        )

        const batchCandidates: Partial<Card>[] = []
        for (const item of validItems) {
          const base = {
            subject_id: subjectId,
            type: cardType,
            front: item.front.trim(),
            back: item.back.trim(),
            concept: item.concept || mod.title || null,
            is_manual: 0 as const,
            source: 'syllabus' as const,
            topic_id: moduleId
          }
          const { valid, cards } = validateCardQuality(base)
          if (valid && cards) {
            batchCandidates.push(...cards.map(c => ({
              ...base,
              front: c.front,
              back: c.back,
              quality_score: c.quality_score ?? 0.85
            })))
          }
        }

        // Programmatic Deduplication against deck and intra-batch
        const dupResults = findCardDuplicates(
          batchCandidates.map(c => ({ front: c.front || '', back: c.back || '' })),
          runningExistingCards
        )

        const validBatchCards = batchCandidates.filter((_, idx) => !dupResults[idx]?.isDuplicate)
        totalDuplicatesFiltered += (batchCandidates.length - validBatchCards.length)

        if (validBatchCards.length === 0) {
          break
        }

        allCandidateCards.push(...validBatchCards)
        for (const c of validBatchCards) {
          if (c.front) {
            runningExistingCards.push({ front: c.front, back: c.back || '' })
          }
        }

        remaining -= validBatchCards.length
      }

      if (allCandidateCards.length === 0) {
        const typeLabel = cardType === 'flashcard' ? 'flashcards' : 'active recall questions'
        const reason = totalDuplicatesFiltered > 0
          ? `All generated ${typeLabel} were duplicates of cards already in your deck.`
          : `No valid ${typeLabel} passed quality check.`
        return { success: false, count: 0, error: reason, duplicates_filtered: totalDuplicatesFiltered }
      }

      const subtopics = mod.topic_titles
        ? mod.topic_titles.split('||').map(t => t.trim()).filter(Boolean)
        : [mod.title]

      const consolidatedCards = consolidateCardTopics(allCandidateCards, {
        maxTopics: 4,
        canonicalTopics: subtopics.length > 0 ? subtopics : undefined,
        defaultTopic: mod.title
      })

      const savedCards = saveGeneratedCards(consolidatedCards, db, userId)
      return {
        success: true,
        count: savedCards.length,
        module_name: mod.title,
        duplicates_filtered: totalDuplicatesFiltered
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      const typeLabel = cardType === 'flashcard' ? 'Flashcard' : 'Active recall'
      console.error(`${typeLabel} generation error:`, errMsg)
      return { success: false, count: 0, error: errMsg }
    }
  }

  ipcMain.handle('cards:generateFlashcardsFromModule', (_event, subjectId: number, moduleId: number, count?: number, userId?: number) =>
    generateCardsFromModule(subjectId, moduleId, 'flashcard', buildFlashcardOnlyPrompt, count || 10, 'flashcards', userId)
  )

  ipcMain.handle('cards:generateActiveRecallFromModule', (_event, subjectId: number, moduleId: number, count?: number, userId?: number) =>
    generateCardsFromModule(subjectId, moduleId, 'active_recall', buildActiveRecallOnlyPrompt, count || 6, 'active_recall', userId)
  )

  ipcMain.handle('cards:generateFromModule', async (
    _event,
    subjectId: number,
    moduleId: number,
    options?: {
      type?: 'flashcard' | 'active_recall' | 'auto'
      count?: number
      userId?: number
      flashcardCount?: number
      activeRecallCount?: number
    }
  ) => {
    try {
      const mod = db.prepare(`
        SELECT sm.*, GROUP_CONCAT(mt.title, '||') as topic_titles,
               GROUP_CONCAT(mt.description, '||') as topic_descriptions
        FROM syllabus_modules sm
        LEFT JOIN module_topics mt ON mt.module_id = sm.id
        WHERE sm.id = ?
        GROUP BY sm.id
      `).get(moduleId) as {
        id: number; title: string; description?: string
        chapter_number?: number; chapter_title?: string; prerequisites?: string
        topic_titles?: string; topic_descriptions?: string
      } | undefined

      if (!mod) throw new Error('Module not found')

      const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId) as
        { name: string } | undefined
      if (!subject) throw new Error('Subject not found')

      const totalCount = Math.max(1, Math.min(200, options?.count ?? 12))

      if (options?.type === 'active_recall') {
        return generateCardsFromModule(
          subjectId,
          moduleId,
          'active_recall',
          buildActiveRecallOnlyPrompt,
          totalCount,
          'active_recall',
          options?.userId
        )
      } else if (options?.type === 'flashcard') {
        return generateCardsFromModule(
          subjectId,
          moduleId,
          'flashcard',
          buildFlashcardOnlyPrompt,
          totalCount,
          'flashcards',
          options?.userId
        )
      }

      // Query existing cards for this subject to prevent duplicates
      const existingCards = db.prepare(
        'SELECT front, back FROM cards WHERE subject_id = ?'
      ).all(subjectId) as { front: string; back: string }[]

      const materials = db.prepare(`
        SELECT content_text, filename FROM materials
        WHERE subject_id = ? AND (module_id = ? OR module_id IS NULL)
        AND content_text IS NOT NULL AND LENGTH(content_text) > 100
        ORDER BY uploaded_at DESC LIMIT 5
      `).all(subjectId, moduleId) as { content_text: string; filename: string }[]

      const topicText = mod.topic_titles
        ? `Topics covered:\n${mod.topic_titles.split('||').map((t, i) => {
            const desc = mod.topic_descriptions?.split('||')[i]
            return `- ${t}${desc ? `: ${desc}` : ''}`
          }).join('\n')}`
        : ''

      const materialText = materials.length > 0
        ? `\n\nSource material:\n${materials.map(m =>
            `[${m.filename}]: ${m.content_text.substring(0, 3000)}`
          ).join('\n\n')}`
        : ''

      const contextText = `Module: ${mod.title}${mod.chapter_number ? ` (Chapter ${mod.chapter_number})` : ''}
${mod.description || ''}
${topicText}
${materialText}`

      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) throw new Error('AI API key not configured')

      const BATCH_SIZE = 8
      let remaining = totalCount
      const runningExistingCards = [...existingCards]
      const allCandidateCards: Partial<Card>[] = []
      let totalDuplicatesFiltered = 0

      while (remaining > 0) {
        const currentBatchTarget = Math.min(remaining, BATCH_SIZE)
        const flashcardCount = options?.flashcardCount ?? (currentBatchTarget === 1 ? 1 : Math.max(1, Math.round(currentBatchTarget * 0.65)))
        const activeRecallCount = options?.activeRecallCount ?? (currentBatchTarget === 1 ? 0 : Math.max(0, currentBatchTarget - flashcardCount))

        const prompt = buildAutoCardGenerationPrompt(
          contextText,
          subject.name,
          mod.title,
          undefined,
          runningExistingCards,
          flashcardCount,
          activeRecallCount
        )

        const responseText = await callAIMessages(
          [{ role: 'user', content: prompt }],
          { ...config, apiKey },
          { type: 'json_object' }
        )

        const parsed = safeParseAICards(responseText)

        let flashcards: any[] = []
        let activeRecall: any[] = []

        if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
          flashcards = parsed.flashcards
        } else if (parsed.cards && Array.isArray(parsed.cards)) {
          const cards = parsed.cards as { type?: string; front?: string; back?: string; question?: string; model_answer?: string; concept?: string }[]
          flashcards = cards.filter(c => c.type === 'flashcard' || !c.type)
            .map(c => ({ front: c.front || '', back: c.back || '', concept: c.concept }))
          activeRecall = cards.filter(c => c.type === 'active_recall')
            .map(c => ({ question: c.question || c.front || '', model_answer: c.model_answer || c.back || '', concept: c.concept }))
        }

        if (parsed.active_recall && Array.isArray(parsed.active_recall)) {
          activeRecall = parsed.active_recall
        }

        const validFlashcards = flashcards.filter(fc =>
          typeof fc.front === 'string' && typeof fc.back === 'string' &&
          fc.front.trim().length > 0 && fc.back.trim().length > 0
        )
        const validActiveRecall = activeRecall.filter(ar =>
          typeof ar.question === 'string' && typeof ar.model_answer === 'string' &&
          ar.question.trim().length > 0 && ar.model_answer.trim().length > 0
        )

        const batchCandidates: Partial<Card>[] = []

        for (const fc of validFlashcards) {
          const base = {
            subject_id: subjectId,
            type: 'flashcard' as const,
            front: fc.front.trim(),
            back: fc.back.trim(),
            concept: fc.concept || mod.title || null,
            is_manual: 0 as const,
            source: 'syllabus' as const,
            topic_id: moduleId
          }
          const { valid, cards } = validateCardQuality(base)
          if (valid) {
            batchCandidates.push(...cards.map(c => ({
              ...base,
              front: c.front,
              back: c.back,
              quality_score: c.quality_score ?? 0.85
            })))
          }
        }

        for (const ar of validActiveRecall) {
          const base = {
            subject_id: subjectId,
            type: 'active_recall' as const,
            front: ar.question.trim(),
            back: ar.model_answer.trim(),
            is_manual: 0 as const,
            source: 'syllabus' as const,
            topic_id: moduleId
          }
          const { valid, cards } = validateCardQuality(base)
          if (valid) {
            batchCandidates.push(...cards.map(c => ({
              ...base,
              front: c.front,
              back: c.back,
              quality_score: c.quality_score ?? 0.85
            })))
          }
        }

        const dupResults = findCardDuplicates(
          batchCandidates.map(c => ({ front: c.front || '', back: c.back || '' })),
          runningExistingCards
        )

        const validBatchCards = batchCandidates.filter((_, idx) => !dupResults[idx]?.isDuplicate)
        totalDuplicatesFiltered += (batchCandidates.length - validBatchCards.length)

        if (validBatchCards.length === 0) {
          break
        }

        allCandidateCards.push(...validBatchCards)
        for (const c of validBatchCards) {
          if (c.front) {
            runningExistingCards.push({ front: c.front, back: c.back || '' })
          }
        }

        remaining -= validBatchCards.length
      }

      if (allCandidateCards.length === 0) {
        const reason = totalDuplicatesFiltered > 0
          ? 'All generated cards were duplicates of existing concepts in your deck.'
          : 'No valid cards passed quality check.'
        return { success: false, count: 0, error: reason, duplicates_filtered: totalDuplicatesFiltered }
      }

      const subtopics = mod.topic_titles
        ? mod.topic_titles.split('||').map(t => t.trim()).filter(Boolean)
        : [mod.title]

      const consolidatedCards = consolidateCardTopics(allCandidateCards, {
        maxTopics: 4,
        canonicalTopics: subtopics.length > 0 ? subtopics : undefined,
        defaultTopic: mod.title
      })

      const savedCards = saveGeneratedCards(consolidatedCards, db, options?.userId)
      return {
        success: true,
        count: savedCards.length,
        module_name: mod.title,
        duplicates_filtered: totalDuplicatesFiltered
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('Module card generation error:', errMsg)
      return { success: false, count: 0, error: errMsg }
    }
  })

  ipcMain.handle('cards:generateFromText', async (
    _event,
    subjectId: number,
    text: string,
    options?: {
      type?: 'flashcard' | 'active_recall'
      count?: number
      folderId?: number | null
      materialId?: number | null
      topicId?: number | null
      concept?: string | null
      userId?: number
    }
  ) => {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Please provide study text or notes to generate cards.')
      }

      const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId) as
        { name: string } | undefined
      if (!subject) throw new Error('Subject not found')

      const requestedType = options?.type === 'active_recall' ? 'active_recall' : 'flashcard'
      const totalCount = Math.max(1, Math.min(200, options?.count ?? 10))

      // Query existing cards for this subject to prevent duplicates
      const existingCards = db.prepare(
        'SELECT front, back FROM cards WHERE subject_id = ?'
      ).all(subjectId) as { front: string; back: string }[]

      let canonicalTopics: string[] = []
      if (options?.concept) {
        canonicalTopics = [options.concept]
      } else if (options?.topicId) {
        const t = db.prepare('SELECT title FROM module_topics WHERE id = ?').get(options.topicId) as { title: string } | undefined
        if (t?.title) canonicalTopics = [t.title]
      } else {
        const existingTopics = (db.prepare(`
          SELECT DISTINCT title FROM module_topics WHERE module_id IN (
            SELECT id FROM syllabus_modules WHERE subject_id = ?
          )
        `).all(subjectId) as { title: string }[]).map(r => r.title)
        if (existingTopics.length > 0) {
          canonicalTopics = existingTopics.slice(0, 5)
        }
      }

      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) throw new Error('AI API key not configured')

      const BATCH_SIZE = 8
      let remaining = totalCount
      const totalBatches = Math.ceil(totalCount / BATCH_SIZE)
      const runningExistingCards = [...existingCards]
      const allCandidateCards: Partial<Card>[] = []
      let totalDuplicatesFiltered = 0
      let batchIdx = 0

      while (remaining > 0) {
        const currentBatchTarget = Math.min(remaining, BATCH_SIZE)

        // Partition large text across batches so every section of a 10k-100k word doc is covered
        let batchText = text
        if (text.length > 8000) {
          const activeBatchIdx = totalBatches > 0 ? (batchIdx % totalBatches) : 0
          const sliceLength = Math.max(5000, Math.ceil(text.length / totalBatches))
          const start = Math.max(0, Math.floor(activeBatchIdx * (text.length / totalBatches)) - 400)
          const end = Math.min(text.length, start + sliceLength + 400)
          batchText = text.slice(start, end)
        }

        const prompt = requestedType === 'active_recall'
          ? buildActiveRecallOnlyPrompt(
              batchText,
              subject.name,
              undefined,
              currentBatchTarget,
              runningExistingCards,
              canonicalTopics.length > 0 ? canonicalTopics : undefined
            )
          : buildFlashcardOnlyPrompt(
              batchText,
              subject.name,
              undefined,
              currentBatchTarget,
              runningExistingCards,
              canonicalTopics.length > 0 ? canonicalTopics : undefined
            )

        const responseText = await callAIMessages(
          [{ role: 'user', content: prompt }],
          { ...config, apiKey },
          { type: 'json_object' }
        )

        const parsed = safeParseAICards(responseText)

        let flashcards: { front: string; back: string; concept?: string }[] = []
        let activeRecall: { question: string; model_answer: string; concept?: string }[] = []

        if (requestedType === 'flashcard') {
          if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
            flashcards = parsed.flashcards
          } else if (parsed.cards && Array.isArray(parsed.cards)) {
            flashcards = (parsed.cards as { type?: string; front?: string; back?: string; concept?: string }[])
              .filter(c => c.type === 'flashcard' || !c.type)
              .map(c => ({ front: c.front || '', back: c.back || '', concept: c.concept }))
          }
        } else if (requestedType === 'active_recall') {
          if (parsed.active_recall && Array.isArray(parsed.active_recall)) {
            activeRecall = parsed.active_recall
          } else if (parsed.cards && Array.isArray(parsed.cards)) {
            activeRecall = (parsed.cards as { type?: string; front?: string; back?: string; question?: string; model_answer?: string; concept?: string }[])
              .filter(c => c.type === 'active_recall')
              .map(c => ({ question: c.question || c.front || '', model_answer: c.model_answer || c.back || '', concept: c.concept }))
          }
        } else {
          if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
            flashcards = parsed.flashcards
          } else if (parsed.cards && Array.isArray(parsed.cards)) {
            const cards = parsed.cards as { type?: string; front?: string; back?: string; question?: string; model_answer?: string; concept?: string }[]
            flashcards = cards.filter(c => c.type === 'flashcard' || !c.type)
              .map(c => ({ front: c.front || '', back: c.back || '', concept: c.concept }))
            activeRecall = cards.filter(c => c.type === 'active_recall')
              .map(c => ({ question: c.question || c.front || '', model_answer: c.model_answer || c.back || '', concept: c.concept }))
          }
          if (parsed.active_recall && Array.isArray(parsed.active_recall)) {
            activeRecall = parsed.active_recall
          }
        }

        const validFlashcards = flashcards.filter(fc =>
          typeof fc.front === 'string' && typeof fc.back === 'string' &&
          fc.front.trim().length > 0 && fc.back.trim().length > 0
        )
        const validActiveRecall = activeRecall.filter(ar =>
          typeof ar.question === 'string' && typeof ar.model_answer === 'string' &&
          ar.question.trim().length > 0 && ar.model_answer.trim().length > 0
        )

        const batchCandidates: Partial<Card>[] = []

        for (const fc of validFlashcards) {
          const base = {
            subject_id: subjectId,
            material_id: options?.materialId ?? null,
            topic_id: options?.topicId ?? null,
            concept: fc.concept || options?.concept || null,
            type: 'flashcard' as const,
            front: fc.front.trim(),
            back: fc.back.trim(),
            is_manual: 0 as const,
            source: 'material' as const,
            folder_id: options?.folderId ?? null
          }
          const { valid, cards } = validateCardQuality(base)
          if (valid) {
            batchCandidates.push(...cards.map(c => ({
              ...base,
              front: c.front,
              back: c.back,
              quality_score: c.quality_score ?? 0.85
            })))
          }
        }

        for (const ar of validActiveRecall) {
          const base = {
            subject_id: subjectId,
            material_id: options?.materialId ?? null,
            topic_id: options?.topicId ?? null,
            concept: ar.concept || options?.concept || null,
            type: 'active_recall' as const,
            front: ar.question.trim(),
            back: ar.model_answer.trim(),
            is_manual: 0 as const,
            source: 'material' as const,
            folder_id: options?.folderId ?? null
          }
          const { valid, cards } = validateCardQuality(base)
          if (valid) {
            batchCandidates.push(...cards.map(c => ({
              ...base,
              front: c.front,
              back: c.back,
              quality_score: c.quality_score ?? 0.85
            })))
          }
        }

        // Deduplicate against running existing cards
        const dupResults = findCardDuplicates(
          batchCandidates.map(c => ({ front: c.front || '', back: c.back || '' })),
          runningExistingCards
        )

        const validBatchCards = batchCandidates.filter((_, idx) => !dupResults[idx]?.isDuplicate)
        totalDuplicatesFiltered += (batchCandidates.length - validBatchCards.length)

        if (validBatchCards.length === 0) {
          break
        }

        allCandidateCards.push(...validBatchCards)
        for (const c of validBatchCards) {
          if (c.front) {
            runningExistingCards.push({ front: c.front, back: c.back || '' })
          }
        }

        remaining -= validBatchCards.length
        batchIdx++
      }

      if (allCandidateCards.length === 0) {
        const typeLabel = requestedType === 'flashcard' ? 'flashcards' : requestedType === 'active_recall' ? 'active recall questions' : 'cards'
        const reason = totalDuplicatesFiltered > 0
          ? `All generated ${typeLabel} were duplicates of concepts already in your deck.`
          : `No valid ${typeLabel} passed quality check.`
        return { success: false, count: 0, error: reason, duplicates_filtered: totalDuplicatesFiltered }
      }

      const consolidatedCards = consolidateCardTopics(allCandidateCards, {
        maxTopics: 4,
        canonicalTopics: canonicalTopics.length > 0 ? canonicalTopics : undefined,
        defaultTopic: options?.concept || subject.name
      })

      const savedCards = saveGeneratedCards(consolidatedCards, db, options?.userId)
      return {
        success: true,
        count: savedCards.length,
        duplicates_filtered: totalDuplicatesFiltered
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('Text card generation error:', errMsg)
      return { success: false, count: 0, error: errMsg }
    }
  })
}

/**
 * Validate a generated card against quality criteria.
 */
function validateCardQuality(card: Partial<Card> & { front: string; back: string }): {
  valid: boolean
  cards: (Partial<Card> & { front: string; back: string; quality_score?: number })[]
  quality_score: number
} {
  let qualityScore = 1.0

  if (!card.front?.trim() || !card.back?.trim()) {
    return { valid: false, cards: [], quality_score: 0 }
  }

  // Vague reference penalties
  const vaguePatterns = [/\bas discussed\b/i, /\bin this context\b/i, /\bas we learned\b/i, /\babove\b/i]
  for (const pattern of vaguePatterns) {
    if (pattern.test(card.front) || pattern.test(card.back)) {
      qualityScore -= 0.2
    }
  }

  // Detect compound cards (lists in back)
  const listIndicators = card.back.match(/(?:\d+\.\s|\*\s|-\s).{5,}/g)
  if (listIndicators && listIndicators.length >= 3) {
    qualityScore -= 0.25
    const parts = card.back.split('\n').filter(p => p.match(/(?:\d+\.\s|\*\s|-\s)/))
    if (parts.length >= 2) {
      const splitCards = parts.map((part) => ({
        ...card,
        front: `${card.front} — ${part.replace(/^(?:\d+\.\s|\*\s|-\s)/, '').trim()}`,
        back: part.replace(/^(?:\d+\.\s|\*\s|-\s)/, '').trim(),
        quality_score: 0.85
      }))
      return { valid: true, cards: splitCards, quality_score: 0.85 }
    }
  }

  // Front should be a question/cloze/prompt
  if (!card.front.includes('?') && !card.front.includes('___') &&
      !card.front.match(/^(what|how|why|when|where|which|explain|describe|define|compare|contrast|list|name)/i)) {
    qualityScore -= 0.1
  }

  if (card.back.length < 15) {
    qualityScore -= 0.15
  }

  return {
    valid: qualityScore >= 0.4,
    cards: [{ ...card, quality_score: Math.max(0, qualityScore) }],
    quality_score: Math.max(0, qualityScore)
  }
}

// ── Shared auto-generate logic ─────────────────────────────────────────────

async function handleAutoGenerate(subjectId: number, materialId: number): Promise<{
  success: boolean
  count: number
  error?: string
  filename?: string
}> {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId) as
    { filename: string; content_text: string; module_id: number | null } | undefined
  if (!material) return { success: false, count: 0, error: 'Material not found' }

  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as
    { name: string } | undefined
  if (!subject) return { success: false, count: 0, error: 'Subject not found' }

  if (!material.content_text || material.content_text.length < 100) {
    return { success: false, count: 0, error: 'Content too short' }
  }

  let moduleTitle: string | undefined
  if (material.module_id) {
    const mod = db.prepare('SELECT title FROM syllabus_modules WHERE id = ?').get(material.module_id) as
      { title: string } | undefined
    if (mod) moduleTitle = mod.title
  }

const existingCards = db.prepare(
    'SELECT front, back FROM cards WHERE subject_id = ? AND material_id IS NOT NULL'
  ).all(subjectId) as { front: string; back: string }[]

  const prompt = buildAutoCardGenerationPrompt(
    material.content_text, subject.name, moduleTitle, undefined, existingCards, 8, 4
  )

  const config = getAIConfig()
  const apiKey = getApiKey()
  if (!apiKey) return { success: false, count: 0, error: 'AI API key not configured' }

  const responseText = await callAIMessages(
    [{ role: 'user', content: prompt }],
    { ...config, apiKey },
    { type: 'json_object' }
  )

  const parsed = safeParseAICards(responseText)
  let flashcards: { front: string; back: string; concept?: string }[] = []
  let activeRecall: { question: string; model_answer: string; concept?: string }[] = []

  if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
    flashcards = parsed.flashcards
  } else if (parsed.cards && Array.isArray(parsed.cards)) {
    const cards = parsed.cards as { type?: string; front?: string; back?: string; question?: string; model_answer?: string; concept?: string }[]
    flashcards = cards.filter(c => c.type === 'flashcard' || !c.type).map(c => ({ front: c.front || '', back: c.back || '', concept: c.concept }))
    activeRecall = cards.filter(c => c.type === 'active_recall').map(c => ({ question: c.question || c.front || '', model_answer: c.model_answer || c.back || '', concept: c.concept }))
  }

  if (parsed.active_recall && Array.isArray(parsed.active_recall)) {
    activeRecall = parsed.active_recall
  }

  const validFlashcards = flashcards.filter(fc =>
    typeof fc.front === 'string' && typeof fc.back === 'string' &&
    fc.front.trim().length > 0 && fc.back.trim().length > 0
  )
  const validActiveRecall = activeRecall.filter(ar =>
    typeof ar.question === 'string' && typeof ar.model_answer === 'string' &&
    ar.question.trim().length > 0 && ar.model_answer.trim().length > 0
  )

  const validatedCards: Partial<Card>[] = []

  for (const fc of validFlashcards) {
    const base = {
      subject_id: subjectId,
      material_id: materialId,
      type: 'flashcard' as const,
      front: fc.front.trim(),
      back: fc.back.trim(),
      is_manual: 0 as const,
      source: 'auto' as const
    }
    const { valid, cards } = validateCardQuality(base)
    if (valid) {
      validatedCards.push(...cards.map(c => ({
        ...base,
        front: c.front,
        back: c.back,
        quality_score: c.quality_score ?? 0.85
      })))
    }
  }

  for (const ar of validActiveRecall) {
    const base = {
      subject_id: subjectId,
      material_id: materialId,
      type: 'active_recall' as const,
      front: ar.question.trim(),
      back: ar.model_answer.trim(),
      is_manual: 0 as const,
      source: 'auto' as const
    }
    const { valid, cards } = validateCardQuality(base)
    if (valid) {
      validatedCards.push(...cards.map(c => ({
        ...base,
        front: c.front,
        back: c.back,
        quality_score: c.quality_score ?? 0.85
      })))
    }
  }

  if (validatedCards.length === 0) {
    return { success: false, count: 0, error: 'No valid cards passed quality check' }
  }

  const consolidatedCards = consolidateCardTopics(validatedCards, {
    maxTopics: 4,
    defaultTopic: moduleTitle || subject.name
  })

  const savedCards = saveGeneratedCards(consolidatedCards, db)
  return { success: true, count: savedCards.length, filename: material.filename }
}

// ── Batch-insert cards with schedules ────────────────────────────────────

function saveGeneratedCards(cards: Partial<Card>[], database: Database.Database, userId?: number): Card[] {
  if (!userId) {
    const firstUser = database.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as { id: number } | undefined
    userId = firstUser?.id ?? 1
  }

  const insertCard = database.prepare(`
    INSERT INTO cards (subject_id, material_id, type, front, back, is_manual,
      source, topic_id, folder_id, concept, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertSchedule = database.prepare(
    'INSERT OR REPLACE INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )

  const savedCards: Card[] = []
  const saveMany = database.transaction(() => {
    for (const card of cards) {
      let folderId = card.folder_id || null
      if (!folderId && card.subject_id) {
        folderId = getOrCreateMaterialFolder(database, card.subject_id, card.material_id, card.concept)
      }

      const result = insertCard.run(
        card.subject_id,
        card.material_id || null,
        card.type,
        card.front,
        card.back,
        card.is_manual || 0,
        card.source || 'manual',
        card.topic_id || null,
        folderId,
        card.concept || null,
        card.tags || '',
        new Date().toISOString()
      )
      const cardId = result.lastInsertRowid as number
      insertSchedule.run(cardId, userId!, 1, 0, 1.3, new Date().toISOString(), null)
      savedCards.push(database.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as Card)
    }
  })
  saveMany()
  return savedCards
}
