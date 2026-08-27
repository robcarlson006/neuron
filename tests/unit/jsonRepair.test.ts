import { repairJSONString, safeParseAICards, cleanMarkdownFences, safeParseAIJson } from '../../src/lib/jsonRepair'

describe('jsonRepair utility', () => {
  describe('cleanMarkdownFences', () => {
    it('strips ```json fences', () => {
      const input = '```json\n{"hello": "world"}\n```'
      expect(cleanMarkdownFences(input)).toBe('{"hello": "world"}')
    })

    it('strips ``` fences without json specifier', () => {
      const input = '```\n{"hello": "world"}\n```'
      expect(cleanMarkdownFences(input)).toBe('{"hello": "world"}')
    })

    it('extracts JSON from conversational preamble and postamble', () => {
      const input = 'Here are your requested cards:\n```json\n{"flashcards": [{"front": "Q", "back": "A"}]}\n```\nI hope this helps your studies!'
      expect(cleanMarkdownFences(input)).toBe('{"flashcards": [{"front": "Q", "back": "A"}]}')
    })

    it('extracts raw JSON without fences when preceded by conversational greeting', () => {
      const input = 'Sure thing! {"flashcards": [{"front": "Q", "back": "A"}]}'
      expect(cleanMarkdownFences(input)).toBe('{"flashcards": [{"front": "Q", "back": "A"}]}')
    })
  })

  describe('repairJSONString', () => {
    it('returns valid JSON untouched', () => {
      const valid = '{"flashcards":[{"front":"A","back":"B"}]}'
      expect(JSON.parse(repairJSONString(valid))).toEqual({
        flashcards: [{ front: 'A', back: 'B' }]
      })
    })

    it('repairs truncated JSON missing closing brackets', () => {
      const truncated = '{"flashcards":[{"front":"A","back":"B"}'
      const repaired = repairJSONString(truncated)
      expect(JSON.parse(repaired)).toEqual({
        flashcards: [{ front: 'A', back: 'B' }]
      })
    })

    it('repairs truncated string in mid-key-value', () => {
      const truncated = '{"flashcards":[{"front":"Mitosis","back":"Cell division process that produces two'
      const repaired = repairJSONString(truncated)
      const parsed = JSON.parse(repaired)
      expect(parsed.flashcards).toBeDefined()
      expect(parsed.flashcards[0].front).toBe('Mitosis')
      expect(parsed.flashcards[0].back).toContain('Cell division')
    })

    it('repairs trailing commas', () => {
      const withComma = '{"flashcards":[{"front":"A","back":"B"},]}'
      const repaired = repairJSONString(withComma)
      expect(JSON.parse(repaired)).toEqual({
        flashcards: [{ front: 'A', back: 'B' }]
      })
    })

    it('repairs literal unescaped newlines and tabs inside string literals', () => {
      const withRawNewlines = '{"flashcards":[{"front":"Question with\nline 1\nline 2","back":"Answer with\ttabs and\nnewlines"}]}'
      const repaired = repairJSONString(withRawNewlines)
      const parsed = JSON.parse(repaired)
      expect(parsed.flashcards[0].front).toContain('line 1')
      expect(parsed.flashcards[0].back).toContain('tabs')
    })

    it('repairs truncation at dangling key without colon', () => {
      const truncatedKey = '{"flashcards":[{"front":"Q1","back":"A1"},{"con'
      const repaired = repairJSONString(truncatedKey)
      const parsed = JSON.parse(repaired)
      expect(parsed.flashcards).toHaveLength(1)
      expect(parsed.flashcards[0].front).toBe('Q1')
    })

    it('repairs truncation at dangling colon', () => {
      const truncatedColon = '{"flashcards":[{"front":"Q1","back":"A1"},{"front":"Q2","back":'
      const repaired = repairJSONString(truncatedColon)
      const parsed = JSON.parse(repaired)
      expect(parsed.flashcards.length).toBeGreaterThanOrEqual(1)
      expect(parsed.flashcards[0].front).toBe('Q1')
    })

    it('repairs truncation at empty unclosed object opener', () => {
      const truncatedEmptyObj = '{"flashcards":[{"front":"Q1","back":"A1"}, {'
      const repaired = repairJSONString(truncatedEmptyObj)
      const parsed = JSON.parse(repaired)
      expect(parsed.flashcards).toHaveLength(1)
      expect(parsed.flashcards[0].front).toBe('Q1')
    })

    it('repairs truncation at dangling escape character', () => {
      const truncatedEscape = '{"flashcards":[{"front":"Q1","back":"A1 with quote \\'
      const repaired = repairJSONString(truncatedEscape)
      const parsed = JSON.parse(repaired)
      expect(parsed.flashcards).toHaveLength(1)
      expect(parsed.flashcards[0].front).toBe('Q1')
    })
  })

  describe('safeParseAICards', () => {
    it('parses valid AI payload', () => {
      const raw = `\`\`\`json
{
  "flashcards": [
    { "front": "What is ATP?", "back": "Adenosine triphosphate", "concept": "Biochemistry" }
  ],
  "active_recall": [
    { "question": "How does glycolysis work?", "model_answer": "Breaks glucose into pyruvate", "concept": "Metabolism" }
  ]
}
\`\`\``
      const result = safeParseAICards(raw)
      expect(result.flashcards).toHaveLength(1)
      expect(result.flashcards![0].front).toBe('What is ATP?')
      expect(result.flashcards![0].concept).toBe('Biochemistry')
      expect(result.active_recall).toHaveLength(1)
      expect(result.active_recall![0].question).toBe('How does glycolysis work?')
      expect(result.active_recall![0].concept).toBe('Metabolism')
    })

    it('safely recovers truncated stream without throwing', () => {
      const truncated = `{"flashcards":[{"front":"Concept 1","back":"Explanation 1"},{"front":"Concept 2","back":"Incomplete exp`
      const result = safeParseAICards(truncated)
      expect(result.flashcards).toBeDefined()
      expect(result.flashcards!.length).toBeGreaterThanOrEqual(1)
      expect(result.flashcards![0].front).toBe('Concept 1')
    })

    it('recovers from massive 18,000 character truncated response with 50+ cards', () => {
      // Simulate generating 50 cards where output is abruptly cut off at ~17,691 chars
      const cardItems = []
      for (let i = 1; i <= 45; i++) {
        cardItems.push(`    { "front": "Concept Question ${i}: Explain mechanism ${i}", "back": "Detailed answer for concept ${i} covering molecular mechanisms, physiological processes, and experimental findings.", "concept": "Module ${i}" }`)
      }
      // Unterminated 46th card:
      const incompleteCard = `    { "front": "Concept Question 46: Truncated question", "back": "Incomplete answer that was abruptly cut off here because of max tokens`
      const rawMassiveStream = `{\n  "flashcards": [\n${cardItems.join(',\n')},\n${incompleteCard}`

      expect(rawMassiveStream.length).toBeGreaterThan(5000)

      const result = safeParseAICards(rawMassiveStream)
      expect(result.flashcards).toBeDefined()
      expect(result.flashcards!.length).toBeGreaterThanOrEqual(45)
      expect(result.flashcards![0].front).toContain('Concept Question 1')
      expect(result.flashcards![44].front).toContain('Concept Question 45')
    })

    it('recovers cards from fenced response with greeting and sign-off', () => {
      const response = `Here are 2 high-yield flashcards for your deck:
\`\`\`json
{
  "flashcards": [
    { "front": "What is the role of myelin in neurons?", "back": "Insulates axons to increase conduction velocity.", "concept": "Neuroanatomy" },
    { "front": "What are Nodes of Ranvier?", "back": "Unmyelinated gaps along an axon with dense Na+ channels.", "concept": "Neuroanatomy" }
  ]
}
\`\`\`
Good luck studying!`
      const result = safeParseAICards(response)
      expect(result.flashcards).toHaveLength(2)
      expect(result.flashcards![0].front).toContain('myelin')
      expect(result.flashcards![1].front).toContain('Nodes of Ranvier')
    })

    it('extracts JSON block when preceded by other code blocks (e.g., Python code)', () => {
      const multiBlock = `Here is some Python sample code:
\`\`\`python
def simulate_neuron():
    print("Action potential fired")
\`\`\`
And here are your generated flashcards:
\`\`\`json
{
  "flashcards": [
    { "front": "What is an action potential?", "back": "A rapid sequence of voltage changes across a membrane.", "concept": "Neurophysiology" }
  ]
}
\`\`\``
      const result = safeParseAICards(multiBlock)
      expect(result.flashcards).toHaveLength(1)
      expect(result.flashcards![0].front).toContain('action potential')
    })

    it('handles direct top-level JSON arrays', () => {
      const arrayJson = `[
        { "front": "What is synaptic transmission?", "back": "Communication between neurons via neurotransmitters." },
        { "question": "Explain long term potentiation.", "model_answer": "Persistent strengthening of synapses based on recent patterns of activity." }
      ]`
      const result = safeParseAICards(arrayJson)
      expect(result.flashcards).toHaveLength(1)
      expect(result.flashcards![0].front).toContain('synaptic transmission')
      expect(result.active_recall).toHaveLength(1)
      expect(result.active_recall![0].question).toContain('long term potentiation')
    })

    it('normalizes alternate keys and capitalized property names', () => {
      const altKeys = `{
        "deck": [
          { "Front": "What is ATP?", "Back": "Energy currency of the cell", "Topic": "Bioenergetics" }
        ],
        "questions": [
          { "Question": "How is ATP synthesized?", "Answer": "Via ATP synthase driven by proton gradient", "Topic": "Bioenergetics" }
        ]
      }`
      const result = safeParseAICards(altKeys)
      expect(result.flashcards).toHaveLength(1)
      expect(result.flashcards![0].front).toBe('What is ATP?')
      expect(result.flashcards![0].concept).toBe('Bioenergetics')
      expect(result.active_recall).toHaveLength(1)
      expect(result.active_recall![0].question).toBe('How is ATP synthesized?')
      expect(result.active_recall![0].concept).toBe('Bioenergetics')
    })

    it('repairs streams cut off inside incomplete Unicode escapes without throwing', () => {
      const cutUnicode1 = '{"flashcards":[{"front":"Test \\u00'
      const cutUnicode2 = '{"flashcards":[{"front":"Test \\u123'
      const res1 = safeParseAICards(cutUnicode1)
      const res2 = safeParseAICards(cutUnicode2)
      expect(res1.flashcards).toBeDefined()
      expect(res2.flashcards).toBeDefined()
    })

    it('repairs streams cut off with partial literals', () => {
      const cutLiteral = '{"flashcards":[{"front":"Q1","back":"A1"}],"success": tr'
      const repaired = repairJSONString(cutLiteral)
      const parsed = JSON.parse(repaired)
      expect(parsed.flashcards).toHaveLength(1)
      expect(parsed.success).toBe(true)
    })

    it('sanitizes LaTeX formulas with single backslashes without crashing JSON.parse', () => {
      const latexPayload = '{"flashcards":[{"front":"What is the formula: $\\\\alpha + \\\\beta = \\\\gamma$ and $\\\\frac{a}{b}$ with $\\\\sqrt{x}$?","back":"Formula with $\\\\pm \\\\times \\\\theta$"}]}'
      // Input with unescaped backslashes in raw text
      const rawWithSingleBackslash = '{"flashcards":[{"front":"What is the formula: $\\alpha + \\beta = \\gamma$ and $\\frac{a}{b}$ with $\\sqrt{x}$?","back":"Formula with $\\pm \\times \\theta$"}]}'
      const result = safeParseAICards(rawWithSingleBackslash)
      expect(result.flashcards).toHaveLength(1)
      expect(result.flashcards![0].front).toContain('\\alpha')
      expect(result.flashcards![0].front).toContain('\\frac')
      expect(result.flashcards![0].back).toContain('\\pm')
    })

    it('handles text with literal paths or URLs like \\url or \\user without crashing', () => {
      const pathPayload = '{"flashcards":[{"front":"Visit \\url/help or check C:\\\\Users\\\\admin","back":"File located at \\user\\docs"}]}'
      const result = safeParseAICards(pathPayload)
      expect(result.flashcards).toHaveLength(1)
      expect(result.flashcards![0].front).toContain('url')
      expect(result.flashcards![0].back).toContain('user')
    })
  })

  describe('safeParseAIJson', () => {
    it('parses valid object', () => {
      const result = safeParseAIJson<{ modules: { title: string }[] }>('{"modules":[{"title":"Week 1"}]}', { modules: [] })
      expect(result.modules).toHaveLength(1)
      expect(result.modules[0].title).toBe('Week 1')
    })

    it('recovers truncated json object', () => {
      const truncated = '{"modules":[{"title":"Week 1"},{"title":"Week 2'
      const result = safeParseAIJson<{ modules: { title: string }[] }>(truncated, { modules: [] })
      expect(result.modules).toBeDefined()
      expect(result.modules[0].title).toBe('Week 1')
    })

    it('parses object wrapped in preamble and markdown fence', () => {
      const wrapped = `Certainly, here is the syllabus:
\`\`\`json
{
  "modules": [
    { "title": "Module 1: Cellular Biology" }
  ]
}
\`\`\``
      const result = safeParseAIJson<{ modules: { title: string }[] }>(wrapped, { modules: [] })
      expect(result.modules).toHaveLength(1)
      expect(result.modules[0].title).toContain('Cellular Biology')
    })

    it('returns fallback on completely unparseable input', () => {
      const fallback = { status: 'empty' }
      const result = safeParseAIJson('random non json text 12345', fallback)
      expect(result).toBe(fallback)
    })
  })
})

