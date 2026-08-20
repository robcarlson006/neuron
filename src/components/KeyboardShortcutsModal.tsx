import React, { useEffect, useState, useCallback } from 'react'

interface ShortcutSection {
  title: string
  shortcuts: Array<{ key: string; description: string }>
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Study Session',
    shortcuts: [
      { key: 'Space / Enter', description: 'Flip card / Reveal cloze' },
      { key: '1', description: 'Rate: Wrong / Again' },
      { key: '2', description: 'Rate: Hard' },
      { key: '3', description: 'Rate: Good' },
      { key: 'S', description: 'Skip card' },
    ],
  },
  {
    title: 'Multiple Choice',
    shortcuts: [
      { key: '1-4', description: 'Select option' },
      { key: 'Enter', description: 'Confirm / Next' },
    ],
  },
  {
    title: 'Chat & AI',
    shortcuts: [
      { key: '⌘N / Ctrl+N', description: 'New conversation' },
      { key: 'Escape', description: 'Close sidebar / modal' },
      { key: 'Enter', description: 'Send message' },
      { key: '⇧Enter', description: 'New line' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { key: '?', description: 'Toggle this guide' },
      { key: '⌘K / Ctrl+K', description: 'Quick search' },
      { key: '⌘, / Ctrl+,', description: 'Open settings' },
    ],
  },
]

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  // Global listener for '?' key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold dark:text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close shortcuts"
          >
            <svg className="w-5 h-5 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.key}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {shortcut.description}
                    </span>
                    <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1 rounded">
                      {shortcut.key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Press <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">?</kbd> to toggle this guide at any time
          </p>
        </div>
      </div>
    </div>
  )
}

// Global hook to register the '?' key listener
export function useKeyboardShortcutsModal(): [boolean, () => void, () => void] {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Don't open when typing in an input
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return [isOpen, open, close]
}

export { SHORTCUT_SECTIONS }
export default KeyboardShortcutsModal
