import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Send, Sparkles, ExternalLink } from '../components/icons'
import MarkdownRenderer from '../components/MarkdownRenderer'
import { useAppStore } from '../store/appStore'
import type { GroundedAnswer } from '../types'

export default function GroundedHelper(): React.JSX.Element {
  const { subjects } = useAppStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [result, setResult] = useState<GroundedAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const activeSubjects = subjects.filter(s => s.status !== 'archived')

  useEffect(() => {
    if (subjectId === null && activeSubjects.length > 0) {
      const saved = Number(localStorage.getItem('neuron_helper_subject_id'))
      setSubjectId(activeSubjects.some(subject => subject.id === saved) ? saved : activeSubjects[0].id)
    }
  }, [activeSubjects, subjectId])

  function changeScope(value: string): void {
    const next = value ? Number(value) : null
    setSubjectId(next)
    if (next) localStorage.setItem('neuron_helper_subject_id', String(next))
    else localStorage.removeItem('neuron_helper_subject_id')
  }

  async function ask(e?: React.FormEvent, requestedQuery?: string): Promise<void> {
    e?.preventDefault()
    const prompt = (requestedQuery || query).trim()
    if (!prompt || loading) return
    setLoading(true)
    try {
      if (requestedQuery) setQuery(requestedQuery)
      const response = await window.electronAPI.groundedAsk(prompt, subjectId)
      setResult(response)
    } catch (error) {
      setResult({ success: false, answer: '', confidence: 'low', evidence: [], error: error instanceof Error ? error.message : String(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full p-6 md:p-10 page-enter">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-2">
              <Sparkles size={18} />
              <span className="text-xs font-bold uppercase tracking-widest">Grounded helper</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Ask your materials</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              Get explanations, formulas, and definitions from the materials in Neuron. Answers are grounded in your selected class and show their supporting sources.
            </p>
          </div>
          <div className="hidden sm:flex h-14 w-14 rounded-2xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-300 items-center justify-center">
            <BookOpen size={24} />
          </div>
        </div>

        <form onSubmit={ask} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask for a formula, definition, comparison, or explanation…"
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
            />
            <select
              value={subjectId ?? ''}
              onChange={e => changeScope(e.target.value)}
              className="md:w-52 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Material scope"
            >
              <option value="">All classes</option>
              {activeSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <button type="submit" disabled={!query.trim() || loading} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
              {loading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={15} />}
              Ask
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">No web search. If Neuron cannot support an answer from your materials, it will say so.</p>
        </form>

        {result && (
          <div className="mt-6 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className={`text-xs font-bold uppercase tracking-wider ${result.confidence === 'not_found' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {result.confidence === 'not_found' ? 'Not found in materials' : `${result.confidence} confidence`}
                </span>
                {result.error && <span className="text-xs text-rose-600">{result.error}</span>}
              </div>
              <MarkdownRenderer
                content={result.answer || 'No grounded answer was returned.'}
                className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800 dark:text-slate-200"
              />
              {result.success && result.confidence !== 'not_found' && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <button type="button" onClick={() => ask(undefined, `Explain this differently using my materials: ${query}`)} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200">Explain differently</button>
                  <button type="button" onClick={() => ask(undefined, `Create one free-response practice problem from this topic using my materials: ${query}`)} className="px-3 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-950/50 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-200">Turn into practice</button>
                  <button type="button" onClick={() => ask(undefined, `Give me a concise flashcard from this topic using my materials: ${query}`)} className="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200">Make a flashcard</button>
                </div>
              )}
            </div>

            {result.evidence.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Supporting materials</h2>
                <div className="space-y-3">
                  {result.evidence.map(evidence => (
                    <div key={`${evidence.materialId}-${evidence.chunkIndex}`} className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">{evidence.sourceLabel || evidence.materialName}</span>
                        <span className="text-[10px] text-slate-400">{Math.round(evidence.score * 100)}% match</span>
                      </div>
                      <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{evidence.text}</p>
                      <button type="button" onClick={() => evidence.subjectId && navigate(`/subject/${evidence.subjectId}/material/${evidence.materialId}`)} className="mt-2 inline-flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-300 hover:underline"><ExternalLink size={11} /> Open source</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
