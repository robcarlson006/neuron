import type { GroundedEvidence } from './groundedRetrieval'

export interface GroundingEvaluation {
  citationPrecision: number
  unsupportedClaimRate: number
  correctAbstention: boolean
}

/** Small model-agnostic fixture scorer for regression tests and review reports. */
export function evaluateGroundedResponse(params: {
  answer: string
  evidence: GroundedEvidence[]
  expectedTerms: string[]
  abstained: boolean
}): GroundingEvaluation {
  const answer = params.answer.toLowerCase()
  const supportedTerms = params.expectedTerms.filter(term => answer.includes(term.toLowerCase()))
  const citationPrecision = params.expectedTerms.length === 0 ? 1 : supportedTerms.length / params.expectedTerms.length
  const unsupportedClaimRate = params.evidence.length === 0 && !params.abstained && answer.trim().length > 0 ? 1 : 0
  return {
    citationPrecision,
    unsupportedClaimRate,
    correctAbstention: params.abstained === (params.evidence.length === 0)
  }
}

export function duplicateRate(items: string[]): number {
  if (items.length === 0) return 0
  return 1 - new Set(items.map(item => item.trim().toLowerCase())).size / items.length
}
