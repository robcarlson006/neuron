import type { CurriculumMaterialGroup, CurriculumMaterialItem, MaterialCurriculumPlan, MaterialSummary } from '../../src/types'

export interface MaterialCurriculumDatabase {
  prepare(sql: string): any
  transaction?<T>(fn: (...args: any[]) => T): (...args: any[]) => T
  exec?(sql: string): unknown
}

export interface MaterialGroupInput {
  subjectId: number
  groupId: number
  title: string
}

export interface MaterialMoveInput {
  subjectId: number
  materialId: number
  targetGroupId: number | null
  targetIndex: number
}

function transaction<T>(db: MaterialCurriculumDatabase, fn: () => T): T {
  if (typeof db.transaction === 'function') return db.transaction(fn)()
  db.exec?.('BEGIN')
  try {
    const result = fn()
    db.exec?.('COMMIT')
    return result
  } catch (error) {
    db.exec?.('ROLLBACK')
    throw error
  }
}

function requireSubject(db: MaterialCurriculumDatabase, subjectId: number): void {
  if (!Number.isSafeInteger(subjectId) || !db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId)) {
    throw new Error('Subject not found')
  }
}

function requireTitle(title: string): string {
  const normalized = typeof title === 'string' ? title.trim() : ''
  if (!normalized) throw new Error('A group title is required')
  return normalized
}

function toSafeIndex(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Material order must be a finite number')
  return Math.max(0, Math.floor(value))
}

/** Persistence boundary for the student-authored material curriculum. */
export class MaterialCurriculumService {
  constructor(private readonly db: MaterialCurriculumDatabase) {}

  getPlan(subjectId: number): MaterialCurriculumPlan {
    requireSubject(this.db, subjectId)
    const groups = this.db.prepare(
      'SELECT id, subject_id, title, sort_order, created_at, updated_at FROM curriculum_material_groups WHERE subject_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(subjectId) as CurriculumMaterialGroup[]
    const rows = this.db.prepare(`
      SELECT i.group_id, i.sort_order, m.id, m.subject_id, m.filename, m.file_type,
        m.uploaded_at, m.file_mtime, m.file_size, m.relative_path
      FROM curriculum_material_group_items i
      JOIN materials m ON m.id = i.material_id AND m.subject_id = ?
      WHERE EXISTS (
        SELECT 1 FROM curriculum_material_groups g
        WHERE g.id = i.group_id AND g.subject_id = ?
      )
      ORDER BY i.group_id ASC, i.sort_order ASC, i.id ASC
    `).all(subjectId, subjectId) as CurriculumMaterialItem[]
    const assigned = new Set(rows.map(row => row.id))
    const unscheduled = this.db.prepare(`
      SELECT id, subject_id, filename, file_type, uploaded_at, file_mtime, file_size,
        relative_path
      FROM materials WHERE subject_id = ? ORDER BY uploaded_at ASC, id ASC
    `).all(subjectId) as MaterialSummary[]
    const filteredUnscheduled = unscheduled.filter(material => !assigned.has(material.id))
    return {
      groups: groups.map(group => ({
        ...group,
        materials: rows.filter(row => row.group_id === group.id)
      })),
      unscheduled: filteredUnscheduled
    }
  }

  createGroup(subjectId: number, title: string): CurriculumMaterialGroup {
    requireSubject(this.db, subjectId)
    const normalizedTitle = requireTitle(title)
    const max = this.db.prepare(
      'SELECT MAX(sort_order) AS value FROM curriculum_material_groups WHERE subject_id = ?'
    ).get(subjectId) as { value: number | null } | undefined
    const now = new Date().toISOString()
    const result = this.db.prepare(`
      INSERT INTO curriculum_material_groups (subject_id, title, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(subjectId, normalizedTitle, (max?.value ?? -1) + 1, now, now)
    const group = this.db.prepare(
      'SELECT id, subject_id, title, sort_order, created_at, updated_at FROM curriculum_material_groups WHERE id = ? AND subject_id = ?'
    ).get(Number(result.lastInsertRowid), subjectId) as CurriculumMaterialGroup | undefined
    if (!group) throw new Error('Material group could not be created')
    return group
  }

  renameGroup(input: MaterialGroupInput): CurriculumMaterialGroup {
    requireSubject(this.db, input.subjectId)
    const normalizedTitle = requireTitle(input.title)
    const result = this.db.prepare(
      'UPDATE curriculum_material_groups SET title = ?, updated_at = ? WHERE id = ? AND subject_id = ?'
    ).run(normalizedTitle, new Date().toISOString(), input.groupId, input.subjectId)
    if (!result.changes) throw new Error('Material group not found')
    const group = this.db.prepare(
      'SELECT id, subject_id, title, sort_order, created_at, updated_at FROM curriculum_material_groups WHERE id = ? AND subject_id = ?'
    ).get(input.groupId, input.subjectId) as CurriculumMaterialGroup | undefined
    if (!group) throw new Error('Material group not found')
    return group
  }

  deleteGroup(subjectId: number, groupId: number): MaterialCurriculumPlan {
    requireSubject(this.db, subjectId)
    this.db.prepare('DELETE FROM curriculum_material_groups WHERE id = ? AND subject_id = ?').run(groupId, subjectId)
    return this.getPlan(subjectId)
  }

  reorderGroups(subjectId: number, groupIds: number[]): MaterialCurriculumPlan {
    requireSubject(this.db, subjectId)
    const ids = groupIds.filter(Number.isSafeInteger)
    const actual = this.db.prepare(
      'SELECT id FROM curriculum_material_groups WHERE subject_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(subjectId).map((group: { id: number }) => group.id)
    if (ids.length !== actual.length || new Set(ids).size !== ids.length || ids.some(id => !actual.includes(id))) {
      throw new Error('Invalid material group order')
    }
    transaction(this.db, () => {
      ids.forEach((id, index) => this.db.prepare(
        'UPDATE curriculum_material_groups SET sort_order = ?, updated_at = ? WHERE id = ? AND subject_id = ?'
      ).run(index, new Date().toISOString(), id, subjectId))
    })
    return this.getPlan(subjectId)
  }

  moveMaterial(input: MaterialMoveInput): MaterialCurriculumPlan {
    requireSubject(this.db, input.subjectId)
    const material = this.db.prepare(
      'SELECT id FROM materials WHERE id = ? AND subject_id = ?'
    ).get(input.materialId, input.subjectId)
    if (!material) throw new Error('Material not found')
    if (input.targetGroupId !== null) {
      const group = this.db.prepare(
        'SELECT id FROM curriculum_material_groups WHERE id = ? AND subject_id = ?'
      ).get(input.targetGroupId, input.subjectId)
      if (!group) throw new Error('Material group not found')
    }
    const targetIndex = toSafeIndex(input.targetIndex)
    transaction(this.db, () => {
      this.db.prepare('DELETE FROM curriculum_material_group_items WHERE material_id = ?').run(input.materialId)
      if (input.targetGroupId === null) return
      const items = this.db.prepare(
        'SELECT material_id FROM curriculum_material_group_items WHERE group_id = ? ORDER BY sort_order ASC, id ASC'
      ).all(input.targetGroupId) as { material_id: number }[]
      const ids = items.map(item => item.material_id)
      ids.splice(Math.min(targetIndex, ids.length), 0, input.materialId)
      ids.forEach((id, index) => this.db.prepare(`
        INSERT INTO curriculum_material_group_items (group_id, material_id, sort_order)
        VALUES (?, ?, ?)
        ON CONFLICT(material_id) DO UPDATE SET group_id = excluded.group_id, sort_order = excluded.sort_order
      `).run(input.targetGroupId, id, index))
    })
    return this.getPlan(input.subjectId)
  }
}
