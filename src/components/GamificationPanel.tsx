import React, { useEffect, useState } from 'react'
import type { Achievement, UserLevel, DailyQuest, AchievementKey } from '../types'
import { ACHIEVEMENT_DEFS } from '../lib/achievements'
import LevelBadge from './LevelBadge'
import AchievementBadge from './AchievementBadge'

interface GamificationPanelProps {
  isOpen: boolean
  onClose: () => void
  userId: number
}

const GamificationPanel: React.FC<GamificationPanelProps> = ({ isOpen, onClose, userId }) => {
  const [userLevel, setUserLevel] = useState<UserLevel | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [quests, setQuests] = useState<DailyQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'progress' | 'achievements' | 'quests'>('progress')

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !userId) return
    const fetchData = async () => {
      setLoading(true)
      try {
        const api = (window as any).electronAPI
        if (!api) return
        const [level, ach, qs] = await Promise.all([
          api.getUserLevel(userId),
          api.getAchievements(userId),
          api.getDailyQuests(userId),
        ])
        setUserLevel(level)
        setAchievements(ach)
        setQuests(qs)
      } catch (err) {
        console.error('Failed to load gamification data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [isOpen, userId])

  if (!isOpen) return null

  const achievementCount = Object.keys(ACHIEVEMENT_DEFS).length
  const unlockedKeys = new Set(achievements.map((a) => a.achievement_key))
  const unlockedMap = new Map(achievements.map((a) => [a.achievement_key, a.unlocked_at]))
  const completedQuests = quests.filter((q) => q.completed === 1)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Your progress and achievements"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold dark:text-white">Your Progress</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading progress...</div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700">
              {(['progress', 'achievements', 'quests'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                    activeTab === tab
                      ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab === 'quests' ? 'Daily Quests' : tab}
                </button>
              ))}
            </div>

            {/* Progress Tab */}
            {activeTab === 'progress' && userLevel && (
              <div className="space-y-4">
                <LevelBadge xp={userLevel.xp} level={userLevel.level} size="lg" />
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-center">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{achievements.length}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Achievements</div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-center">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{completedQuests.length}/{quests.length}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Quests Today</div>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-center">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{userLevel.level}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Current Level</div>
                  </div>
                </div>
              </div>
            )}

            {/* Achievements Tab */}
            {activeTab === 'achievements' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {achievements.length} of {achievementCount} unlocked
                </p>
                <div className="grid gap-2">
                  {Object.entries(ACHIEVEMENT_DEFS).map(([key]) => (
                    <AchievementBadge
                      key={key}
                      achievementKey={key as AchievementKey}
                      unlocked={unlockedKeys.has(key)}
                      unlockedAt={unlockedMap.get(key)}
                      size="sm"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Daily Quests Tab */}
            {activeTab === 'quests' && (
              <div className="space-y-3">
                {quests.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No quests today. Complete some reviews to generate quests!
                  </p>
                ) : (
                  quests.map((quest) => (
                    <div
                      key={quest.id}
                      className={`p-4 rounded-xl border ${
                        quest.completed === 1
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className={`font-semibold text-sm ${quest.completed === 1 ? 'text-green-700 dark:text-green-300' : 'dark:text-white'}`}>
                            {quest.title}
                          </h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {quest.description}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-medium ${quest.completed === 1 ? 'text-green-600' : 'text-purple-600 dark:text-purple-400'}`}>
                            +{quest.xp_reward} XP
                          </span>
                        </div>
                      </div>
                      {/* Progress bar for non-completed quests */}
                      {quest.completed !== 1 && (
                        <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (quest.progress / quest.required) * 100)}%` }}
                          />
                        </div>
                      )}
                      {quest.completed === 1 && (
                        <div className="mt-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          Completed!
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default GamificationPanel
