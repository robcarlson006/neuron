import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import ProgressChart from '../components/ProgressChart'
import LatexText from '../components/LatexText'
import AnalyticsOverview from '../components/analytics/AnalyticsOverview'
import ConceptCoverageTracker from '../components/analytics/ConceptCoverageTracker'
import type { ReviewLog, Card, MCStats, RetentionForecastPoint, CompletedTaskStats, AnalyticsSnapshot } from '../types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface ReviewDataPoint {
  date: string
  reviews: number
  correct: number
  incorrect: number
}

interface WeakCard extends Card {
  avg_quality: number
}

export default function Analytics(): React.JSX.Element {
  const { user, subjects } = useAppStore()
  const [activeTab, setActiveTab] = useState<'overview' | 'concepts'>('overview')
  const [reviewData, setReviewData] = useState<ReviewDataPoint[]>([])
  const [weakCards, setWeakCards] = useState<WeakCard[]>([])
  const [masteryBySubject, setMasteryBySubject] = useState<{ name: string; mastery: number; total: number; mastered: number }[]>([])
  const [streak, setStreak] = useState(0)
  const [totalReviews, setTotalReviews] = useState(0)
  const [correctRate, setCorrectRate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [chartType, setChartType] = useState<'area' | 'bar'>('bar')
  const [mcStats, setMCStats] = useState<MCStats>({ total: 0, correct: 0 })
  const [avgResponseMs, setAvgResponseMs] = useState<number | null>(null)
  const [forecast, setForecast] = useState<RetentionForecastPoint[]>([])
  const [subjectRetention, setSubjectRetention] = useState<{ subject_id: number; retention: number; count: number }[]>([])
  const [completedStats, setCompletedStats] = useState<CompletedTaskStats>({
    completedTasksCount: 0,
    completedTopicsCount: 0,
    completedSessionsCount: 0,
    totalCompleted: 0
  })

  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90>(30)
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState<AnalyticsSnapshot | null>(null)

  useEffect(() => {
    if (user) loadAnalytics()
  }, [user, subjects, analyticsDays])

  useEffect(() => {
    if (!window.electronAPI?.onConceptLearningStateChanged) return
    const unsubscribe = window.electronAPI.onConceptLearningStateChanged(({ subjectId }) => {
      if (subjects.some(subject => subject.id === subjectId)) void loadAnalytics()
    })
    return () => { if (typeof unsubscribe === 'function') unsubscribe() }
  }, [subjects, user, analyticsDays])

  async function loadAnalytics(): Promise<void> {
    if (!user) return
    setLoading(true)
    try {
      const logs = await window.electronAPI.getReviewLogs(user.id, 30) as ReviewLog[]
      const snapshot = await window.electronAPI.getAnalyticsSnapshot(user.id, analyticsDays)
      setAnalyticsSnapshot(snapshot)
      setTotalReviews(logs.length)
      const correctCount = logs.filter(l => l.was_correct).length
      setCorrectRate(logs.length > 0 ? Math.round((correctCount / logs.length) * 100) : 0)

      const dayMap = new Map<string, { reviews: number; correct: number; incorrect: number }>()
      logs.forEach(log => {
        const date = log.reviewed_at.split('T')[0]
        const existing = dayMap.get(date) || { reviews: 0, correct: 0, incorrect: 0 }
        dayMap.set(date, {
          reviews: existing.reviews + 1,
          correct: existing.correct + (log.was_correct ? 1 : 0),
          incorrect: existing.incorrect + (log.was_correct ? 0 : 1)
        })
      })

      const points: ReviewDataPoint[] = []
      for (let i = 29; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        const data = dayMap.get(dateStr) || { reviews: 0, correct: 0, incorrect: 0 }
        points.push({ date: dateStr, ...data })
      }
      setReviewData(points)

      const streakData = await window.electronAPI.getStreakData(user.id)
      let s = 0
      const today = new Date().toISOString().split('T')[0]
      let check = today
      for (const d of streakData) {
        if (d.date === check) {
          s++
          const prev = new Date(check)
          prev.setDate(prev.getDate() - 1)
          check = prev.toISOString().split('T')[0]
        } else break
      }
      setStreak(s)

      const masteryStats = await window.electronAPI.getMasteryStats(user.id) as { subject_id: number; interval: number }[]
      const subjectMastery = subjects.map(sub => {
        const cards = masteryStats.filter(m => m.subject_id === sub.id)
        const mastered = cards.filter(m => m.interval >= 21).length
        return {
          name: sub.name,
          total: cards.length,
          mastered,
          mastery: cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0
        }
      })
      setMasteryBySubject(subjectMastery)

      const weak = await window.electronAPI.getWeakestCards(user.id, 10) as WeakCard[]
      setWeakCards(weak)

      const mc = await window.electronAPI.getMCStats(user.id, 30)
      setMCStats(mc)

      const rtResult = await window.electronAPI.getAvgResponseTime(user.id)
      setAvgResponseMs(rtResult.avg_ms)

      const fc = await window.electronAPI.getRetentionForecast(user.id, 30)
      setForecast(fc)
      const sr = await window.electronAPI.getCurrentRetentionBySubject(user.id)
      setSubjectRetention(sr)

      // Fetch completed tasks stats
      try {
        const comp = await (window.electronAPI.getCompletedTaskStats?.(user.id) ||
          window.electronAPI.planGetCompletedTaskStats?.(user.id))
        if (comp) {
          setCompletedStats(comp)
        }
      } catch (err) {
        console.error('Failed to load completed task stats:', err)
      }

    } catch (err) {
      console.error('Analytics load error:', err)
    } finally {
      setLoading(false)
    }
  }



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading analytics...</p>
        </div>
      </div>
    )
  }

  const totalMastered = masteryBySubject.reduce((a, b) => a + b.mastered, 0)
  const thisWeekReviews = reviewData.slice(-7).reduce((a, b) => a + b.reviews, 0)

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full page-enter min-w-0 overflow-x-hidden">
      {/* Header & Tab Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-5 border-b border-slate-100 dark:border-slate-800 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track study activity and inspect concept progress from recorded assessment evidence.
          </p>
        </div>

        {/* Tab Controls: Activity overview and concept evidence */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs self-start sm:self-auto max-w-full overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>📊</span>
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('concepts')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'concepts'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>🧭</span>
            <span>Concept evidence</span>
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Time window</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Compare activity with the previous period.</p>
        </div>
        <div className="flex w-fit items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Analytics time window">
          {[7, 30, 90].map(days => (
            <button
              key={days}
              onClick={() => setAnalyticsDays(days as 7 | 30 | 90)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 ${analyticsDays === days ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}
              aria-pressed={analyticsDays === days}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && analyticsSnapshot && (
        <AnalyticsOverview
          snapshot={analyticsSnapshot}
          subjects={subjects}
          weakCards={weakCards}
          forecast={forecast}
            onOpenMastery={() => setActiveTab('concepts')}
        />
      )}

      {/* Legacy overview markup retained below as a compatibility reference while the new cockpit is validated. */}
      {false && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-8">
        <StatCard
          value={completedStats.totalCompleted || completedStats.completedTasksCount}
          label="Tasks Completed"
          color="violet"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <StatCard
          value={totalMastered}
          label="Mature flashcards (21+ day interval)"
          color="emerald"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 9L7 13L15 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <StatCard
          value={`${correctRate}%`}
          label="Correct Rate"
          color="blue"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M6 9L8 11L12 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <StatCard
          value={thisWeekReviews}
          label="Reviews This Week"
          color="slate"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M6 2V4M12 2V4M2 8H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          value={streak}
          label="Day Streak"
          color="amber"
          suffix=" 🔥"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 2C9 2 11 5 11 8C11 9.5 10.5 10.5 9.5 11.5C9.8 10.5 9.5 9 8.5 8C8.5 8 8 10 6.5 11C5.5 12 5 13 5 14C5 16.2 6.8 17 9 17C11.2 17 13 15.8 13 14C13 11 9 8 9 2Z" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <StatCard
          value={avgResponseMs == null ? '—' : `${((avgResponseMs as number) / 1000).toFixed(1)}s`}
          label="Avg Response Time"
          color="slate"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M9 5V9L12 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      </div>}

      {/* TAB 1: OVERVIEW */}
      {false && activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Completed Milestones Banner */}
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-2xl border border-violet-200 dark:border-violet-800/60 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-violet-600 text-white flex items-center justify-center text-xl shadow-sm flex-shrink-0">
                ✓
              </div>
              <div>
                <h2 className="text-base font-bold text-violet-950 dark:text-violet-100">
                  {completedStats.completedTasksCount} Focus Block {completedStats.completedTasksCount === 1 ? 'Task' : 'Tasks'} Completed
                </h2>
                <p className="text-xs text-violet-700 dark:text-violet-300 mt-0.5">
                  {completedStats.completedTopicsCount} syllabus topics marked complete · {completedStats.completedSessionsCount} AI tutor sessions finished
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('concepts')}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm self-stretch md:self-auto justify-center"
            >
              <span>View Concept Evidence</span>
              <span>→</span>
            </button>
          </div>

          {/* Review History Chart */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Review History</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Last 30 days · {totalReviews} total reviews</p>
              </div>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg p-1">
                <button
                  onClick={() => setChartType('bar')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors font-medium ${
                    chartType === 'bar'
                      ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  Bar
                </button>
                <button
                  onClick={() => setChartType('area')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors font-medium ${
                    chartType === 'area'
                      ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  Area
                </button>
              </div>
            </div>
            {reviewData.some(d => d.reviews > 0) ? (
              <ProgressChart data={reviewData} type={chartType} />
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="12" width="4" height="8" rx="1" fill="currentColor" className="text-slate-300 dark:text-slate-600" />
                    <rect x="10" y="7" width="4" height="13" rx="1" fill="currentColor" className="text-slate-200 dark:text-slate-700" />
                    <rect x="17" y="3" width="4" height="17" rx="1" fill="currentColor" className="text-slate-100 dark:text-slate-700" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400 dark:text-slate-500">No review data yet.</p>
                <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Start studying to see your progress here!</p>
              </div>
            )}
          </div>

          {/* Retention Forecast — FSRS */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Retention Forecast</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Predicted average recall probability over the next 30 days (FSRS-5)
                </p>
              </div>
              {forecast.length > 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Today: <span className="font-semibold text-violet-600 dark:text-violet-400">
                    {Math.round((forecast[0]?.retention ?? 0) * 100)}%
                  </span>
                </p>
              )}
            </div>
            {forecast.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-10 text-center">
                Review a few cards to unlock retention forecasting.
              </p>
            ) : (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={forecast.map(p => ({ date: p.date.slice(5), retention: Math.round(p.retention * 100) }))}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <ReferenceLine y={90} stroke="#a78bfa" strokeDasharray="3 3" label={{ value: 'Target', fontSize: 10, fill: '#a78bfa' }} />
                    <Line type="monotone" dataKey="retention" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Subject retention snapshot */}
          {subjectRetention.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Current Retention by Subject</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Predicted recall probability right now</p>
              </div>
              <div className="space-y-3">
                {subjectRetention.map(sr => {
                  const sub = subjects.find(s => s.id === sr.subject_id)
                  const pct = Math.round(sr.retention * 100)
                  return (
                    <div key={sr.subject_id} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-44 truncate">{sub?.name ?? `Subject ${sr.subject_id}`}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: `hsl(${Math.round(sr.retention * 120)}, 65%, 50%)` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-12 text-right tabular-nums">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Multiple Choice Stats */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Multiple Choice Practice</h2>
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium">Last 30 days</span>
            </div>
            {mcStats.total === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-3">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="4" width="16" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" className="text-blue-400 dark:text-blue-500" fill="none" />
                    <circle cx="6.5" cy="10.5" r="1.5" fill="currentColor" className="text-blue-400 dark:text-blue-500" />
                    <path d="M10 10.5H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-blue-400 dark:text-blue-500" />
                    <circle cx="6.5" cy="14" r="1.5" fill="currentColor" className="text-blue-300 dark:text-blue-600" />
                    <path d="M10 14H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-blue-300 dark:text-blue-600" />
                  </svg>
                </div>
                <p className="text-sm text-slate-400 dark:text-slate-500">No multiple choice practice yet.</p>
                <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Use the Multiple Choice mode to practice without affecting your schedule.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{mcStats.total}</div>
                  <div className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-1">Questions Answered</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{mcStats.correct}</div>
                  <div className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-1">Correct</div>
                </div>
                <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-4 border border-violet-100 dark:border-violet-800">
                  <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                    {mcStats.total > 0 ? Math.round((mcStats.correct / mcStats.total) * 100) : 0}%
                  </div>
                  <div className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-1">MC Accuracy</div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom grid: Card intervals + weak cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mature card schedules by subject */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Mature flashcards by subject</h2>
                <button
                  onClick={() => setActiveTab('concepts')}
                  className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium hover:underline"
                >
                  View concept evidence →
                </button>
              </div>
              {masteryBySubject.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">No subjects yet.</p>
              ) : (
                <div className="space-y-5">
                  {masteryBySubject.map(s => (
                    <div key={s.name}>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate pr-3">{s.name}</span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {s.total ? `${s.mastery}%` : 'No reviews'}
                        </span>
                      </div>
                      {s.total > 0 && <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${s.mastery}%` }}
                        />
                      </div>}
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        {s.mastered} of {s.total} cards have a 21+ day interval
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Weakest cards */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">Cards Needing Attention</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">Your 10 lowest-rated cards</p>
              {weakCards.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    Review some cards to see which ones need work.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {weakCards.map(card => (
                    <div
                      key={card.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1"><LatexText forceInline>{card.front}</LatexText></div>
                      <div className="flex gap-0.5 flex-shrink-0">
                        {[1, 2, 3, 4, 5].map(star => (
                          <span
                            key={star}
                            className={`text-xs ${
                              star <= Math.round(card.avg_quality || 0)
                                ? 'text-amber-400'
                                : 'text-slate-200 dark:text-slate-600'
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'concepts' && <ConceptCoverageTracker subjects={subjects} userId={user?.id} />}
    </div>
  )
}

function StatCard({
  value,
  label,
  color,
  suffix,
  icon
}: {
  value: number | string
  label: string
  color: 'emerald' | 'amber' | 'slate' | 'violet' | 'blue'
  suffix?: string
  icon?: React.ReactNode
}): React.JSX.Element {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-500 dark:text-amber-400',
    slate: 'text-slate-700 dark:text-slate-300',
    violet: 'text-violet-600 dark:text-violet-400',
    blue: 'text-blue-600 dark:text-blue-400'
  }

  const iconBgMap: Record<string, string> = {
    emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400',
    slate: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
    violet: 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 flex flex-col justify-between min-w-0">
      {icon && (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${iconBgMap[color]}`}>
          {icon}
        </div>
      )}
      <div>
        <div className={`text-2xl font-bold tracking-tight ${colorMap[color]}`}>
          {value}{suffix}
        </div>
        <div className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-1 leading-tight">{label}</div>
      </div>
    </div>
  )
}
