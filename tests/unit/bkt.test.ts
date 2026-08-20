import { bktUpdate, masteryBand, DEFAULT_BKT_PARAMS } from '../../src/lib/bkt'

describe('BKT (Bayesian Knowledge Tracing)', () => {
  describe('bktUpdate', () => {
    it('increases mastery probability after a correct answer', () => {
      const prior = 0.3
      const posterior = bktUpdate(prior, true)
      expect(posterior).toBeGreaterThan(prior)
    })

    it('decreases mastery probability after an incorrect answer', () => {
      const prior = 0.8
      const posterior = bktUpdate(prior, false)
      expect(posterior).toBeLessThan(prior)
    })

    it('always returns a value within [0, 1]', () => {
      expect(bktUpdate(0.9999, true)).toBeLessThanOrEqual(1)
      expect(bktUpdate(0.0001, false)).toBeGreaterThanOrEqual(0)
      expect(bktUpdate(1.5, true)).toBeLessThanOrEqual(1)
      expect(bktUpdate(-1, false)).toBeGreaterThanOrEqual(0)
    })

    it('handles a prior at the numerical boundary without NaN', () => {
      const result = bktUpdate(1, true)
      expect(Number.isNaN(result)).toBe(false)
      expect(result).toBeLessThanOrEqual(1)
    })

    it('uses custom parameters', () => {
      const p = { pInit: 0.3, pLearn: 0.5, pSlip: 0, pGuess: 0 }
      // With no slip and no guess, a correct answer with pLearn=0.5 moves prior toward 1.
      const posterior = bktUpdate(0.3, true, p)
      expect(posterior).toBeGreaterThan(0.3)
    })
  })

  describe('masteryBand', () => {
    it('classifies low probability as weak', () => {
      expect(masteryBand(0.2)).toBe('weak')
      expect(masteryBand(0.44)).toBe('weak')
    })

    it('classifies mid probability as moderate', () => {
      expect(masteryBand(0.45)).toBe('moderate')
      expect(masteryBand(0.79)).toBe('moderate')
    })

    it('classifies high probability as strong', () => {
      expect(masteryBand(0.8)).toBe('strong')
      expect(masteryBand(1)).toBe('strong')
    })
  })

  it('exposes sensible default parameters', () => {
    expect(DEFAULT_BKT_PARAMS.pInit).toBeGreaterThan(0)
    expect(DEFAULT_BKT_PARAMS.pInit).toBeLessThan(1)
    expect(DEFAULT_BKT_PARAMS.pSlip).toBeGreaterThan(0)
    expect(DEFAULT_BKT_PARAMS.pGuess).toBeGreaterThan(0)
  })
})
