import type { GeneratedCards, EvaluationResult } from '../types'

/**
 * Build the card generation prompt
 */
export function buildCardGenerationPrompt(
  extractedText: string,
  minCards: number = 10,
  minQuestions: number = 5
): string {
  return `You are an expert educator and cognitive scientist creating study materials from the following course content.

CONTENT:
${extractedText}

Generate the following in valid JSON:
1. "flashcards": An array of at least ${minCards} flashcards. Each has "front" (term/concept) and "back" (definition/explanation). Make them precise, clear, and educational. Do not generate trivial or redundant cards.
2. "active_recall": An array of at least ${minQuestions} active recall questions. Each has "question" (open-ended, requires understanding) and "model_answer" (a complete, correct answer a student should give).

Prioritize depth over quantity — every card must earn its place. Cover all major topics in the material.

Return ONLY valid JSON. No markdown. No commentary.`
}

/**
 * Build the answer evaluation prompt
 */
export function buildEvaluationPrompt(
  question: string,
  modelAnswer: string,
  studentAnswer: string
): string {
  return `You are grading a student's answer to a study question.

QUESTION: ${question}
MODEL ANSWER: ${modelAnswer}
STUDENT ANSWER: ${studentAnswer}

Evaluate the student's answer and respond in JSON:
{
  "correct": true or false,
  "score": 0-5,
  "feedback": "Specific, constructive feedback. What did they get right? What did they miss? What is the key concept they should understand?"
}

Be fair but academically rigorous. Partial credit answers that capture the core concept should be marked correct.
Return ONLY valid JSON.`
}

/**
 * Parse the Gemini card generation response
 */
export function parseCardGenerationResponse(responseText: string): GeneratedCards {
  // Strip markdown code fences if present
  let cleaned = responseText.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  const parsed = JSON.parse(cleaned)

  if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
    throw new Error('Invalid response: missing flashcards array')
  }
  if (!parsed.active_recall || !Array.isArray(parsed.active_recall)) {
    throw new Error('Invalid response: missing active_recall array')
  }

  // Validate flashcard structure
  const flashcards = parsed.flashcards.map((fc: { front?: string; back?: string }) => {
    if (typeof fc.front !== 'string' || typeof fc.back !== 'string') {
      throw new Error('Invalid flashcard: missing front or back')
    }
    return { front: fc.front, back: fc.back }
  })

  // Validate active recall structure
  const active_recall = parsed.active_recall.map((ar: { question?: string; model_answer?: string }) => {
    if (typeof ar.question !== 'string' || typeof ar.model_answer !== 'string') {
      throw new Error('Invalid active recall: missing question or model_answer')
    }
    return { question: ar.question, model_answer: ar.model_answer }
  })

  return { flashcards, active_recall }
}

/**
 * Parse the Gemini evaluation response
 */
export function parseEvaluationResponse(responseText: string): EvaluationResult {
  let cleaned = responseText.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  const parsed = JSON.parse(cleaned)

  if (typeof parsed.correct !== 'boolean') {
    throw new Error('Invalid evaluation response: missing correct field')
  }
  if (typeof parsed.score !== 'number') {
    throw new Error('Invalid evaluation response: missing score field')
  }
  if (typeof parsed.feedback !== 'string') {
    throw new Error('Invalid evaluation response: missing feedback field')
  }

  return {
    correct: parsed.correct,
    score: parsed.score,
    feedback: parsed.feedback
  }
}
