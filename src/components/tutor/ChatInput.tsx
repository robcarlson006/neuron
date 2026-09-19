import React, { useState, useRef, useCallback, useEffect } from 'react'
import LatexText from '../LatexText'
import MathKeyboard from '../practice/MathKeyboard'
import { Sigma, Calculator as CalcIcon } from '../icons'

interface ChatInputProps {
  onSend: (message: string) => void
  onAttachFile?: () => void
  onSelectFromLibrary?: () => void
  onToggleCalculator?: () => void
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
  onToggleCalculator,
  disabled,
  placeholder,
  attachedFile,
  onClearAttachment,
  refocusKey
}: ChatInputProps): React.JSX.Element {
  const [input, setInput] = useState('')
  const [showMathPalette, setShowMathPalette] = useState(false)
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

  const handleInsertSnippet = (snippet: string) => {
    if (!textareaRef.current) {
      setInput((prev) => prev + snippet)
      return
    }

    const textarea = textareaRef.current
    const start = textarea.selectionStart || 0
    const end = textarea.selectionEnd || 0
    const text = textarea.value
    const updated = text.substring(0, start) + snippet + text.substring(end)
    setInput(updated)

    setTimeout(() => {
      textarea.focus()
      const nextPos = start + snippet.length
      textarea.setSelectionRange(nextPos, nextPos)
    }, 0)
  }

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
    <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 space-y-2">
      {/* Attached file indicator */}
      {attachedFile && (
        <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
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

      {/* Math Keyboard Palette */}
      {showMathPalette && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-150 p-2 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700">
          <MathKeyboard onInsert={handleInsertSnippet} />
        </div>
      )}

      {/* Live Math Preview */}
      {(input.includes('$') || input.includes('\\') || input.includes('^') || input.includes('_')) && (
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-left animate-in fade-in">
          <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 block mb-1">
            Live Math Preview:
          </span>
          <div className="text-sm text-slate-800 dark:text-slate-200 font-sans">
            <LatexText>{input}</LatexText>
          </div>
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

        {/* Math Palette Toggle */}
        <button
          type="button"
          onClick={() => setShowMathPalette((prev) => !prev)}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
            showMathPalette
              ? 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/60 font-bold'
              : 'text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          title="Toggle Math Keyboard Palette"
        >
          <Sigma size={16} />
        </button>

        {/* Calculator Widget Toggle */}
        {onToggleCalculator && (
          <button
            type="button"
            onClick={onToggleCalculator}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
            title="Open Scientific Calculator"
          >
            <CalcIcon size={16} />
          </button>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Ask a question (use standard text or LaTeX math)...'}
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
      <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1">
        <kbd className="text-xs">Enter</kbd> to send · <kbd className="text-xs">Shift</kbd>+<kbd className="text-xs">Enter</kbd> for newline · Click <Sigma size={10} className="inline mx-0.5" /> for Math Keyboard
      </p>
    </div>
  )
}
