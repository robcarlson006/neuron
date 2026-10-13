import { resolveCurriculumMaterialIds } from '../../src/lib/curriculumMaterialSelection'
import type { Material, ModuleTopic, SyllabusModule } from '../../src/types'

describe('resolveCurriculumMaterialIds', () => {
  const modules = [
    {
      id: 1,
      title: 'Week 1',
      topics: [
        { id: 11, module_id: 1, title: 'Budget constraints', source_material_ids: '[1,2]' },
        { id: 12, module_id: 1, title: 'Preferences', source_material_ids: '[2,3]' }
      ]
    },
    {
      id: 4,
      title: 'Week 4',
      topics: [{ id: 41, module_id: 4, title: 'Monopoly', source_material_ids: '[9]' }]
    }
  ] as unknown as (SyllabusModule & { topics: ModuleTopic[] })[]
  const materials = [
    { id: 1, module_id: 1 },
    { id: 2, module_id: 1 },
    { id: 3, module_id: 1 },
    { id: 4, module_id: 1 }, // Explicit week-level material without a concept mapping.
    { id: 9, module_id: 4 }
  ] as Material[]

  it('includes selected concept sources and explicit week materials, deduplicated and scoped', () => {
    expect(resolveCurriculumMaterialIds(1, [11, 12], modules, materials)).toEqual([1, 2, 3, 4])
  })

  it('resolves a selected subset and preserves shared links once', () => {
    expect(resolveCurriculumMaterialIds(1, [11], modules, materials)).toEqual([1, 2, 3, 4])
  })

  it('can resolve selected concepts spanning modules without selecting unrelated module materials', () => {
    expect(resolveCurriculumMaterialIds(undefined, [11, 41], modules, materials)).toEqual([1, 2, 9, 3, 4])
  })
})
