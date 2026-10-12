/**
 * Concept Extractor
 * Transforms topic source material (chunks) into an exhaustive set of atomic concepts
 * with grading rubric key points and validated topological teaching order.
 *
 * Guarantees 100% material coverage: every source chunk must be accounted for.
 * Any orphan chunks are converted into an explicit "Supplementary / Additional concepts" item.
 */

import crypto from 'crypto'
import type { ExtractedRawConcept } from './conceptCoverage'
import { validateTeachingOrder } from './conceptCoverage'

export interface SourceChunkItem {
  id: string
  chunk_index: number
  title?: string
  text: string
}

export function buildConceptExtractionPrompt(
  topicTitle: string,
  chunks: SourceChunkItem[]
): string {
  const chunksFormatted = chunks
    .map(
      (c) =>
        `--- CHUNK [ID: ${c.id}] (Index: ${c.chunk_index}) ${c.title || ''} ---\n${c.text.trim()}`
    )
    .join('\n\n')

  return `You are a world-class cognitive curriculum engineer and master tutor.
Analyze the following lecture/topic source material and decompose it into an EXHAUSTIVE, ATOMIC checklist of key concepts for instruction and active recall assessment.

Topic: "${topicTitle}"

SOURCE MATERIAL CHUNKS:
${chunksFormatted}

EXTRACTION RULES (MANDATORY):
1. ATOMICITY: Each concept must represent one distinct, cohesive conceptual mechanism, rule, process, or distinction.
2. 100% COVERAGE GUARANTEE: EVERY chunk ID must be mapped to at least one concept in "source_chunk_ids". No parts of the material may be silently ignored or skipped!
3. GRADING RUBRIC (key_points): Provide 3 to 5 clear, objective, verifiable key points for each concept that a student must demonstrate to prove deep understanding. These serve as the background grading rubric (e.g. "States the primary definition", "Identifies the underlying causal mechanism", "Applies rule correctly to edge cases").
4. OPTIMAL TEACHING ORDER (PEDAGOGICAL PREREQUISITES):
   - Do NOT just follow chronological slide order if another order is pedagogically superior.
   - Foundational concepts that set the stage must come FIRST before advanced or derivative concepts!
   - For each concept, list "prerequisite_labels" (exact labels of prior concepts in this list that must be understood first).
   - Provide "teach_order_hint" as an integer (1 = foundational starting point).

Return JSON ONLY matching this schema:
{
  "concepts": [
    {
      "label": "Short, clear concept title",
      "summary": "1-2 sentence core idea",
      "key_points": [
        "Verifiable key point 1",
        "Verifiable key point 2",
        "Verifiable key point 3"
      ],
      "source_chunk_ids": ["chunk_id_1"],
      "prerequisite_labels": ["Prerequisite Concept Label"],
      "teach_order_hint": 1
    }
  ]
}`
}

export function parseExtractedConcepts(
  rawJson: string,
  allSourceChunks: SourceChunkItem[]
): Array<ExtractedRawConcept & { teach_order: number; content_hash: string; resolved_prereq_indices: number[] }> {
  let parsedList: ExtractedRawConcept[] = []
  try {
    const match = rawJson.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed.concepts)) {
        parsedList = parsed.concepts
          .filter((c: any) => c && typeof c.label === 'string' && c.label.trim())
          .map((c: any) => ({
            label: c.label.trim(),
            summary: typeof c.summary === 'string' ? c.summary.trim() : undefined,
            key_points: Array.isArray(c.key_points)
              ? c.key_points.filter((kp: any) => typeof kp === 'string' && kp.trim()).map((kp: any) => kp.trim())
              : ['Core definition and mechanism', 'Application to standard problem'],
            source_chunk_ids: Array.isArray(c.source_chunk_ids)
              ? c.source_chunk_ids.map(String)
              : [],
            prerequisite_labels: Array.isArray(c.prerequisite_labels)
              ? c.prerequisite_labels.map(String)
              : [],
            teach_order_hint: typeof c.teach_order_hint === 'number' ? c.teach_order_hint : undefined
          }))
      }
    }
  } catch {
    // Malformed JSON fallback
  }

  // Fallback if model failed or returned empty
  if (parsedList.length === 0) {
    parsedList = [
      {
        label: 'Core Topic Principles',
        summary: 'Fundamental mechanisms of the topic.',
        key_points: [
          'Understands core definition and principles',
          'Explains the central causal relationship',
          'Applies principles to concrete scenarios'
        ],
        source_chunk_ids: allSourceChunks.map((c) => c.id),
        prerequisite_labels: [],
        teach_order_hint: 1
      }
    ]
  }

  // 100% COVERAGE AUDIT: Identify any orphan chunks not attributed to any concept
  const coveredChunkIds = new Set<string>()
  for (const c of parsedList) {
    for (const chunkId of c.source_chunk_ids) {
      coveredChunkIds.add(chunkId)
    }
  }

  const orphanChunks = allSourceChunks.filter((c) => !coveredChunkIds.has(c.id))
  if (orphanChunks.length > 0) {
    parsedList.push({
      label: 'Supplementary Lecture Material',
      summary: 'Additional concepts and context from course material.',
      key_points: [
        'Recognizes supplementary terminology and definitions',
        'Connects secondary details back to primary mechanisms'
      ],
      source_chunk_ids: orphanChunks.map((c) => c.id),
      prerequisite_labels: [],
      teach_order_hint: parsedList.length + 1
    })
  }

  // Validate and topologically sort into pedagogical teaching order
  const ordered = validateTeachingOrder(parsedList)

  // Compute deterministic content hash for caching / revision tracking
  return ordered.map((c) => {
    const rawStr = `${c.label}|${c.summary || ''}|${(c.key_points || []).join(';')}`
    const content_hash = crypto.createHash('sha256').update(rawStr).digest('hex').slice(0, 16)
    return {
      ...c,
      content_hash
    }
  })
}
