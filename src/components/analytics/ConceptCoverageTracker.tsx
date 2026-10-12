import React, { useEffect, useMemo, useState } from 'react'
import type { Subject } from '../../types'
import type { ConceptLearningState } from '../../lib/learningState'

interface Props { subjects: Subject[]; userId?: number }

export default function ConceptCoverageTracker({ subjects, userId }: Props): React.JSX.Element {
  const [selectedSubject, setSelectedSubject] = useState<number | 'all'>('all')
  const [query, setQuery] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [states, setStates] = useState<Array<ConceptLearningState & { subjectId: number; subjectName: string }>>([])
  const [loading, setLoading] = useState(true)
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => {
    if (!window.electronAPI?.onConceptLearningStateChanged) return
    const unsubscribe = window.electronAPI.onConceptLearningStateChanged(({ subjectId }) => {
      if (subjects.some(subject => subject.id === subjectId)) setRefreshVersion(version => version + 1)
    })
    return () => { if (typeof unsubscribe === 'function') unsubscribe() }
  }, [subjects])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all(subjects.map(async subject => {
      const rows = await window.electronAPI.conceptsGetLearningStates(subject.id, userId)
      return rows.map(row => ({ ...row, subjectId: subject.id, subjectName: subject.name }))
    })).then(rows => { if (active) setStates(rows.flat()) })
      .catch(() => { if (active) setStates([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [subjects, userId, refreshVersion])

  const filtered = useMemo(() => states.filter(row =>
    (selectedSubject === 'all' || row.subjectId === selectedSubject) &&
    `${row.conceptLabel} ${row.subjectName}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [states, selectedSubject, query])
  const counts = useMemo(() => ({
    total: filtered.length,
    introduced: filtered.filter(row => row.coverage !== 'not_introduced').length,
    practised: filtered.filter(row => row.coverage === 'practised').length,
    demonstrated: filtered.filter(row => row.proficiency === 'demonstrated' || row.proficiency === 'strong_evidence').length,
    needsWork: filtered.filter(row => row.proficiency === 'needs_work').length,
    reviewsDue: filtered.filter(row => row.review === 'review_due' || row.review === 'review_overdue').length
  }), [filtered])

  const summary = [
    ['Concepts in scope', counts.total], ['Introduced', counts.introduced], ['Practised', counts.practised],
    ['Demonstrated', counts.demonstrated], ['Needs work', counts.needsWork], ['Reviews due', counts.reviewsDue]
  ] as const

  return <section className="space-y-5" aria-label="Concept coverage tracker">
    <div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Concept coverage</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Evidence-derived states from the active curriculum concept inventory. Card reviews remain card-level evidence.</p>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {summary.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="text-xl font-bold text-slate-900 dark:text-slate-50">{value}</div>
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      </div>)}
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search concepts" aria-label="Search concepts" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
      <select aria-label="Filter by subject" value={selectedSubject} onChange={event => setSelectedSubject(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
        <option value="all">All subjects</option>
        {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
      </select>
    </div>
    {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading concept evidence…</p> : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No extracted curriculum concepts in this scope yet.</div> :
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="p-3">Concept</th><th className="p-3">Coverage</th><th className="p-3">Proficiency</th><th className="p-3">Confidence</th><th className="p-3">Review</th><th className="p-3">Evidence</th></tr></thead>
          <tbody>{filtered.map(row => {
            const key = `${row.subjectId}:${row.conceptId}`
            const expanded = expandedKey === key
            return <React.Fragment key={key}><tr className="border-t border-slate-100 dark:border-slate-700">
            <td className="p-3"><button type="button" aria-expanded={expanded} onClick={() => setExpandedKey(expanded ? null : key)} className="text-left"><div className="font-semibold text-slate-800 dark:text-slate-100">{row.conceptLabel}</div><div className="mt-0.5 text-[10px] text-slate-500">{row.subjectName} · {expanded ? 'Hide evidence' : 'Show evidence'}</div></button></td>
            <td className="p-3 capitalize">{row.coverage.replace(/_/g, ' ')}</td>
            <td className="p-3 capitalize">{row.proficiency.replace(/_/g, ' ')}</td>
            <td className="p-3 capitalize">{row.confidence.replace(/_/g, ' ')}</td>
            <td className="p-3 capitalize">{row.review.replace(/_/g, ' ')}</td>
            <td className="p-3"><span title={row.explanation.join(' ')}>{row.counts.assessments} assessment{row.counts.assessments === 1 ? '' : 's'} · {row.counts.independentCorrect} independent correct</span>{row.misconceptions.length > 0 && <div className="mt-1 text-rose-600 dark:text-rose-400" title={row.misconceptions.join('; ')}>Misconception recorded</div>}</td>
          </tr>{expanded && <tr className="bg-slate-50/70 dark:bg-slate-900/50"><td colSpan={6} className="px-3 pb-4 pt-1"><div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p><strong>Why:</strong> {row.explanation.join(' ')}</p>
            <p><strong>Evidence:</strong> {row.counts.independentCorrect} independent correct, {row.counts.assistedCorrect} assisted correct, {row.counts.partial} partial, {row.counts.incorrect} incorrect, {row.counts.delayedAssessments} delayed correct.</p>
            <p><strong>Last assessed:</strong> {row.lastAssessedAt ? new Date(row.lastAssessedAt).toLocaleString() : 'No assessment recorded'}.</p>
            {row.misconceptions.length > 0 && <p className="text-rose-600 dark:text-rose-400"><strong>Misconceptions:</strong> {row.misconceptions.join('; ')}</p>}
          </div></td></tr>}</React.Fragment>
          })}</tbody>
        </table>
      </div>}
  </section>
}
