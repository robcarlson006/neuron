import {
  normalizeText,
  levenshteinDistance,
  stringSimilarity,
  extractKeyConcepts,
  detectNegationMismatch,
  scoreToQuality,
  evaluateSemantically,
  evaluateStudentAnswer
} from '../../src/lib/semanticEvaluator'

describe('semanticEvaluator', () => {
  describe('normalizeText', () => {
    it('normalizes case, punctuation, and whitespace', () => {
      expect(normalizeText('  Hello, World!  ')).toBe('hello world')
      expect(normalizeText('Alpha & Beta; Gamma...')).toBe('alpha beta gamma')
    })

    it('strips LaTeX delimiters and tags', () => {
      expect(normalizeText('$\\text{ATP}$ synthesis')).toBe('atp synthesis')
      expect(normalizeText('$E = mc^2$')).toBe('e mc 2')
    })
  })

  describe('levenshteinDistance & stringSimilarity', () => {
    it('calculates correct edit distance', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
      expect(levenshteinDistance('abc', 'abc')).toBe(0)
    })

    it('computes normalized string similarity', () => {
      expect(stringSimilarity('mitochondria', 'mitochondria')).toBe(1)
      expect(stringSimilarity('mitochondria', 'mitochondrion')).toBeGreaterThan(0.80)
      expect(stringSimilarity('apple', 'banana')).toBeLessThan(0.5)
    })
  })

  describe('extractKeyConcepts', () => {
    it('extracts capitalized terms, quoted strings, and substantive words', () => {
      const concepts = extractKeyConcepts('The "Krebs cycle" produces NADH and FADH2 in mitochondria.')
      expect(concepts).toContain('krebs cycle')
      expect(concepts).toContain('mitochondria')
      expect(concepts).toContain('nadh')
    })
  })

  describe('detectNegationMismatch', () => {
    it('detects when one sentence has a negation and the other does not', () => {
      expect(detectNegationMismatch('It does not produce ATP', 'It produces ATP')).toBe(true)
      expect(detectNegationMismatch('Cannot cross the membrane', 'Can cross the membrane')).toBe(true)
    })

    it('returns false when both or neither contain negation', () => {
      expect(detectNegationMismatch('Produces ATP in matrix', 'Generates ATP in matrix')).toBe(false)
      expect(detectNegationMismatch('Does not work', 'It is not functional')).toBe(false)
    })
  })

  describe('scoreToQuality', () => {
    it('maps scores to FSRS-5 diagnostic (0-4) scale correctly', () => {
      expect(scoreToQuality(0.95).diagnosticQuality).toBe(4) // Mastered
      expect(scoreToQuality(0.75).diagnosticQuality).toBe(3) // Know it well
      expect(scoreToQuality(0.50).diagnosticQuality).toBe(2) // Okay at this
      expect(scoreToQuality(0.25).diagnosticQuality).toBe(1) // Know a little
      expect(scoreToQuality(0.10).diagnosticQuality).toBe(0) // Don't know
    })

    it('maps scores to study session (1/3/5) scale correctly', () => {
      expect(scoreToQuality(0.90).quality).toBe(5) // Got It
      expect(scoreToQuality(0.50).quality).toBe(3) // Partially Right
      expect(scoreToQuality(0.20).quality).toBe(1) // Wrong
    })
  })

  describe('evaluateSemantically', () => {
    it('handles empty student input', () => {
      const res = evaluateSemantically('', 'Mitochondria produces ATP')
      expect(res.correct).toBe(false)
      expect(res.score).toBe(0)
      expect(res.quality).toBe(1)
      expect(res.diagnosticQuality).toBe(0)
    })

    it('grades exact matches as perfect score (Tier 1)', () => {
      const res = evaluateSemantically('Mitochondria produces ATP', 'Mitochondria produces ATP')
      expect(res.correct).toBe(true)
      expect(res.score).toBe(1)
      expect(res.quality).toBe(5)
      expect(res.diagnosticQuality).toBe(4)
      expect(res.tierUsed).toBe('exact')
    })

    it('grades semantically similar paraphrased answers well', () => {
      const model = 'The myelin sheath insulates axons to accelerate nerve impulse transmission.'
      const student = 'Myelin insulates axons and accelerates the transmission of nerve impulses.'
      const res = evaluateSemantically(student, model)
      expect(res.score).toBeGreaterThanOrEqual(0.6)
      expect(res.correct).toBe(true)
      expect(res.tierUsed).toBe('local')
    })

    it('penalizes negation mismatch', () => {
      const model = 'The cell membrane is permeable to water.'
      const affirmative = evaluateSemantically('The cell membrane is permeable to water molecules.', model)
      const negated = evaluateSemantically('The cell membrane is not permeable to water molecules.', model)
      expect(negated.score).toBeLessThan(affirmative.score)
    })
  })

  describe('evaluateStudentAnswer', () => {
    it('returns exact match immediately', async () => {
      const res = await evaluateStudentAnswer('What is ATP?', 'Adenosine triphosphate', 'adenosine triphosphate')
      expect(res.tierUsed).toBe('exact')
      expect(res.score).toBe(1)
      expect(res.quality).toBe(5)
    })

    it('calls electronAPI.evaluateAnswer when available and maps response', async () => {
      const mockEvaluate = jest.fn().mockResolvedValue({
        correct: true,
        score: 4.5,
        feedback: 'Great conceptual understanding.',
        matched_concepts: ['myelin', 'axon'],
        missing_concepts: ['saltatory']
      })
      ;(window as any).electronAPI = { evaluateAnswer: mockEvaluate }

      const res = await evaluateStudentAnswer(
        'What is myelin?',
        'Myelin insulates axons for saltatory conduction',
        'It insulates the axon'
      )

      expect(mockEvaluate).toHaveBeenCalled()
      expect(res.tierUsed).toBe('ai')
      expect(res.score).toBe(0.9)
      expect(res.quality).toBe(5)
      expect(res.diagnosticQuality).toBe(4)
      expect(res.matchedConcepts).toEqual(['myelin', 'axon'])
      expect(res.missingConcepts).toEqual(['saltatory'])
    })

    it('falls back to local evaluator if electronAPI.evaluateAnswer throws', async () => {
      const mockEvaluate = jest.fn().mockRejectedValue(new Error('Network error'))
      ;(window as any).electronAPI = { evaluateAnswer: mockEvaluate }

      const res = await evaluateStudentAnswer(
        'What is ATP?',
        'Adenosine triphosphate is the energy currency of the cell',
        'Energy currency of the cell called adenosine triphosphate'
      )

      expect(res.tierUsed).toBe('local')
      expect(res.score).toBeGreaterThan(0.5)
      expect(res.correct).toBe(true)
    })
  })
})
