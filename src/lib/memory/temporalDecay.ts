/**
 * Continuous Temporal Memory Decay Engine
 *
 * Implements FSRS-5 continuous retention decay dynamics and Glicko-2
 * rating deviation erosion over time to prevent permanent mastery fossilization.
 */

export interface DecayConfig {
  /** Confidence erosion speed constant (c). Default 15.0 */
  c?: number
  /** Maximum rating deviation (uncertainty cap). Default 350.0 */
  maxDeviation?: number
  /** FSRS factor constant (19/81). Default ~0.2345679 */
  fsrsFactor?: number
  /** FSRS power decay exponent. Default 0.5 */
  decayExponent?: number
  /** Baseline unstudied mastery probability. Default 0.3 */
  baselineMastery?: number
}

const DEFAULT_C = 15.0
const DEFAULT_MAX_RD = 350.0
const DEFAULT_FSRS_FACTOR = 19 / 81
const DEFAULT_DECAY_EXPONENT = 0.5
const DEFAULT_BASELINE_MASTERY = 0.3

/**
 * Inflates a student's Rating Deviation (RD) over inactive elapsed days.
 *
 * Formula: RD_new = min(sqrt(RD_old^2 + c^2 * elapsedDays), maxDeviation)
 *
 * @param currentRD Current rating deviation
 * @param elapsedDays Number of days since last assessment
 * @param config Optional decay configuration
 * @returns Decayed rating deviation
 */
export function applyTemporalDeviationDecay(
  currentRD: number,
  elapsedDays: number,
  config?: DecayConfig
): number {
  if (elapsedDays <= 0) return currentRD

  const c = config?.c ?? DEFAULT_C
  const maxRD = config?.maxDeviation ?? DEFAULT_MAX_RD

  const decayedRD = Math.sqrt(currentRD * currentRD + c * c * elapsedDays)
  return Math.min(maxRD, Math.round(decayedRD * 10) / 10)
}

/**
 * Computes the FSRS-5 continuous retrievability score R(t) in [0.0, 1.0].
 *
 * Formula: R(t) = (1 + F * (t / S))^(-w)
 *
 * @param elapsedDays Number of elapsed days since last practice
 * @param stability Days required for retrievability to fall from 100% to 90%
 * @param config Optional decay configuration
 * @returns Probability of retrieval in [0.0, 1.0]
 */
export function computeFSRS5Retrievability(
  elapsedDays: number,
  stability: number,
  config?: DecayConfig
): number {
  if (elapsedDays <= 0) return 1.0
  if (stability <= 0) return 0.0

  const factor = config?.fsrsFactor ?? DEFAULT_FSRS_FACTOR
  const exponent = config?.decayExponent ?? DEFAULT_DECAY_EXPONENT

  const retrievability = Math.pow(1 + factor * (elapsedDays / stability), -exponent)
  return Math.max(0.0, Math.min(1.0, Math.round(retrievability * 10000) / 10000))
}

/**
 * Decays an existing Bayesian Knowledge Tracing belief towards baseline over time.
 *
 * Formula: P(L_t^-) = baseline + (P(L_{t-1}^+) - baseline) * R(t)
 *
 * @param priorMastery Previous mastery probability
 * @param elapsedDays Elapsed days since last practice
 * @param stability Memory stability in days (defaults to 7 days for uncalibrated topics)
 * @param config Optional decay configuration
 * @returns Decayed mastery probability
 */
export function decayMasteryBelief(
  priorMastery: number,
  elapsedDays: number,
  stability = 7.0,
  config?: DecayConfig
): number {
  if (elapsedDays <= 0) return priorMastery

  const baseline = config?.baselineMastery ?? DEFAULT_BASELINE_MASTERY
  const retrievability = computeFSRS5Retrievability(elapsedDays, stability, config)

  const decayed = baseline + (priorMastery - baseline) * retrievability
  return Math.max(0.0, Math.min(1.0, Math.round(decayed * 10000) / 10000))
}

/**
 * Determines whether a topic's uncertainty or retrievability has decayed sufficiently
 * to warrant a refresher diagnostic in the study planner or tutor.
 */
export function isRefresherRecommended(
  ratingDeviation: number,
  thresholdRD = 180.0
): boolean {
  return ratingDeviation >= thresholdRD
}
