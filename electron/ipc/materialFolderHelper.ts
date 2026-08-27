import Database from 'better-sqlite3'

/**
 * Ensures a card folder exists for the given material or fallback name, and returns the folder ID.
 */
export function getOrCreateMaterialFolder(
  database: Database.Database,
  subjectId: number,
  materialId?: number | null,
  fallbackName?: string | null
): number | null {
  let folderName = fallbackName || ''
  if (materialId) {
    const mat = database.prepare('SELECT filename FROM materials WHERE id = ?').get(materialId) as { filename: string } | undefined
    if (mat?.filename) {
      folderName = mat.filename
    }
  }

  if (!folderName || !folderName.trim()) return null
  folderName = folderName.trim()

  const existing = database.prepare(
    'SELECT id FROM card_folders WHERE subject_id = ? AND name = ?'
  ).get(subjectId, folderName) as { id: number } | undefined

  if (existing) {
    return existing.id
  }

  const result = database.prepare(
    'INSERT INTO card_folders (subject_id, name, created_at) VALUES (?, ?, ?)'
  ).run(subjectId, folderName, new Date().toISOString())

  return result.lastInsertRowid as number
}

/**
 * Automatically sync/backfill cards with their material folders.
 */
export function syncCardsToMaterialFolders(database: Database.Database): void {
  try {
    const unassigned = database.prepare(`
      SELECT DISTINCT c.subject_id, c.material_id, m.filename
      FROM cards c
      JOIN materials m ON m.id = c.material_id
      WHERE c.folder_id IS NULL AND c.material_id IS NOT NULL
    `).all() as { subject_id: number; material_id: number; filename: string }[]

    for (const row of unassigned) {
      if (!row.filename) continue
      const folderId = getOrCreateMaterialFolder(database, row.subject_id, row.material_id, row.filename)
      if (folderId) {
        database.prepare(`
          UPDATE cards SET folder_id = ?
          WHERE subject_id = ? AND material_id = ? AND folder_id IS NULL
        `).run(folderId, row.subject_id, row.material_id)
      }
    }
  } catch (err) {
    console.warn('syncCardsToMaterialFolders warning:', err)
  }
}
