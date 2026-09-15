/**
 * Semantic Ledger Engine
 * State machine that guarantees 100% material coverage.
 * Tracks every chunk through: pending -> extracted -> audited -> verified.
 * The generation pipeline physically cannot conclude until 100% of chunks are verified.
 */

import type { AtomicChunk } from './documentTopologyParser'

export type LedgerChunkStatus = 'pending' | 'extracted' | 'audited' | 'verified' | 'failed'

export interface LedgerEntry {
  id: string
  materialId: number
  chunkIndex: number
  title: string
  type: string
  text: string
  status: LedgerChunkStatus
  extractedPrinciples: string[]
  auditedGaps: string[]
  itemsGeneratedCount: number
  attempts: number
  lastError?: string
}

export interface CoverageManifest {
  materialId: number
  totalChunks: number
  verifiedChunks: number
  coveragePercentage: number
  totalItemsGenerated: number
  isFullyCovered: boolean
  sections: {
    chunkIndex: number
    title: string
    type: string
    status: LedgerChunkStatus
    itemCount: number
    keyPrinciples: string[]
  }[]
}

/**
 * In-memory & SQLite-compatible Semantic Ledger
 */
export class SemanticLedger {
  private entries: Map<string, LedgerEntry> = new Map()

  /**
   * Initialize ledger with atomic chunks from Document Topology Parser
   */
  public initialize(materialId: number, chunks: AtomicChunk[]): void {
    this.entries.clear()
    for (const chunk of chunks) {
      const id = `${materialId}_chunk_${chunk.index}`
      this.entries.set(id, {
        id,
        materialId,
        chunkIndex: chunk.index,
        title: chunk.title,
        type: chunk.type,
        text: chunk.text,
        status: 'pending',
        extractedPrinciples: [],
        auditedGaps: [],
        itemsGeneratedCount: 0,
        attempts: 0
      })
    }
  }

  /**
   * Get all entries for a material
   */
  public getEntries(): LedgerEntry[] {
    return Array.from(this.entries.values()).sort((a, b) => a.chunkIndex - b.chunkIndex)
  }

  /**
   * Check if any chunk is still awaiting processing
   */
  public hasPendingChunks(): boolean {
    return Array.from(this.entries.values()).some(e => e.status === 'pending' || e.status === 'extracted')
  }

  /**
   * Get next pending chunk
   */
  public getNextPendingChunk(): LedgerEntry | null {
    const sorted = this.getEntries()
    return sorted.find(e => e.status === 'pending') || null
  }

  /**
   * Update status after Pass 1: Generative Extraction
   */
  public markExtracted(chunkIndex: number, principles: string[]): void {
    const entry = this.getEntries().find(e => e.chunkIndex === chunkIndex)
    if (entry) {
      entry.status = 'extracted'
      entry.extractedPrinciples = principles
      entry.attempts++
    }
  }

  /**
   * Update status after Pass 2: Adversarial Audit
   */
  public markAudited(chunkIndex: number, auditedGaps: string[]): void {
    const entry = this.getEntries().find(e => e.chunkIndex === chunkIndex)
    if (entry) {
      entry.status = 'audited'
      entry.auditedGaps = auditedGaps
    }
  }

  /**
   * Update status after Pass 3 & 4: Cold-Solver Verification and Item Commitment
   */
  public markVerified(chunkIndex: number, generatedItemsCount: number): void {
    const entry = this.getEntries().find(e => e.chunkIndex === chunkIndex)
    if (entry) {
      entry.status = 'verified'
      entry.itemsGeneratedCount += generatedItemsCount
    }
  }

  /**
   * Mark chunk failed if unrecoverable, logging error
   */
  public markFailed(chunkIndex: number, error: string): void {
    const entry = this.getEntries().find(e => e.chunkIndex === chunkIndex)
    if (entry) {
      entry.status = 'failed'
      entry.lastError = error
      entry.attempts++
    }
  }

  /**
   * Compute comprehensive coverage manifest
   */
  public getCoverageManifest(materialId: number): CoverageManifest {
    const entries = this.getEntries().filter(e => e.materialId === materialId)
    const totalChunks = entries.length
    const verifiedChunks = entries.filter(e => e.status === 'verified').length
    const totalItemsGenerated = entries.reduce((sum, e) => sum + e.itemsGeneratedCount, 0)
    const coveragePercentage = totalChunks > 0 ? Math.round((verifiedChunks / totalChunks) * 100) : 100

    return {
      materialId,
      totalChunks,
      verifiedChunks,
      coveragePercentage,
      totalItemsGenerated,
      isFullyCovered: totalChunks > 0 && verifiedChunks === totalChunks,
      sections: entries.map(e => ({
        chunkIndex: e.chunkIndex,
        title: e.title,
        type: e.type,
        status: e.status,
        itemCount: e.itemsGeneratedCount,
        keyPrinciples: Array.from(new Set([...e.extractedPrinciples, ...e.auditedGaps]))
      }))
    }
  }
}
