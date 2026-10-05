import { normalizeSyllabusResult } from '../../src/lib/syllabusResult'

describe('normalizeSyllabusResult', () => {
  it('normalizes the reconciler object returned by the current IPC handler', () => {
    const result = normalizeSyllabusResult({
      modules: [{ id: 1, subject_id: 2, title: 'Module', status: 'pending', hours_estimated: 1, sort_order: 0, created_at: '', topics: [] }],
      new_module_count: 1,
      new_topic_count: 2,
      processed_material_count: 1,
      needs_updates: true,
      curriculum_revision: 3,
      source_coverage: 1,
      diagnostics: ['ok']
    } as any)

    expect(result.modules).toHaveLength(1)
    expect(result.summary).toEqual(expect.objectContaining({
      newModuleCount: 1,
      newTopicCount: 2,
      processedMaterialCount: 1,
      revision: 3,
      sourceCoverage: 1,
      diagnostics: ['ok']
    }))
  })

  it('continues to support the legacy module-array response', () => {
    const result = normalizeSyllabusResult([
      { id: 1, subject_id: 2, title: 'Module', status: 'pending', hours_estimated: 1, sort_order: 0, created_at: '', topics: [{ id: 1 } as any] }
    ])
    expect(result.modules).toHaveLength(1)
    expect(result.summary).toEqual({ newModuleCount: 1, newTopicCount: 1 })
  })
})
