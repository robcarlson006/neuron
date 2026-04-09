import React, { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import NeuronLogo from './NeuronLogo'

interface DemoStep {
  icon: React.ReactNode
  title: string
  description: string
  tip?: string
}

const steps: DemoStep[] = [
  {
    icon: <NeuronLogo size={64} className="drop-shadow-lg" />,
    title: 'Welcome to Neuron!',
    description:
      'Neuron is your AI-powered study companion. It uses spaced repetition and active recall — the two most effective study techniques known to science — to help you learn faster and remember longer.',
    tip: 'This tour takes about 2 minutes. You can always replay it from Settings → Help.'
  },
  {
    icon: (
      <div className="text-5xl select-none">🏠</div>
    ),
    title: 'Your Dashboard',
    description:
      'The Dashboard is your home base. It shows all your subjects at a glance, how many flashcards are due for review today, and lets you jump straight into a study session with one click.',
    tip: 'Cards due today appear as a badge on each subject. Green = you\'re on top of it!'
  },
  {
    icon: (
      <div className="text-5xl select-none">📚</div>
    ),
    title: 'Creating Subjects',
    description:
      'Start by creating a subject for each course or topic you\'re studying. Click the "+ New Subject" button on the Dashboard. Give it a name (e.g. "Biology 101") and an optional course code.',
    tip: 'You can mark subjects as Active, Ongoing, or Archived to keep your Dashboard clean.'
  },
  {
    icon: (
      <div className="text-5xl select-none">📄</div>
    ),
    title: 'Uploading Your Materials',
    description:
      'Inside each subject, click "Upload File" to add your notes, textbook chapters, or slides. Neuron supports PDF, Word (.docx), and PowerPoint (.pptx) files.',
    tip: 'The more detailed your notes, the better the AI-generated cards will be.'
  },
  {
    icon: (
      <div className="text-5xl select-none">✨</div>
    ),
    title: 'AI Card Generation',
    description:
      'After uploading a file, click "Generate Cards". Neuron sends your notes to Google Gemini AI, which automatically creates both flashcards and open-ended active recall questions for you.',
    tip: 'You\'ll need a Google Gemini API key — add it in Settings. It\'s free to get started.'
  },
  {
    icon: (
      <div className="text-5xl select-none">🃏</div>
    ),
    title: 'Flashcards',
    description:
      'Flashcards have a front (the question or term) and a back (the answer). During a study session, you flip the card, then rate how well you knew it from 1 (blank) to 5 (perfect). That rating trains the algorithm.',
    tip: 'You can also create cards manually from the subject page — great for adding your own.'
  },
  {
    icon: (
      <div className="text-5xl select-none">💭</div>
    ),
    title: 'Active Recall Questions',
    description:
      'Active recall questions ask you to write out a full answer in your own words. After you submit, AI evaluates your response, shows you the model answer, and gives detailed feedback on what you got right or missed.',
    tip: 'Writing answers from scratch is the most powerful study technique — stronger than re-reading by far.'
  },
  {
    icon: (
      <div className="text-5xl select-none">🧠</div>
    ),
    title: 'Spaced Repetition',
    description:
      'Neuron uses the SM-2 spaced repetition algorithm (the science behind Anki). Cards you know well are shown less frequently; cards you struggle with come back sooner. Over time, this builds deep long-term memory.',
    tip: 'Consistency beats cramming. Even 10 minutes of daily review compounds dramatically over a semester.'
  },
  {
    icon: (
      <div className="text-5xl select-none">📊</div>
    ),
    title: 'Analytics',
    description:
      'The Analytics page tracks your study streaks, total cards mastered, review history over time, and your weakest cards. Use it to see where you\'re strong and where to focus more effort.',
    tip: 'Your "weakest cards" list is gold — those are the ones that will show up on your exam.'
  },
  {
    icon: (
      <div className="text-5xl select-none">📅</div>
    ),
    title: 'Calendar & Deadlines',
    description:
      'Add exams, quizzes, and assignment due dates to the Calendar. Neuron displays upcoming deadlines so you can plan your study sessions and avoid last-minute cramming.',
    tip: 'Deadlines are tied to subjects, so you always know which material is time-sensitive.'
  },
  {
    icon: (
      <div className="text-5xl select-none">⚡</div>
    ),
    title: 'Diagnostics',
    description:
      'Run a rapid multiple-choice Diagnostic test for any subject. It quickly identifies what you know cold and what still needs work — perfect for a pre-exam knowledge check.',
    tip: 'Diagnostics generate fresh multiple-choice questions using AI each time, so they stay challenging.'
  },
  {
    icon: (
      <div className="text-5xl select-none">⚙️</div>
    ),
    title: 'Settings',
    description:
      'In Settings you can update your display name, switch between light and dark mode, and manage your Google Gemini API key (required for AI features). Your data is stored 100% locally — nothing leaves your device.',
    tip: 'To replay this tour anytime, go to Settings → Help → Start Tour.'
  },
  {
    icon: (
      <div className="text-6xl select-none">🎉</div>
    ),
    title: "You're Ready to Learn!",
    description:
      "That's everything you need to know. Add your first subject, upload your notes, generate cards, and start studying. Neuron handles the scheduling — you just show up.",
    tip: 'Start small: one subject, one upload. You\'ll have cards in under a minute.'
  }
]

interface DemoTourProps {
  onComplete: () => void
}

export default function DemoTour({ onComplete }: DemoTourProps): React.JSX.Element {
  const { user } = useAppStore()
  const [step, setStep] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')

  const goTo = useCallback(
    (next: number, dir: 'forward' | 'back') => {
      if (animating) return
      setAnimating(true)
      setDirection(dir)
      setTimeout(() => {
        setStep(next)
        setAnimating(false)
      }, 220)
    },
    [animating]
  )

  const handleNext = useCallback(() => {
    if (step < steps.length - 1) {
      goTo(step + 1, 'forward')
    } else {
      onComplete()
    }
  }, [step, goTo, onComplete])

  const handleBack = useCallback(() => {
    if (step > 0) goTo(step - 1, 'back')
  }, [step, goTo])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext()
      if (e.key === 'ArrowLeft') handleBack()
      if (e.key === 'Escape') onComplete()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleNext, handleBack, onComplete])

  const current = steps[step]
  const isLast = step === steps.length - 1

  const slideClass = animating
    ? direction === 'forward'
      ? 'opacity-0 translate-x-4'
      : 'opacity-0 -translate-x-4'
    : 'opacity-100 translate-x-0'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-sky-500 transition-all duration-400 ease-out"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Step counter */}
        <div className="px-6 pt-4 flex justify-between items-center">
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
            Step {step + 1} of {steps.length}
          </span>
          <button
            onClick={onComplete}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Skip tour
          </button>
        </div>

        {/* Content */}
        <div
          className={`px-8 py-6 flex flex-col items-center text-center transition-all duration-220 ease-out ${slideClass}`}
        >
          {/* Icon */}
          <div className="mb-5 flex items-center justify-center">
            {current.icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-3">
            {step === 0 && user?.name
              ? `Welcome, ${user.name}!`
              : current.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            {current.description}
          </p>

          {/* Tip */}
          {current.tip && (
            <div className="w-full bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40 rounded-xl px-4 py-3 text-xs text-violet-700 dark:text-violet-300 text-left">
              <span className="font-semibold">Tip: </span>
              {current.tip}
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-2">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i, i > step ? 'forward' : 'back')}
              className={`rounded-full transition-all duration-200 ${
                i === step
                  ? 'w-5 h-2 bg-violet-500'
                  : i < step
                  ? 'w-2 h-2 bg-violet-300 dark:bg-violet-700'
                  : 'w-2 h-2 bg-slate-200 dark:bg-slate-700'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="px-8 pb-8 flex gap-3">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleNext}
            className="flex-[2] py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-700 hover:to-violet-600 text-white shadow-sm transition-all active:scale-[0.98]"
          >
            {isLast ? "Let's Go! 🚀" : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
