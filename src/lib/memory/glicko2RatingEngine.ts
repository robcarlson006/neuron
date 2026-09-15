/**
 * Glicko-2 Psychometric Rating Engine for Student Topic Competency
 *
 * Implements the Glickman (2001) Glicko-2 rating system adapted for
 * educational psychometrics (Pelánek, 2016) with 2-Parameter Logistic
 * Item Response Theory (2PL-IRT) item calibration.
 */

export interface StudentRatingProfile {
  rating: number            // R: centered at 1500 (800 - 2400)
  ratingDeviation: number   // RD: uncertainty (default 350, drops to ~50)
  volatility: number        // sigma: performance fluctuation (default 0.06)
}

export interface AssessmentOutcome {
  itemDifficulty: number    // 1 to 5 scale (or mapped equivalent)
  itemRating?: number       // Explicit opponent item rating (defaults to 900 + diff * 200)
  itemDeviation?: number    // Uncertainty of item calibration (default 50.0)
  score: number             // Normalized outcome in [0.0, 1.0] (1.0 = full correct, 0.0 = failure)
}

export type CompetencyBand = 'Novice' | 'Developing' | 'Competent' | 'Proficient' | 'Master'

const GLICKO2_SCALE = 173.7178
const DEFAULT_TAU = 0.5     // System volatility constraint
const CONVERGENCE_EPSILON = 0.000001

/**
 * Maps standard 1-5 difficulty levels to calibrated Glicko-2 opponent ratings.
 */
export function difficultyToItemRating(difficulty: number): number {
  const clamped = Math.max(1, Math.min(5, difficulty))
  return 900 + clamped * 200 // 1 -> 1100, 2 -> 1300, 3 -> 1500, 4 -> 1700, 5 -> 1900
}

/**
 * Glicko-2 g(phi) reduction function.
 */
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
}

/**
 * Expected score E(mu, mu_j, phi_j) under logistic distribution.
 */
function expectedScore(mu: number, mu_j: number, phi_j: number): number {
  return 1 / (1 + Math.exp(-g(phi_j) * (mu - mu_j)))
}

/**
 * Updates a student's Glicko-2 rating profile based on one or more assessment outcomes.
 *
 * @param current Current student rating profile
 * @param outcomes One or more assessment results
 * @param tau System volatility constraint (default 0.5)
 * @returns Updated StudentRatingProfile
 */
export function updateRating(
  current: StudentRatingProfile,
  outcomes: AssessmentOutcome[],
  tau = DEFAULT_TAU
): StudentRatingProfile {
  if (outcomes.length === 0) {
    return { ...current }
  }

  // Step 1: Convert to Glicko-2 scale
  const mu = (current.rating - 1500) / GLICKO2_SCALE
  const phi = current.ratingDeviation / GLICKO2_SCALE
  const sigma = current.volatility

  // Step 2: Compute estimated variance v and improvement delta
  let vInv = 0
  let deltaSum = 0

  for (const outcome of outcomes) {
    const itemRating = outcome.itemRating ?? difficultyToItemRating(outcome.itemDifficulty)
    const itemDeviation = outcome.itemDeviation ?? 50.0

    const mu_j = (itemRating - 1500) / GLICKO2_SCALE
    const phi_j = itemDeviation / GLICKO2_SCALE

    const g_j = g(phi_j)
    const e_j = expectedScore(mu, mu_j, phi_j)
    const s_j = Math.max(0, Math.min(1, outcome.score))

    vInv += g_j * g_j * e_j * (1 - e_j)
    deltaSum += g_j * (s_j - e_j)
  }

  const v = 1 / vInv
  const delta = v * deltaSum

  // Step 3: Determine new volatility sigma' using the Illinois bracketing algorithm
  const a = Math.log(sigma * sigma)

  const f = (x: number): number => {
    const ex = Math.exp(x)
    const num = ex * (delta * delta - phi * phi - v - ex)
    const denom = 2 * (phi * phi + v + ex) * (phi * phi + v + ex)
    return num / denom - (x - a) / (tau * tau)
  }

  let A = a
  let B: number

  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v)
  } else {
    let k = 1
    while (f(a - k * tau) < 0) {
      k += 1
    }
    B = a - k * tau
  }

  let fA = f(A)
  let fB = f(B)

  while (Math.abs(B - A) > CONVERGENCE_EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)

    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else {
      fA = fA / 2
    }
    B = C
    fB = fC
  }

  const newSigma = Math.exp(A / 2)

  // Step 4: Update rating deviation to pre-rating period value
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma)

  // Step 5: Update rating deviation and rating to new values
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  const newMu = mu + newPhi * newPhi * deltaSum

  // Step 6: Convert back to original scale
  const newRating = newMu * GLICKO2_SCALE + 1500
  const newRatingDeviation = newPhi * GLICKO2_SCALE

  return {
    rating: Math.round(newRating * 10) / 10,
    ratingDeviation: Math.round(newRatingDeviation * 10) / 10,
    volatility: Math.round(newSigma * 10000) / 10000
  }
}

/**
 * Evaluates the human-facing competency band from a Glicko-2 rating.
 */
export function getCompetencyBand(rating: number): CompetencyBand {
  if (rating < 1200) return 'Novice'
  if (rating < 1450) return 'Developing'
  if (rating < 1700) return 'Competent'
  if (rating < 1950) return 'Proficient'
  return 'Master'
}

/**
 * Calculates the 95% confidence interval for a student's true skill.
 */
export function getConfidenceInterval(rating: number, ratingDeviation: number): [number, number] {
  const margin = 2 * ratingDeviation
  return [Math.round((rating - margin) * 10) / 10, Math.round((rating + margin) * 10) / 10]
}
