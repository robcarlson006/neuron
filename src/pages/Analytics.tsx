import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import ProgressChart from '../components/ProgressChart'
import type { ReviewLog, Card, MCStats, ConceptMastery, RetentionForecastPoint, CompletedTaskStats } from '../types'
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

export interface TopicMasteryItem {
  id: string
  title: string
  subjectId: number
  subjectName: string
  subjectColor?: string
  score: number // 1 - 100
  band: 'mastered' | 'proficient' | 'developing' | 'struggling'
  observations: number
  source: 'concept' | 'syllabus' | 'card'
  statusLabel: string
}

export interface SubjectMasteryScore {
  id: number
  name: string
  color?: string
  score: number // 1 - 100
  totalTopics: number
  masteredTopics: number
  averageRetention: number
  totalCards: number
  masteredCards: number
}

export default function Analytics(): React.JSX.Element {
  const navigate = useNavigate()
  const { user, subjects } = useAppStore()
  const [activeTab, setActiveTab] = useState<'overview' | 'mastery'>('overview')
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
  const [concepts, setConcepts] = useState<ConceptMastery[]>([])
  const [completedStats, setCompletedStats] = useState<CompletedTaskStats>({
    completedTasksCount: 0,
    completedTopicsCount: 0,
    completedSessionsCount: 0,
    totalCompleted: 0
  })

  // Topic Mastery tab states
  const [topicMasteryList, setTopicMasteryList] = useState<TopicMasteryItem[]>([])
  const [subjectMasteryScores, setSubjectMasteryScores] = useState<SubjectMasteryScore[]>([])
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<number | 'all'>('all')
  const [topicSearchQuery, setTopicSearchQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<'all' | 'mastered' | 'proficient' | 'developing' | 'struggling'>('all')
  const [sortBy, setSortBy] = useState<'lowest' | 'highest' | 'name' | 'reviews'>('lowest')

  useEffect(() => {
    if (user) loadAnalytics()
  }, [user, subjects])

  async function loadAnalytics(): Promise<void> {
    if (!user) return
    setLoading(true)
    try {
      const logs = await window.electronAPI.getReviewLogs(user.id, 30) as ReviewLog[]
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
      const cm = await window.electronAPI.getConceptMastery(user.id)
      setConcepts(cm)

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

      // Build 1-100 Subject Mastery and Topic Mastery List
      const collectedTopics: TopicMasteryItem[] = []
      const collectedSubjectScores: SubjectMasteryScore[] = []

      for (const sub of subjects) {
        const subConcepts = (cm || []).filter(c => c.subject_id === sub.id)
        const subSyllabusTopics: { id: number; title: string; completed?: boolean; studied?: boolean }[] = []
        if (window.electronAPI.syllabusListModules) {
          try {
            const mods = await window.electronAPI.syllabusListModules(sub.id)
            for (const mod of (mods || [])) {
              if (window.electronAPI.syllabusListTopics) {
                const tops = await window.electronAPI.syllabusListTopics(mod.id, user.id)
                if (Array.isArray(tops)) {
                  subSyllabusTopics.push(...tops)
                }
              }
            }
          } catch { /* ignore */ }
        }

        const seenTitles = new Set<string>()
        const topicsForSub: TopicMasteryItem[] = []

        for (const c of subConcepts) {
          const rawScore = Math.round((c.mastery_prob || 0.3) * 100)
          const score = Math.min(Math.max(rawScore, 1), 100)
          seenTitles.add(c.concept.trim().toLowerCase())

          let band: TopicMasteryItem['band'] = 'developing'
          let statusLabel = 'Developing'
          if (score >= 85) {
            band = 'mastered'
            statusLabel = 'Mastered'
          } else if (score >= 70) {
            band = 'proficient'
            statusLabel = 'Proficient'
          } else if (score < 50) {
            band = 'struggling'
            statusLabel = 'Needs Review'
          }

          topicsForSub.push({
            id: `concept-${c.id || c.concept}`,
            title: c.concept,
            subjectId: sub.id,
            subjectName: sub.name,
            subjectColor: sub.color,
            score,
            band,
            observations: c.observations || 1,
            source: 'concept',
            statusLabel
          })
        }

        for (const st of subSyllabusTopics) {
          const key = st.title.trim().toLowerCase()
          if (!seenTitles.has(key)) {
            seenTitles.add(key)
            const isDone = Boolean(st.completed || st.studied)
            const score = isDone ? 80 : 30
            const band: TopicMasteryItem['band'] = isDone ? 'proficient' : 'developing'
            const statusLabel = isDone ? 'Studied' : 'Initial Assessment'

            topicsForSub.push({
              id: `topic-${st.id}`,
              title: st.title,
              subjectId: sub.id,
              subjectName: sub.name,
              subjectColor: sub.color,
              score,
              band,
              observations: isDone ? 1 : 0,
              source: 'syllabus',
              statusLabel
            })
          }
        }

        const cards = (masteryStats || []).filter(m => m.subject_id === sub.id)
        const masteredCards = cards.filter(m => m.interval >= 21).length
        const cardMasteryPct = cards.length > 0 ? Math.round((masteredCards / cards.length) * 100) : 0
        const retObj = (sr || []).find(r => r.subject_id === sub.id)
        const avgRetention = retObj ? Math.round(retObj.retention * 100) : (cardMasteryPct || 0)

        let subjectScore = 0
        if (topicsForSub.length > 0) {
          const avgTopicScore = Math.round(
            topicsForSub.reduce((acc, t) => acc + t.score, 0) / topicsForSub.length
          )
          if (cards.length > 0) {
            subjectScore = Math.round(avgTopicScore * 0.6 + Math.max(cardMasteryPct, avgRetention) * 0.4)
          } else {
            subjectScore = avgTopicScore
          }
        } else if (cards.length > 0) {
          subjectScore = Math.max(cardMasteryPct, avgRetention)
        } else {
          subjectScore = 50
        }
        subjectScore = Math.min(Math.max(subjectScore, 1), 100)

        collectedTopics.push(...topicsForSub)
        collectedSubjectScores.push({
          id: sub.id,
          name: sub.name,
          color: sub.color,
          score: subjectScore,
          totalTopics: topicsForSub.length,
          masteredTopics: topicsForSub.filter(t => t.score >= 85).length,
          averageRetention: avgRetention,
          totalCards: cards.length,
          masteredCards
        })
      }

      setTopicMasteryList(collectedTopics)
      setSubjectMasteryScores(collectedSubjectScores)
    } catch (err) {
      console.error('Analytics load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredTopics = useMemo(() => {
    return topicMasteryList
      .filter(t => {
        if (selectedSubjectFilter !== 'all' && t.subjectId !== selectedSubjectFilter) {
          return false
        }
        if (tierFilter !== 'all' && t.band !== tierFilter) {
          return false
        }
        if (topicSearchQuery.trim()) {
          const q = topicSearchQuery.toLowerCase()
          return t.title.toLowerCase().includes(q) || t.subjectName.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'lowest') return a.score - b.score
        if (sortBy === 'highest') return b.score - a.score
        if (sortBy === 'name') return a.title.localeCompare(b.title)
        if (sortBy === 'reviews') return b.observations - a.observations
        return 0
      })
  }, [topicMasteryList, selectedSubjectFilter, tierFilter, topicSearchQuery, sortBy])

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
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-6xl page-enter mx-auto min-w-0 overflow-x-hidden">
      {/* Header & Tab Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-5 border-b border-slate-100 dark:border-slate-800 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track your study progress, completed tasks, and comprehensive topic mastery.
          </p>
        </div>

        {/* Tab Controls: Overview vs Topic Mastery */}
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
            onClick={() => setActiveTab('mastery')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'mastery'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>🎯</span>
            <span>Topic Mastery</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'mastery'
                ? 'bg-violet-700 text-violet-100'
                : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
            }`}>
              Scores 1–100
            </span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards — Featuring Completed Tasks Count */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-8">
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
          label="Cards Mastered"
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
          value={avgResponseMs !== null ? `${(avgResponseMs / 1000).toFixed(1)}s` : '—'}
          label="Avg Response Time"
          color="slate"
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M9 5V9L12 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
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
                  {completedStats.completedTopicsCount} syllabus topics mastered · {completedStats.completedSessionsCount} AI tutor sessions finished
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('mastery')}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm self-stretch md:self-auto justify-center"
            >
              <span>View Topic Mastery Scores</span>
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

          {/* Concept Mastery Heatmap — BKT */}
          {concepts.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Concept Mastery Quickview</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Bayesian estimate per concept — darker green = stronger mastery
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('mastery')}
                  className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium hover:underline flex items-center gap-1"
                >
                  View All Topics in Topic Mastery Tab →
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {concepts.slice(0, 24).map(c => {
                  const p = Math.round(c.mastery_prob * 100)
                  const hue = Math.round(c.mastery_prob * 120)
                  return (
                    <div
                      key={c.id}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700"
                      style={{ background: `hsla(${hue}, 70%, 50%, 0.12)` }}
                      title={`${c.observations} observations`}
                    >
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{c.concept}</p>
                      <p className="text-sm font-bold" style={{ color: `hsl(${hue}, 60%, 40%)` }}>{p}%</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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

          {/* Bottom grid: Mastery + Weak cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Mastery by subject */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Mastery by Subject</h2>
                <button
                  onClick={() => setActiveTab('mastery')}
                  className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium hover:underline"
                >
                  Detailed 1–100 Scores →
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
                          {s.mastery}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${s.mastery}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        {s.mastered} of {s.total} cards mastered
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
                      <p className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1">{card.front}</p>
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

      {/* TAB 2: TOPIC MASTERY (SCORES 1-100 ACROSS ALL SUBJECTS & TOPICS) */}
      {activeTab === 'mastery' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Section 1: Subject Mastery Scorecards (1-100 on ALL subjects) */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <span>🎓</span> Subject Mastery Scores
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Comprehensive 1–100 proficiency score calculated across syllabus topics, concepts, and retention
                </p>
              </div>
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2.5 py-1 rounded-full border border-violet-200 dark:border-violet-800">
                {subjectMasteryScores.length} {subjectMasteryScores.length === 1 ? 'Subject' : 'Subjects'} Tracked
              </span>
            </div>

            {subjectMasteryScores.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">No subjects found. Create a subject to track mastery!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjectMasteryScores.map(sub => {
                  const isSelected = selectedSubjectFilter === sub.id
                  const score = sub.score

                  // Color mapping according to score tier
                  let scoreColor = 'text-rose-600 dark:text-rose-400'
                  let barColor = 'bg-rose-500'
                  let badgeBg = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  let tierLabel = 'Needs Review'

                  if (score >= 85) {
                    scoreColor = 'text-emerald-600 dark:text-emerald-400'
                    barColor = 'bg-emerald-500'
                    badgeBg = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    tierLabel = 'Mastered'
                  } else if (score >= 70) {
                    scoreColor = 'text-violet-600 dark:text-violet-400'
                    barColor = 'bg-violet-500'
                    badgeBg = 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800'
                    tierLabel = 'Proficient'
                  } else if (score >= 50) {
                    scoreColor = 'text-amber-600 dark:text-amber-400'
                    barColor = 'bg-amber-500'
                    badgeBg = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    tierLabel = 'Developing'
                  }

                  return (
                    <div
                      key={sub.id}
                      onClick={() => setSelectedSubjectFilter(isSelected ? 'all' : sub.id)}
                      className={`rounded-2xl border p-5 transition-all cursor-pointer bg-white dark:bg-slate-800 shadow-sm hover:shadow-md min-w-0 ${
                        isSelected
                          ? 'ring-2 ring-violet-500 border-violet-400 dark:border-violet-500'
                          : 'border-slate-200/90 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs flex-shrink-0"
                            style={{ backgroundColor: sub.color || '#7c3aed' }}
                          >
                            {sub.name.charAt(0).toUpperCase()}
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate" title={sub.name}>
                            {sub.name}
                          </h3>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badgeBg}`}>
                          {tierLabel}
                        </span>
                      </div>

                      {/* 1-100 Score Display */}
                      <div className="flex items-baseline gap-1.5 my-3">
                        <span className={`text-4xl font-extrabold tracking-tight ${scoreColor}`}>
                          {score}
                        </span>
                        <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">
                          / 100
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
                          Proficiency
                        </span>
                      </div>

                      {/* Meter bar */}
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3.5">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                          style={{ width: `${score}%` }}
                        />
                      </div>

                      {/* Sub metrics footer */}
                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-center">
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{sub.totalTopics}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">Topics</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{sub.masteredTopics}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">Mastered</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-violet-600 dark:text-violet-400">{sub.averageRetention}%</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">Retention</div>
                        </div>
                      </div>

                      {/* Filter indicator */}
                      <div className="mt-3 pt-2 text-center">
                        <span className={`text-[11px] font-semibold ${isSelected ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          {isSelected ? '✓ Filtering topics below' : 'Click to filter topics ↓'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section 2: Granular Topic Mastery List */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6 min-w-0">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 mb-5 pb-4 border-b border-slate-100 dark:border-slate-700/60 min-w-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <span>📖</span> Mastery of Every Topic ({filteredTopics.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Individual 1–100 scores across every concept and chapter in your courses
                </p>
              </div>

              {/* Subject Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                <button
                  onClick={() => setSelectedSubjectFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    selectedSubjectFilter === 'all'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  All Subjects
                </button>
                {subjects.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSubjectFilter(s.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selectedSubjectFilter === s.id
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Search, Filter by Tier & Sort Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5 min-w-0">
              {/* Search bar */}
              <div className="relative flex-1 min-w-0">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="6" cy="6" r="4.5" />
                    <path d="M9.5 9.5L13 13" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={topicSearchQuery}
                  onChange={(e) => setTopicSearchQuery(e.target.value)}
                  placeholder="Search topics by name or subject..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                {topicSearchQuery && (
                  <button
                    onClick={() => setTopicSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Tier Filter & Sort Order */}
              <div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 flex-1 sm:flex-initial"
                >
                  <option value="all">All Tiers</option>
                  <option value="mastered">Mastered (85+)</option>
                  <option value="proficient">Proficient (70–84)</option>
                  <option value="developing">Developing (50–69)</option>
                  <option value="struggling">Needs Review (&lt;50)</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500/30 flex-1 sm:flex-initial"
                >
                  <option value="lowest">Lowest Score</option>
                  <option value="highest">Highest Score</option>
                  <option value="name">Alphabetical (A–Z)</option>
                  <option value="reviews">Most Reviewed</option>
                </select>
              </div>
            </div>

            {/* Topics List */}
            {filteredTopics.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="text-3xl mb-2">🔍</div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  No topics match your current filter
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                  Try clearing your search or choosing "All Subjects"
                </p>
                <button
                  onClick={() => {
                    setSelectedSubjectFilter('all')
                    setTopicSearchQuery('')
                    setTierFilter('all')
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-colors"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTopics.map((topic) => {
                  const score = topic.score

                  let scoreColor = 'text-rose-600 dark:text-rose-400'
                  let barColor = 'bg-rose-500'
                  let badgeBg = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'

                  if (score >= 85) {
                    scoreColor = 'text-emerald-600 dark:text-emerald-400'
                    barColor = 'bg-emerald-500'
                    badgeBg = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  } else if (score >= 70) {
                    scoreColor = 'text-violet-600 dark:text-violet-400'
                    barColor = 'bg-violet-500'
                    badgeBg = 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800'
                  } else if (score >= 50) {
                    scoreColor = 'text-amber-600 dark:text-amber-400'
                    barColor = 'bg-amber-500'
                    badgeBg = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }

                  return (
                    <div
                      key={topic.id}
                      className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center justify-between gap-3 min-w-0 w-full"
                    >
                      {/* Left: Topic info */}
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-700/60 max-w-[220px] truncate">
                            {topic.subjectName}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeBg}`}>
                            {topic.statusLabel}
                          </span>
                          {topic.observations > 0 && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                              · {topic.observations} {topic.observations === 1 ? 'review' : 'reviews'}
                            </span>
                          )}
                        </div>

                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate block" title={topic.title}>
                          {topic.title}
                        </h3>

                        {/* Visual Progress Bar */}
                        <div className="w-full max-w-xs sm:max-w-sm h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </div>

                      {/* Right: Score 1-100 & Action */}
                      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className={`text-xl sm:text-2xl font-black tabular-nums leading-none ${scoreColor}`}>
                            {score}
                            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 ml-0.5">/100</span>
                          </div>
                          <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Mastery Score</div>
                        </div>

                        <button
                          onClick={() => navigate(`/tutor/${topic.subjectId}`)}
                          className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/30 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/50 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 shadow-xs whitespace-nowrap"
                          title="Launch Socratic Tutor Drill on this topic"
                        >
                          <span>Drill</span>
                          <span className="hidden sm:inline">Topic</span>
                          <span className="text-xs">→</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
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
