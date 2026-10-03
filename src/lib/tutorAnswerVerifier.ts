import type { EvidenceRef } from '../types'

export interface TutorAnswerVerification {
  answer: string
  citations: Array<{ materialId: number; chunkIndex: number }>
  invalidCitations: Array<{ materialId: number; chunkIndex: number }>
  grounded: boolean
  needsAbstention: boolean
}

const SOURCE_TAG = /\[SOURCE\s+(\d+):(\d+)\]/gi

export function verifyTutorAnswer(answer: string, evidence: EvidenceRef[]): TutorAnswerVerification {
  SOURCE_TAG.lastIndex = 0
  const available = new Set(evidence.map(item => `${item.materialId}:${item.chunkIndex}`))
  const citations: Array<{ materialId: number; chunkIndex: number }> = []
  const invalidCitations: Array<{ materialId: number; chunkIndex: number }> = []
  let match: RegExpExecArray | null
  while ((match = SOURCE_TAG.exec(answer)) !== null) {
    const materialId = Number(match[1])
    const chunkIndex = Number(match[2])
    const key = `${materialId}:${chunkIndex}`
    if (!available.has(key)) invalidCitations.push({ materialId, chunkIndex })
    else citations.push({ materialId, chunkIndex })
  }

  const uniqueCitations = Array.from(new Map(citations.map(item => [`${item.materialId}:${item.chunkIndex}`, item])).values())
  const explicitlyUnsupported = /(?:not enough support|(?:do not|don't|cannot) have enough evidence|not enough evidence|not established|cannot verify|could not find enough|outside the provided material)/i.test(answer)
  return {
    answer,
    citations: uniqueCitations,
    invalidCitations,
    grounded: invalidCitations.length === 0 && (uniqueCitations.length > 0 || explicitlyUnsupported),
    needsAbstention: invalidCitations.length > 0
  }
}

export function addGroundingInstruction(answer: string, evidence: EvidenceRef[]): string {
  const verification = verifyTutorAnswer(answer, evidence)
  if (!verification.needsAbstention) return answer
  return `${answer}\n\nI could not verify one or more cited claims against the selected course material, so please check the referenced section before relying on them.`
}
