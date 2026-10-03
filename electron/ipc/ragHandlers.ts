import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { parseDocumentTopology, type AtomicChunk } from '../../src/lib/coverage/documentTopologyParser'
import { topK } from '../../src/lib/vectorSearch'
import { generateEmbeddings, generateEmbedding } from '../../src/lib/embeddings'
import { mergeGroundedResults, rankLexicalCandidates, type RetrievalCandidate } from '../../src/lib/groundedRetrieval'
import { getAIConfig, getApiKey } from './aiConfigStore'
import type { RAGSearchResult, AIProviderConfig } from '../../src/types'

let db: Database.Database
const RAG_INDEX_VERSION = 'formula-aware-v2'

function structuralChunks(text: string, filename: string): AtomicChunk[] {
  return parseDocumentTopology(text, filename, 750, 75).chunks
}

function syncCanonicalChunks(materialId: number, filename: string, chunks: AtomicChunk[]): void {
  db.prepare('DELETE FROM document_chunks WHERE material_id = ?').run(materialId)
  const rows = chunks.map(chunk => {
    const id = `${materialId}:${chunk.index}:${createHash('sha256').update(chunk.text).digest('hex').slice(0, 16)}`
    return {
      id,
      materialId,
      chunk,
      hash: createHash('sha256').update(`${filename}\n${chunk.text}`).digest('hex')
    }
  })
  const insert = db.prepare(`
    INSERT INTO document_chunks (
      id, material_id, chunk_index, title, heading_path, chunk_type, text,
      char_start, char_end, token_count, content_hash, previous_chunk_id, next_chunk_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const current = rows[i]
      insert.run(
        current.id,
        materialId,
        current.chunk.index,
        current.chunk.title,
        current.chunk.sectionHeading || current.chunk.title,
        current.chunk.type,
        current.chunk.text,
        current.chunk.charStart,
        current.chunk.charEnd,
        current.chunk.tokenEstimate,
        current.hash,
        rows[i - 1]?.id || null,
        rows[i + 1]?.id || null
      )
    }
  })()
}

export function setRAGDatabase(database: Database.Database): void {
  db = database
}

export function isRAGDatabaseReady(): boolean {
  return Boolean(db)
}

export async function indexMaterialById(materialId: number): Promise<{ chunkCount: number }> {
  // 1. Fetch material content_text
  const material = db.prepare('SELECT id, filename, content_text FROM materials WHERE id = ?').get(materialId) as
    | { id: number; filename: string; content_text: string | null }
    | undefined

  if (!material) throw new Error(`Material not found: ${materialId}`)
  if (!material.content_text || material.content_text.trim().length === 0) {
    throw new Error('Material has no content text to index')
  }

  const chunks = structuralChunks(material.content_text, material.filename)
  if (chunks.length === 0) return { chunkCount: 0 }
  syncCanonicalChunks(materialId, material.filename, chunks)

  const config = getAIConfig()
  const apiKey = getApiKey()
  const providerConfig: AIProviderConfig | null = apiKey ? { ...config, apiKey } : null
  let embeddings: number[][] | null = null
  try {
    if (providerConfig) embeddings = await generateEmbeddings(chunks.map(c => c.text), providerConfig)
  } catch (embeddingError) {
    console.warn('rag:indexMaterial semantic indexing unavailable; keeping lexical index:', embeddingError)
  }

  db.prepare('DELETE FROM embeddings WHERE material_id = ?').run(materialId)
  const insert = db.prepare('INSERT INTO embeddings (material_id, chunk_index, chunk_text, embedding, model) VALUES (?, ?, ?, ?, ?)')
  db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const embeddingBuffer = embeddings?.[i] ? Buffer.from(new Float32Array(embeddings[i]).buffer) : null
      insert.run(materialId, chunks[i].index, chunks[i].text, embeddingBuffer, embeddings ? 'configured' : 'lexical')
    }
  })()
  return { chunkCount: chunks.length }
}

export async function ensureRAGIndexVersion(): Promise<void> {
  const current = db.prepare("SELECT value FROM app_meta WHERE key = 'rag_index_version'").get() as { value?: string } | undefined
  if (current?.value === RAG_INDEX_VERSION) return

  const materials = db.prepare('SELECT id FROM materials WHERE content_text IS NOT NULL AND content_text != ?').all('') as Array<{ id: number }>
  let allSucceeded = true
  for (const material of materials) {
    try { await indexMaterialById(material.id) } catch (error) { allSucceeded = false; console.warn(`Failed to re-index material ${material.id}:`, error) }
  }
  if (allSucceeded) db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('rag_index_version', ?)").run(RAG_INDEX_VERSION)
}

export function registerRAGHandlers(): void {
  // ── Index a single material ────────────────────────────────────────────────

  ipcMain.handle('rag:indexMaterial', async (_event, materialId: number) => {
    try {
      return await indexMaterialById(materialId)
    } catch (error) {
      console.error('rag:indexMaterial error:', error)
      throw error
    }
  })

  // ── Search across indexed materials ────────────────────────────────────────

  ipcMain.handle(
    'rag:search',
    async (
      _event,
      query: string,
      subjectId?: number,
      topKCount: number = 10
    ): Promise<RAGSearchResult[]> => {
      try {
        // 1. Load all scoped chunks. Lexical retrieval is the trust-preserving
        // fallback and also improves exact formula/name lookups.
        const config = getAIConfig()
        const apiKey = getApiKey()
        let rows: Array<{
          id: number
          material_id: number
          chunk_index: number
          chunk_text: string
          embedding: Buffer | null
          filename: string
        }>

        if (subjectId) {
          rows = db
            .prepare(
              `SELECT e.id, e.material_id, e.chunk_index, e.chunk_text, e.embedding, m.filename
               FROM embeddings e
               JOIN materials m ON m.id = e.material_id
               WHERE m.subject_id = ?`
            )
            .all(subjectId) as typeof rows
        } else {
          rows = db
            .prepare(
              `SELECT e.id, e.material_id, e.chunk_index, e.chunk_text, e.embedding, m.filename
               FROM embeddings e JOIN materials m ON m.id = e.material_id`
            )
            .all() as typeof rows
        }

        if (rows.length === 0) {
          return []
        }

        const candidates: RetrievalCandidate[] = rows.map(row => ({
          text: row.chunk_text,
          materialId: row.material_id,
          materialName: row.filename || 'Unknown material',
          chunkIndex: row.chunk_index
        }))
        const lexical = rankLexicalCandidates(query, candidates, topKCount)

        let semantic: RAGSearchResult[] = []
        if (apiKey && rows.some(row => row.embedding)) {
          try {
            const providerConfig: AIProviderConfig = { ...config, apiKey }
            const queryEmbedding = await generateEmbedding(query, providerConfig)
            const semanticRows = rows.filter(row => row.embedding)
            const vectors = semanticRows.map(row => {
              const buffer = row.embedding!
              const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
              return Array.from(float32)
            })
            const topResults = topK(queryEmbedding, vectors, topKCount)
            semantic = topResults.map(result => ({
              text: semanticRows[result.index].chunk_text,
              materialId: semanticRows[result.index].material_id,
              materialName: semanticRows[result.index].filename || 'Unknown material',
              score: result.score,
              chunkIndex: semanticRows[result.index].chunk_index
            }))
          } catch (semanticError) {
            console.warn('rag:search semantic retrieval unavailable; using lexical retrieval:', semanticError)
          }
        }

        return mergeGroundedResults(semantic, lexical, topKCount)
      } catch (error) {
        console.error('rag:search error:', error)
        return []
      }
    }
  )

  // ── Get index stats ────────────────────────────────────────────────────────

  ipcMain.handle('rag:getIndexStats', async () => {
    try {
      const chunkRow = db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as {
        count: number
      }
      const materialRow = db.prepare(
        'SELECT COUNT(DISTINCT material_id) as count FROM embeddings'
      ).get() as { count: number }

      return {
        totalChunks: chunkRow.count,
        indexedMaterials: materialRow.count
      }
    } catch (error) {
      console.error('rag:getIndexStats error:', error)
      return { totalChunks: 0, indexedMaterials: 0 }
    }
  })

  // ── Re-index all materials ─────────────────────────────────────────────────

  ipcMain.handle('rag:reindexAll', async () => {
    try {
      const materials = db
        .prepare('SELECT id, filename, content_text FROM materials WHERE content_text IS NOT NULL AND content_text != ?')
        .all('') as Array<{ id: number; filename: string; content_text: string }>

      let totalChunks = 0

      for (const material of materials) {
        try {
          const chunks = structuralChunks(material.content_text, material.filename)
          if (chunks.length === 0) continue

          syncCanonicalChunks(material.id, material.filename, chunks)

          const config = getAIConfig()
          const apiKey = getApiKey()
          const providerConfig: AIProviderConfig | null = apiKey
            ? { ...config, apiKey }
            : null

          let embeddings: number[][] | null = null
          try {
            if (providerConfig) embeddings = await generateEmbeddings(chunks.map(c => c.text), providerConfig)
          } catch (embeddingError) {
            console.warn(`Failed to create semantic index for material ${material.id}; keeping lexical chunks:`, embeddingError)
          }

          db.prepare('DELETE FROM embeddings WHERE material_id = ?').run(material.id)

          const insert = db.prepare(
            'INSERT INTO embeddings (material_id, chunk_index, chunk_text, embedding, model) VALUES (?, ?, ?, ?, ?)'
          )

          db.transaction(() => {
            for (let i = 0; i < chunks.length; i++) {
              const embeddingBuffer = embeddings?.[i]
                ? Buffer.from(new Float32Array(embeddings[i]).buffer)
                : null
              insert.run(material.id, chunks[i].index, chunks[i].text, embeddingBuffer, embeddings ? 'configured' : 'lexical')
            }
          })()

          totalChunks += chunks.length
        } catch (err) {
          console.error(`Failed to index material ${material.id}:`, err)
          // Continue with other materials
        }
      }

      return { success: true, totalChunks }
    } catch (error) {
      console.error('rag:reindexAll error:', error)
      throw error
    }
  })

  // ── Delete index for a material ────────────────────────────────────────────

  ipcMain.handle('rag:deleteIndex', async (_event, materialId: number) => {
    try {
      db.prepare('DELETE FROM embeddings WHERE material_id = ?').run(materialId)
      db.prepare('DELETE FROM document_chunks WHERE material_id = ?').run(materialId)
      return { success: true }
    } catch (error) {
      console.error('rag:deleteIndex error:', error)
      throw error
    }
  })
}
