import { hasSufficientEvidence, lexicalScore, rankLexicalCandidates, normalizeFormula } from '../../src/lib/groundedRetrieval'

describe('grounded retrieval fallback', () => {
  it('ranks source passages by query term coverage and phrase match', () => {
    const result = rankLexicalCandidates('elasticity formula', [
      { text: 'The elasticity formula measures responsiveness.', materialId: 1, materialName: 'Notes', chunkIndex: 0 },
      { text: 'A historical introduction to markets.', materialId: 1, materialName: 'Notes', chunkIndex: 1 }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].matchedTerms).toEqual(expect.arrayContaining(['elasticity', 'formula']))
    expect(hasSufficientEvidence(result)).toBe(true)
  })

  it('does not claim evidence for unrelated passages', () => {
    expect(lexicalScore('mitosis', 'A paragraph about supply and demand').score).toBe(0)
    expect(hasSufficientEvidence(rankLexicalCandidates('mitosis', [
      { text: 'A paragraph about supply and demand', materialId: 1, materialName: 'Notes', chunkIndex: 0 }
    ]))).toBe(false)
  })

  it('matches exact formulas with short variables and operators', () => {
    const result = rankLexicalCandidates('F = ma', [
      { text: "Newton's second law: F = ma", materialId: 1, materialName: 'Formula sheet', chunkIndex: 0 },
      { text: 'A historical introduction to markets.', materialId: 1, materialName: 'Formula sheet', chunkIndex: 1 }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].score).toBeGreaterThanOrEqual(0.75)
    expect(result[0].matchedTerms).toContain('formula:f=ma')
  })

  it('normalizes common LaTeX formula variants', () => {
    expect(normalizeFormula('$$ F = \\frac{m}{a} \\cdot v $$')).toBe('f=(m)/(a)*v')
  })
})
