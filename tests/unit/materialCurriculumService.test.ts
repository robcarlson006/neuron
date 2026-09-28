import { DB_SCHEMA } from '../../src/lib/db'
import { MaterialCurriculumService } from '../../electron/services/materialCurriculumService'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

function createDb(): any {
  const db = new DatabaseSync(':memory:')
  for (const statement of DB_SCHEMA.split(';').map(value => value.trim()).filter(Boolean)) db.exec(`${statement};`)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec("INSERT INTO users (name) VALUES ('Test User')")
  db.exec("INSERT INTO subjects (user_id, name) VALUES (1, 'Biology')")
  db.exec("INSERT INTO materials (subject_id, filename, file_type, content_text) VALUES (1, 'one.pdf', 'pdf', 'private content')")
  db.exec("INSERT INTO materials (subject_id, filename, file_type, content_text) VALUES (1, 'two.pdf', 'pdf', 'private content')")
  db.exec("INSERT INTO materials (subject_id, filename, file_type, content_text) VALUES (1, 'three.pdf', 'pdf', 'private content')")
  return db
}

describe('MaterialCurriculumService', () => {
  it('persists deterministic group and material order without exposing content text', () => {
    const db = createDb()
    const service = new MaterialCurriculumService(db)
    const first = service.createGroup(1, '  Unit 1  ')
    const second = service.createGroup(1, 'Unit 2')

    service.moveMaterial({ subjectId: 1, materialId: 1, targetGroupId: second.id, targetIndex: 0 })
    service.moveMaterial({ subjectId: 1, materialId: 2, targetGroupId: second.id, targetIndex: 0 })
    service.moveMaterial({ subjectId: 1, materialId: 3, targetGroupId: first.id, targetIndex: 0 })

    const plan = service.reorderGroups(1, [second.id, first.id])
    expect(plan.groups.map(group => group.title)).toEqual(['Unit 2', 'Unit 1'])
    expect(plan.groups[0].materials.map(material => material.filename)).toEqual(['two.pdf', 'one.pdf'])
    expect(plan.groups[1].materials.map(material => material.filename)).toEqual(['three.pdf'])
    expect(plan.groups[0].materials[0]).not.toHaveProperty('content_text')
    expect(plan.unscheduled).toHaveLength(0)
  })

  it('rejects cross-subject access and incomplete or duplicate orders', () => {
    const db = createDb()
    db.exec("INSERT INTO subjects (user_id, name) VALUES (1, 'Chemistry')")
    const service = new MaterialCurriculumService(db)
    const group = service.createGroup(1, 'Unit 1')

    expect(() => service.getPlan(999)).toThrow('Subject not found')
    expect(() => service.renameGroup({ subjectId: 2, groupId: group.id, title: 'Nope' })).toThrow('Material group not found')
    expect(() => service.reorderGroups(1, [group.id, group.id])).toThrow('Invalid material group order')
    expect(() => service.moveMaterial({ subjectId: 1, materialId: 1, targetGroupId: 999, targetIndex: 0 })).toThrow('Material group not found')
  })
})
