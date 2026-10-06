/** Helpers for finalizing structured tutor responses before they reach the UI. */

function cleanTrailingMarkdown(text: string): string {
  return text.trim().replace(/[*_"'`~)>\]}\\\s-]+$/, '')
}

export function hasFinalActiveRecallQuestion(response: string): boolean {
  if (!response || !response.trim()) return false

  const trimmed = response.trim()
  const stripped = cleanTrailingMarkdown(trimmed)

  // Direct question mark at the end (allowing for trailing markdown/punctuation)
  if (stripped.endsWith('?')) {
    return true
  }

  // Check the final paragraph / block for a question mark or active recall prompt
  const paragraphs = trimmed.split(/\n{2,}/)
  const lastParagraph = paragraphs[paragraphs.length - 1]?.trim() || ''
  const cleanLast = cleanTrailingMarkdown(lastParagraph)

  if (cleanLast.endsWith('?') || lastParagraph.includes('?')) {
    return true
  }

  // Check for an explicit Active Recall heading with an imperative retrieval instruction
  const activeRecallPattern = /(?:active[- ]recall|teach[- ]back|your turn)[:\s*#]+.*?(?:explain|describe|calculate|identify|state|compare|contrast|summarize|detail|why|how|what)/i
  if (activeRecallPattern.test(lastParagraph)) {
    return true
  }

  return false
}

/** A repair response replaces the hidden draft; it is never appended to it. */
export function chooseFinalTutorResponse(
  draft: string,
  repaired?: string | null,
  fallbackConcept?: string
): string | null {
  const repairedTrimmed = repaired?.trim()
  const draftTrimmed = draft?.trim() || ''

  // Prefer repaired if it satisfies the contract
  if (repairedTrimmed && hasFinalActiveRecallQuestion(repairedTrimmed)) {
    return repairedTrimmed
  }

  // If draft satisfies the contract, use draft
  if (draftTrimmed && hasFinalActiveRecallQuestion(draftTrimmed)) {
    return draftTrimmed
  }

  // If fallback concept is provided, append a guaranteed active recall question to draft
  if (fallbackConcept && (draftTrimmed || repairedTrimmed)) {
    const base = draftTrimmed || repairedTrimmed || ''
    const concept = (!fallbackConcept || fallbackConcept.toLowerCase() === 'general')
      ? 'this concept'
      : fallbackConcept.trim()
    return `${base}\n\n**Active Recall:** Based on what we just covered, can you explain the central mechanism of ${concept} in your own words?`
  }

  return null
}

