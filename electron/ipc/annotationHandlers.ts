import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import type {
  DocumentAnnotation,
  DocumentAnnotationKind,
  SaveDocumentAnnotationInput
} from '../../src/types'
import { exportLectureArtifacts } from './lectureArtifactService'

let db: Database.Database | null = null

const KINDS: ReadonlySet<DocumentAnnotationKind> = new Set([
  'highlight',
  'comment',
  'cue',
  'question',
  'summary'
])

export function setAnnotationDatabase(database: Database.Database): void {
  db = database
}

function requireDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

function assertResourceOwnership(database: Database.Database, input: SaveDocumentAnnotationInput): void {
  const resourceCount = Number(Boolean(input.material_id)) + Number(Boolean(input.lecture_id))
  if (resourceCount !== 1) {
    throw new Error('An annotation must belong to exactly one material or lecture')
  }

  if (!KINDS.has(input.kind)) throw new Error(`Unsupported annotation kind: ${input.kind}`)

  const resource = input.material_id
    ? database.prepare('SELECT subject_id FROM materials WHERE id = ?').get(input.material_id) as { subject_id: number } | undefined
    : database.prepare('SELECT subject_id FROM lectures WHERE id = ?').get(input.lecture_id) as { subject_id: number } | undefined

  if (!resource || resource.subject_id !== input.subject_id) {
    throw new Error('Annotation resource does not belong to the selected subject')
  }

  if (input.parent_id) {
    const parent = database.prepare(
      'SELECT subject_id, material_id, lecture_id FROM document_annotations WHERE id = ? AND deleted_at IS NULL'
    ).get(input.parent_id) as { subject_id: number; material_id: number | null; lecture_id: number | null } | undefined
    if (!parent || parent.subject_id !== input.subject_id || parent.material_id !== (input.material_id || null) || parent.lecture_id !== (input.lecture_id || null)) {
      throw new Error('Annotation parent does not belong to the same resource')
    }
  }
}

function normalizeBody(input: SaveDocumentAnnotationInput): string {
  const body = input.body.trim()
  if (input.kind !== 'highlight' && body.length === 0) {
    throw new Error('Notes, questions, comments, and summaries cannot be empty')
  }
  return body
}

function normalizeForSearch(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function locatorForOffset(content: string, offset: number, existing: Record<string, unknown> | null): Record<string, unknown> {
  const markers = [...content.matchAll(/---\s+(Page|Slide|Chapter)\s+(\d+)\s+---/gi)]
  const marker = markers.reverse().find((match) => (match.index || 0) <= offset)
  if (marker) {
    const markerKind = marker[1].toLowerCase()
    const locatorKey = markerKind === 'slide' ? 'slide' : markerKind === 'chapter' ? 'chapter' : 'page'
    return { ...existing, [locatorKey]: Number(marker[2]) }
  }
  return existing || {}
}

function reconcileMaterialAnnotations(database: Database.Database, materialId: number): DocumentAnnotation[] {
  const material = database.prepare('SELECT subject_id, content_text, file_mtime, file_size, file_sha256 FROM materials WHERE id = ?').get(materialId) as { subject_id: number; content_text: string; file_mtime?: number | null; file_size?: number | null; file_sha256?: string | null } | undefined
  if (!material) throw new Error('Material not found')
  const annotations = database.prepare('SELECT * FROM document_annotations WHERE material_id = ? AND deleted_at IS NULL').all(materialId) as DocumentAnnotation[]
  const content = material.content_text || ''
  const normalizedContent = normalizeForSearch(content)
  const currentSourceHash = material.file_sha256 || (material.file_mtime != null ? `${material.file_mtime}:${material.file_size || 0}` : null)

  for (const annotation of annotations) {
    if (!annotation.selected_text || annotation.kind === 'summary') continue
    const quote = normalizeForSearch(annotation.selected_text)
    const snapshot = normalizeForSearch(annotation.source_snapshot || '')
    const found = normalizedContent.indexOf(quote)
    let locator: Record<string, unknown> | null = null
    try { locator = annotation.locator_json ? JSON.parse(annotation.locator_json) as Record<string, unknown> : null } catch { locator = null }
    const stillInSnapshot = Boolean(snapshot && snapshot.includes(quote))
    const hasVisualRegion = annotation.kind === 'highlight'
      && annotation.selected_text.startsWith('Visual region on ')
      && Array.isArray(locator?.rects)
      && locator.rects.length > 0
    const sourceHashUnchanged = !currentSourceHash || !annotation.source_hash || annotation.source_hash === currentSourceHash
    const resolved = hasVisualRegion
      ? sourceHashUnchanged
      : found >= 0 && (stillInSnapshot || !annotation.source_snapshot)
    const updatedLocator = found >= 0 ? locatorForOffset(content, found, locator) : locator
    database.prepare(`
      UPDATE document_annotations
      SET locator_json = ?, locator_status = ?, source_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updatedLocator ? JSON.stringify(updatedLocator) : null,
      resolved ? 'resolved' : 'needs_review',
      currentSourceHash || annotation.source_hash || null,
      new Date().toISOString(),
      annotation.id
    )
  }
  return database.prepare('SELECT * FROM document_annotations WHERE material_id = ? AND deleted_at IS NULL ORDER BY updated_at ASC, id ASC').all(materialId) as DocumentAnnotation[]
}

function exportLectureArtifactsSafely(database: Database.Database, lectureId: number): void {
  try {
    exportLectureArtifacts(database, lectureId)
  } catch (error) {
    // The SQLite sidecar remains authoritative if the linked folder is
    // temporarily unavailable or read-only; retrying sync will preserve the
    // annotations and the next save can export them again.
    console.warn('Could not export lecture artifacts to the linked folder:', error)
  }
}

export function registerAnnotationHandlers(): void {
  ipcMain.handle('annotations:list', (_event, resource: { materialId?: number; lectureId?: number; includeDeleted?: boolean }): DocumentAnnotation[] => {
    const database = requireDatabase()
    if (!resource.materialId && !resource.lectureId) throw new Error('A material or lecture is required')
    if (resource.materialId && resource.lectureId) throw new Error('Only one annotation resource may be selected')

    const column = resource.materialId ? 'material_id' : 'lecture_id'
    const id = resource.materialId || resource.lectureId
    const deletedClause = resource.includeDeleted ? '' : ' AND deleted_at IS NULL'
    return database.prepare(
      `SELECT * FROM document_annotations WHERE ${column} = ?${deletedClause} ORDER BY updated_at ASC, id ASC`
    ).all(id) as DocumentAnnotation[]
  })

  ipcMain.handle('annotations:reconcileMaterial', (_event, materialId: number): DocumentAnnotation[] => {
    return reconcileMaterialAnnotations(requireDatabase(), materialId)
  })

  ipcMain.handle('annotations:save', (_event, input: SaveDocumentAnnotationInput): DocumentAnnotation => {
    const database = requireDatabase()
    assertResourceOwnership(database, input)
    const body = normalizeBody(input)
    const locatorJson = input.locator ? JSON.stringify(input.locator) : null
    const now = new Date().toISOString()

    if (input.id) {
      const existing = database.prepare(
        'SELECT id, subject_id, material_id, lecture_id FROM document_annotations WHERE id = ? AND deleted_at IS NULL'
      ).get(input.id) as { id: number; subject_id: number; material_id: number | null; lecture_id: number | null } | undefined
      if (!existing || existing.subject_id !== input.subject_id || existing.material_id !== (input.material_id || null) || existing.lecture_id !== (input.lecture_id || null)) {
        throw new Error('Annotation cannot be updated outside its original resource')
      }
      database.prepare(`
        UPDATE document_annotations
        SET kind = ?, parent_id = ?, color = ?, body = ?, selected_text = ?, locator_json = ?,
            source_snapshot = ?, source_hash = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.kind,
        input.parent_id || null,
        input.color || null,
        body,
        input.selected_text || null,
        locatorJson,
        input.source_snapshot || null,
        input.source_hash || null,
        now,
        input.id
      )
      const saved = database.prepare('SELECT * FROM document_annotations WHERE id = ?').get(input.id) as DocumentAnnotation
      if (input.lecture_id) exportLectureArtifactsSafely(database, input.lecture_id)
      return saved
    }

    const result = database.prepare(`
      INSERT INTO document_annotations
        (subject_id, material_id, lecture_id, kind, parent_id, color, body, selected_text,
         locator_json, source_snapshot, source_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.subject_id,
      input.material_id || null,
      input.lecture_id || null,
      input.kind,
      input.parent_id || null,
      input.color || null,
      body,
      input.selected_text || null,
      locatorJson,
      input.source_snapshot || null,
      input.source_hash || null,
      now,
      now
    )
    const saved = database.prepare('SELECT * FROM document_annotations WHERE id = ?').get(result.lastInsertRowid) as DocumentAnnotation
    if (input.lecture_id) exportLectureArtifactsSafely(database, input.lecture_id)
    return saved
  })

  ipcMain.handle('annotations:delete', (_event, annotationId: number): { success: boolean } => {
    const database = requireDatabase()
    const existing = database.prepare('SELECT lecture_id FROM document_annotations WHERE id = ? AND deleted_at IS NULL').get(annotationId) as { lecture_id: number | null } | undefined
    const result = database.prepare(
      'UPDATE document_annotations SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    ).run(new Date().toISOString(), new Date().toISOString(), annotationId)
    if (result.changes > 0 && existing?.lecture_id) exportLectureArtifactsSafely(database, existing.lecture_id)
    return { success: result.changes > 0 }
  })

  ipcMain.handle('annotations:restore', (_event, annotationId: number): { success: boolean } => {
    const database = requireDatabase()
    const existing = database.prepare('SELECT lecture_id FROM document_annotations WHERE id = ? AND deleted_at IS NOT NULL').get(annotationId) as { lecture_id: number | null } | undefined
    const result = database.prepare(
      'UPDATE document_annotations SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL'
    ).run(new Date().toISOString(), annotationId)
    if (result.changes > 0 && existing?.lecture_id) exportLectureArtifactsSafely(database, existing.lecture_id)
    return { success: result.changes > 0 }
  })
}
