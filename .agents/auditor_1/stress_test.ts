import { repairJSONString, safeParseAICards, cleanMarkdownFences, safeParseAIJson } from '../../src/lib/jsonRepair'
import { findCardDuplicates } from '../../src/lib/cardDeduplication'

console.log('--- STARTING ADVERSARIAL STRESS TEST SUITE ---')

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`FAIL: ${msg}`)
  }
}

// 1. Extreme payload: 100,000 character document with 200 cards cut at every 250th byte
const cardsArray: string[] = []
for (let i = 1; i <= 200; i++) {
  cardsArray.push(`  {
    "front": "Adversarial Stress Card ${i}: Explain the thermodynamic and quantum biological properties of concept ${i}",
    "back": "Detailed answer for concept ${i} involving enzyme kinetics $\\alpha + \\beta \\to \\gamma$, ATP hydrolysis ($\\Delta G = -30.5\\text{ kJ/mol}$), and $\\frac{a}{b}$",
    "concept": "Topic ${(i % 10) + 1}",
    "concrete_example": "Example case ${i}",
    "common_mistake": "Mistake ${i}",
    "mnemonic": "Mnemonic ${i}"
  }`)
}
const massiveJson = `{\n  "flashcards": [\n${cardsArray.join(',\n')}\n  ]\n}`
assert(massiveJson.length > 50000, `Massive JSON size is ${massiveJson.length}`)

for (let cut = 100; cut < massiveJson.length; cut += 250) {
  const truncated = massiveJson.slice(0, cut)
  try {
    const repaired = repairJSONString(truncated)
    JSON.parse(repaired)
    const parsed = safeParseAICards(truncated)
    assert(Array.isArray(parsed.flashcards), `Parsed flashcards array at cut ${cut}`)
  } catch (err: any) {
    assert(false, `Crash at byte cut ${cut}: ${err.message}`)
  }
}

// 2. Corrupted UTF-16 / Unicode / Escape sequences
const weirdInputs = [
  '{"flashcards": [{"front": "\\u004", "back": "incomplete hex"}]}',
  '{"flashcards": [{"front": "\\u00", "back": "incomplete hex"}]}',
  '{"flashcards": [{"front": "\\u", "back": "incomplete hex"}]}',
  '{"flashcards": [{"front": "\\", "back": "trailing backslash"}]}',
  '{"flashcards": [{"front": "Literal \\user\\path\\file.txt", "back": "Url: \\url{https://example.com}"}]}',
  '{"flashcards": [{"front": "Formula $\\sqrt{x^2 + y^2} \\pm \\theta$", "back": "Math $\\frac{\\alpha}{\\beta} \\times 100$"}]}',
  '{"flashcards": [{"front": "Unclosed quote',
  '{"flashcards": [',
  '{',
  '',
  '   ',
  '```json\n\n```',
  'Here is nothing: ```python\nprint("hello")\n```',
  '{"flashcards": [{}, {}, {"front": "", "back": ""}]}',
  '{"cards": [{"type": "active_recall", "question": "Q?", "model_answer": "A!"}]}',
  '[{"term": "T1", "definition": "D1"}, {"prompt": "P2", "answer": "A2"}]'
]

for (const input of weirdInputs) {
  try {
    const parsed = safeParseAICards(input)
    assert(parsed !== null && typeof parsed === 'object', `Parsed safe for input: ${input.slice(0, 30)}`)
  } catch (err: any) {
    assert(false, `safeParseAICards threw error for ${input}: ${err.message}`)
  }
}

// 3. Multi-batch text chunking partition test for 500,000 char text (100k+ words)
const largeDoc = 'Word '.repeat(100000) // 500k chars
const totalCount = 100
const totalBatches = Math.ceil(totalCount / 8) // 13 batches
for (let batchIdx = 0; batchIdx < 26; batchIdx++) { // test 2 cycles (retries included)
  const activeBatchIdx = totalBatches > 0 ? (batchIdx % totalBatches) : 0
  const sliceLength = Math.max(5000, Math.ceil(largeDoc.length / totalBatches))
  const start = Math.max(0, Math.floor(activeBatchIdx * (largeDoc.length / totalBatches)) - 400)
  const end = Math.min(largeDoc.length, start + sliceLength + 400)
  const slice = largeDoc.slice(start, end)
  assert(slice.length >= 5000, `Slice length ${slice.length} at batch ${batchIdx}`)
  assert(start >= 0 && end <= largeDoc.length, `Slice bounds valid at batch ${batchIdx}`)
}

console.log(`--- FINISHED STRESS TESTS: ${passed} passed, ${failed} failed ---`)
if (failed > 0) process.exit(1)
