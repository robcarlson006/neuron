import React, { useState } from 'react'
import LatexText from '../LatexText'
import { parseCardsFromText } from '../../lib/cardParser'

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  isStreaming?: boolean
  onSaveCards?: (content: string) => void
  created_at?: string
}

/**
 * Simplified markdown renderer that handles:
 * - **bold** text
 * - Bullet lists (- , *)
 * - Numbered lists
 * - Paragraph breaks
 * - LaTeX math ($...$, $$...$$) via LatexText
 */
function SimpleMarkdown({ content }: { content: string }): React.JSX.Element {
  // Split into segments by math blocks for LatexText processing
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g)

  return (
    <span className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('$$') || (part.startsWith('$') && part.endsWith('$'))) {
          return <LatexText key={i}>{part}</LatexText>
        }
        return <PlainText key={i} text={part} />
      })}
    </span>
  )
}

function PlainText({ text }: { text: string }): React.JSX.Element {
  // Split by \n\n for paragraphs
  const paragraphs = text.split(/\n\n+/)
  return (
    <>
      {paragraphs.map((para, pi) => {
        // Check if it's a list
        const lines = para.split('\n')
        const isList = lines.some(l => /^\s*[-*•]\s/.test(l) || /^\s*\d+[.)]\s/.test(l))

        if (isList) {
          return (
            <span key={pi}>
              {renderListLines(lines)}
              {pi < paragraphs.length - 1 && <><br /><br /></>}
            </span>
          )
        }

        return (
          <span key={pi}>
            {renderBold(para)}
            {pi < paragraphs.length - 1 && <><br /><br /></>}
          </span>
        )
      })}
    </>
  )
}

function renderListLines(lines: string[]): React.ReactNode {
  return (
    <span className="block">
      {lines.map((line, li) => {
        const trimmed = line.trim()
        if (!trimmed) return <br key={li} />
        const match = trimmed.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/)
        if (match) {
          return (
            <span key={li} className="block ml-4">
              <span className="inline-block w-4 text-slate-400 dark:text-slate-500">{match[1]}</span>
              {renderBold(match[2])}
              <br />
            </span>
          )
        }
        return <span key={li}>{renderBold(trimmed)}<br /></span>
      })}
    </span>
  )
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        const boldMatch = part.match(/^\*\*(.+)\*\*$/)
        if (boldMatch) {
          return <strong key={i} className="font-semibold text-slate-800 dark:text-slate-100">{boldMatch[1]}</strong>
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

export default function ChatMessage({
  role,
  content,
  isStreaming,
  onSaveCards,
  created_at
}: ChatMessageProps): React.JSX.Element {
  const isUser = role === 'user'
  const [showActions, setShowActions] = useState(false)

  const hasCards = !isUser && !isStreaming && content.length > 50 &&
    parseCardsFromText(content).length > 0

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
      <div className={`max-w-[80%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-violet-600 text-white rounded-tr-md'
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-md shadow-sm'
        }`}>
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
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
          <div className="flex items-center gap-1 mt-1 px-1 animate-fade-in">
            {hasCards && onSaveCards && (
              <button
                onClick={() => onSaveCards(content)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
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
      </div>
    </div>
  )
}
