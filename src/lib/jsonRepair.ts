/**
 * Robust JSON repair and parsing utility for AI outputs.
 * Safely handles:
 * - Conversational preambles and postambles wrapping code blocks
 * - Markdown code fences at arbitrary positions
 * - Unescaped literal newlines and control characters in string literals
 * - Truncated strings / unterminated quotes at arbitrary byte cuts
 * - Incomplete keys, dangling colons, empty unclosed objects
 * - Unbalanced brackets and braces across arbitrary nesting depths
 * - Regex entity recovery fallback for severely malformed streams
 */

export interface ParsedAICardsPayload {
  flashcards?: Array<{
    front: string
    back: string
    concept?: string
    card_subtype?: string
    concrete_example?: string
    common_mistake?: string
    mnemonic?: string
  }>
  active_recall?: Array<{
    question: string
    model_answer: string
    concept?: string
    card_subtype?: string
    concrete_example?: string
    common_mistake?: string
    mnemonic?: string
  }>
  cards?: Array<{
    type?: string
    front?: string
    back?: string
    question?: string
    model_answer?: string
    concept?: string
    card_subtype?: string
  }>
  [key: string]: unknown
}

/**
 * Clean markdown fences and extract candidate JSON from conversational or fenced text
 */
export function cleanMarkdownFences(text: string): string {
  if (!text || typeof text !== 'string') return ''
  let cleaned = text.trim()

  // 1. If text contains a markdown code fence tagged specifically with ```json
  const jsonFenceRegex = /```json\s*\n?([\s\S]*?)(?:```|$)/i
  const jsonFenceMatch = jsonFenceRegex.exec(cleaned)
  if (jsonFenceMatch && jsonFenceMatch[1] && jsonFenceMatch[1].trim()) {
    const candidate = jsonFenceMatch[1].trim()
    if (candidate.includes('{') || candidate.includes('[')) {
      return candidate
    }
  }

  // 2. If text contains any code fence block with JSON-like structure ({ or [)
  const genericFenceRegex = /```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)(?:```|$)/g
  let match: RegExpExecArray | null
  while ((match = genericFenceRegex.exec(cleaned)) !== null) {
    const candidate = match[1]?.trim()
    if (candidate && (candidate.includes('{') || candidate.includes('['))) {
      return candidate
    }
  }

  // 3. If no fence matched, strip leading/trailing backticks
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '')
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\n?```\s*$/, '')
  }
  cleaned = cleaned.trim()

  // 4. Find the first '{' or '['
  const firstBrace = cleaned.indexOf('{')
  const firstBracket = cleaned.indexOf('[')
  let startIdx = -1

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket)
  } else if (firstBrace !== -1) {
    startIdx = firstBrace
  } else if (firstBracket !== -1) {
    startIdx = firstBracket
  }

  if (startIdx >= 0) {
    cleaned = cleaned.slice(startIdx).trim()

    // Check if the root JSON object/array closes and is followed by postamble text
    let inStr = false
    let isEsc = false
    let depth = 0
    let rootClosedIdx = -1

    for (let i = 0; i < cleaned.length; i++) {
      const c = cleaned[i]
      if (inStr) {
        if (isEsc) isEsc = false
        else if (c === '\\') isEsc = true
        else if (c === '"') inStr = false
      } else {
        if (c === '"') {
          inStr = true
        } else if (c === '{' || c === '[') {
          depth++
        } else if (c === '}' || c === ']') {
          depth--
          if (depth === 0) {
            rootClosedIdx = i
            break
          }
        }
      }
    }

    // If root object/array cleanly closed and there was postamble text after it, trim the postamble
    if (rootClosedIdx !== -1 && rootClosedIdx < cleaned.length - 1) {
      cleaned = cleaned.slice(0, rootClosedIdx + 1).trim()
    }
  }

  return cleaned
}

/**
 * Structural JSON repair for truncated, unescaped, or malformed JSON strings
 */
export function repairJSONString(raw: string): string {
  const text = cleanMarkdownFences(raw)
  if (!text) return '{}'

  // Fast path: if it parses directly, return as is
  try {
    JSON.parse(text)
    return text
  } catch {
    // Needs repair
  }

  // Scan text character by character:
  // - Escape raw control chars (literal newlines, tabs) inside strings
  // - Track quote state and open bracket/brace stack
  // - Track last successful object/array close indices
  const stack: ('{' | '[')[] = []
  let inString = false
  let isEscaped = false
  let repairedBuilder = ''
  let lastGoodIndex = 0

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        repairedBuilder += char
      } else if (char === '\\') {
        const nextChar = i + 1 < text.length ? text[i + 1] : ''
        if (nextChar === '"' || nextChar === '\\' || nextChar === '/' ||
            nextChar === 'n' || nextChar === 'r') {
          isEscaped = true
          repairedBuilder += char
        } else if (nextChar === 't') {
          // If `\t` is followed by letters (e.g. \times, \theta, \tau, \text), it's a LaTeX command
          const nextTwo = text.slice(i + 1, i + 3)
          if (/^t[a-zA-Z]/.test(nextTwo)) {
            repairedBuilder += '\\\\'
          } else {
            isEscaped = true
            repairedBuilder += char
          }
        } else if (nextChar === 'u' || nextChar === 'U') {
          const hexPart = text.slice(i + 2, i + 6)
          if (/^[0-9a-fA-F]{4}/.test(hexPart) || i + 5 >= text.length) {
            isEscaped = true
            repairedBuilder += char
          } else {
            // Invalid unicode escape like \url or \user -> escape the backslash so it remains literal text
            repairedBuilder += '\\\\'
          }
        } else if (i === text.length - 1) {
          // Trailing backslash at truncation boundary
          isEscaped = true
          repairedBuilder += char
        } else {
          // Invalid escape sequence or LaTeX command (e.g. \alpha, \beta, \frac, \sqrt, \pm) -> escape backslash
          repairedBuilder += '\\\\'
        }
      } else if (char === '"') {
        inString = false
        repairedBuilder += char
      } else if (char === '\n') {
        // Escape literal newline inside JSON string
        repairedBuilder += '\\n'
      } else if (char === '\r') {
        // Escape literal carriage return inside JSON string
        repairedBuilder += '\\r'
      } else if (char === '\t') {
        // Escape literal tab inside JSON string
        repairedBuilder += '\\t'
      } else {
        repairedBuilder += char
      }
    } else {
      if (char === '"') {
        inString = true
        repairedBuilder += char
      } else if (char === '{' || char === '[') {
        stack.push(char)
        repairedBuilder += char
      } else if (char === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') {
          stack.pop()
          lastGoodIndex = repairedBuilder.length
        }
        repairedBuilder += char
      } else if (char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop()
          lastGoodIndex = repairedBuilder.length
        }
        repairedBuilder += char
      } else {
        repairedBuilder += char
      }
    }
  }

  let result = repairedBuilder

  // If truncated inside an escape sequence (e.g. trailing `\`), strip it
  if (inString && isEscaped) {
    result = result.slice(0, -1)
  }

  // If truncated inside an incomplete unicode escape (e.g. \u, \u0, \u00, \u000), strip it
  if (inString) {
    result = result.replace(/\\u[0-9a-fA-F]{0,3}$/, '')
  }

  // If truncated inside a string, close the string
  if (inString) {
    result += '"'
  }

  // Trim trailing whitespace
  result = result.trimEnd()

  // Clean trailing commas before closing braces or at end of text
  result = result.replace(/,\s*([\}\]])/g, '$1')
  result = result.replace(/,\s*$/, '')

  // Handle incomplete trailing key/value pairs outside string:
  // Case 1: Dangling colon (e.g. `"back": ` or `"back":`) -> fill with empty string
  result = result.replace(/:\s*"?$/, ': ""')

  // Case 2: Dangling partial literals (e.g. `tr`, `fa`, `nu`, `123.`)
  result = result.replace(/:\s*tr?u?e?$/i, ': true')
  result = result.replace(/:\s*fa?l?s?e?$/i, ': false')
  result = result.replace(/:\s*nu?l?l?$/i, ': null')
  result = result.replace(/:\s*(\d+)\.$/, ': $1')

  // Case 3: Dangling key with comma (e.g. `, "concept"` or `, "concept`) -> strip trailing key
  result = result.replace(/,\s*"[^"]*"\s*:\s*"?$/, '')
  result = result.replace(/,\s*"[^"]*"\s*$/, '')

  // Case 4: Empty object opener at end after comma (e.g. `[..., {` or `[..., { `)
  if (/,\s*\{\s*$/.test(result)) {
    result = result.replace(/,\s*\{\s*$/, '')
    if (stack.length > 0 && stack[stack.length - 1] === '{') {
      stack.pop()
    }
  }

  // Case 5: Key inside single object with no value (e.g. `{"front": "Q", "concept"` -> remove `, "concept"`)
  result = result.replace(/,\s*"[^"]*"\s*$/, '')

  // Close all unclosed brackets/braces in reverse order
  while (stack.length > 0) {
    const open = stack.pop()
    result = result.replace(/,\s*$/, '')
    if (open === '{') {
      result += '}'
    } else if (open === '[') {
      result += ']'
    }
  }

  // Remove any remaining trailing commas before } or ]
  result = result.replace(/,\s*([\}\]])/g, '$1')

  // Verify parse
  try {
    JSON.parse(result)
    return result
  } catch {
    // If still failing, try progressive truncation at last known good closed object/array
    if (lastGoodIndex > 0) {
      const truncated = repairedBuilder.slice(0, lastGoodIndex)
      // Count open brackets up to lastGoodIndex
      const tempStack: ('{' | '[')[] = []
      let tInStr = false
      let tEsc = false
      for (let i = 0; i < truncated.length; i++) {
        const c = truncated[i]
        if (tInStr) {
          if (tEsc) tEsc = false
          else if (c === '\\') tEsc = true
          else if (c === '"') tInStr = false
        } else {
          if (c === '"') tInStr = true
          else if (c === '{' || c === '[') tempStack.push(c)
          else if (c === '}' && tempStack[tempStack.length - 1] === '{') tempStack.pop()
          else if (c === ']' && tempStack[tempStack.length - 1] === '[') tempStack.pop()
        }
      }
      let candidate = truncated.replace(/,\s*$/, '')
      while (tempStack.length > 0) {
        const op = tempStack.pop()
        candidate = candidate.replace(/,\s*$/, '') + (op === '{' ? '}' : ']')
      }
      try {
        JSON.parse(candidate)
        return candidate
      } catch {
        // Continue
      }
    }
    return result
  }
}

/**
 * Normalizes an arbitrary parsed JSON structure into ParsedAICardsPayload
 */
function normalizeAICardsPayload(raw: unknown): ParsedAICardsPayload {
  if (!raw || typeof raw !== 'object') {
    return { flashcards: [], active_recall: [], cards: [] }
  }

  const flashcards: NonNullable<ParsedAICardsPayload['flashcards']> = []
  const activeRecall: NonNullable<ParsedAICardsPayload['active_recall']> = []
  const allCards: NonNullable<ParsedAICardsPayload['cards']> = []

  const extractItem = (item: unknown, contextKey?: string) => {
    if (!item || typeof item !== 'object') return
    const rec = item as Record<string, unknown>

    const front = String(rec.front || rec.Front || rec.prompt || rec.Prompt || rec.question || rec.Question || rec.term || rec.Term || '').trim()
    const back = String(rec.back || rec.Back || rec.answer || rec.Answer || rec.model_answer || rec.modelAnswer || rec.Model_Answer || rec.definition || rec.Definition || '').trim()
    const concept = typeof rec.concept === 'string' ? rec.concept.trim() : typeof rec.Concept === 'string' ? rec.Concept.trim() : typeof rec.topic === 'string' ? rec.topic.trim() : typeof rec.Topic === 'string' ? rec.Topic.trim() : undefined
    const cardSubtype = typeof rec.card_subtype === 'string' ? rec.card_subtype : typeof rec.subtype === 'string' ? rec.subtype : undefined
    const concreteExample = typeof rec.concrete_example === 'string' ? rec.concrete_example : typeof rec.example === 'string' ? rec.example : undefined
    const commonMistake = typeof rec.common_mistake === 'string' ? rec.common_mistake : typeof rec.mistake === 'string' ? rec.mistake : undefined
    const mnemonic = typeof rec.mnemonic === 'string' ? rec.mnemonic : undefined
    const type = typeof rec.type === 'string' ? rec.type : undefined

    const hasQuestion = Boolean(rec.question || rec.Question)
    const hasFront = Boolean(rec.front || rec.Front || rec.term || rec.Term || rec.prompt || rec.Prompt)
    const isRecall = type === 'active_recall' || contextKey === 'active_recall' || contextKey === 'questions' || (type !== 'flashcard' && hasQuestion && !hasFront)

    if (front || back) {
      allCards.push({
        type: isRecall ? 'active_recall' : 'flashcard',
        front,
        back,
        question: isRecall ? front : undefined,
        model_answer: isRecall ? back : undefined,
        concept,
        card_subtype: cardSubtype
      })

      if (isRecall) {
        activeRecall.push({
          question: front,
          model_answer: back,
          concept,
          card_subtype: cardSubtype,
          concrete_example: concreteExample,
          common_mistake: commonMistake,
          mnemonic
        })
      } else {
        flashcards.push({
          front,
          back,
          concept,
          card_subtype: cardSubtype,
          concrete_example: concreteExample,
          common_mistake: commonMistake,
          mnemonic
        })
      }
    }
  }

  // Handle top-level array
  if (Array.isArray(raw)) {
    raw.forEach((item) => extractItem(item))
    return { flashcards, active_recall: activeRecall, cards: allCards }
  }

  const obj = raw as Record<string, unknown>

  // Known candidate array properties
  const arrayKeys = ['flashcards', 'active_recall', 'cards', 'deck', 'items', 'data', 'result', 'results', 'questions', 'qa_pairs', 'notes']

  for (const key of arrayKeys) {
    if (Array.isArray(obj[key])) {
      (obj[key] as unknown[]).forEach((item) => extractItem(item, key))
    }
  }

  // If nothing extracted yet, check any remaining array properties
  if (flashcards.length === 0 && activeRecall.length === 0 && allCards.length === 0) {
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) {
        (obj[key] as unknown[]).forEach((item) => extractItem(item, key))
      }
    }
  }

  return {
    ...obj,
    flashcards,
    active_recall: activeRecall,
    cards: allCards
  }
}

/**
 * Safely parse AI JSON payload with multi-stage fallback (Direct -> Repaired -> Regex Extraction)
 */
export function safeParseAICards(rawText: string): ParsedAICardsPayload {
  if (!rawText || !rawText.trim()) {
    return { flashcards: [], active_recall: [], cards: [] }
  }

  const cleaned = cleanMarkdownFences(rawText)

  // 1. Direct parse attempt
  try {
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === 'object') {
      return normalizeAICardsPayload(parsed)
    }
  } catch {
    // Continue to repair
  }

  // 2. Repaired parse attempt
  try {
    const repaired = repairJSONString(cleaned)
    const parsed = JSON.parse(repaired)
    if (parsed && typeof parsed === 'object') {
      return normalizeAICardsPayload(parsed)
    }
  } catch {
    // Continue to regex recovery
  }

  // 3. Fallback: Regex extraction of individual card and question objects
  const flashcards: NonNullable<ParsedAICardsPayload['flashcards']> = []
  const active_recall: NonNullable<ParsedAICardsPayload['active_recall']> = []
  const cards: NonNullable<ParsedAICardsPayload['cards']> = []

  // Extract flashcard-like objects: { "front": "...", "back": "..." }
  const fcRegex = /\{\s*"(?:front|Front|term|Term)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"(?:back|Back|definition|Definition|answer|Answer)"\s*:\s*"((?:[^"\\]|\\.)*)"(?:[^{}]*?"(?:concept|Concept|topic|Topic)"\s*:\s*"((?:[^"\\]|\\.)*)")?[^}]*?\}/g
  let match: RegExpExecArray | null
  while ((match = fcRegex.exec(cleaned)) !== null) {
    try {
      const front = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      const back = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      const concept = match[3] ? match[3].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : undefined
      if (front.trim() && back.trim()) {
        flashcards.push({ front: front.trim(), back: back.trim(), concept: concept?.trim() })
        cards.push({ type: 'flashcard', front: front.trim(), back: back.trim(), concept: concept?.trim() })
      }
    } catch {
      // Ignore bad match
    }
  }

  // Extract active-recall-like objects: { "question": "...", "model_answer": "..." }
  const arRegex = /\{\s*"(?:question|Question)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"(?:model_answer|modelAnswer|Model_Answer|answer|Answer)"\s*:\s*"((?:[^"\\]|\\.)*)"(?:[^{}]*?"(?:concept|Concept|topic|Topic)"\s*:\s*"((?:[^"\\]|\\.)*)")?[^}]*?\}/g
  while ((match = arRegex.exec(cleaned)) !== null) {
    try {
      const question = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      const model_answer = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      const concept = match[3] ? match[3].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : undefined
      if (question.trim() && model_answer.trim()) {
        active_recall.push({ question: question.trim(), model_answer: model_answer.trim(), concept: concept?.trim() })
        cards.push({ type: 'active_recall', front: question.trim(), back: model_answer.trim(), question: question.trim(), model_answer: model_answer.trim(), concept: concept?.trim() })
      }
    } catch {
      // Ignore bad match
    }
  }

  return { flashcards, active_recall, cards }
}

/**
 * Generic safe JSON parser for any structured AI output (syllabuses, classes, evaluations, etc.)
 */
export function safeParseAIJson<T>(rawText: string, fallback: T): T {
  if (!rawText || !rawText.trim()) return fallback
  const cleaned = cleanMarkdownFences(rawText)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    try {
      const repaired = repairJSONString(cleaned)
      return JSON.parse(repaired) as T
    } catch (err) {
      console.warn('safeParseAIJson failed to parse even after repair, returning fallback:', err)
      return fallback
    }
  }
}
