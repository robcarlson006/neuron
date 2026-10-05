import type { SyllabusModule, SyllabusUpdateResult } from '../types'

export interface SyllabusChangeSummary {
  newModuleCount?: number
  newTopicCount?: number
  updatedTopicCount?: number
  gapTopicCount?: number
  preservedCompletedCount?: number
  processedMaterialCount?: number
  sourceCoverage?: number
  revision?: number | string
  generatedAt?: string
  recommendations?: Array<{ title: string; detail?: string; mode?: string }>
  rejected?: boolean
  diagnostics?: string[]
}

export type SyllabusGenerationResponse = SyllabusUpdateResult | SyllabusModule[] | null | undefined

export function normalizeSyllabusResult(result: SyllabusGenerationResponse): { modules: SyllabusModule[]; summary: SyllabusChangeSummary } {
  if (Array.isArray(result)) {
    return {
      modules: result,
      summary: { newModuleCount: result.length, newTopicCount: result.reduce((count, module) => count + (module.topics?.length || 0), 0) }
    }
  }
  if (!result) return { modules: [], summary: {} }
  const candidate = result as SyllabusUpdateResult & Record<string, unknown>
  const numeric = (camel: string, snake: string): number | undefined => {
    const value = candidate[camel] ?? candidate[snake]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  }
  const sourceCoverage = candidate.sourceCoverage ?? candidate.source_coverage
  const recommendations = candidate.recommendations ?? candidate.advisoryRecommendations ?? candidate.advisory_recommendations
  const diagnostics = candidate.diagnostics ?? candidate.validationErrors ?? candidate.validation_errors
  return {
    modules: Array.isArray(candidate.modules) ? candidate.modules : [],
    summary: {
      newModuleCount: numeric('newModuleCount', 'new_module_count'),
      newTopicCount: numeric('newTopicCount', 'new_topic_count'),
      updatedTopicCount: numeric('updatedTopicCount', 'updated_topic_count'),
      gapTopicCount: numeric('gapTopicCount', 'gap_topic_count'),
      preservedCompletedCount: numeric('preservedCompletedCount', 'preserved_completed_count'),
      processedMaterialCount: numeric('processedMaterialCount', 'processed_material_count'),
      sourceCoverage: typeof sourceCoverage === 'number' ? sourceCoverage : undefined,
      revision: typeof (candidate.revision ?? candidate.curriculumRevision ?? candidate.curriculum_revision) === 'string' || typeof (candidate.revision ?? candidate.curriculumRevision ?? candidate.curriculum_revision) === 'number'
        ? (candidate.revision ?? candidate.curriculumRevision ?? candidate.curriculum_revision) as string | number
        : undefined,
      generatedAt: typeof candidate.generatedAt === 'string' ? candidate.generatedAt : typeof candidate.generated_at === 'string' ? candidate.generated_at : undefined,
      recommendations: Array.isArray(recommendations) ? recommendations as SyllabusChangeSummary['recommendations'] : undefined,
      rejected: candidate.rejected === true || candidate.applied === false,
      diagnostics: Array.isArray(diagnostics) ? diagnostics.filter((item): item is string => typeof item === 'string') : undefined
    }
  }
}
