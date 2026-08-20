import React from 'react'

interface ChatWelcomeProps {
  subjectName?: string
  onSelectPrompt?: (prompt: string) => void
}

type Suggestion = {
  icon: string
  text: string
  prompt: string
}

const suggestions: Suggestion[] = [
  {
    icon: '📝',
    text: 'Summarize my study materials',
    prompt: 'Summarize the key concepts from the materials I\'ve uploaded.'
  },
  {
    icon: '🧠',
    text: 'Quiz me with active recall',
    prompt: 'Give me an active recall question to test my knowledge.'
  },
  {
    icon: '📊',
    text: 'Create a study schedule',
    prompt: 'Help me create a study schedule to prepare for my upcoming exams.'
  },
  {
    icon: '🎯',
    text: 'Explain a difficult concept',
    prompt: 'Pick an important concept from my subject and explain it simply, like I\'m a beginner.'
  },
  {
    icon: '📋',
    text: 'Generate flashcards',
    prompt: 'Generate 10 flashcards from my subject material as study cards.'
  },
  {
    icon: '🔗',
    text: 'Connect topics',
    prompt: 'Show me how the main topics in this subject connect to each other.'
  }
]

export default function ChatWelcome({ subjectName, onSelectPrompt }: ChatWelcomeProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
      {/* Logo / greeting */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-500/20">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M8 12l8 8 8-8" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-1">
        Neuron AI Chat
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md mb-8">
        {subjectName
          ? `Ask questions about ${subjectName}, get help studying, or generate flashcards.`
          : 'Ask questions about your studies, get explanations, or practice with active recall.'}
      </p>

      {/* Suggestions grid */}
      {onSelectPrompt && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
          {suggestions.map((item, i) => (
            <button
              key={i}
              onClick={() => onSelectPrompt(item.prompt)}
              className="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm transition-all text-left group"
            >
              <span className="text-lg flex-shrink-0 mt-0.5">{item.icon}</span>
              <span className="text-sm text-slate-600 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors">
                {item.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
