import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface HelpTopic {
  title: string
  description: string
  steps: string[]
  route?: string
  category: string
}

const TOPICS: HelpTopic[] = [
  { category: 'Getting started', title: 'Dashboard and classes', description: 'Use the Dashboard to see what matters today and open a class workspace.', steps: ['Create or import a class.', 'Upload materials to build a curriculum.', 'Use the class workspace to move between learning, creation, and management tools.'], route: '/' },
  { category: 'Learning', title: 'Flashcards and study sessions', description: 'Review due cards with spaced repetition, active recall, cloze, and multiple-choice practice.', steps: ['Open a class and choose Study Flashcards.', 'Answer before revealing the solution.', 'Rate honestly so Neuron can schedule the next review.'], route: '/study' },
  { category: 'Learning', title: 'AI Tutor and General Chat', description: 'Use structured tutor sessions for teaching and General Chat for open-ended questions.', steps: ['Choose a class, topic, difficulty, and time.', 'Answer the tutor’s questions instead of only reading explanations.', 'End explicitly when you want learning progress evaluated.'], route: '/tutor' },
  { category: 'Learning', title: 'Practice Lab', description: 'Generate constructive practice problems and get feedback on your reasoning.', steps: ['Choose a class or weekly scope.', 'Work through the problem before asking for help.', 'Review the explanation and retry weak areas.'], route: '/tutor' },
  { category: 'Notes', title: 'Notebook and Cornell notes', description: 'Capture durable notes, cues, questions, summaries, equations, and material links.', steps: ['Open Notebook from a class workspace.', 'Use / to link a material in notebook text.', 'Cornell lecture notes save automatically as you work.'] },
  { category: 'Notes', title: 'Materials, highlights, and AI cards', description: 'Read documents, annotate source passages, and turn selected evidence into cards.', steps: ['Open a material from its class.', 'Select text or draw over a visual page.', 'Add a cue, question, highlight, or generated card.'] },
  { category: 'Planning', title: 'Focus Blocks and Pomodoro', description: 'Turn available time into a targeted sprint while keeping timers visible across the app.', steps: ['Choose a Focus Block length in Tutor.', 'Pause safely when you need a break.', 'Use the global timer bar to run Pomodoro alongside any study surface.'], route: '/tutor' },
  { category: 'Planning', title: 'Calendar and exam planning', description: 'Add deadlines and let Exam Boost prioritize relevant study work.', steps: ['Add an exam or assignment deadline.', 'Review the projected workload.', 'Use Tutor or Focus Blocks to act on the priority.'], route: '/calendar' },
  { category: 'Progress', title: 'Analytics and mastery', description: 'Understand retention, stability, streaks, weak cards, and review forecasts.', steps: ['Open Analytics from the sidebar.', 'Look for weak concepts rather than only total cards.', 'Use the recommended next action to return to learning.'], route: '/analytics' },
  { category: 'AI and privacy', title: 'AI providers and local models', description: 'Choose local or cloud AI and configure provider keys, routing, and transcription.', steps: ['Open Settings → AI.', 'Choose a local or cloud preset.', 'Test the connection before starting AI-heavy workflows.'], route: '/settings?section=ai' },
  { category: 'Data', title: 'Import, export, and Anki', description: 'Move your cards and study data safely and connect existing Anki decks.', steps: ['Use Export / Import Data for a full JSON backup.', 'Use Anki tools from the class workspace for deck workflows.', 'Verify counts after importing.'], route: '/settings?section=data' },
  { category: 'Help', title: 'Keyboard shortcuts and accessibility', description: 'Use keyboard navigation, visible focus, reduced motion, and dark mode throughout Neuron.', steps: ['Open the shortcut reference from the app shell.', 'Use Tab and Enter to operate controls.', 'Adjust appearance and accessibility preferences in Settings.'], route: '/settings' }
]

export default function HelpCenter(): React.JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return TOPICS.filter(topic => !needle || `${topic.title} ${topic.description} ${topic.category}`.toLowerCase().includes(needle))
  }, [query])

  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8 page-enter">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-600 dark:text-violet-300">Learn Neuron</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">How can we help?</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Short, practical lessons for every major Neuron workflow. Start the guided tour for a hands-on walkthrough.</p>
        </div>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('neuron:start-tour'))} className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700">🎓 Start feature tour</button>
      </header>

      <label className="mb-6 block">
        <span className="sr-only">Search help topics</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search features, notes, timers, AI, or settings…" className="input h-11 text-sm" />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map(topic => {
          const isOpen = expanded === topic.title
          return (
            <article key={topic.title} className={`rounded-2xl border bg-white p-5 shadow-sm transition-colors dark:bg-slate-900 ${isOpen ? 'border-violet-400 dark:border-violet-600' : 'border-slate-200 dark:border-slate-700'}`}>
              <button type="button" className="w-full text-left" onClick={() => setExpanded(isOpen ? null : topic.title)} aria-expanded={isOpen}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-300">{topic.category}</span>
                <h2 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-50">{topic.title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{topic.description}</p>
              </button>
              {isOpen && (
                <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    {topic.steps.map((step, index) => <li key={step} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 dark:bg-violet-950/60 dark:text-violet-200">{index + 1}</span><span>{step}</span></li>)}
                  </ol>
                  {topic.route && <button type="button" onClick={() => navigate(topic.route!)} className="mt-4 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">Open this area →</button>}
                </div>
              )}
            </article>
          )
        })}
      </div>
      {filtered.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No help topics match that search.</p>}
    </div>
  )
}
