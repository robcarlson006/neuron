/** Helpers for finalizing structured tutor responses before they reach the UI. */

export function hasFinalActiveRecallQuestion(response: string): boolean {
  return /\?\s*$/.test(response.trim())
}

/** A repair response replaces the hidden draft; it is never appended to it. */
export function chooseFinalTutorResponse(draft: string, repaired?: string | null): string | null {
  const candidate = (repaired || draft).trim()
  return candidate && hasFinalActiveRecallQuestion(candidate) ? candidate : null
}
