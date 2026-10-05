import { buildTutorAssessmentPrompt, parseTutorAssessment } from '../../src/lib/tutorAssessment'

describe('teach-back assessment parsing', () => {
  it('parses a passing independent teach-back with rubric evidence', () => {
    const assessment = parseTutorAssessment(JSON.stringify({
      outcome: 'correct', score: 0.9, confidence: 0.85, assistance_level: 'none',
      task_type: 'teach_back', teach_back_status: 'passed', own_words: true,
      missing_elements: []
    }), 12, 'Photosynthesis', 'turn-1', 'message-1')

    expect(assessment.taskType).toBe('teach_back')
    expect(assessment.teachBackStatus).toBe('passed')
    expect(assessment.ownWords).toBe(true)
    expect(assessment.missingElements).toEqual([])
  })

  it('preserves targeted revision feedback for an incomplete teach-back', () => {
    const assessment = parseTutorAssessment(JSON.stringify({
      outcome: 'partial', score: 0.4, confidence: 0.8, assistance_level: 'hint',
      teach_back_status: 'needs_revision', own_words: true,
      missing_elements: ['Explain how light energy becomes chemical energy', 5]
    }), 12, 'Photosynthesis', 'turn-2')

    expect(assessment.teachBackStatus).toBe('needs_revision')
    expect(assessment.missingElements).toEqual(['Explain how light energy becomes chemical energy'])
  })

  it('leaves malformed rubric output unassessed', () => {
    const assessment = parseTutorAssessment('not json', 12, 'Photosynthesis', 'turn-3')
    expect(assessment.outcome).toBe('unassessed')
    expect(assessment.assistanceLevel).toBe('unassessed')
    expect(assessment.teachBackStatus).toBeUndefined()
  })

  it('requests the universal teach-back rubric only when required', () => {
    const prompt = buildTutorAssessmentPrompt('Explain it back.', 'It turns light into stored energy.', 'Photosynthesis', { isTeachBack: true })
    expect(prompt).toContain('central mechanism')
    expect(prompt).toContain('own words')
    expect(prompt).toContain('example or implication')
    expect(prompt).toContain('teach_back_status')
  })
})
