import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { callAIMessages } from './aiHandlers'
import { getAIConfig, getApiKey } from './aiConfigStore'
import { buildAutoCardGenerationPrompt, buildFlashcardOnlyPrompt, buildActiveRecallOnlyPrompt } from '../../src/lib/promptBuilders'
import { parseDocumentTopology } from '../../src/lib/coverage/documentTopologyParser'
import { findCardDuplicates } from '../../src/lib/cardDeduplication'
import { safeParseAICards, type ParsedAICardsPayload } from '../../src/lib/jsonRepair'
import { cleanCardBrackets } from '../../src/lib/cardParser'
import { consolidateCardTopics } from '../../src/lib/topicClustering'
import { getOrCreateMaterialFolder } from './materialFolderHelper'
import type { Card } from '../../src/types'

let db: Database.Database

export function setCardGenerationDatabase(database: Database.Database): void {
  db = database
}

/**
 * Strips raw transcript blocks embedded inside <details> tags (common in generated
 * lecture notes) as well as any raw transcript sections, preventing conversational
 * banter, course mechanics, and logistics from leaking into card generation.
 */
export function stripRawTranscript(text: string): string {
  if (!text) return ''
  let cleaned = text.replace(/<details\b[^>]*>[\s\S]*?(?:raw transcript|transcript)[\s\S]*?<\/details>/gi, '')
  cleaned = cleaned.replace(/<details>\s*<summary>📜\s*Click to expand full raw transcript<\/summary>[\s\S]*?<\/details>/gi, '')
  return cleaned.trim()
}

/**
 * Extracts card candidates from AI output, with multi-level fallbacks so valid
 * content is never dropped regardless of which keys or structures the LLM used.
 */
function extractCardCandidates(
  parsed: ParsedAICardsPayload,
  requestedType: 'flashcard' | 'active_recall' | 'auto'
): {
  flashcards: { front: string; back: string; concept?: string }[]
  activeRecall: { question: string; model_answer: string; concept?: string }[]
} {
  let flashcards: { front: string; back: string; concept?: string }[] = []
  let activeRecall: { question: string; model_answer: string; concept?: string }[] = []

  if (requestedType === 'flashcard') {
    if (parsed.flashcards && parsed.flashcards.length > 0) {
      flashcards = parsed.flashcards.map(fc => ({ front: fc.front, back: fc.back, concept: fc.concept }))
    }
    if (parsed.cards && parsed.cards.length > 0) {
      for (const c of parsed.cards) {
        const front = (c.front || c.question || '').trim()
        const back = (c.back || c.model_answer || '').trim()
        if (front && back && !flashcards.some(f => f.front === front)) {
          flashcards.push({ front, back, concept: c.concept })
        }
      }
    }
    if (flashcards.length === 0 && parsed.active_recall && parsed.active_recall.length > 0) {
      flashcards = parsed.active_recall.map(ar => ({
        front: ar.question,
        back: ar.model_answer,
        concept: ar.concept
      }))
    }
  } else if (requestedType === 'active_recall') {
    if (parsed.active_recall && parsed.active_recall.length > 0) {
      activeRecall = parsed.active_recall.map(ar => ({ question: ar.question, model_answer: ar.model_answer, concept: ar.concept }))
    }
    if (parsed.cards && parsed.cards.length > 0) {
      for (const c of parsed.cards) {
        const question = (c.question || c.front || '').trim()
        const model_answer = (c.model_answer || c.back || '').trim()
        if (question && model_answer && !activeRecall.some(a => a.question === question)) {
          activeRecall.push({ question, model_answer, concept: c.concept })
        }
      }
    }
    if (activeRecall.length === 0 && parsed.flashcards && parsed.flashcards.length > 0) {
      activeRecall = parsed.flashcards.map(fc => ({
        question: fc.front,
        model_answer: fc.back,
        concept: fc.concept
      }))
    }
  } else {
    // Auto or mixed format
    if (parsed.flashcards && parsed.flashcards.length > 0) {
      flashcards = parsed.flashcards.map(fc => ({ front: fc.front, back: fc.back, concept: fc.concept }))
    }
    if (parsed.active_recall && parsed.active_recall.length > 0) {
      activeRecall = parsed.active_recall.map(ar => ({ question: ar.question, model_answer: ar.model_answer, concept: ar.concept }))
    }
    if (parsed.cards && parsed.cards.length > 0) {
      for (const c of parsed.cards) {
        const front = (c.front || c.question || '').trim()
        const back = (c.back || c.model_answer || '').trim()
        if (front && back) {
          if (c.type === 'active_recall') {
            if (!activeRecall.some(a => a.question === front)) {
              activeRecall.push({ question: front, model_answer: back, concept: c.concept })
            }
          } else {
            if (!flashcards.some(f => f.front === front)) {
              flashcards.push({ front, back, concept: c.concept })
            }
          }
        }
      }
    }
  }

  return {
    flashcards: flashcards.filter(fc => typeof fc.front === 'string' && typeof fc.back === 'string' && fc.front.trim().length > 0 && fc.back.trim().length > 0),
    activeRecall: activeRecall.filter(ar => typeof ar.question === 'string' && typeof ar.model_answer === 'string' && ar.question.trim().length > 0 && ar.model_answer.trim().length > 0)
  }
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

      const cleanContent = stripRawTranscript(material.content_text) || material.content_text
      if (!cleanContent || cleanContent.length < 100) {
        return { success: false, count: 0, error: 'Material content too short (< 100 chars)' }
      }

      let moduleTitle: string | undefined
      if (material.module_id) {
        const mod = db.prepare('SELECT title FROM syllabus_modules WHERE id = ?').get(material.module_id) as
          { title: string } | undefined
        if (mod) moduleTitle = mod.title
      }

      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) throw new Error('AI API key not configured.')

      const existingCards = db.prepare(
        'SELECT front, back FROM cards WHERE subject_id = ? AND material_id IS NOT NULL'
      ).all(subjectId) as { front: string; back: string }[]

      const chunks: { text: string; title?: string }[] = []
      if (cleanContent.length > 8000) {
        const topology = parseDocumentTopology(cleanContent, material.filename, 1000)
        for (const c of topology.chunks) {
          if (c.text.trim().length > 100) {
            chunks.push({ text: c.text, title: c.title })
          }
        }
      }
      if (chunks.length === 0) {
        chunks.push({ text: cleanContent, title: moduleTitle })
      }

      const validFlashcards: { front: string; back: string; concept?: string }[] = []
      const validActiveRecall: { question: string; model_answer: string; concept?: string }[] = []

      // Calibrate total generation to optimal bounds (~14 flashcards and ~4 active recall across all chunks)
      const targetTotalFc = 14
      const targetTotalAr = 4
      const fcPerChunk = Math.max(2, Math.ceil(targetTotalFc / chunks.length))
      const arPerChunk = Math.max(1, Math.ceil(targetTotalAr / chunks.length))

      for (const chunk of chunks) {
        const prompt = buildAutoCardGenerationPrompt(
          chunk.text,
          subject.name,
          chunk.title ? `${moduleTitle ? `${moduleTitle} - ` : ''}${chunk.title}` : moduleTitle,
          undefined,
          existingCards,
          fcPerChunk,
          arPerChunk
        )

        try {
          const responseText = await callAIMessages(
            [{ role: 'user', content: prompt }],
            { ...config, apiKey },
            { type: 'json_object' }
          )

          const parsed = safeParseAICards(responseText)
          const extracted = extractCardCandidates(parsed, 'auto')
          validFlashcards.push(...extracted.flashcards)
          validActiveRecall.push(...extracted.activeRecall)
        } catch (chunkErr) {
          console.warn('Error generating cards for chunk:', chunk.title, chunkErr)
        }
      }

      // Cap total cards to pedagogical sweet spot (max 16 flashcards, max 5 active recall)
      const cappedFlashcards = validFlashcards.slice(0, 16)
      const cappedActiveRecall = validActiveRecall.slice(0, 5)

      const validatedCards: Partial<Card>[] = []

      for (const fc of cappedFlashcards) {
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

      for (const ar of cappedActiveRecall) {
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
    buildPrompt: (text: string, subject?: string, moduleTitle?: string, min?: number, existing?: { front: string; back?: string }[], availableTopics?: string[], autoCount?: boolean) => string,
    minCount: number,
    _responseKey: 'flashcards' | 'active_recall',
    userId?: number,
    autoCount?: boolean
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
        ? `\n\nSource material:\n${materials.map(m => {
            const cleanText = stripRawTranscript(m.content_text) || m.content_text
            if (cleanText.length > 8000) {
              const topology = parseDocumentTopology(cleanText, m.filename, 800)
              const sections = topology.chunks.map(c => `[${c.title}]:\n${c.text}`).join('\n\n')
              return `[${m.filename}]:\n${sections}`
            }
            return `[${m.filename}]:\n${cleanText}`
          }).join('\n\n')}`
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

      if (autoCount) {
        const prompt = buildPrompt(contextText, subject.name, mod.title, 10, runningExistingCards, undefined, true)

        const responseText = await callAIMessages(
          [{ role: 'user', content: prompt }],
          { ...config, apiKey },
          { type: 'json_object' }
        )

        const parsed = safeParseAICards(responseText)
        const candidates = extractCardCandidates(parsed, cardType)
        const validItems = cardType === 'flashcard'
          ? candidates.flashcards.map(fc => ({ front: fc.front, back: fc.back, concept: fc.concept }))
          : candidates.activeRecall.map(ar => ({ front: ar.question, back: ar.model_answer, concept: ar.concept }))

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

        const dupResults = findCardDuplicates(
          batchCandidates.map(c => ({ front: c.front || '', back: c.back || '' })),
          runningExistingCards
        )
        const validBatchCards = batchCandidates.filter((_, idx) => !dupResults[idx]?.isDuplicate)
        totalDuplicatesFiltered += (batchCandidates.length - validBatchCards.length)
        allCandidateCards.push(...validBatchCards)
      } else {
        while (remaining > 0) {
          const batchTarget = Math.min(remaining, BATCH_SIZE)
          const prompt = buildPrompt(contextText, subject.name, mod.title, batchTarget, runningExistingCards)

          const responseText = await callAIMessages(
            [{ role: 'user', content: prompt }],
            { ...config, apiKey },
            { type: 'json_object' }
          )

          const parsed = safeParseAICards(responseText)
          const candidates = extractCardCandidates(parsed, cardType)
          const validItems = cardType === 'flashcard'
            ? candidates.flashcards.map(fc => ({ front: fc.front, back: fc.back, concept: fc.concept }))
            : candidates.activeRecall.map(ar => ({ front: ar.question, back: ar.model_answer, concept: ar.concept }))

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

          const toAdd = validBatchCards.slice(0, remaining)
          allCandidateCards.push(...toAdd)
          for (const c of toAdd) {
            if (c.front) {
              runningExistingCards.push({ front: c.front, back: c.back || '' })
            }
          }

          remaining -= toAdd.length
        }
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

      const cardsToSave = autoCount ? consolidatedCards : consolidatedCards.slice(0, minCount)
      const savedCards = saveGeneratedCards(cardsToSave, db, userId)
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
      autoCount?: boolean
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
          options?.userId,
          options?.autoCount === true
        )
      } else if (options?.type === 'flashcard') {
        return generateCardsFromModule(
          subjectId,
          moduleId,
          'flashcard',
          buildFlashcardOnlyPrompt,
          totalCount,
          'flashcards',
          options?.userId,
          options?.autoCount === true
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
        ? `\n\nSource material:\n${materials.map(m => {
            const cleanText = stripRawTranscript(m.content_text) || m.content_text
            if (cleanText.length > 8000) {
              const topology = parseDocumentTopology(cleanText, m.filename, 800)
              const sections = topology.chunks.map(c => `[${c.title}]:\n${c.text}`).join('\n\n')
              return `[${m.filename}]:\n${sections}`
            }
            return `[${m.filename}]:\n${cleanText}`
          }).join('\n\n')}`
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
        const { flashcards: validFlashcards, activeRecall: validActiveRecall } = extractCardCandidates(parsed, 'auto')

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
          if (valid && cards) {
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
            concept: ar.concept || mod.title || null,
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

        const dupResults = findCardDuplicates(
          batchCandidates.map(c => ({ front: c.front || '', back: c.back || '' })),
          runningExistingCards
        )

        const validBatchCards = batchCandidates.filter((_, idx) => !dupResults[idx]?.isDuplicate)
        totalDuplicatesFiltered += (batchCandidates.length - validBatchCards.length)

        if (validBatchCards.length === 0) {
          break
        }

        const toAdd = validBatchCards.slice(0, remaining)
        allCandidateCards.push(...toAdd)
        for (const c of toAdd) {
          if (c.front) {
            runningExistingCards.push({ front: c.front, back: c.back || '' })
          }
        }

        remaining -= toAdd.length
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

      const cardsToSave = consolidatedCards.slice(0, totalCount)
      const savedCards = saveGeneratedCards(cardsToSave, db, options?.userId)
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
      autoCount?: boolean
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
      const isAuto = options?.autoCount === true
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

      if (isAuto) {
        const chunks: string[] = []
        if (text.length > 8000) {
          const topology = parseDocumentTopology(text, '', 1000)
          for (const c of topology.chunks) {
            if (c.text.trim().length > 100) {
              chunks.push(c.text)
            }
          }
        }
        if (chunks.length === 0) {
          chunks.push(text)
        }

        for (const chunkText of chunks) {
          const prompt = requestedType === 'active_recall'
            ? buildActiveRecallOnlyPrompt(
                chunkText,
                subject.name,
                undefined,
                10,
                runningExistingCards,
                canonicalTopics.length > 0 ? canonicalTopics : undefined,
                true
              )
            : buildFlashcardOnlyPrompt(
                chunkText,
                subject.name,
                undefined,
                10,
                runningExistingCards,
                canonicalTopics.length > 0 ? canonicalTopics : undefined,
                true
              )

          const responseText = await callAIMessages(
            [{ role: 'user', content: prompt }],
            { ...config, apiKey },
            { type: 'json_object' }
          )

          const parsed = safeParseAICards(responseText)
          const { flashcards: validFlashcards, activeRecall: validActiveRecall } = extractCardCandidates(parsed, requestedType)

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
            if (valid && cards) {
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
            if (valid && cards) {
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

          allCandidateCards.push(...validBatchCards)
          for (const c of validBatchCards) {
            if (c.front) {
              runningExistingCards.push({ front: c.front, back: c.back || '' })
            }
          }
        }
      } else {
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
          const { flashcards: validFlashcards, activeRecall: validActiveRecall } = extractCardCandidates(parsed, requestedType)

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
            if (valid && cards) {
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
            if (valid && cards) {
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

          const toAdd = validBatchCards.slice(0, remaining)
          allCandidateCards.push(...toAdd)
          for (const c of toAdd) {
            if (c.front) {
              runningExistingCards.push({ front: c.front, back: c.back || '' })
            }
          }

          remaining -= toAdd.length
          batchIdx++
        }
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

      const cardsToSave = isAuto ? consolidatedCards : consolidatedCards.slice(0, totalCount)
      const savedCards = saveGeneratedCards(cardsToSave, db, options?.userId)
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
  const cleanedFront = cleanCardBrackets(card.front || '').trim()
  const cleanedBack = cleanCardBrackets(card.back || '').trim()

  if (!cleanedFront || !cleanedBack) {
    return { valid: false, cards: [], quality_score: 0 }
  }

  let qualityScore = 1.0

  // Vague reference penalties
  const vaguePatterns = [/\bas discussed\b/i, /\bin this context\b/i, /\bas we learned\b/i, /\babove\b/i, /\bas mentioned\b/i]
  for (const pattern of vaguePatterns) {
    if (pattern.test(cleanedFront) || pattern.test(cleanedBack)) {
      qualityScore -= 0.15
    }
  }

  // Detect compound cards (lists in back)
  const listIndicators = cleanedBack.match(/(?:\d+\.\s|\*\s|-\s).{5,}/g)
  if (listIndicators && listIndicators.length >= 3) {
    const parts = cleanedBack.split('\n').map(p => p.trim()).filter(p => p.match(/^(?:\d+\.\s|\*\s|-\s)/))
    if (parts.length >= 2) {
      const basePrompt = cleanedFront.replace(/[?:.!]+$/, '')
      const splitCards = parts.map((part, idx) => {
        const rawItem = cleanCardBrackets(part.replace(/^(?:\d+\.\s|\*\s|-\s)/, '').trim())
        const colonIdx = rawItem.indexOf(':')
        const dashMatch = rawItem.match(/\s+[—–-]\s+/)
        const splitIdx = colonIdx > 0 ? colonIdx : (dashMatch?.index !== undefined ? dashMatch.index : -1)

        if (splitIdx > 0 && splitIdx < rawItem.length - 1) {
          const term = rawItem.slice(0, splitIdx).trim()
          const desc = rawItem.slice(splitIdx + (colonIdx > 0 ? 1 : (dashMatch?.[0].length || 1))).trim()
          return {
            ...card,
            front: cleanCardBrackets(`${basePrompt} — which element is: "${desc}"?`),
            back: term,
            quality_score: 0.9
          }
        }

        return {
          ...card,
          front: cleanCardBrackets(`${basePrompt} (Part ${idx + 1} of ${parts.length})?`),
          back: rawItem,
          quality_score: 0.9
        }
      })
      return { valid: true, cards: splitCards, quality_score: 0.9 }
    }
  }

  return {
    valid: cleanedFront.length > 0 && cleanedBack.length > 0,
    cards: [{ ...card, front: cleanedFront, back: cleanedBack, quality_score: Math.max(0.5, qualityScore) }],
    quality_score: Math.max(0.5, qualityScore)
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

  const cleanContent = stripRawTranscript(material.content_text) || material.content_text
  if (!cleanContent || cleanContent.length < 100) {
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
    cleanContent, subject.name, moduleTitle, undefined, existingCards, 10, 4
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
  const { flashcards: validFlashcards, activeRecall: validActiveRecall } = extractCardCandidates(parsed, 'auto')

  const validatedCards: Partial<Card>[] = []

  for (const fc of validFlashcards) {
    const base = {
      subject_id: subjectId,
      material_id: materialId,
      type: 'flashcard' as const,
      front: cleanCardBrackets(fc.front.trim()),
      back: cleanCardBrackets(fc.back.trim()),
      concept: fc.concept ? cleanCardBrackets(fc.concept) : null,
      is_manual: 0 as const,
      source: 'auto' as const
    }
    const { valid, cards } = validateCardQuality(base)
    if (valid && cards) {
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
      front: cleanCardBrackets(ar.question.trim()),
      back: cleanCardBrackets(ar.model_answer.trim()),
      concept: ar.concept ? cleanCardBrackets(ar.concept) : null,
      is_manual: 0 as const,
      source: 'auto' as const
    }
    const { valid, cards } = validateCardQuality(base)
    if (valid && cards) {
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

  const savedCards = saveGeneratedCards(consolidatedCards.slice(0, 12), db)
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
      const cleanFront = cleanCardBrackets(card.front || '')
      const cleanBack = cleanCardBrackets(card.back || '')
      const cleanConcept = card.concept ? cleanCardBrackets(card.concept) : null

      let folderId = card.folder_id || null
      if (!folderId && card.subject_id) {
        folderId = getOrCreateMaterialFolder(database, card.subject_id, card.material_id, cleanConcept)
      }

      const result = insertCard.run(
        card.subject_id,
        card.material_id || null,
        card.type,
        cleanFront,
        cleanBack,
        card.is_manual || 0,
        card.source || 'manual',
        card.topic_id || null,
        folderId,
        cleanConcept,
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
