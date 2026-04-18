/**
 * Bayesian Knowledge Tracing (standard 4-parameter model).
 *
 * Tracks, per (user, subject, concept), the posterior probability that the
 * user has learned the concept. Updated after every review whose card is
 * tagged with that concept.
 */

export interface BKTParams {
  pInit: number     // prior P(knows) for a brand-new concept
  pLearn: number    // P(transition from unknown → known) per opportunity
  pSlip: number     // P(gets it wrong | knows)
  pGuess: number    // P(gets it right | doesn't know)
}

export const DEFAULT_BKT_PARAMS: BKTParams = {
  pInit: 0.3,
  pLearn: 0.10,
  pSlip: 0.10,
  pGuess: 0.20
}

/**
 * Update posterior P(knows) after observing a correct/incorrect response.
 */
export function bktUpdate(
  prior: number,
  correct: boolean,
  p: BKTParams = DEFAULT_BKT_PARAMS
): number {
  const clamped = Math.min(Math.max(prior, 1e-4), 1 - 1e-4)
  const likelihoodGivenKnown = correct ? (1 - p.pSlip) : p.pSlip
  const likelihoodGivenUnknown = correct ? p.pGuess : (1 - p.pGuess)
  const numer = clamped * likelihoodGivenKnown
  const denom = numer + (1 - clamped) * likelihoodGivenUnknown
  const posteriorGivenEvidence = denom > 0 ? numer / denom : clamped
  const nextPrior = posteriorGivenEvidence + (1 - posteriorGivenEvidence) * p.pLearn
  return Math.min(Math.max(nextPrior, 0), 1)
}

/**
 * Categorise a mastery probability into a band used by the Diagnostics UI.
 */
export function masteryBand(prob: number): 'weak' | 'moderate' | 'strong' {
  if (prob < 0.45) return 'weak'
  if (prob < 0.80) return 'moderate'
  return 'strong'
}
