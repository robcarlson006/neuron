import React from 'react'
import type { AchievementKey } from '../types'
import { ACHIEVEMENT_DEFS } from '../lib/achievements'

interface AchievementBadgeProps {
  achievementKey: AchievementKey
  unlocked: boolean
  unlockedAt?: string
  size?: 'sm' | 'md' | 'lg'
}

const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  achievementKey,
  unlocked,
  unlockedAt,
  size = 'md',
}) => {
  const def = ACHIEVEMENT_DEFS[achievementKey]
  if (!def) return null

  const iconSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl'
  const padding = size === 'sm' ? 'p-1.5' : size === 'lg' ? 'p-4' : 'p-2.5'

  return (
    <div
      className={`
        inline-flex items-center gap-2 rounded-xl transition-all duration-200
        ${unlocked
          ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800'
          : 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 opacity-50'
        }
        ${padding}
      `}
      title={`${def.title}: ${def.description}`}
      role="img"
      aria-label={`Achievement: ${def.title} - ${unlocked ? 'Unlocked' : 'Locked'}`}
    >
      <span className={iconSize} role="img" aria-hidden="true">
        {getIconEmoji(def.icon)}
      </span>
      <div className="flex flex-col">
        <span className={`font-semibold text-sm ${unlocked ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'}`}>
          {def.title}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {unlocked && unlockedAt
            ? `Unlocked ${new Date(unlockedAt).toLocaleDateString()}`
            : def.description}
        </span>
      </div>
    </div>
  )
}

function getIconEmoji(icon: string): string {
  const icons: Record<string, string> = {
    star: '⭐', sunrise: '\u{1F305}', moon: '\u{1F319}',
    award: '\u{1F396}️', flame: '\u{1F525}', zap: '⚡',
    crown: '\u{1F451}', brain: '\u{1F9E0}', 'graduation-cap': '\u{1F393}',
    'file-text': '\u{1F4DD}', robot: '\u{1F916}', target: '\u{1F3AF}',
    package: '\u{1F4E6}', lightning: '⚡', mountain: '⛰️',
    stars: '\u{1F31F}', sparkles: '✨', trophy: '\u{1F3C6}',
  }
  return icons[icon] || '\u{1F3C6}'
}

export default AchievementBadge
