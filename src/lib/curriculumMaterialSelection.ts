import type { Material, ModuleTopic, SyllabusModule } from '../types'

function parseMaterialIds(value?: string | null): number[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
  } catch {
    return []
  }
}

/** Resolve only source relationships explicitly attached to the selected topics or module. */
export function resolveCurriculumMaterialIds(
  moduleId: number | undefined,
  selectedTopicIds: number[],
  modules: (SyllabusModule & { topics?: ModuleTopic[] })[],
  materials: Material[]
): number[] {
  const selected = new Set(selectedTopicIds)
  const ids = new Set<number>()
  const scopedModuleIds = new Set<number>(moduleId === undefined ? [] : [moduleId])

  for (const module of modules) {
    for (const topic of module.topics || []) {
      if (selected.has(topic.id)) {
        scopedModuleIds.add(module.id)
        for (const id of parseMaterialIds(topic.source_material_ids)) ids.add(id)
      }
    }
  }

  // A material assigned to the selected module is an explicit week/module association.
  for (const material of materials) {
    if (material.module_id != null && scopedModuleIds.has(material.module_id)) ids.add(material.id)
  }

  return [...ids]
}
