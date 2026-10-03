import type { HighlightCardExtractionOptions } from '../types'

export function buildHighlightCardPrompt(
  subjectName: string,
  snippet: string,
  contextTopic?: string,
  options?: HighlightCardExtractionOptions,
  existingCardHints = ''
): string {
  const highlightText = options?.highlightText?.trim() || snippet.substring(0, 3000)
  const sourceContext = options?.sourceContext?.trim() || snippet.substring(0, 3000)
  const revisionBlock = options?.feedback?.trim() || options?.previousCard
    ? `\n<revision_request>\n${options?.feedback?.trim() ? `Learner feedback:\n${options.feedback.trim()}\n` : ''}${options?.previousCard ? `Previous card front: ${options.previousCard.front}\nPrevious card back: ${options.previousCard.back}\n` : ''}</revision_request>`
    : ''

  return `You are a precise academic editor and expert flashcard designer. Create a high-quality study card for a student studying "${subjectName}".

<learner_highlight>
${highlightText.substring(0, 3000)}
</learner_highlight>

<source_context>
${sourceContext.substring(0, 9000)}
</source_context>
${contextTopic ? `\nMaterial: ${options?.materialTitle || contextTopic}` : ''}
${revisionBlock}
${existingCardHints}

Before creating the card, correct the learner highlight's spelling, grammar, punctuation, and fragmented wording. Preserve the learner's meaning exactly and do not add facts. Use the complete source context to resolve references and make the card precise. Generate one atomic flashcard grounded only in the source context. Do not make a yes/no question, an unbounded list question, or a composite card. Keep the answer concise but explanatory and use LaTeX for mathematics.

Return only valid JSON in this exact structure:
{
  "normalizedText": "Corrected learner highlight text",
  "cards": [
    {
      "type": "flashcard",
      "front": "Precise question",
      "back": "Grounded concise answer",
      "concept": "Key concept"
    }
  ]
}`
}
