import React, { useState, useRef, useCallback, useEffect } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  onAttachFile?: () => void
  onSelectFromLibrary?: () => void
  disabled?: boolean
  placeholder?: string
  attachedFile?: string | null
  onClearAttachment?: () => void
  refocusKey?: number
}

export default function ChatInput({
  onSend,
  onAttachFile,
  onSelectFromLibrary,
  disabled,
  placeholder,
  attachedFile,
  onClearAttachment,
  refocusKey
}: ChatInputProps): React.JSX.Element {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [input])

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Programmatic refocus when refocusKey changes
  useEffect(() => {
    textareaRef.current?.focus()
  }, [refocusKey])

  function handleSubmit(): void {
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [input, disabled])

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
      {/* Attached file indicator */}
      {attachedFile && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
          <span className="text-sm">📎</span>
          <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">
            {attachedFile}
          </span>
          {onClearAttachment && (
            <button
              onClick={onClearAttachment}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 focus-within:border-violet-400 dark:focus-within:border-violet-600 transition-colors">
        {/* Attach file button */}
        {onAttachFile && (
          <button
            onClick={onAttachFile}
            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
            title="Attach a file"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 4v7M9 11l-2.5-2.5M9 11l2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 9v4a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        {/* Library button */}
        {onSelectFromLibrary && (
          <button
            onClick={onSelectFromLibrary}
            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
            title="Select from library"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 3h4v12H3V3z" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M11 6h4v9h-4V6z" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M3 13.5h12" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          </button>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Ask a question about your studies...'}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 resize-none outline-none py-1.5 max-h-[200px]"
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || disabled}
          className={`p-1.5 rounded-xl transition-colors flex-shrink-0 ${
            input.trim() && !disabled
              ? 'bg-violet-600 text-white hover:bg-violet-700'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8l5-5 5 5M7 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Helper text */}
      <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1.5">
        <kbd className="text-xs">Enter</kbd> to send · <kbd className="text-xs">Shift</kbd>+<kbd className="text-xs">Enter</kbd> for new line
      </p>
    </div>
  )
}
