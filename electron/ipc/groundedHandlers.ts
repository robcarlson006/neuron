import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { callAIMessages } from './aiHandlers'
import { getAIConfig, getApiKey } from './aiConfigStore'
import { parseDocumentTopology } from '../../src/lib/coverage/documentTopologyParser'
import { generateEmbedding } from '../../src/lib/embeddings'
import { topK } from '../../src/lib/vectorSearch'
import {
  buildEvidenceContext,
  hasSufficientEvidence,
  mergeGroundedResults,
  rankLexicalCandidates,
  type RetrievalCandidate,
  type GroundedEvidence
} from '../../src/lib/groundedRetrieval'
import type { GroundedAnswer } from '../../src/types'

let db: Database.Database

export function setGroundedDatabase(database: Database.Database): void {
  db = database
}

export function retrieveGroundedEvidence(query: string, subjectId?: number | null, materialId?: number | null, materialIds?: number[]): GroundedEvidence[] {
  const filters: string[] = []
  const params: number[] = []
  if (subjectId) { filters.push('m.subject_id = ?'); params.push(subjectId) }
  if (materialId) { filters.push('m.id = ?'); params.push(materialId) }
  if (materialIds?.length) { filters.push(`m.id IN (${materialIds.map(() => '?').join(',')})`); params.push(...materialIds) }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const rows = db.prepare(`
        SELECT e.material_id, m.subject_id, e.chunk_index, e.chunk_text, e.embedding, m.filename
        FROM embeddings e JOIN materials m ON m.id = e.material_id
        ${where}
      `).all(...params) as Array<{ material_id: number; subject_id: number; chunk_index: number; chunk_text: string; embedding: Buffer | null; filename: string }>

  // Existing installations may have materials but no RAG index yet. Build a
  // transient lexical view so the helper and tutor work immediately; the
  // persistent index can still be created from Settings for semantic search.
  if (rows.length === 0) {
    const materialFilters: string[] = ['content_text IS NOT NULL', "content_text != ''"]
    const materialParams: number[] = []
    if (subjectId) { materialFilters.push('subject_id = ?'); materialParams.push(subjectId) }
    if (materialId) { materialFilters.push('id = ?'); materialParams.push(materialId) }
    if (materialIds?.length) { materialFilters.push(`id IN (${materialIds.map(() => '?').join(',')})`); materialParams.push(...materialIds) }
    const materials = db.prepare(`SELECT id, subject_id, filename, content_text FROM materials WHERE ${materialFilters.join(' AND ')}`).all(...materialParams) as Array<{ id: number; subject_id: number; filename: string; content_text: string }>
    const transientCandidates: RetrievalCandidate[] = []
    for (const material of materials) {
      for (const chunk of parseDocumentTopology(material.content_text, material.filename, 750, 75).chunks) {
        transientCandidates.push({ text: chunk.text, materialId: material.id, subjectId: material.subject_id, materialName: material.filename || 'Unknown material', chunkIndex: chunk.index })
      }
    }
    return rankLexicalCandidates(query, transientCandidates, 8)
  }

  const candidates: RetrievalCandidate[] = rows.map(row => ({
    text: row.chunk_text,
    materialId: row.material_id,
    subjectId: row.subject_id,
    materialName: row.filename || 'Unknown material',
    chunkIndex: row.chunk_index
  }))
  const indexedMaterialIds = new Set(rows.map(row => row.material_id))
  const materialFilters: string[] = ['content_text IS NOT NULL', "content_text != ''"]
  const materialParams: number[] = []
  if (subjectId) { materialFilters.push('subject_id = ?'); materialParams.push(subjectId) }
  if (materialId) { materialFilters.push('id = ?'); materialParams.push(materialId) }
  if (materialIds?.length) { materialFilters.push(`id IN (${materialIds.map(() => '?').join(',')})`); materialParams.push(...materialIds) }
  const unindexedMaterials = db.prepare(`SELECT id, subject_id, filename, content_text FROM materials WHERE ${materialFilters.join(' AND ')}`).all(...materialParams) as Array<{ id: number; subject_id: number; filename: string; content_text: string }>
  for (const material of unindexedMaterials) {
    if (indexedMaterialIds.has(material.id)) continue
    for (const chunk of parseDocumentTopology(material.content_text, material.filename, 750, 75).chunks) {
      candidates.push({ text: chunk.text, materialId: material.id, subjectId: material.subject_id, materialName: material.filename || 'Unknown material', chunkIndex: chunk.index })
    }
  }
  return rankLexicalCandidates(query, candidates, 8)
}

export async function retrieveGroundedEvidenceAsync(query: string, subjectId?: number | null, materialId?: number | null, materialIds?: number[]): Promise<GroundedEvidence[]> {
  const filters: string[] = []
  const params: number[] = []
  if (subjectId) { filters.push('m.subject_id = ?'); params.push(subjectId) }
  if (materialId) { filters.push('m.id = ?'); params.push(materialId) }
  if (materialIds?.length) { filters.push(`m.id IN (${materialIds.map(() => '?').join(',')})`); params.push(...materialIds) }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const rows = db.prepare(`
    SELECT e.material_id, m.subject_id, e.chunk_index, e.chunk_text, e.embedding, m.filename
    FROM embeddings e JOIN materials m ON m.id = e.material_id ${where}
  `).all(...params) as Array<{ material_id: number; subject_id: number; chunk_index: number; chunk_text: string; embedding: Buffer | null; filename: string }>
  if (rows.length === 0) return retrieveGroundedEvidence(query, subjectId, materialId, materialIds)

  const candidates: RetrievalCandidate[] = rows.map(row => ({
    text: row.chunk_text,
    materialId: row.material_id,
    subjectId: row.subject_id,
    materialName: row.filename || 'Unknown material',
    chunkIndex: row.chunk_index
  }))
  const indexedMaterialIds = new Set(rows.map(row => row.material_id))
  const materialFilters: string[] = ['content_text IS NOT NULL', "content_text != ''"]
  const materialParams: number[] = []
  if (subjectId) { materialFilters.push('subject_id = ?'); materialParams.push(subjectId) }
  if (materialId) { materialFilters.push('id = ?'); materialParams.push(materialId) }
  if (materialIds?.length) { materialFilters.push(`id IN (${materialIds.map(() => '?').join(',')})`); materialParams.push(...materialIds) }
  const unindexedMaterials = db.prepare(`SELECT id, subject_id, filename, content_text FROM materials WHERE ${materialFilters.join(' AND ')}`).all(...materialParams) as Array<{ id: number; subject_id: number; filename: string; content_text: string }>
  for (const material of unindexedMaterials) {
    if (indexedMaterialIds.has(material.id)) continue
    for (const chunk of parseDocumentTopology(material.content_text, material.filename, 750, 75).chunks) {
      candidates.push({ text: chunk.text, materialId: material.id, subjectId: material.subject_id, materialName: material.filename || 'Unknown material', chunkIndex: chunk.index })
    }
  }
  const lexical = rankLexicalCandidates(query, candidates, 12)
  let semantic: GroundedEvidence[] = []
  const apiKey = getApiKey()
  if (apiKey && rows.some(row => row.embedding)) {
    try {
      const config = getAIConfig()
      const queryEmbedding = await generateEmbedding(query, { ...config, apiKey })
      const semanticRows = rows.filter(row => row.embedding)
      const vectors = semanticRows.map(row => {
        const buffer = row.embedding!
        return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4))
      })
      semantic = topK(queryEmbedding, vectors, 12).map(result => ({
        text: semanticRows[result.index].chunk_text,
        materialId: semanticRows[result.index].material_id,
        subjectId: semanticRows[result.index].subject_id,
        materialName: semanticRows[result.index].filename || 'Unknown material',
        score: result.score,
        chunkIndex: semanticRows[result.index].chunk_index,
        sourceLabel: `${semanticRows[result.index].filename || 'Unknown material'} · section ${semanticRows[result.index].chunk_index + 1}`,
        matchedTerms: [],
        retrievalMode: 'semantic'
      }))
    } catch {
      // lexical fallback is expected for offline/local configurations
    }
  }
  return mergeGroundedResults(semantic, lexical, 8)
}

export function registerGroundedHandlers(): void {
  ipcMain.handle('grounded:ask', async (_event, query: string, subjectId?: number | null): Promise<GroundedAnswer> => {
    try {
      const cleanQuery = String(query || '').trim()
      if (!cleanQuery) return { success: false, answer: '', confidence: 'not_found', evidence: [], error: 'Ask a question first.' }

      const evidence = retrieveGroundedEvidence(cleanQuery, subjectId)

      if (!hasSufficientEvidence(evidence)) {
        return {
          success: true,
          answer: 'I could not find enough support for that in the selected Neuron materials. Try naming the topic, formula, or document section more specifically.',
          confidence: 'not_found',
          evidence: []
        }
      }

      const apiKey = getApiKey()
      if (!apiKey) return { success: false, answer: '', confidence: 'low', evidence, error: 'AI API key not configured.' }

      const config = getAIConfig()
      const context = buildEvidenceContext(evidence)
      const prompt = `You are Neuron's grounded study helper. Answer the learner's question using ONLY the source excerpts below.

Rules:
- Do not use outside knowledge, web search, or unstated assumptions.
- If the excerpts do not support a claim, say that it is not established in the materials.
- Explain formulas in plain language and LaTeX when useful.
- Be concise but include the reasoning needed to learn the answer.
- Do not mention internal source IDs.

SOURCE EXCERPTS:
${context}

LEARNER QUESTION:
${cleanQuery}

Return JSON only: {"answer":"...","confidence":"high|medium|low"}`

      const response = await callAIMessages([{ role: 'user', content: prompt }], { ...config, apiKey }, { type: 'json_object' })
      let parsed: { answer?: string; confidence?: 'high' | 'medium' | 'low' } = {}
      try { parsed = JSON.parse(response) } catch { parsed = { answer: response } }
      return {
        success: true,
        answer: parsed.answer?.trim() || 'The materials contain relevant passages, but I could not form a grounded answer.',
        confidence: parsed.confidence || (evidence[0].score >= 0.65 ? 'high' : 'medium'),
        evidence
      }
    } catch (error) {
      console.error('grounded:ask error:', error)
      return { success: false, answer: '', confidence: 'low', evidence: [], error: error instanceof Error ? error.message : String(error) }
    }
  })
}
