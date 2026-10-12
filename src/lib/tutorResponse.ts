/** Helpers for finalizing structured tutor responses before they reach the UI. */

export interface TutorValidationOptions {
  maxWords?: number
  minWords?: number
  targetRange?: { min: number; max: number }
  allowClosingWithoutQuestion?: boolean
  isComplex?: boolean
  hasEquations?: boolean
}

export type TutorValidationIssue =
  | 'EXCEEDS_LENGTH'
  | 'TOO_BRIEF'
  | 'NO_QUESTION'
  | 'MULTIPLE_QUESTIONS'
  | 'ANSWER_SPOILER'
  | 'MALFORMED_LATEX'

export interface TutorValidationResult {
  isValid: boolean
  wordCount: number
  issues: TutorValidationIssue[]
  questionCount: number
  extractedQuestion?: string
}

function naturalLanguageText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/\[(?:CONCEPT|TEACH_BACK|TOPIC):[^\]]*\]/gi, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$(?:\\.|[^$])*\$/g, ' ')
    .replace(/<[^>]*>/g, ' ')
}

export function countTutorWords(text: string): number {
  const cleaned = naturalLanguageText(text)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[#*_~`]/g, ' ')
    .trim()
  return cleaned.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

function cleanTrailingMarkdown(text: string): string {
  return text.trim().replace(/[*_"'`~)\]}\\\s-]+$/, '')
}

/** True when a value names a source file/material rather than a learning concept. */
export function isDocumentIdentifier(concept: string | null | undefined): boolean {
  const value = concept?.trim() ?? ''
  return /^(?:material|document|file)\s*:/i.test(value)
    || /\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|rtf|odt|epub)(?:\s|$)/i.test(value)
}

/** Remove source-label syntax; use a neutral topic when no concept remains. */
export function sanitizeConceptName(concept: string | null | undefined, fallback = 'this topic'): string {
  const value = concept?.trim() ?? ''
  if (!value || /^(?:general|this concept|this topic)$/i.test(value)) return fallback
  if (isDocumentIdentifier(value)) return fallback
  const cleaned = value
    .replace(/^(?:material|document|file)\s*:\s*/i, '')
    .replace(/\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|rtf|odt|epub)$/i, '')
    .replace(/[?\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

function isGenericDocumentQuestion(text: string): boolean {
  return /\b(?:what is this|what's this|what is the|what does this)\s+(?:pdf|document|file|material)\b|\bwhat is this (?:pdf|document|file) about\b|\bkey idea behind\s+(?:this\s+)?(?:pdf|document|file|material)\b|\bkey idea behind\s+(?:material\s*:|[^?]*\.(?:pdf|docx?))|\b(?:material|document|file)\s*:[^?]*\b(?:about|key idea)\b|\bwhat is the key idea behind\s+[^?]*\.(?:pdf|docx?)\s*\?/i.test(text)
}

function hasSpecificConcept(text: string): string | null {
  const concepts = ['transitivity', 'cyclic preferences', 'strict preference', 'weak preference', 'reflexivity', 'opportunity cost']
  const found = concepts.find((concept) => new RegExp(`\\b${concept.replace(/ /g, '\\s+')}\\b`, 'i').test(text))
  return found ?? null
}

function questionForConcept(concept: string): string {
  if (/transitivity/i.test(concept)) return 'How does transitivity help you compare a chain of preferences?'
  if (/cyclic preferences/i.test(concept)) return 'How can cyclic preferences create a loop in pairwise choices?'
  if (/opportunity cost/i.test(concept)) return 'How would you identify the opportunity cost in a real choice?'
  return `How does ${concept} work in a specific example?`
}

export function hasFinalActiveRecallQuestion(response: string): boolean {
  if (!response || !response.trim()) return false
  const trimmed = response.trim()
  const stripped = cleanTrailingMarkdown(trimmed)
  if (stripped.endsWith('?')) return true

  const paragraphs = trimmed.split(/\n{2,}/)
  const lastParagraph = paragraphs[paragraphs.length - 1]?.trim() || ''
  const cleanLast = cleanTrailingMarkdown(lastParagraph)
  if (cleanLast.endsWith('?') || lastParagraph.includes('?')) return true

  const activeRecallPattern = /(?:active[- ]recall|teach[- ]back|your turn)[:\s*#]+.*?(?:explain|describe|calculate|identify|state|compare|contrast|summarize|detail|why|how|what)/i
  return activeRecallPattern.test(lastParagraph)
}

function getQuestionPrompts(text: string): string[] {
  // Question marks are reliable separators for ordinary prose; retain the text
  // before each mark so multiple clauses in one paragraph are counted separately.
  return text.split('?').slice(0, -1).map((part) => part.trim()).filter(Boolean)
}

function questionHasAnswerSpoiler(question: string): boolean {
  return /\b(?:which|that)\s+(?:is|means|refers to|describes|represents|equals)\b|\b(?:the answer is|namely|i\.e\.)\b/i.test(question)
}

export function validateTutorResponse(
  response: string,
  options: TutorValidationOptions = {}
): TutorValidationResult {
  const maxWords = options.maxWords ?? 110
  const complex = options.isComplex || options.hasEquations || /(?<!\\)\$/.test(response)
  const effectiveMaxWords = options.maxWords ?? (complex ? 140 : maxWords)
  const minWords = options.minWords ?? 8
  const wordCount = countTutorWords(response)
  const questionCount = getQuestionPrompts(naturalLanguageText(response)).length
  const issues: TutorValidationIssue[] = []

  if (wordCount > effectiveMaxWords) issues.push('EXCEEDS_LENGTH')
  if (wordCount < minWords) issues.push('TOO_BRIEF')
  if (!options.allowClosingWithoutQuestion && !hasFinalActiveRecallQuestion(response)) {
    issues.push('NO_QUESTION')
  }
  if (questionCount > 1) issues.push('MULTIPLE_QUESTIONS')
  const finalQuestion = questionCount ? getQuestionPrompts(naturalLanguageText(response)).at(-1) : undefined
  if (finalQuestion && questionHasAnswerSpoiler(finalQuestion)) issues.push('ANSWER_SPOILER')
  if (hasMalformedLatex(response)) issues.push('MALFORMED_LATEX')

  return {
    isValid: issues.length === 0,
    wordCount,
    issues,
    questionCount,
    ...(finalQuestion ? { extractedQuestion: `${finalQuestion}?` } : {}),
  }
}

function hasMalformedLatex(text: string): boolean {
  const dollars = text.match(/(?<!\\)\$\$?/g) ?? []
  let inlineOpen = false
  let displayOpen = false
  for (const delimiter of dollars) {
    if (delimiter === '$$') {
      if (inlineOpen) return true
      displayOpen = !displayOpen
    } else {
      if (displayOpen) return true
      inlineOpen = !inlineOpen
    }
  }
  return inlineOpen || displayOpen
}

export function buildTutorRepairPrompt(
  draft: string,
  validation: TutorValidationResult,
  concept?: string
): string {
  const descriptions: string[] = []
  if (validation.issues.includes('EXCEEDS_LENGTH')) descriptions.push(`Too long (${validation.wordCount} words)`)
  if (validation.issues.includes('TOO_BRIEF')) descriptions.push(`Too brief (${validation.wordCount} words)`)
  if (validation.issues.includes('NO_QUESTION')) descriptions.push('Missing final active-recall question')
  if (validation.issues.includes('MULTIPLE_QUESTIONS')) descriptions.push('Contains multiple questions')
  if (validation.issues.includes('ANSWER_SPOILER')) descriptions.push('Final question gives away its answer')
  if (validation.issues.includes('MALFORMED_LATEX')) descriptions.push('Malformed or unclosed LaTeX delimiters')
  const failure = descriptions.length ? descriptions.join('; ') : 'Response needs validation repair'
  const conceptInstruction = concept?.trim()
    ? `Focus the final active-recall question on the concept: ${concept.trim()}.`
    : 'Conclude with exactly ONE active-recall question directly testing the concept in the draft.'
  return `Rewrite this tutor response. Validation failure: ${failure}. Preserve the specific subject matter, core factual explanations, and any mathematical equations ($...$ or $$...$$). Do NOT substitute generic filler or boilerplate questions. Ensure all LaTeX delimiters are properly paired and closed. ${conceptInstruction} Keep the response concise and do not reveal the answer to the question.\n\nDraft:\n${draft}`
}

/** A repair replaces the hidden draft; it is never appended to it. */
export function chooseFinalTutorResponse(
  draft: string,
  repaired?: string | null,
  fallbackConcept?: string,
  options: TutorValidationOptions = {}
): string | null {
  const repairedTrimmed = repaired?.trim()
  const draftTrimmed = draft?.trim() || ''
  if (repairedTrimmed && !isGenericDocumentQuestion(repairedTrimmed) && validateTutorResponse(repairedTrimmed, options).isValid) return repairedTrimmed
  if (draftTrimmed && !isGenericDocumentQuestion(draftTrimmed) && validateTutorResponse(draftTrimmed, options).isValid) return draftTrimmed
  const preserved = preserveSpecificDraft(draftTrimmed, options, fallbackConcept)
  if (preserved) return preserved
  if (!fallbackConcept) return null

  const rawConcept = fallbackConcept.trim()
  const concept = sanitizeConceptName(rawConcept, 'this topic')
  const maxWords = options.maxWords ?? 110
  const cleanConcept = countTutorWords(concept) > 12 ? 'this topic' : concept
  const microTeach = `Let's check your understanding of ${cleanConcept}. ${questionForConcept(cleanConcept)}`
  if (countTutorWords(draftTrimmed) > maxWords) return microTeach

  // Retain the historical short-draft behavior while making sure it adds only
  // one question and stays within the caller's configured limit.
  const base = draftTrimmed || repairedTrimmed || ''
  if (base && !base.includes('?')) {
    const appended = `${base}\n\n**Active Recall:** ${questionForConcept(cleanConcept)}`
    if (validateTutorResponse(appended, options).isValid) return appended
  }
  return microTeach
}

function preserveSpecificDraft(draft: string, options: TutorValidationOptions, fallbackConcept?: string): string | null {
  if (!draft || countTutorWords(draft) < 12) return null
  const questionMark = draft.lastIndexOf('?')
  if (questionMark < 0) return null
  const beforeMark = draft.slice(0, questionMark)
  const question = beforeMark.split(/[.!\n]/).at(-1)?.trim()
  if (!question) return null
  const specificConcept = hasSpecificConcept(draft) ?? (fallbackConcept ? sanitizeConceptName(fallbackConcept, '') : '')
  const questionText = isGenericDocumentQuestion(`${question}?`) || isGenericDocumentQuestion(draft)
    ? (specificConcept ? questionForConcept(specificConcept) : '')
    : `${question}?`
  if (!questionText) return null
  const beforeQuestion = beforeMark.slice(0, beforeMark.lastIndexOf(question))
  const sentences = beforeQuestion.replace(/\.(?=(?:pdf|docx?)\b)/gi, '\u0000').match(/[^.!?]+[.!]?/g)?.map((part) => part.replace(/\u0000/gi, '.').trim()).filter(Boolean) ?? []
  const explanation = sentences.slice(0, 2).join(' ')
  const equations = draft.match(/\$\$[\s\S]*?\$\$|(?<!\\)\$(?:\\.|[^$])*\$/g) ?? []
  const body = [explanation, ...equations.filter((equation) => !explanation.includes(equation))].filter(Boolean).join(' ')
  const candidate = `${body}\n\nActive recall: ${questionText}`
  return !isGenericDocumentQuestion(candidate) && validateTutorResponse(candidate, options).isValid ? candidate : null
}
