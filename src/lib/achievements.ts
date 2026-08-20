import type { AchievementKey, AchievementDef } from '../types'

export const ACHIEVEMENT_DEFS: Record<AchievementKey, AchievementDef> = {
  first_review: {
    key: 'first_review',
    title: 'First Steps',
    description: 'Complete your first review',
    icon: 'star',
    xpReward: 10,
  },
  early_bird: {
    key: 'early_bird',
    title: 'Early Bird',
    description: 'Review before 8 AM for 7 days',
    icon: 'sunrise',
    xpReward: 50,
  },
  night_owl: {
    key: 'night_owl',
    title: 'Night Owl',
    description: 'Review after 11 PM for 7 days',
    icon: 'moon',
    xpReward: 50,
  },
  centurion: {
    key: 'centurion',
    title: 'Centurion',
    description: 'Review 100 cards in a single day',
    icon: 'award',
    xpReward: 100,
  },
  streak_7: {
    key: 'streak_7',
    title: 'Week Warrior',
    description: 'Maintain a 7-day study streak',
    icon: 'flame',
    xpReward: 75,
  },
  streak_30: {
    key: 'streak_30',
    title: 'Month Master',
    description: 'Maintain a 30-day study streak',
    icon: 'zap',
    xpReward: 200,
  },
  streak_365: {
    key: 'streak_365',
    title: 'Year of Knowledge',
    description: 'Study every day for a year',
    icon: 'crown',
    xpReward: 1000,
  },
  master_subject: {
    key: 'master_subject',
    title: 'Subject Sage',
    description: 'Get 90%+ mastery in any subject',
    icon: 'brain',
    xpReward: 150,
  },
  master_concept: {
    key: 'master_concept',
    title: 'Concept Guru',
    description: 'Master 10 concepts at 90%+',
    icon: 'graduation-cap',
    xpReward: 100,
  },
  deck_creator: {
    key: 'deck_creator',
    title: 'Card Creator',
    description: 'Create 100 cards',
    icon: 'file-text',
    xpReward: 50,
  },
  ai_cards_generated: {
    key: 'ai_cards_generated',
    title: 'AI Collaborator',
    description: 'Generate 50 cards with AI',
    icon: 'robot',
    xpReward: 75,
  },
  focus_warrior: {
    key: 'focus_warrior',
    title: 'Focus Warrior',
    description: 'Complete 10 focus sessions',
    icon: 'target',
    xpReward: 100,
  },
  import_enthusiast: {
    key: 'import_enthusiast',
    title: 'Import Explorer',
    description: 'Import cards from any external source',
    icon: 'package',
    xpReward: 30,
  },
  speed_demon: {
    key: 'speed_demon',
    title: 'Speed Demon',
    description: 'Average <5 seconds per card for 50+ reviews',
    icon: 'lightning',
    xpReward: 80,
  },
  persistence: {
    key: 'persistence',
    title: 'Never Give Up',
    description: 'Review a card 10+ times',
    icon: 'mountain',
    xpReward: 40,
  },
  level_5: {
    key: 'level_5',
    title: 'Getting Started',
    description: 'Reach level 5',
    icon: 'star',
    xpReward: 0,
  },
  level_10: {
    key: 'level_10',
    title: 'Dedicated Learner',
    description: 'Reach level 10',
    icon: 'stars',
    xpReward: 0,
  },
  level_25: {
    key: 'level_25',
    title: 'Knowledge Seeker',
    description: 'Reach level 25',
    icon: 'sparkles',
    xpReward: 0,
  },
  level_50: {
    key: 'level_50',
    title: 'Grand Master',
    description: 'Reach level 50',
    icon: 'trophy',
    xpReward: 0,
  },
}

export const XP_PER_LEVEL = 100

export function xpForLevel(level: number): number {
  return level * XP_PER_LEVEL
}

export function levelForXP(xp: number): { level: number; xpForNext: number; progress: number } {
  let level = 1
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level)
    level++
  }
  return {
    level,
    xpForNext: xpForLevel(level),
    progress: xp / xpForLevel(level),
  }
}
