/**
 * Pure math utilities for vector operations.
 * Renderer-safe — no Node.js dependencies.
 */

/**
 * Compute cosine similarity between two vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
  }

  const dot = dotProduct(a, b)
  const magA = magnitude(a)
  const magB = magnitude(b)

  if (magA === 0 || magB === 0) return 0
  return dot / (magA * magB)
}

/**
 * Normalize a vector to unit length.
 */
export function normalizeVector(v: number[]): number[] {
  const mag = magnitude(v)
  if (mag === 0) return v.map(() => 0)
  return v.map(x => x / mag)
}

/**
 * Find the top-k most similar vectors to a query vector.
 * Returns indices and cosine similarity scores, sorted by score descending.
 */
export function topK(
  query: number[],
  vectors: number[][],
  k: number = 10
): Array<{ index: number; score: number }> {
  const scores: Array<{ index: number; score: number }> = []

  for (let i = 0; i < vectors.length; i++) {
    const score = cosineSimilarity(query, vectors[i])
    scores.push({ index: i, score })
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score)

  return scores.slice(0, k)
}

/**
 * Compute dot product of two vectors.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
  }

  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

/**
 * Compute magnitude (L2 norm) of a vector.
 */
export function magnitude(v: number[]): number {
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i]
  }
  return Math.sqrt(sum)
}
