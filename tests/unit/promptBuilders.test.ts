import {
  parseCardGenerationResponse,
  parseEvaluationResponse,
  buildCardGenerationPrompt,
  buildEvaluationPrompt
} from '../../src/lib/promptBuilders'

describe('Prompt Builders', () => {
  describe('parseCardGenerationResponse', () => {
    it('parses valid JSON response', () => {
      const json = JSON.stringify({
        flashcards: [
          { front: 'Question 1', back: 'Answer 1' },
          { front: 'Question 2', back: 'Answer 2' }
        ],
        active_recall: [
          { question: 'Explain X', model_answer: 'X is...' }
        ]
      })

      const result = parseCardGenerationResponse(json)
      expect(result.flashcards).toHaveLength(2)
      expect(result.active_recall).toHaveLength(1)
      expect(result.flashcards[0].front).toBe('Question 1')
      expect(result.active_recall[0].question).toBe('Explain X')
    })

    it('strips markdown code fences', () => {
      const json = '```json\n' + JSON.stringify({
        flashcards: [{ front: 'Q', back: 'A' }],
        active_recall: [{ question: 'Q?', model_answer: 'A' }]
      }) + '\n```'

      const result = parseCardGenerationResponse(json)
      expect(result.flashcards).toHaveLength(1)
    })

    it('strips code fences without language tag', () => {
      const json = '```\n' + JSON.stringify({
        flashcards: [{ front: 'Q', back: 'A' }],
        active_recall: []
      }) + '\n```'

      const result = parseCardGenerationResponse(json)
      expect(result.flashcards).toHaveLength(1)
    })

    it('throws on malformed JSON', () => {
      expect(() => parseCardGenerationResponse('{ invalid json')).toThrow()
    })

    it('throws on missing flashcards array', () => {
      const json = JSON.stringify({ active_recall: [] })
      expect(() => parseCardGenerationResponse(json)).toThrow('missing flashcards array')
    })

    it('throws on missing active_recall array', () => {
      const json = JSON.stringify({ flashcards: [] })
      expect(() => parseCardGenerationResponse(json)).toThrow('missing active_recall array')
    })

    it('throws on invalid flashcard structure', () => {
      const json = JSON.stringify({
        flashcards: [{ question: 'bad structure' }],
        active_recall: []
      })
      expect(() => parseCardGenerationResponse(json)).toThrow('missing front or back')
    })

    it('handles empty response string', () => {
      expect(() => parseCardGenerationResponse('')).toThrow()
    })

    it('handles empty arrays', () => {
      const json = JSON.stringify({ flashcards: [], active_recall: [] })
      const result = parseCardGenerationResponse(json)
      expect(result.flashcards).toHaveLength(0)
      expect(result.active_recall).toHaveLength(0)
    })
  })

  describe('parseEvaluationResponse', () => {
    it('parses valid evaluation response', () => {
      const json = JSON.stringify({
        correct: true,
        score: 4,
        feedback: 'Good answer but missed key point'
      })

      const result = parseEvaluationResponse(json)
      expect(result.correct).toBe(true)
      expect(result.score).toBe(4)
      expect(result.feedback).toBe('Good answer but missed key point')
    })

    it('parses incorrect evaluation', () => {
      const json = JSON.stringify({ correct: false, score: 1, feedback: 'Wrong answer' })
      const result = parseEvaluationResponse(json)
      expect(result.correct).toBe(false)
      expect(result.score).toBe(1)
    })

    it('strips markdown code fences', () => {
      const json = '```json\n' + JSON.stringify({ correct: true, score: 5, feedback: 'Perfect' }) + '\n```'
      const result = parseEvaluationResponse(json)
      expect(result.correct).toBe(true)
    })

    it('throws on missing correct field', () => {
      const json = JSON.stringify({ score: 3, feedback: 'ok' })
      expect(() => parseEvaluationResponse(json)).toThrow('missing correct field')
    })

    it('throws on missing score field', () => {
      const json = JSON.stringify({ correct: true, feedback: 'ok' })
      expect(() => parseEvaluationResponse(json)).toThrow('missing score field')
    })

    it('throws on missing feedback field', () => {
      const json = JSON.stringify({ correct: true, score: 3 })
      expect(() => parseEvaluationResponse(json)).toThrow('missing feedback field')
    })

    it('throws on malformed JSON', () => {
      expect(() => parseEvaluationResponse('not json')).toThrow()
    })
  })

  describe('buildCardGenerationPrompt', () => {
    it('includes the extracted text', () => {
      const prompt = buildCardGenerationPrompt('Some course content', 10, 5)
      expect(prompt).toContain('Some course content')
    })

    it('includes min cards count', () => {
      const prompt = buildCardGenerationPrompt('content', 15, 5)
      expect(prompt).toContain('15')
    })

    it('includes min questions count', () => {
      const prompt = buildCardGenerationPrompt('content', 10, 8)
      expect(prompt).toContain('8')
    })

    it('requests valid JSON output', () => {
      const prompt = buildCardGenerationPrompt('content', 10, 5)
      expect(prompt).toContain('valid JSON')
    })
  })

  describe('buildEvaluationPrompt', () => {
    it('includes question, model answer, and student answer', () => {
      const prompt = buildEvaluationPrompt('What is X?', 'X is Y', 'X is Z')
      expect(prompt).toContain('What is X?')
      expect(prompt).toContain('X is Y')
      expect(prompt).toContain('X is Z')
    })

    it('requests JSON response with correct, score, feedback', () => {
      const prompt = buildEvaluationPrompt('Q', 'MA', 'SA')
      expect(prompt).toContain('"correct"')
      expect(prompt).toContain('"score"')
      expect(prompt).toContain('"feedback"')
    })
  })
})
