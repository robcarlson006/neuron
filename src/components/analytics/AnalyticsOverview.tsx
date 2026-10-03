import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { AnalyticsSnapshot, Card, RetentionForecastPoint, Subject } from '../../types'
import LatexText from '../LatexText'

interface AnalyticsOverviewProps {
  snapshot: AnalyticsSnapshot
  subjects: Subject[]
  weakCards: (Card & { avg_quality: number })[]
  forecast: RetentionForecastPoint[]
  onOpenMastery: () => void
}

const panel = 'rounded-[22px] border border-slate-200/80 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none'

function percent(value: number | null): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

export function formatStudyDuration(minutes: number | null): string {
  const roundedMinutes = Math.max(0, Math.round(minutes ?? 0))
  if (roundedMinutes < 60) return `${roundedMinutes} min`

  const hours = Math.floor(roundedMinutes / 60)
  const remainder = roundedMinutes % 60
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`
}

interface ModeBarLabelProps {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: number | string
}

function ModeBarLabel({ x = 0, y = 0, width = 0, height = 0, value = '' }: ModeBarLabelProps): React.JSX.Element {
  const barX = Number(x)
  const barY = Number(y)
  const barWidth = Number(width)
  const barHeight = Number(height)
  const label = String(value)
  const fitsInside = barWidth >= label.length * 7 + 16

  return (
    <text
      x={fitsInside ? barX + barWidth - 8 : barX + barWidth + 8}
      y={barY + barHeight / 2}
      dy="0.35em"
      textAnchor={fitsInside ? 'end' : 'start'}
      fill={fitsInside ? '#ffffff' : '#475569'}
      fontSize={11}
      fontWeight={600}
    >
      {label}
    </text>
  )
}

function delta(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return 100
  return Math.round(((current - previous) / previous) * 100)
}

function Delta({ value }: { value: number | null }): React.JSX.Element | null {
  if (value == null) return null
  const positive = value >= 0
  return <span className={`text-[11px] font-semibold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{positive ? '↑' : '↓'} {Math.abs(value)}%</span>
}

function SummaryMetric({ label, value, comparison, tone = 'slate' }: { label: string; value: string; comparison?: number | null; tone?: 'violet' | 'emerald' | 'amber' | 'slate' }): React.JSX.Element {
  const tones = {
    violet: 'text-violet-700 dark:text-violet-300',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    slate: 'text-slate-900 dark:text-slate-100'
  }
  return (
    <div className="min-w-0 border-l border-slate-200 pl-4 first:border-l-0 first:pl-0 dark:border-slate-800 sm:pl-5">
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold tracking-tight ${tones[tone]}`}>{value}</span>
        <Delta value={comparison ?? null} />
      </div>
      <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

function CardPanel({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }): React.JSX.Element {
  return (
    <section className={`${panel} p-5 sm:p-6`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
          {description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ message, detail }: { message: string; detail: string }): React.JSX.Element {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-5 text-center dark:border-slate-700"><p className="text-sm font-medium text-slate-600 dark:text-slate-300">{message}</p><p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{detail}</p></div>
}

export default function AnalyticsOverview({ snapshot, subjects, weakCards, forecast, onOpenMastery }: AnalyticsOverviewProps): React.JSX.Element {
  const navigate = useNavigate()
  const subjectById = useMemo(() => new Map(subjects.map(subject => [subject.id, subject])), [subjects])
  const chartData = snapshot.daily.map(point => ({
    ...point,
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    study_hours: Number((point.study_minutes / 60).toFixed(1)),
    accuracy_percent: point.accuracy == null ? null : Math.round(point.accuracy * 100)
  }))
  const subjectRows = [...snapshot.subjects].sort((a, b) => {
    const aAccuracy = a.accuracy ?? -1
    const bAccuracy = b.accuracy ?? -1
    return aAccuracy - bAccuracy
  })
  const totalModeMinutes = snapshot.modes.reduce((sum, mode) => sum + (mode.minutes || 0), 0)
  const modeLabels: Record<string, string> = { flashcards: 'Flashcards', tutor: 'Tutor', practice: 'Practice', focus: 'Focus blocks' }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[26px] bg-slate-900 p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] sm:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="mb-2 text-xs font-semibold text-violet-300">Your learning pulse</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Progress is easier to change when you can see its shape.</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">Use the signals below to decide what to reinforce next—not just how much you have completed.</p>
          </div>
          <button onClick={onOpenMastery} className="w-fit rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900">Explore topic mastery</button>
        </div>
      </section>

      <section className={`${panel} grid grid-cols-2 gap-y-5 p-4 sm:grid-cols-5 sm:gap-y-0 sm:p-5`} aria-label="Analytics summary">
        <SummaryMetric label="Reviews" value={snapshot.totals.reviews.toLocaleString()} comparison={delta(snapshot.totals.reviews, snapshot.previous_totals.reviews)} tone="violet" />
        <SummaryMetric label="Accuracy" value={percent(snapshot.totals.accuracy)} comparison={snapshot.totals.accuracy != null && snapshot.previous_totals.accuracy != null ? Math.round((snapshot.totals.accuracy - snapshot.previous_totals.accuracy) * 100) : null} tone="emerald" />
        <SummaryMetric label="Study time" value={snapshot.totals.study_minutes ? `${Math.round(snapshot.totals.study_minutes / 6) / 10}h` : '—'} comparison={delta(snapshot.totals.study_minutes, snapshot.previous_totals.study_minutes)} tone="amber" />
        <SummaryMetric label="Sessions" value={snapshot.totals.sessions.toLocaleString()} comparison={delta(snapshot.totals.sessions, snapshot.previous_totals.sessions)} />
        <SummaryMetric label="Current retention" value={percent(snapshot.totals.current_retention)} tone="violet" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <CardPanel title="Activity trend" description={`Daily activity from ${snapshot.start_date} to ${snapshot.end_date}`}>
          {chartData.some(point => point.reviews || point.study_minutes || point.tutor_sessions || point.practice_sessions) ? (
            <div className="h-[290px] w-full">
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={snapshot.range_days === 7 ? 0 : Math.max(0, Math.floor(snapshot.range_days / 7) - 1)} />
                  <YAxis yAxisId="count" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis yAxisId="percent" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12, color: '#f8fafc' }} />
                  <Bar yAxisId="count" dataKey="reviews" name="Reviews" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Line yAxisId="percent" type="monotone" dataKey="accuracy_percent" name="Accuracy" stroke="#10b981" strokeWidth={2.5} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState message="No activity in this window" detail="Complete a review or study session to start building your trend." />}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-medium text-slate-500 dark:text-slate-400"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-violet-500" />Reviews</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />Accuracy</span><span className="text-slate-400">Study time is included in the mode breakdown.</span></div>
        </CardPanel>

        <CardPanel title="Maintenance load" description="What needs attention next">
          <div className="space-y-4">
            <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/25"><div className="flex items-baseline justify-between"><span className="text-sm font-medium text-rose-900 dark:text-rose-200">Overdue cards</span><span className="text-2xl font-bold text-rose-700 dark:text-rose-300">{snapshot.maintenance.overdue_cards}</span></div><p className="mt-1 text-xs text-rose-700/70 dark:text-rose-300/70">Start here to protect recall.</p></div>
            <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/25"><div className="flex items-baseline justify-between"><span className="text-sm font-medium text-amber-900 dark:text-amber-200">Due now</span><span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{snapshot.maintenance.due_cards}</span></div><p className="mt-1 text-xs text-amber-700/70 dark:text-amber-300/70">Reviews ready in your queue.</p></div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800"><div><p className="text-sm font-medium text-slate-700 dark:text-slate-200">Fading soon</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Due within three days</p></div><span className="text-xl font-bold text-slate-700 dark:text-slate-200">{snapshot.maintenance.fading_cards}</span></div>
            <button onClick={() => navigate('/study')} className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900">Review due cards</button>
          </div>
        </CardPanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
        <CardPanel title="Performance by subject" description="Sorted by lowest accuracy so weak areas are visible first.">
          {subjectRows.length === 0 ? <EmptyState message="No subjects to compare" detail="Create a subject and complete a review to see performance here." /> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-3 pr-4">Subject</th><th className="pb-3 pr-4">Mastery</th><th className="pb-3 pr-4">Retention</th><th className="pb-3 pr-4">Reviews</th><th className="pb-3 pr-4">Study time</th><th className="pb-3 pr-4">Accuracy</th><th className="pb-3">Change</th></tr></thead><tbody>{subjectRows.map(row => { const subject = subjectById.get(row.subject_id); const accuracyDelta = row.accuracy != null && row.previous_reviews > 0 ? Math.round((row.accuracy - row.previous_correct / row.previous_reviews) * 100) : null; return <tr key={row.subject_id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/70"><td className="py-3 pr-4"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: subject?.color || '#8b5cf6' }} /><span className="max-w-[180px] truncate font-medium text-slate-700 dark:text-slate-200">{subject?.name || `Subject ${row.subject_id}`}</span></div></td><td className="py-3 pr-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round(row.mastery * 100)}%` }} /></div><span className="font-semibold text-slate-700 dark:text-slate-200">{Math.round(row.mastery * 100)}%</span></div></td><td className="py-3 pr-4 font-semibold text-slate-700 dark:text-slate-200">{percent(row.retention)}</td><td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{row.reviews || '—'}</td><td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{row.study_minutes == null ? '—' : `${row.study_minutes}m`}</td><td className="py-3 pr-4 font-semibold text-slate-700 dark:text-slate-200">{percent(row.accuracy)}</td><td className="py-3 font-semibold"><Delta value={accuracyDelta} /></td></tr> })}</tbody></table></div>}
        </CardPanel>

        <CardPanel title="Learning mix" description="Where your time went in this period">
          {totalModeMinutes === 0 && snapshot.modes.every(mode => mode.sessions === 0) ? <EmptyState message="No completed sessions yet" detail="Your mix will appear after you finish a study mode." /> : <><div className="h-48"><ResponsiveContainer><BarChart data={snapshot.modes.map(mode => ({ ...mode, label: modeLabels[mode.mode], displayMinutes: mode.minutes || 0, durationLabel: formatStudyDuration(mode.minutes) }))} layout="vertical" margin={{ top: 0, right: 64, left: 12, bottom: 0 }}><XAxis type="number" hide /><YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={78} /><Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12, color: '#f8fafc' }} formatter={(value: number) => [formatStudyDuration(value), 'Time']} /><Bar dataKey="displayMinutes" fill="#7c3aed" radius={[0, 5, 5, 0]}><LabelList dataKey="durationLabel" content={<ModeBarLabel />} /></Bar></BarChart></ResponsiveContainer></div><div className="mt-2 grid grid-cols-2 gap-2">{snapshot.modes.map(mode => <div key={mode.mode} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70"><p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{modeLabels[mode.mode]}</p><p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{mode.sessions} <span className="text-[10px] font-normal text-slate-400">sessions</span></p></div>)}</div></>}
        </CardPanel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CardPanel title="Retention forecast" description="Predicted recall across the next 30 days.">
          {forecast.length === 0 ? <EmptyState message="Forecast unavailable" detail="Review a few cards to unlock retention forecasting." /> : <div className="h-56"><ResponsiveContainer><LineChart data={forecast.map(point => ({ date: point.date.slice(5), retention: Math.round(point.retention * 100) }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={4} /><YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" /><Tooltip formatter={(value: number) => `${value}%`} contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12, color: '#f8fafc' }} /><Line type="monotone" dataKey="retention" stroke="#7c3aed" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>}
        </CardPanel>
        <CardPanel title="Cards needing attention" description="Lowest-rated cards from your review history." action={<button onClick={onOpenMastery} className="text-xs font-semibold text-violet-600 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-violet-400">View mastery</button>}>
          {weakCards.length === 0 ? <EmptyState message="Nothing flagged yet" detail="Complete a few reviews and Neuron will surface cards that need another pass." /> : <div className="space-y-2">{weakCards.slice(0, 5).map(card => <div key={card.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-800"><div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200"><LatexText forceInline>{card.front}</LatexText></div><div className="flex shrink-0 items-center gap-2"><span className="text-[11px] text-amber-500">{Math.round(card.avg_quality || 0)}/5</span><button onClick={() => navigate(`/tutor/${card.subject_id}`)} className="rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-violet-950/40 dark:text-violet-300">Drill</button></div></div>)}</div>}
        </CardPanel>
      </div>
    </div>
  )
}
