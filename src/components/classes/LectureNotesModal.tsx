import React, { useState } from 'react'

interface LectureNotesModalProps {
  title: string
  markdown: string
  onClose: () => void
  onGenerateCards?: () => void
}

export default function LectureNotesModal({
  title,
  markdown,
  onClose,
  onGenerateCards
}: LectureNotesModalProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_notes.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-base text-slate-800 dark:text-slate-100 truncate">
              {title}
            </h3>
            <p className="text-xs text-slate-400">Structured Lecture Notes</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onGenerateCards && (
              <button
                onClick={() => {
                  onClose()
                  onGenerateCards()
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors text-xs font-medium flex items-center gap-1.5"
                title="Create flashcards from this lecture"
              >
                <span>✨</span>
                <span>Generate Cards</span>
              </button>
            )}

            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-xs font-medium"
            >
              {copied ? '✓ Copied' : 'Copy MD'}
            </button>

            <button
              onClick={handleExport}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-xs font-medium"
              title="Save markdown file to computer"
            >
              Export .md
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-sans select-text">
          <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-xs bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            {markdown}
          </div>
        </div>
      </div>
    </div>
  )
}
