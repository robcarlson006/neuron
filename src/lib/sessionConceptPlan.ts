import { validateTeachingOrder, type ExtractedRawConcept } from './coverage/conceptCoverage'
import { buildConceptExtractionPrompt, type SourceChunkItem } from './coverage/conceptExtractor'
import { parseDocumentTopology } from './coverage/documentTopologyParser'

export interface SessionSourceChunk extends SourceChunkItem {
  materialId: number
}

export interface SessionLearningConcept {
  label: string
  summary?: string
  keyPoints: string[]
  sourceMaterialIds: number[]
  sourceChunkIds: string[]
  prerequisiteLabels: string[]
  teachOrder: number
}

export interface SessionLearningPlan {
  selectedMaterialIds: number[]
  sourceFingerprint?: string
  materialNames: Record<number, string>
  processedMaterialIds: number[]
  unprocessedMaterials: Array<{ id: number; filename: string; reason: string }>
  truncatedMaterialIds: number[]
  concepts: SessionLearningConcept[]
  status: 'ready' | 'incomplete' | 'failed'
  error?: string
}

export interface SessionSourceMaterial {
  id: number
  filename: string
  content_text: string | null
}

const SESSION_PLAN_MAX_CHUNKS = 24
const SESSION_PLAN_CHUNK_TOKENS = 300

export function selectBalancedSessionChunks(
  chunksByMaterial: Array<{ materialId: number; chunks: SessionSourceChunk[] }>,
  limit = 40
): { chunks: SessionSourceChunk[]; truncatedMaterialIds: number[] } {
  const chosen: SessionSourceChunk[] = []
  const offsets = chunksByMaterial.map(() => 0)
  let remaining = true
  while (chosen.length < limit && remaining) {
    remaining = false
    for (let i = 0; i < chunksByMaterial.length && chosen.length < limit; i++) {
      const next = chunksByMaterial[i].chunks[offsets[i]]
      if (!next) continue
      chosen.push(next)
      offsets[i]++
      remaining = true
    }
  }
  return {
    chunks: chosen,
    truncatedMaterialIds: chunksByMaterial.filter((item, index) => offsets[index] < item.chunks.length).map(item => item.materialId)
  }
}

export async function buildSessionLearningPlan(
  selectedMaterialIdsInput: number[],
  materials: SessionSourceMaterial[],
  analyze: (chunks: SessionSourceChunk[]) => Promise<string>
): Promise<SessionLearningPlan> {
  const selectedMaterialIds = [...new Set(selectedMaterialIdsInput)]
  const byId = new Map(materials.map(material => [material.id, material]))
  const materialNames: Record<number, string> = Object.fromEntries(materials.map(material => [material.id, material.filename || `Material ${material.id}`]))
  const unprocessedMaterials: SessionLearningPlan['unprocessedMaterials'] = selectedMaterialIds
    .filter(id => !byId.has(id))
    .map(id => ({ id, filename: `Material ${id}`, reason: 'The selected material is unavailable in this subject.' }))
  const chunksByMaterial: Array<{ materialId: number; chunks: SessionSourceChunk[] }> = []
  for (const id of selectedMaterialIds) {
    const material = byId.get(id)
    if (!material) continue
    if (!material.content_text?.trim()) {
      unprocessedMaterials.push({ id, filename: material.filename, reason: 'No extracted text is available for this file.' })
      continue
    }
    const parsed = parseDocumentTopology(material.content_text, material.filename, SESSION_PLAN_CHUNK_TOKENS, 35)
    const chunks = parsed.chunks.map(chunk => ({
      id: `material-${id}-chunk-${chunk.index}`,
      materialId: id,
      chunk_index: chunk.index,
      title: chunk.title,
      text: chunk.text
    }))
    if (chunks.length === 0) {
      unprocessedMaterials.push({ id, filename: material.filename, reason: 'The extracted text could not be divided into study passages.' })
    } else {
      chunksByMaterial.push({ materialId: id, chunks })
    }
  }

  const selectedChunks = selectBalancedSessionChunks(chunksByMaterial, SESSION_PLAN_MAX_CHUNKS)
  const plan: SessionLearningPlan = {
    selectedMaterialIds,
    materialNames,
    processedMaterialIds: chunksByMaterial.map(item => item.materialId),
    unprocessedMaterials,
    truncatedMaterialIds: selectedChunks.truncatedMaterialIds,
    concepts: [],
    status: 'incomplete'
  }
  if (selectedChunks.chunks.length === 0) {
    plan.status = 'failed'
    plan.error = 'No selected material passages were available for concept analysis.'
    return plan
  }

  try {
    const raw = await analyze(selectedChunks.chunks)
    plan.concepts = parseSessionConceptInventory(raw, selectedChunks.chunks)
    if (plan.concepts.length === 0) {
      plan.status = 'failed'
      plan.error = 'The AI did not return source-grounded concepts.'
      return plan
    }
    const attributedMaterialIds = new Set(plan.concepts.flatMap(concept => concept.sourceMaterialIds))
    const attributedChunkIds = new Set(plan.concepts.flatMap(concept => concept.sourceChunkIds))
    for (const id of plan.processedMaterialIds) {
      const selectedSourceChunks = selectedChunks.chunks.filter(chunk => chunk.materialId === id)
      const hasUnmappedPassage = selectedSourceChunks.some(chunk => !attributedChunkIds.has(chunk.id))
      if ((!attributedMaterialIds.has(id) || hasUnmappedPassage) && !plan.unprocessedMaterials.some(item => item.id === id)) {
        const filename = materialNames[id] || `Material ${id}`
        plan.unprocessedMaterials.push({ id, filename, reason: hasUnmappedPassage
          ? 'Some selected passages were not mapped to a concept.'
          : 'No extracted concept was attributed to its selected passages.' })
      }
    }
    plan.status = plan.unprocessedMaterials.length === 0 && plan.truncatedMaterialIds.length === 0 ? 'ready' : 'incomplete'
  } catch (error) {
    plan.status = 'failed'
    plan.error = error instanceof Error ? error.message : 'Concept analysis could not be completed.'
  }
  return plan
}

function conceptKey(label: string): string {
  return label.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Build a compact, source-attributed extraction request over the selected chunk set. */
export function buildSessionConceptPrompt(topic: string, chunks: SessionSourceChunk[]): string {
  return `${buildConceptExtractionPrompt(topic, chunks)}

SESSION-SCOPE RULES:
- Treat all supplied chunks as one combined body of knowledge, regardless of source material.
- Merge the same concept across chunks into one concept and list every supporting chunk ID.
- Retain concepts that occur in only one source.
- Preserve equations, variable meanings, and mathematical relationships in a concept's summary or key points when they appear in the source.
- Use only concepts supported by the supplied text. Do not infer concepts from filenames.
- Return only source_chunk_ids from the supplied IDs. Keep explanations concise.
- For this session plan, use one-sentence summaries and at most two short key points per concept to keep the opening analysis compact.`
}

/** Parse, consolidate duplicate labels, retain provenance, then topologically order concepts. */
export function parseSessionConceptInventory(
  rawJson: string,
  chunks: SessionSourceChunk[]
): SessionLearningConcept[] {
  let values: unknown[] = []
  try {
    const match = rawJson.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    if (Array.isArray(parsed?.concepts)) values = parsed.concepts
  } catch {
    return []
  }

  const knownChunkIds = new Set(chunks.map(chunk => chunk.id))
  const merged = new Map<string, ExtractedRawConcept>()
  for (const value of values as any[]) {
    if (!value || typeof value.label !== 'string' || !value.label.trim()) continue
    const sourceChunkIds: string[] = Array.isArray(value.source_chunk_ids)
      ? [...new Set((value.source_chunk_ids as unknown[]).map(id => String(id)).filter((id: string) => knownChunkIds.has(id)))]
      : []
    if (sourceChunkIds.length === 0) continue
    const label = value.label.trim()
    const key = conceptKey(label)
    if (!key) continue
    const existing = merged.get(key)
    const keyPoints: string[] = Array.isArray(value.key_points)
      ? (value.key_points as unknown[]).filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim())
      : []
    const prerequisites = Array.isArray(value.prerequisite_labels) ? value.prerequisite_labels.map(String) : []
    if (existing) {
      existing.source_chunk_ids = [...new Set([...existing.source_chunk_ids, ...sourceChunkIds])]
      existing.key_points = [...new Set([...existing.key_points, ...keyPoints])]
      existing.prerequisite_labels = [...new Set([...(existing.prerequisite_labels || []), ...prerequisites])]
      if (!existing.summary && typeof value.summary === 'string') existing.summary = value.summary.trim()
      continue
    }
    merged.set(key, {
      label,
      summary: typeof value.summary === 'string' ? value.summary.trim() : undefined,
      key_points: [...new Set(keyPoints)],
      source_chunk_ids: sourceChunkIds,
      prerequisite_labels: prerequisites,
      teach_order_hint: typeof value.teach_order_hint === 'number' ? value.teach_order_hint : undefined
    })
  }

  const sourceByChunkId = new Map(chunks.map(chunk => [chunk.id, chunk.materialId]))
  return validateTeachingOrder([...merged.values()]).map(concept => ({
    label: concept.label,
    summary: concept.summary,
    keyPoints: concept.key_points,
    sourceChunkIds: concept.source_chunk_ids,
    sourceMaterialIds: [...new Set(concept.source_chunk_ids.map(id => sourceByChunkId.get(id)).filter((id): id is number => id !== undefined))],
    prerequisiteLabels: concept.prerequisite_labels || [],
    teachOrder: concept.teach_order
  }))
}

export function formatSessionConceptPlan(plan: SessionLearningPlan): string {
  const lines = [
    'UNIFIED SELECTED-MATERIAL LEARNING PLAN:',
    `Complete discovered concept inventory: ${plan.concepts.length} concepts. Teach one concept at a time in this order; keep explanations short, ask one specific active-recall question, evaluate the response, then advance when ready. Respect the session timer and leave later concepts for another session.`,
    'On the opening turn, teach concept 1. On later turns, continue from the current concept in conversation history; do not switch between documents or skip concepts because another source appears first.',
    ...plan.concepts.map((concept, index) => {
      const sources = concept.sourceMaterialIds.map(id => plan.materialNames[id] || `material ${id}`).join(', ')
      const prerequisites = concept.prerequisiteLabels.length ? `; prerequisites: ${concept.prerequisiteLabels.join(', ')}` : ''
      const details = concept.summary?.replace(/\s+/g, ' ').slice(0, 180)
      return `${index + 1}. ${concept.label} [sources: ${sources || 'source mapping unavailable'}]${prerequisites}${details ? ` — ${details}` : ''}`
    }),
    'Use the listed source attributions and retrieve supporting passages from any selected material. Never restrict the lesson to the first selected document.'
  ]
  if (plan.status !== 'ready') {
    lines.push('SOURCE PROCESSING NOTICE: The selected-material scope is incomplete. Tell the learner which materials were unavailable or only partially processed before relying on them.')
    for (const item of plan.unprocessedMaterials) lines.push(`- ${item.filename || plan.materialNames[item.id] || `Material ${item.id}`}: ${item.reason}`)
    if (plan.truncatedMaterialIds.length) lines.push(`- Partial chunk coverage because of the extraction limit for material IDs: ${plan.truncatedMaterialIds.join(', ')}.`)
    if (plan.error) lines.push(`- Concept extraction failed: ${plan.error}`)
  }
  return lines.join('\n')
}

export function resolveSessionPlanAssessmentConcept(plan: SessionLearningPlan, previousTutorMessage?: string): string | undefined {
  if (!plan.concepts.length) return undefined
  const previous = conceptKey(previousTutorMessage || '')
  return plan.concepts.find(concept => previous.includes(conceptKey(concept.label)))?.label || plan.concepts[0].label
}
