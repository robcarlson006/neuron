import {
  applyTemporalDeviationDecay,
  computeFSRS5Retrievability,
  decayMasteryBelief,
  isRefresherRecommended
} from '../../src/lib/memory/temporalDecay'

describe('Temporal Memory Decay Engine', () => {
  it('leaves rating deviation unchanged when elapsed days is 0', () => {
    const rd = applyTemporalDeviationDecay(100, 0)
    expect(rd).toBe(100)
  })

  it('inflates rating deviation as elapsed days increase', () => {
    const rdDay1 = applyTemporalDeviationDecay(80, 1)
    const rdDay10 = applyTemporalDeviationDecay(80, 10)
    const rdDay30 = applyTemporalDeviationDecay(80, 30)

    expect(rdDay1).toBeGreaterThan(80)
    expect(rdDay10).toBeGreaterThan(rdDay1)
    expect(rdDay30).toBeGreaterThan(rdDay10)
  })

  it('caps rating deviation at maxDeviation (default 350)', () => {
    const rdCapped = applyTemporalDeviationDecay(200, 500)
    expect(rdCapped).toBe(350)
  })

  it('computes FSRS-5 continuous power decay retrievability score correctly', () => {
    // At t=0, retrievability is 1.0
    expect(computeFSRS5Retrievability(0, 10)).toBe(1.0)

    // Over time, retrievability decays strictly monotonically
    const r5 = computeFSRS5Retrievability(5, 10)
    const r15 = computeFSRS5Retrievability(15, 10)
    const r50 = computeFSRS5Retrievability(50, 10)

    expect(r5).toBeLessThan(1.0)
    expect(r15).toBeLessThan(r5)
    expect(r50).toBeLessThan(r15)
    expect(r50).toBeGreaterThan(0.0)
  })

  it('decays BKT mastery belief towards baseline over elapsed days', () => {
    const initialMastery = 0.95
    const decayedAfter30Days = decayMasteryBelief(initialMastery, 30, 7)

    // Should decay towards baseline (0.3)
    expect(decayedAfter30Days).toBeLessThan(initialMastery)
    expect(decayedAfter30Days).toBeGreaterThanOrEqual(0.3)

    // With very high elapsed time, it continues decaying towards baseline
    const decayedAfter365Days = decayMasteryBelief(initialMastery, 365, 7)
    expect(decayedAfter365Days).toBeLessThan(decayedAfter30Days)
    expect(decayedAfter365Days).toBeLessThan(0.5)
  })

  it('identifies when a refresher diagnostic is recommended', () => {
    expect(isRefresherRecommended(120)).toBe(false)
    expect(isRefresherRecommended(190)).toBe(true)
    expect(isRefresherRecommended(350)).toBe(true)
  })
})
