import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import NeuronLogo from './NeuronLogo'

// ─── Step definitions ──────────────────────────────────────────────────────────

interface Step {
  id: string
  modal?: boolean           // full blocking modal (welcome / complete)
  navigateTo?: 'dashboard' | 'subject' | 'diagnostics' | 'study' | 'tutor' | 'calendar' | 'analytics'
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
        Let's take a quick tour so you know exactly how to get the most out of Neuron.
        We'll walk through all the core features together — it takes about 2 minutes.
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
        This is your <strong>Dashboard</strong> — your learning command center.
        Track flashcards due for review today, maintain your daily study streak, and watch your
        mastery grow. As you complete sessions, you'll earn <strong>achievement badges</strong> and level up!
      </p>
    ),
    cta: 'Next →'
  },
  {
    id: 'create-class',
    navigateTo: 'dashboard',
    title: 'Create Classes with AI',
    body: (
      <>
        <p>
          Click <strong>"+ New Class"</strong> to launch the Class Creation Wizard.
          Add course information, set upcoming exam dates, and upload study documents like PDFs, lecture slides,
          or notes.
        </p>
        <p className="mt-2 text-xs opacity-80">
          Neuron can automatically analyze your materials and generate a structured curriculum for you!
        </p>
      </>
    ),
    cta: 'Next →',
    autoAdvanceOn: 'subject-created'
  },
  {
    id: 'enter-class',
    navigateTo: 'dashboard',
    title: 'Open Your Class Workspace',
    body: (
      <>
        <p>
          Click on any class card to open its workspace. Inside you'll find dedicated tabs for
          your <strong>Curriculum</strong>, <strong>Cards</strong>, <strong>Materials</strong>, and <strong>Deadlines</strong>.
        </p>
        <p className="mt-2 text-xs opacity-80">
          Click your class now — the tour will follow you in.
        </p>
      </>
    ),
    cta: 'Enter class →',
    autoAdvanceOn: 'subject-route'
  },
  {
    id: 'curriculum-materials',
    navigateTo: 'subject',
    title: 'Curriculum & Study Materials',
    body: (
      <>
        <p>
          In the <strong>Curriculum</strong> and <strong>Materials</strong> tabs, you can view your structured course outline,
          track topic-by-topic progress, and upload course documents (PDF, DOCX, PPTX).
        </p>
        <p className="mt-2">
          Uploaded materials provide source context for AI tutoring and instant card generation.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'creating-cards',
    navigateTo: 'subject',
    title: 'Creating & Generating Cards',
    body: (
      <p>
        Build your decks effortlessly: create custom cards manually, bulk import from text, or click
        <strong> "AI Generate"</strong> to automatically extract high-yield questions and explanations
        directly from your uploaded documents or custom prompts.
      </p>
    ),
    cta: 'Next →'
  },
  {
    id: 'card-types',
    navigateTo: 'subject',
    title: '4 Powerful Card Types',
    body: (
      <>
        <p className="mb-2">Neuron supports multiple formats tailored for active recall:</p>
        <ul className="space-y-1 text-xs">
          <li>🃏 <strong>Flashcards</strong> — Classic 3D flip cards with question & answer</li>
          <li>✍️ <strong>Active Recall</strong> — Type your explanation and receive instant AI grading</li>
          <li>🧩 <strong>Cloze Deletion</strong> — Fill-in-the-blank cards to master key terminology</li>
          <li>🔘 <strong>Multiple Choice</strong> — Fast drill practice with intelligent distractors</li>
        </ul>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'diagnostics',
    navigateTo: 'diagnostics',
    title: 'Baseline Diagnostics',
    body: (
      <>
        <p>
          Before drilling new material, run <strong>Diagnostics</strong> to rate your starting familiarity
          on a 1–5 scale.
        </p>
        <p className="mt-2">
          This calibrates the spaced repetition algorithm so it won't waste your time reviewing concepts you already know well.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'study-mode',
    navigateTo: 'study',
    title: 'Smart Study Sessions',
    body: (
      <>
        <p className="mb-2">
          Flip cards with Spacebar, keyboard shortcuts, or swipe gestures. Rate each card honestly:
        </p>
        <ul className="space-y-1.5 text-xs">
          <li>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mr-1.5 align-middle" />
            <strong>Wrong</strong> (1) — Review again tomorrow
          </li>
          <li>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 mr-1.5 align-middle" />
            <strong>Partially Right</strong> (2) — Review in a few days
          </li>
          <li>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5 align-middle" />
            <strong>Got It</strong> (3) — Mastered; spaced far out
          </li>
        </ul>
        <p className="mt-2 text-xs opacity-80">
          Also features <strong>Learn Mode</strong> for new decks, <strong>Undo</strong> for quick corrections, and a built-in <strong>Pomodoro timer</strong>.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'ai-tutor',
    navigateTo: 'tutor',
    title: 'Personal AI Tutor',
    body: (
      <>
        <p>
          Need deep conceptual understanding? Visit the <strong>Tutor</strong> hub to launch interactive AI study sessions.
        </p>
        <p className="mt-2">
          Your tutor uses RAG (Retrieval-Augmented Generation) over your uploaded lecture notes to quiz you Socratically,
          clarify tricky concepts, and convert chat breakthroughs into flashcards on the spot.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'focus-blocks',
    navigateTo: 'tutor',
    title: 'Focus Blocks & Daily Plans',
    body: (
      <>
        <p>
          Neuron creates an optimized daily study plan based on your upcoming exams and card schedules.
        </p>
        <p className="mt-2">
          Launch a <strong>Focus Block</strong> for guided, distraction-free study intervals with persistent timers,
          automated task routing, and quick extension options.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'calendar',
    navigateTo: 'calendar',
    title: 'Calendar & Exam Boost',
    body: (
      <>
        <p>
          The <strong>Calendar</strong> displays your projected daily review workload so you can plan your week.
        </p>
        <p className="mt-2">
          Add exam or assignment deadlines to activate <strong>Exam Boost</strong> — Neuron automatically concentrates
          and prioritizes reviews for relevant topics as your test date approaches.
        </p>
      </>
    ),
    cta: 'Next →'
  },
  {
    id: 'analytics',
    navigateTo: 'analytics',
    title: 'Analytics & Mastery',
    body: (
      <>
        <p>
          Track your learning journey with detailed metrics: study streaks, retention rates, memory stability,
          and review forecasts.
        </p>
        <p className="mt-2">
          Identify your weakest cards so you know exactly where extra focus will deliver the highest returns!
        </p>
      </>
    ),
    cta: 'Finish tour →'
  },
  {
    id: 'complete',
    modal: true,
    title: "You're All Set! 🎉",
    body: (
      <p>
        You now have the full toolkit to master your coursework. Create your first class,
        add your study materials, and let Neuron's spaced repetition take care of the rest.
        You can revisit this tour anytime from <strong>Settings → Help → Start Feature Tour</strong>.
      </p>
    ),
    cta: 'Start studying →'
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
        case 'tutor': return '/tutor'
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
  }, [stepIdx, step.modal, step.navigateTo, resolveRoute, location.pathname, navigate])

  // Auto-advance: subject created
  useEffect(() => {
    if (
      step.autoAdvanceOn === 'subject-created' &&
      subjects.length > prevSubjectCount.current
    ) {
      prevSubjectCount.current = subjects.length
      advance()
    }
  }, [subjects.length, step.autoAdvanceOn])

  // Auto-advance: user navigated into a subject
  useEffect(() => {
    if (
      step.autoAdvanceOn === 'subject-route' &&
      location.pathname.startsWith('/subject/')
    ) {
      advance()
    }
  }, [location.pathname, step.autoAdvanceOn])

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

  function goBack(): void {
    if (stepIdx <= 0) return
    setVisible(false)
    setTimeout(() => {
      setStepIdx((i) => i - 1)
      setVisible(true)
    }, 200)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      if (e.key === 'Escape') {
        onComplete()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        advance()
      } else if (e.key === 'ArrowLeft' && stepIdx > 0) {
        goBack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [stepIdx, isLast, onComplete])

  const totalSteps = STEPS.length
  const progress = ((stepIdx + 1) / totalSteps) * 100

  // ── Full-screen modal (welcome / complete) ──────────────────────────────────
  if (step.modal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div
          className={`w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 border border-slate-200/80 dark:border-slate-800 transition-all duration-200 ${
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

            <div className="flex w-full gap-2">
              {isLast && (
                <button
                  onClick={goBack}
                  className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm transition-all active:scale-[0.98]"
                >
                  ← Back
                </button>
              )}
              <button
                onClick={isLast ? onComplete : advance}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-700 hover:to-violet-600 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98]"
              >
                {step.cta}
              </button>
            </div>

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

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                onClick={goBack}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors active:scale-[0.98]"
              >
                ← Back
              </button>
            )}
            <button
              onClick={advance}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-700 hover:to-violet-600 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              {step.cta}
            </button>
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="mt-2.5 text-[10px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2">
            <span>Navigate: <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[9px]">←</kbd> <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[9px]">→</kbd> / <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[9px]">Enter</kbd></span>
            <span>•</span>
            <span><kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[9px]">Esc</kbd> to exit</span>
          </div>
        </div>
      </div>
    </div>
  )
}
