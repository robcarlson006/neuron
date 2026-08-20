import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { chunkText } from '../../src/lib/ragChunker'
import { topK } from '../../src/lib/vectorSearch'
import { generateEmbeddings, generateEmbedding } from '../../src/lib/embeddings'
import { getAIConfig, getApiKey } from './aiConfigStore'
import type { RAGSearchResult, AIProviderConfig } from '../../src/types'

let db: Database.Database

export function setRAGDatabase(database: Database.Database): void {
  db = database
}

export function registerRAGHandlers(): void {
  // ── Index a single material ────────────────────────────────────────────────

  ipcMain.handle('rag:indexMaterial', async (_event, materialId: number) => {
    try {
      // 1. Fetch material content_text
      const material = db.prepare('SELECT id, content_text FROM materials WHERE id = ?').get(materialId) as
        | { id: number; content_text: string | null }
        | undefined

      if (!material) {
        throw new Error(`Material not found: ${materialId}`)
      }

      if (!material.content_text || material.content_text.trim().length === 0) {
        throw new Error('Material has no content text to index')
      }

      // 2. Chunk the text
      const chunks = chunkText(material.content_text)
      if (chunks.length === 0) {
        return { chunkCount: 0 }
      }

      // 3. Generate embeddings
      const config = getAIConfig()
      const apiKey = getApiKey()
      const providerConfig: AIProviderConfig | null = apiKey
        ? { ...config, apiKey }
        : null

      const embeddings: number[][] = await generateEmbeddings(
        chunks.map(c => c.text),
        providerConfig
      )

      // 4. Clear existing embeddings for this material
      db.prepare('DELETE FROM embeddings WHERE material_id = ?').run(materialId)

      // 5. Insert new embeddings
      const insert = db.prepare(
        'INSERT INTO embeddings (material_id, chunk_index, chunk_text, embedding, model) VALUES (?, ?, ?, ?, ?)'
      )

      const insertMany = db.transaction(() => {
        for (let i = 0; i < chunks.length; i++) {
          const embeddingBuffer = Buffer.from(new Float32Array(embeddings[i]).buffer)
          insert.run(materialId, chunks[i].index, chunks[i].text, embeddingBuffer, config.model || '')
        }
      })
      insertMany()

      return { chunkCount: chunks.length }
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
        // 1. Generate embedding for query
        const config = getAIConfig()
        const apiKey = getApiKey()

        if (!apiKey) {
          return []
        }

        const providerConfig: AIProviderConfig = { ...config, apiKey }
        const queryEmbedding = await generateEmbedding(query, providerConfig)

        // 2. Fetch all embeddings (optionally filtered by subject)
        let rows: Array<{
          id: number
          material_id: number
          chunk_index: number
          chunk_text: string
          embedding: Buffer
        }>

        if (subjectId) {
          rows = db
            .prepare(
              `SELECT e.id, e.material_id, e.chunk_index, e.chunk_text, e.embedding
               FROM embeddings e
               JOIN materials m ON m.id = e.material_id
               WHERE m.subject_id = ? AND e.embedding IS NOT NULL`
            )
            .all(subjectId) as typeof rows
        } else {
          rows = db
            .prepare(
              `SELECT id, material_id, chunk_index, chunk_text, embedding
               FROM embeddings WHERE embedding IS NOT NULL`
            )
            .all() as typeof rows
        }

        if (rows.length === 0) {
          return []
        }

        // 3. Compute cosine similarity for each
        const vectors: number[][] = []
        for (const row of rows) {
          const float32 = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4)
          vectors.push(Array.from(float32))
        }

        const topResults = topK(queryEmbedding, vectors, topKCount)

        // 4. Build result objects with material names
        const materialNameCache = new Map<number, string>()
        const getMaterialName = (materialId: number): string => {
          if (!materialNameCache.has(materialId)) {
            const m = db
              .prepare('SELECT filename FROM materials WHERE id = ?')
              .get(materialId) as { filename: string } | undefined
            materialNameCache.set(materialId, m?.filename || 'Unknown')
          }
          return materialNameCache.get(materialId)!
        }

        const results: RAGSearchResult[] = topResults.map(r => ({
          text: rows[r.index].chunk_text,
          materialId: rows[r.index].material_id,
          materialName: getMaterialName(rows[r.index].material_id),
          score: r.score,
          chunkIndex: rows[r.index].chunk_index
        }))

        return results
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
        .prepare('SELECT id, content_text FROM materials WHERE content_text IS NOT NULL AND content_text != ?')
        .all('') as Array<{ id: number; content_text: string }>

      let totalChunks = 0

      for (const material of materials) {
        try {
          const chunks = chunkText(material.content_text)
          if (chunks.length === 0) continue

          const config = getAIConfig()
          const apiKey = getApiKey()
          const providerConfig: AIProviderConfig | null = apiKey
            ? { ...config, apiKey }
            : null

          const embeddings: number[][] = await generateEmbeddings(
            chunks.map(c => c.text),
            providerConfig
          )

          db.prepare('DELETE FROM embeddings WHERE material_id = ?').run(material.id)

          const insert = db.prepare(
            'INSERT INTO embeddings (material_id, chunk_index, chunk_text, embedding, model) VALUES (?, ?, ?, ?, ?)'
          )

          db.transaction(() => {
            for (let i = 0; i < chunks.length; i++) {
              const embeddingBuffer = Buffer.from(new Float32Array(embeddings[i]).buffer)
              insert.run(material.id, chunks[i].index, chunks[i].text, embeddingBuffer, config.model || '')
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
      return { success: true }
    } catch (error) {
      console.error('rag:deleteIndex error:', error)
      throw error
    }
  })
}

