import React from 'react'
import { levelForXP } from '../lib/achievements'

interface LevelBadgeProps {
  xp: number
  level: number
  size?: 'sm' | 'md' | 'lg'
}

const LevelBadge: React.FC<LevelBadgeProps> = ({ xp, level, size = 'md' }) => {
  const { xpForNext, progress } = levelForXP(xp)
  const barHeight = size === 'sm' ? 'h-1' : size === 'lg' ? 'h-2.5' : 'h-1.5'

  return (
    <div className="flex items-center gap-3">
      {/* Level circle */}
      <div className={`
        flex items-center justify-center rounded-full font-bold text-white
        bg-gradient-to-br from-purple-500 to-violet-600
        ${size === 'sm' ? 'w-8 h-8 text-sm' : size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-base'}
      `}>
        {level}
      </div>

      {/* XP bar */}
      <div className="flex-1 min-w-[100px]">
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Level {level}</span>
          <span>{xp} / {xpForNext} XP</span>
        </div>
        <div className={`${barHeight} bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden`}>
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export default LevelBadge
