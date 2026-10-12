import { hasSufficientEvidence, lexicalScore, rankLexicalCandidates, normalizeFormula } from '../../src/lib/groundedRetrieval'
import { retrieveGroundedEvidence, setGroundedDatabase } from '../../electron/ipc/groundedHandlers'

const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any }

describe('grounded retrieval fallback', () => {
  it('retrieves evidence from every selected material when the legacy first ID is also supplied', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE materials (id INTEGER PRIMARY KEY, subject_id INTEGER, filename TEXT, content_text TEXT);
      CREATE TABLE embeddings (material_id INTEGER, chunk_index INTEGER, chunk_text TEXT, embedding BLOB);
      INSERT INTO materials VALUES
        (1, 7, 'Lecture 1.pptx', 'Scarcity means limited resources require choices.'),
        (2, 7, 'Chapter 1.pdf', 'Marginal analysis compares the additional benefit and cost.'),
        (3, 7, 'Transcript 1.md', 'Opportunity cost is the next best alternative forgone.');
    `)
    setGroundedDatabase(db)

    const evidence = retrieveGroundedEvidence('marginal analysis additional benefit', 7, 1, [1, 2, 3])

    expect(evidence.map(item => item.materialId)).toContain(2)
    expect(evidence.some(item => item.text.includes('Marginal analysis'))).toBe(true)
    db.close()
  })

  it('preserves single-material retrieval when no plural scope is supplied', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE materials (id INTEGER PRIMARY KEY, subject_id INTEGER, filename TEXT, content_text TEXT);
      CREATE TABLE embeddings (material_id INTEGER, chunk_index INTEGER, chunk_text TEXT, embedding BLOB);
      INSERT INTO materials VALUES (1, 7, 'Lecture 1.md', 'Scarcity concerns limited resources and choices.');
    `)
    setGroundedDatabase(db)
    const evidence = retrieveGroundedEvidence('scarcity limited resources', 7, 1)
    expect(evidence).toHaveLength(1)
    expect(evidence[0].materialId).toBe(1)
    db.close()
  })

  it('searches selected materials outside the first document when some sources already have embeddings', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE materials (id INTEGER PRIMARY KEY, subject_id INTEGER, filename TEXT, content_text TEXT);
      CREATE TABLE embeddings (material_id INTEGER, chunk_index INTEGER, chunk_text TEXT, embedding BLOB);
      INSERT INTO materials VALUES
        (1, 7, 'Lecture 1.pptx', 'Scarcity means limited resources require choices.'),
        (2, 7, 'Chapter 1.pdf', 'Marginal analysis compares additional benefit with additional cost.'),
        (3, 7, 'Transcript 1.md', 'Opportunity cost is the next best alternative forgone.');
      INSERT INTO embeddings VALUES (1, 0, 'Scarcity means limited resources require choices.', NULL);
    `)
    setGroundedDatabase(db)
    const evidence = retrieveGroundedEvidence('marginal analysis additional benefit', 7, 1, [1, 2, 3])
    expect(evidence.some(item => item.materialId === 2 && item.text.includes('Marginal analysis'))).toBe(true)
    db.close()
  })

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
