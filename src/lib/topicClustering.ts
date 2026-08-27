/**
 * Topic Consolidation & Clustering Engine
 * Ensures card generation produces a clean, cohesive set of 3–6 major topics
 * instead of dozens of fragmented one-off micro-topics per card.
 */

import type { Card } from '../types'

/**
 * Standardize topic title casing and strip punctuation/numbering
 */
export function normalizeTopicName(raw: string): string {
  let cleaned = (raw || '').trim()
  if (!cleaned) return ''

  // Remove markdown formatting
  cleaned = cleaned.replace(/[*_`]/g, '').trim()

  // Remove leading numbers, bullets, prefixes like "1. ", "- • ", "Topic: ", "Concept: "
  cleaned = cleaned.replace(/^(?:(?:\d+[\.\)\-]\s*)|(?:[-•*]+\s*)|(?:(?:Topic|Concept|Chapter|Section|Module)\s*:\s*))+/i, '').trim()

  if (!cleaned) return ''

  // Title-case words while preserving acronyms like ATP, DNA, RNA, CPU, RAM and mixed-case terms like mRNA, cAMP, pH
  return cleaned
    .split(/\s+/)
    .map(word => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word // Keep acronyms like ATP, DNA
      if (/^[a-z]+[A-Z]/.test(word)) return word // Keep mixed-case scientific terms like mRNA, cAMP
      if (/^[a-z]/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      }
      return word
    })
    .join(' ')
}

/**
 * Calculate token & stem overlap similarity score between two topic strings (0.0 to 1.0)
 */
export function calculateTopicSimilarity(topicA: string, topicB: string): number {
  const normA = topicA.toLowerCase().replace(/[^a-z0-9\s]/g, '')
  const normB = topicB.toLowerCase().replace(/[^a-z0-9\s]/g, '')

  if (normA === normB) return 1.0
  if (normA.includes(normB) || normB.includes(normA)) return 0.85

  const tokensA = normA.split(/\s+/).filter(t => t.length > 2)
  const tokensB = normB.split(/\s+/).filter(t => t.length > 2)

  if (tokensA.length === 0 || tokensB.length === 0) return 0.0

  let matchScore = 0
  for (const a of tokensA) {
    for (const b of tokensB) {
      if (a === b) {
        matchScore += 1.0
      } else if (a.startsWith(b) || b.startsWith(a)) {
        matchScore += 0.75
      } else if (a.includes(b) || b.includes(a)) {
        matchScore += 0.7
      } else if (a.length >= 4 && b.length >= 4) {
        let hasSubMatch = false
        for (let len = 6; len >= 4; len--) {
          for (let i = 0; i <= a.length - len; i++) {
            const sub = a.substring(i, i + len)
            if (b.includes(sub)) {
              matchScore += 0.6
              hasSubMatch = true
              break
            }
          }
          if (hasSubMatch) break
        }
      }
    }
  }

  const maxPossible = Math.max(tokensA.length, tokensB.length)
  return Math.min(1.0, matchScore / maxPossible)
}

/**
 * Consolidate and cluster topics for a list of generated cards.
 * Ensures the result has at most `maxTopics` distinct, high-level topics.
 */
export function consolidateCardTopics(
  cards: Partial<Card>[],
  options?: {
    maxTopics?: number
    canonicalTopics?: string[]
    defaultTopic?: string
  }
): Partial<Card>[] {
  const maxTopics = options?.maxTopics ?? 5
  const defaultFallback = options?.defaultTopic || 'Core Concepts'

  // Prepare normalized canonical topics if provided
  const canonicalTopics = (options?.canonicalTopics || [])
    .map(normalizeTopicName)
    .filter(t => t.length > 0)

  // Step 1: Normalize all raw card concepts
  const normalizedCards = cards.map(c => {
    const rawConcept = c.concept || ''
    const norm = normalizeTopicName(rawConcept)
    return {
      ...c,
      concept: norm || defaultFallback
    }
  })

  // If canonical topics are provided and non-empty, map every card to the best canonical topic
  if (canonicalTopics.length > 0) {
    return normalizedCards.map(c => {
      const current = c.concept || ''
      let bestMatch = canonicalTopics[0]
      let bestScore = -1

      for (const canonical of canonicalTopics) {
        const score = calculateTopicSimilarity(current, canonical)
        if (score > bestScore) {
          bestScore = score
          bestMatch = canonical
        }
      }

      return {
        ...c,
        concept: bestMatch
      }
    })
  }

  // Step 2: Frequency analysis of generated topics
  const freqMap = new Map<string, number>()
  for (const c of normalizedCards) {
    const topic = c.concept || defaultFallback
    freqMap.set(topic, (freqMap.get(topic) || 0) + 1)
  }

  // Sort topics by frequency descending
  const sortedTopics = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)

  // If already within maxTopics, return normalized cards
  if (sortedTopics.length <= maxTopics) {
    return normalizedCards
  }

  // Step 3: Cluster into top `maxTopics` dominant topics
  const dominantTopics = sortedTopics.slice(0, maxTopics)
  const topicMapping = new Map<string, string>()

  // Map each dominant topic to itself
  for (const dom of dominantTopics) {
    topicMapping.set(dom, dom)
  }

  // Map remaining minor topics to the most similar dominant topic
  const minorTopics = sortedTopics.slice(maxTopics)
  for (const minor of minorTopics) {
    let bestDom = dominantTopics[0]
    let bestScore = -1

    for (const dom of dominantTopics) {
      const score = calculateTopicSimilarity(minor, dom)
      if (score > bestScore) {
        bestScore = score
        bestDom = dom
      }
    }

    topicMapping.set(minor, bestDom)
  }

  // Apply mapped topics to all cards
  return normalizedCards.map(c => ({
    ...c,
    concept: topicMapping.get(c.concept || defaultFallback) || dominantTopics[0]
  }))
}
