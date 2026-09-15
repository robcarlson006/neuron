import {
  updateRating,
  difficultyToItemRating,
  getCompetencyBand,
  getConfidenceInterval,
  type StudentRatingProfile
} from '../../src/lib/memory/glicko2RatingEngine'

describe('Glicko-2 Rating Engine', () => {
  const initialProfile: StudentRatingProfile = {
    rating: 1500,
    ratingDeviation: 350,
    volatility: 0.06
  }

  it('maps 1-5 difficulty levels to calibrated item ratings', () => {
    expect(difficultyToItemRating(1)).toBe(1100)
    expect(difficultyToItemRating(2)).toBe(1300)
    expect(difficultyToItemRating(3)).toBe(1500)
    expect(difficultyToItemRating(4)).toBe(1700)
    expect(difficultyToItemRating(5)).toBe(1900)
    // Clamping checks
    expect(difficultyToItemRating(0)).toBe(1100)
    expect(difficultyToItemRating(10)).toBe(1900)
  })

  it('correctly updates rating and narrows deviation after a win on an equal-level item', () => {
    const updated = updateRating(initialProfile, [
      { itemDifficulty: 3, score: 1.0 }
    ])

    // Should gain rating and decrease uncertainty
    expect(updated.rating).toBeGreaterThan(1500)
    expect(updated.ratingDeviation).toBeLessThan(350)
  })

  it('awards higher rating gains for beating a hard item vs an easy item', () => {
    const hardWin = updateRating(initialProfile, [
      { itemDifficulty: 5, score: 1.0 } // 1900 opponent
    ])
    const easyWin = updateRating(initialProfile, [
      { itemDifficulty: 1, score: 1.0 } // 1100 opponent
    ])

    expect(hardWin.rating).toBeGreaterThan(easyWin.rating)
  })

  it('penalizes rating more heavily for failing an easy item vs a hard item', () => {
    const establishedProfile: StudentRatingProfile = {
      rating: 1600,
      ratingDeviation: 100,
      volatility: 0.06
    }

    const failedEasy = updateRating(establishedProfile, [
      { itemDifficulty: 1, score: 0.0 }
    ])
    const failedHard = updateRating(establishedProfile, [
      { itemDifficulty: 5, score: 0.0 }
    ])

    expect(failedEasy.rating).toBeLessThan(failedHard.rating)
  })

  it('returns unchanged profile if no outcomes are provided', () => {
    const unchanged = updateRating(initialProfile, [])
    expect(unchanged).toEqual(initialProfile)
  })

  it('maps ratings to intuitive human-facing competency bands', () => {
    expect(getCompetencyBand(1050)).toBe('Novice')
    expect(getCompetencyBand(1320)).toBe('Developing')
    expect(getCompetencyBand(1580)).toBe('Competent')
    expect(getCompetencyBand(1820)).toBe('Proficient')
    expect(getCompetencyBand(2100)).toBe('Master')
  })

  it('computes 95% confidence intervals accurately', () => {
    const [low, high] = getConfidenceInterval(1600, 60)
    expect(low).toBe(1480)
    expect(high).toBe(1720)
  })
})
