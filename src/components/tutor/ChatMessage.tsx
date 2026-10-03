import React, { useEffect, useRef, useState } from 'react'
import { parseCardsFromText } from '../../lib/cardParser'
import MarkdownRenderer from '../MarkdownRenderer'

// Re-export SimpleMarkdown for backward compatibility
export const SimpleMarkdown = MarkdownRenderer
export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
  onSaveCards?: (content: string) => void
  onExtractCard?: (snippet: string) => void
  created_at?: string
}

export default function ChatMessage({
  role,
  content,
  isStreaming,
  onSaveCards,
  onExtractCard,
  created_at
}: ChatMessageProps): React.JSX.Element {
  const isUser = role === 'user'
  const [showActions, setShowActions] = useState(false)
  const [selectionAction, setSelectionAction] = useState<{ left: number; top: number; text: string } | null>(null)
  const messageRef = useRef<HTMLDivElement>(null)

  const hasCards = !isUser && !isStreaming && content.length > 50 &&
    parseCardsFromText(content).length > 0

  useEffect(() => {
    if (isUser || isStreaming || !onExtractCard) return undefined

    const dismissSelectionAction = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target && messageRef.current?.contains(target)) return
      setSelectionAction(null)
    }
    const dismissOnScroll = (): void => setSelectionAction(null)

    document.addEventListener('pointerdown', dismissSelectionAction)
    document.addEventListener('scroll', dismissOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', dismissSelectionAction)
      document.removeEventListener('scroll', dismissOnScroll, true)
    }
  }, [isStreaming, isUser, onExtractCard])

  function handleMessageMouseUp(): void {
    if (isUser || isStreaming || !onExtractCard || !messageRef.current) return
    const selection = window.getSelection()
    const text = selection?.toString().trim() || ''
    if (!selection || !text || text.length < 2 || !selection.anchorNode || !selection.focusNode ||
      !messageRef.current.contains(selection.anchorNode) || !messageRef.current.contains(selection.focusNode)) {
      setSelectionAction(null)
      return
    }

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    const rect = range?.getBoundingClientRect()
    if (!rect) {
      setSelectionAction(null)
      return
    }

    setSelectionAction({
      text,
      left: Math.min(Math.max(8, rect.left + (rect.width / 2) - 28), window.innerWidth - 72),
      top: Math.min(rect.bottom + 8, window.innerHeight - 48)
    })
  }

  function handleSelectionCard(): void {
    if (!selectionAction || !onExtractCard) return
    onExtractCard(selectionAction.text)
    setSelectionAction(null)
  }

  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
          : 'bg-neuron-500 text-white'
      }`}>
        {isUser ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" fill="none"/>
            <path d="M3 14c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      {/* Message bubble */}
      <div ref={messageRef} className={`relative max-w-[80%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`} onMouseUp={handleMessageMouseUp}>
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-violet-600 text-white rounded-tr-md'
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-md shadow-sm'
        }`}>
          {isUser ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              <MarkdownRenderer content={content} />
            </div>
          ) : (
            <div className={`${isStreaming ? 'animate-fade-in' : ''}`}>
              <SimpleMarkdown content={content} />
              {isStreaming && content && (
                <span className="inline-block w-1.5 h-4 bg-violet-500 dark:bg-violet-400 animate-pulse ml-0.5 rounded-sm" />
              )}
            </div>
          )}
        </div>

        {/* Action buttons row */}
        {showActions && !isStreaming && !isUser && (
          <div className="flex items-center gap-1.5 mt-1 px-1 animate-fade-in">
            {onExtractCard && content.trim().length > 15 && (
              <button
                type="button"
                onClick={() => {
                  const sel = window.getSelection()?.toString()?.trim()
                  onExtractCard(sel && sel.length > 5 ? sel : content)
                }}
                title="Create a card from this reply"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 border border-violet-200 dark:border-violet-800/60 transition-colors shadow-2xs cursor-pointer"
              >
                <span>🃏</span>
                <span>Card from reply</span>
              </button>
            )}
            {hasCards && onSaveCards && (
              <button
                type="button"
                onClick={() => onSaveCards(content)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1.5 2a.5.5 0 01.5-.5h5l3 3v5.5a.5.5 0 01-.5.5H2a.5.5 0 01-.5-.5V2z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M7 1.5V4h2.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                </svg>
                Save as Cards
              </button>
            )}
          </div>
        )}

        {/* Timestamp */}
        {created_at && !isStreaming && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">
            {isUser ? 'You' : 'Neuron AI'} · {new Date(created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        )}

        {/* Empty streaming state */}
        {isStreaming && !content && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {selectionAction && (
          <button
            type="button"
            aria-label="Card"
            title="Make a flashcard from the selected text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleSelectionCard}
            style={{ left: selectionAction.left, top: selectionAction.top }}
            className="fixed z-[60] flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-violet-900/20 transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 dark:border-violet-500 dark:focus:ring-offset-slate-950"
          >
            <span aria-hidden="true">🃏</span>
            <span>Card</span>
          </button>
        )}
      </div>
    </div>
  )
}
