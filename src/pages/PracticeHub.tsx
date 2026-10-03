import React, { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, BookOpen, CheckCircle2, Filter, Layers, Play, Search, ShieldCheck, Sparkles, Star, Trash2, Upload } from '../components/icons'
import MarkdownRenderer from '../components/MarkdownRenderer'
import PracticeUploadModal from '../components/practice/PracticeUploadModal'
import PracticeSessionLauncher from '../components/practice/PracticeSessionLauncher'
import AutoGeneratePracticeModal from '../components/practice/AutoGeneratePracticeModal'
import type { Subject, SyllabusModule, ModuleTopic, PracticeProblem, User } from '../types'

type PracticeView = 'practice' | 'build' | 'library'
interface PracticeHubProps { subject: Subject; user: User | null; onStartSession: (moduleId?: number, topicId?: number, count?: number, mode?: 'standard' | 'guided', options?: { difficulty?: number; learningGoal?: 'recommended' | 'reinforce' | 'review' | 'transfer' }) => void }
const viewLabels: Record<PracticeView, string> = { practice: 'Practice', build: 'Build session', library: 'Problem library' }

function principlesOf(problem: PracticeProblem): string[] { try { return JSON.parse(problem.principles_json || '[]') as string[] } catch { return [] } }

export default function PracticeHub({ subject, user, onStartSession }: PracticeHubProps): React.JSX.Element {
  const [modules, setModules] = useState<(SyllabusModule & { topics?: ModuleTopic[] })[]>([])
  const [problems, setProblems] = useState<PracticeProblem[]>([])
  const [stats, setStats] = useState({ totalCompleted: 0, accuracy: 0 })
  const [view, setView] = useState<PracticeView>(() => { const saved = window.localStorage.getItem(`neuron.practice.view.${subject.id}`); return saved === 'build' || saved === 'library' ? saved : 'practice' })
  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState<number | undefined>()
  const [topicFilter, setTopicFilter] = useState<number | undefined>()
  const [statusFilter, setStatusFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [selected, setSelected] = useState<PracticeProblem | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generateTarget, setGenerateTarget] = useState<{ moduleId?: number; topicId?: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      const loadedModules: (SyllabusModule & { topics?: ModuleTopic[] })[] = []
      if (window.electronAPI.syllabusListModules) {
        const rows = await window.electronAPI.syllabusListModules(subject.id)
        for (const module of rows) loadedModules.push({ ...module, topics: window.electronAPI.syllabusListTopics ? await window.electronAPI.syllabusListTopics(module.id, user?.id) : [] })
      }
      setModules(loadedModules)
      if (window.electronAPI.practiceListProblems) setProblems(await window.electronAPI.practiceListProblems(subject.id))
      if (window.electronAPI.practiceGetStats && user?.id) { const next = await window.electronAPI.practiceGetStats(subject.id, user.id); setStats({ totalCompleted: next.totalCompleted, accuracy: next.accuracy }) }
    } catch (error) { console.error('Failed to load practice lab:', error) } finally { setLoading(false) }
  }

  useEffect(() => { void loadData() }, [subject.id, user?.id])
  useEffect(() => { window.localStorage.setItem(`neuron.practice.view.${subject.id}`, view) }, [subject.id, view])

  const activeModule = modules.find(module => module.id === moduleFilter)
  const filteredProblems = useMemo(() => problems.filter(problem => {
    if (moduleFilter && problem.module_id !== moduleFilter) return false
    if (topicFilter && problem.topic_id !== topicFilter) return false
    if (statusFilter !== 'all' && (problem.verification_status || 'legacy_unverified') !== statusFilter) return false
    if (difficultyFilter !== 'all' && problem.difficulty !== Number(difficultyFilter)) return false
    if (query.trim() && !`${problem.title} ${problem.problem_text} ${problem.principles_json} ${problem.source_ref || ''}`.toLowerCase().includes(query.trim().toLowerCase())) return false
    return true
  }), [problems, moduleFilter, topicFilter, statusFilter, difficultyFilter, query])

  const openGenerator = (moduleId?: number, topicId?: number) => { setGenerateTarget({ moduleId, topicId }); setShowGenerate(true) }
  const deleteProblem = async (problemId: number): Promise<void> => { if (!window.confirm('Delete this practice problem?')) return; await window.electronAPI.practiceDeleteProblem?.(problemId); setProblems(current => current.filter(problem => problem.id !== problemId)); if (selected?.id === problemId) setSelected(null) }

  if (loading) return <div className="py-20 text-center text-sm text-slate-500">Loading Practice Lab…</div>

  return <div className="max-w-7xl mx-auto space-y-6 pb-12">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-semibold text-violet-600 dark:text-violet-300">Practice Lab</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Build confidence by solving.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">A calmer place to practice, get help one step at a time, and return to the ideas that need more work.</p></div>
      <div className="flex items-center gap-5 text-sm text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1.5"><Layers size={15} /> {problems.length} problems</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} /> {stats.totalCompleted} solved</span><span className="inline-flex items-center gap-1.5"><Activity size={15} /> {stats.accuracy}% accuracy</span></div>
    </header>

    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Practice Lab sections">{(Object.keys(viewLabels) as PracticeView[]).map(key => <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`relative px-4 py-3 text-sm font-semibold transition-colors ${view === key ? 'text-violet-700 dark:text-violet-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{viewLabels[key]}{view === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-violet-600" />}</button>)}</nav>

    {view === 'practice' && <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="rounded-3xl bg-slate-950 p-8 text-white shadow-lg dark:bg-slate-900 lg:p-10"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-violet-400/15 px-3 py-1 text-xs font-semibold text-violet-200"><Sparkles size={13} /> Recommended practice</span><h2 className="mt-5 text-3xl font-semibold tracking-tight">Start with the ideas most likely to fade next.</h2><p className="mt-4 text-sm leading-6 text-slate-300">Neuron will mix weaker concepts with spaced maintenance items. You can ask for a hint whenever you need one without leaving the problem.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={() => onStartSession(undefined, undefined, 5, 'standard')} disabled={problems.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-violet-50 disabled:opacity-50"><Play size={15} className="fill-current" /> Start recommended</button><button onClick={() => setView('build')} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"><BookOpen size={15} /> Build a session</button></div>{problems.length === 0 && <p className="mt-4 text-xs text-violet-200">Add or generate a problem set to begin.</p>}</div></div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-900 dark:text-white">Need a fresh set?</p><p className="mt-1 text-xs leading-5 text-slate-500">Generate from your course materials and learning gaps.</p></div><Sparkles size={20} className="text-violet-500" /></div><div className="mt-6 grid gap-2"><button onClick={() => openGenerator()} className="flex items-center justify-between rounded-xl bg-violet-50 px-4 py-3 text-left text-sm font-semibold text-violet-800 transition hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-200"><span>Generate verified practice</span><ArrowRight size={15} /></button><button onClick={() => setShowUpload(true)} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200"><span>Upload a problem set</span><Upload size={15} /></button></div></div>
    </section>}

    {view === 'build' && <section className="space-y-4"><div><h2 className="text-xl font-semibold text-slate-950 dark:text-white">Build a practice session</h2><p className="mt-1 text-sm text-slate-500">Choose the scope and pace. Help is always available once you start.</p></div><PracticeSessionLauncher embedded subjectId={subject.id} userId={user?.id || 1} modules={modules} problems={problems} onClose={() => undefined} onStartSession={(moduleId, topicId, count, options) => onStartSession(moduleId, topicId, count, 'standard', options)} onOpenAutoGen={openGenerator} /></section>}

    {view === 'library' && <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search problems, principles, or source material" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800" /></div><div className="flex flex-wrap items-center gap-2"><Filter size={14} className="text-slate-400" /><select value={moduleFilter || ''} onChange={event => { setModuleFilter(event.target.value ? Number(event.target.value) : undefined); setTopicFilter(undefined) }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="">All modules</option>{modules.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}</select><select value={topicFilter || ''} onChange={event => setTopicFilter(event.target.value ? Number(event.target.value) : undefined)} disabled={!activeModule} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"><option value="">All topics</option>{activeModule?.topics?.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="all">All statuses</option><option value="verified">Verified</option><option value="needs_review">Needs review</option><option value="legacy_unverified">Legacy</option></select><select value={difficultyFilter} onChange={event => setDifficultyFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"><option value="all">Any difficulty</option>{[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>Difficulty {level}</option>)}</select></div></div>
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-slate-950 dark:text-white">Problem library</h2><p className="mt-1 text-sm text-slate-500">{filteredProblems.length} of {problems.length} problems</p></div><div className="flex gap-2"><button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"><Upload size={13} /> Upload</button><button onClick={() => openGenerator(moduleFilter, topicFilter)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700"><Sparkles size={13} /> Generate</button></div></div>
      {filteredProblems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700"><Layers size={28} className="mx-auto text-slate-300" /><h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">No problems match these filters</h3><p className="mt-1 text-xs text-slate-500">Try a broader search or generate a new set for this topic.</p></div> : <div className="grid gap-3">{filteredProblems.map(problem => { const isSelected = selected?.id === problem.id; const principles = principlesOf(problem); const status = problem.verification_status || 'legacy_unverified'; return <article key={problem.id} className={`rounded-2xl border bg-white transition dark:bg-slate-900 ${isSelected ? 'border-violet-500 shadow-md' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'}`}><button onClick={() => setSelected(isSelected ? null : problem)} className="w-full p-5 text-left"><div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-950 dark:text-white">{problem.title}</h3><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status === 'verified' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : status === 'needs_review' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>{status === 'verified' && <ShieldCheck size={10} />}{status.replace('_', ' ')}</span></div><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{problem.problem_text}</p><div className="mt-3 flex flex-wrap items-center gap-2">{principles.slice(0, 4).map(principle => <span key={principle} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:bg-slate-800">{principle}</span>)}{problem.source_ref && <span className="text-[10px] text-slate-400">From {problem.source_ref}</span>}</div></div><div className="flex shrink-0 items-center gap-1">{[1, 2, 3, 4, 5].map(level => <Star key={level} size={11} className={level <= problem.difficulty ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'} />)}</div></div></button>{isSelected && <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800"><div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"><MarkdownRenderer content={problem.stimulus || problem.problem_text} /></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => onStartSession(problem.module_id || undefined, problem.topic_id || undefined, 1, 'standard')} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white"><Play size={13} className="fill-current" /> Solve this</button><button onClick={() => openGenerator(problem.module_id || undefined, problem.topic_id || undefined)} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-800 dark:text-violet-300"><Sparkles size={13} /> Make a variant</button><button onClick={() => void deleteProblem(problem.id)} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300"><Trash2 size={13} /> Delete</button></div>{problem.solution_steps && <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-slate-500">Preview solution structure</summary><div className="mt-2 text-sm text-slate-600 dark:text-slate-400"><MarkdownRenderer content={problem.solution_steps} /></div></details>}</div>}</article> })}</div>}
    </section>}

    {showUpload && <PracticeUploadModal subjectId={subject.id} modules={modules} onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); void loadData() }} />}
    {showGenerate && <AutoGeneratePracticeModal subjectId={subject.id} userId={user?.id || 1} modules={modules} initialModuleId={generateTarget?.moduleId} initialTopicId={generateTarget?.topicId} onClose={() => { setShowGenerate(false); setGenerateTarget(null) }} onSuccess={() => { setShowGenerate(false); setGenerateTarget(null); void loadData() }} />}
  </div>
}
