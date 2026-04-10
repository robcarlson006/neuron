import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import NeuronLogo from './NeuronLogo'

// ─── Step definitions ──────────────────────────────────────────────────────────

interface Step {
  id: string
  modal?: boolean           // full blocking modal (welcome / complete)
  navigateTo?: 'dashboard' | 'subject' | 'diagnostics' | 'study' | 'calendar' | 'analytics'
  title: string
  body: React.ReactNode
  cta: string
  autoAdvanceOn?: 'subject-created' | 'subject-route'  // advance automatically on condition
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    modal: true,
    title: 'Welcome to Neuron!',
    body: (
      <p>
        Let's take a quick tour so you know exactly how to use every feature.
        We'll walk through the whole app together — it takes about 2 minutes.
      </p>
    ),
    cta: "Let's go →"
  },
  {
    id: 'dashboard-intro',
    navigateTo: 'dashboard',
    title: 'Your Dashboard',
    body: (
      <p>
        This is your <strong>Dashboard</strong> — the home for all your classes.
        Every class you create shows up here with a count of how many flashcards
        are due for review today. You can also start a study session directly
        from here.
      </p>
    ),
    cta: 'Next →'
  },
  {
    id: 'create-class',
    navigateTo: 'dashboard',
    title: 'Create Your First Class',
    body: (
      <>
        <p>
          Click <strong>"+ New Subject"</strong> (top right) to add a class.
          Give it a name like "Biology 101" and hit save.
        </p>
        <p className="mt-2 text-xs opacity-80">
          Once you create one, the tour will continue automatically.
        </p>
      </>
    ),
    cta: 'Skip this step →',
    autoAdvanceOn: 'subject-created'
  },
  {
    id: 'class-management',
    navigateTo: 'dashboard',
    title: 'Managing Your Classes',
    body: (
      <>
        <p>
          Click the <strong>vertical three-dot button (⋮)</strong> on any class card to open its options:
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>🗑️ <strong>Delete</strong> — permanently removes the class and all its cards</li>
          <li>📗 <strong>Active</strong> — currently taking this course</li>
          <li>📘 <strong>Ongoing</strong> — long-term or self-study subject</li>
          <li>📦 <strong>Archived</strong> — finished; hides it from your main dashboard</li>
        </ul>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'enter-class',
    navigateTo: 'dashboard',
    title: 'Open Your Class',
    body: (
      <>
        <p>
          Click on any class card to open it. Inside you'll see your materials,
          flashcard sets, and options to import new content.
        </p>
        <p className="mt-2 text-xs opacity-80">
          Click your class now — the tour will follow you in.
        </p>
      </>
    ),
    cta: 'Skip — take me in →',
    autoAdvanceOn: 'subject-route'
  },
  {
    id: 'import-intro',
    navigateTo: 'subject',
    title: 'Creating Your First Flashcard Set',
    body: (
      <p>
        This is the inside of your class. Click the <strong>Import</strong> button
        to create your first flashcard set. You can upload a file or paste your
        notes directly.
      </p>
    ),
    cta: 'Next →'
  },
  {
    id: 'import-walkthrough',
    navigateTo: 'subject',
    title: 'How Import Works',
    body: (
      <>
        <p className="mb-2">Inside the Import panel:</p>
        <ul className="space-y-2 text-sm">
          <li>
            <strong>AI Prompt</strong> — Neuron generates a ready-made prompt
            for you. Copy it, then paste it along with your study material into
            any AI of your choice — ChatGPT, Claude, Gemini, etc. The AI will
            return a formatted list of flashcards.
          </li>
          <li>
            <strong>Paste Cards Here</strong> — Take the cards the AI gave you
            and paste them into this box.
          </li>
          <li>
            <strong>Separators</strong> — These tell Neuron how to split each
            card's front from its back. The default is{' '}
            <code>...</code> between question and answer, and <code>;</code>{' '}
            between cards. Make sure your AI output matches these (or adjust
            them to match).
          </li>
        </ul>
      </>
    ),
    cta: 'Got it →'
  },
  {
    id: 'diagnostics-intro',
    navigateTo: 'diagnostics',
    title: 'Diagnostics',
    body: (
      <>
        <p>
          <strong>Diagnostics</strong> is how Neuron figures out your starting
          level. It shows you each card and asks you to rate how well you know
          it using the same 1–5 scale as a study session.
        </p>
        <p className="mt-2">
          This matters because new cards are assumed completely unknown until
          diagnosed. Running Diagnostics first lets you tell the algorithm which
          cards you already know well — so it won't waste your time drilling
          material you've already mastered.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'study-mode',
    navigateTo: 'study',
    title: 'Study Mode — The 3 Rating Buttons',
    body: (
      <>
        <p className="mb-2">
          After you flip a flashcard, you'll see three buttons. Be honest — the
          algorithm only works if you rate accurately:
        </p>
        <ul className="space-y-2 text-sm">
          <li>
            <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-1.5 align-middle" />
            <strong>Wrong</strong> — You blanked or got it wrong. Card comes back
            tomorrow.
          </li>
          <li>
            <span className="inline-block w-3 h-3 rounded-full bg-amber-400 mr-1.5 align-middle" />
            <strong>Partially Right</strong> — You kind of knew it. Card comes back
            in a few days.
          </li>
          <li>
            <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-1.5 align-middle" />
            <strong>Got It</strong> — You nailed it. Card comes back much later.
          </li>
        </ul>
        <p className="mt-2 text-xs opacity-75">
          Over time this builds a schedule where hard cards appear often and easy
          cards only appear when you're about to forget them.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'calendar',
    navigateTo: 'calendar',
    title: 'Calendar',
    body: (
      <>
        <p>
          The <strong>Calendar</strong> shows you how many flashcards are due on
          every day of the month so you can plan your study time.
        </p>
        <p className="mt-2">
          You can also create <strong>Events</strong> — add exam dates, quiz
          deadlines, and assignment due dates. Neuron uses these to boost the
          frequency of relevant cards in the days before your exam.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'analytics',
    navigateTo: 'analytics',
    title: 'Analytics',
    body: (
      <p>
        <strong>Analytics</strong> gives you the full picture of your progress:
        study streaks, total cards mastered, your review history over time, and
        your weakest cards. Use it to stay motivated and spot exactly where
        to focus more effort.
      </p>
    ),
    cta: 'Finish tour →'
  },
  {
    id: 'complete',
    modal: true,
    title: "You're All Set! 🎉",
    body: (
      <p>
        That's everything. Go add your first class, upload your notes, and let
        Neuron build your study schedule. You can replay this tour anytime from{' '}
        <strong>Settings → Help → Start Feature Tour</strong>.
      </p>
    ),
    cta: "Start studying →"
  }
]

// ─── Component ─────────────────────────────────────────────────────────────────

interface DemoTourProps {
  onComplete: () => void
}

export default function DemoTour({ onComplete }: DemoTourProps): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, subjects } = useAppStore()
  const [stepIdx, setStepIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  const prevSubjectCount = useRef(subjects.length)

  const step = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1

  // Resolve dynamic navigation target
  const resolveRoute = useCallback(
    (target: Step['navigateTo']): string | null => {
      switch (target) {
        case 'dashboard': return '/'
        case 'subject': {
          const id = subjects[0]?.id
          return id ? `/subject/${id}` : '/'
        }
        case 'diagnostics': {
          const id = subjects[0]?.id
          return id ? `/diagnostics/${id}` : '/'
        }
        case 'study': return '/study'
        case 'calendar': return '/calendar'
        case 'analytics': return '/analytics'
        default: return null
      }
    },
    [subjects]
  )

  // Navigate when step changes
  useEffect(() => {
    if (!step.modal && step.navigateTo) {
      const route = resolveRoute(step.navigateTo)
      if (route && location.pathname !== route) {
        navigate(route)
      }
    }
  }, [stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance: subject created
  useEffect(() => {
    if (
      step.autoAdvanceOn === 'subject-created' &&
      subjects.length > prevSubjectCount.current
    ) {
      prevSubjectCount.current = subjects.length
      advance()
    }
  }, [subjects.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance: user navigated into a subject
  useEffect(() => {
    if (
      step.autoAdvanceOn === 'subject-route' &&
      location.pathname.startsWith('/subject/')
    ) {
      advance()
    }
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  function advance(): void {
    if (stepIdx >= STEPS.length - 1) {
      onComplete()
      return
    }
    setVisible(false)
    setTimeout(() => {
      setStepIdx((i) => i + 1)
      setVisible(true)
    }, 200)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onComplete()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onComplete])

  const totalSteps = STEPS.length
  const progress = ((stepIdx + 1) / totalSteps) * 100

  // ── Full-screen modal (welcome / complete) ──────────────────────────────────
  if (step.modal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div
          className={`w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 transition-all duration-200 ${
            visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          <div className="flex flex-col items-center text-center">
            <div className="mb-5">
              {stepIdx === 0 ? (
                <NeuronLogo size={64} className="drop-shadow-lg" />
              ) : (
                <div className="text-5xl">🎉</div>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-3">
              {stepIdx === 0 && user?.name
                ? `Welcome, ${user.name}!`
                : step.title}
            </h2>
            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              {step.body}
            </div>
            <button
              onClick={isLast ? onComplete : advance}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-700 hover:to-violet-600 text-white font-semibold text-sm shadow-sm transition-all active:scale-[0.98]"
            >
              {step.cta}
            </button>
            {stepIdx === 0 && (
              <button
                onClick={onComplete}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Skip tour
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Floating hint bar (all other steps) ─────────────────────────────────────
  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-sky-500 transition-all duration-400"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="px-5 py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">
              Step {stepIdx} of {totalSteps - 1}
            </span>
            <button
              onClick={onComplete}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              Exit tour
            </button>
          </div>

          {/* Title + body */}
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-1.5">
            {step.title}
          </h3>
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {step.body}
          </div>

          {/* Action button */}
          <button
            onClick={advance}
            className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors active:scale-[0.98]"
          >
            {step.cta}
          </button>
        </div>
      </div>
    </div>
  )
}
