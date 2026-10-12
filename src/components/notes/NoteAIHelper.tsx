import React, { useState, useRef, useEffect } from 'react'
import MarkdownRenderer from '../MarkdownRenderer'

export interface NoteAIHelperProps {
  subjectName?: string
  lectureTitle?: string
  currentNotes?: string
  onInsertText?: (text: string) => void
  className?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function NoteAIHelper({
  subjectName,
  lectureTitle,
  currentNotes,
  onInsertText,
  className = ''
}: NoteAIHelperProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I'm your AI note-taking helper${subjectName ? ` for **${subjectName}**` : ''}. Ask me any questions while you study or take notes!`
    }
  ])
  const [loading, setLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [insertedIndex, setInsertedIndex] = useState<number | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen) {
      if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [messages, isOpen])

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  async function handleSend(customText?: string): Promise<void> {
    const textToSend = (customText ?? input).trim()
    if (!textToSend || loading) return

    const userMessage: Message = { role: 'user', content: textToSend }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      if (window.electronAPI?.noteHelperChat) {
        // Send previous context + new message
        const chatPayload = updatedMessages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(-10) // keep last 10 messages for context

        const res = await window.electronAPI.noteHelperChat({
          messages: chatPayload,
          context: {
            subjectName,
            lectureTitle,
            currentNotes
          }
        })

        if (res.success && res.text) {
          setMessages(prev => [...prev, { role: 'assistant', content: res.text! }])
        } else {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: res.error || 'Sorry, I had trouble answering that. Please try again.' }
          ])
        }
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'AI Chat Helper service is currently not available.' }
        ])
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Failed to reach AI helper.'}` }
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  function copyToClipboard(text: string, index: number): void {
    void navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  function handleInsert(text: string, index: number): void {
    if (onInsertText) {
      onInsertText(text)
      setInsertedIndex(index)
      setTimeout(() => setInsertedIndex(null), 2000)
    }
  }

  function clearHistory(): void {
    setMessages([
      {
        role: 'assistant',
        content: `Chat cleared. Ask me any question about your notes or study material!`
      }
    ])
  }

  return (
    <div className={`relative ${className}`}>
      {/* ── Toggle Floating Button (when closed) ── */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Open AI Note Helper"
          className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg ring-2 ring-violet-300/40 transition-all hover:scale-105 hover:shadow-violet-500/25 dark:ring-violet-700/50"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">
            ✦
          </span>
          <span>Ask AI Helper</span>
        </button>
      )}

      {/* ── Chat Drawer / Flyout Panel (when open) ── */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[540px] w-[370px] flex-col rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-900/95 dark:ring-white/10">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white shadow-xs">
                ✦
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-white">
                  Note AI Helper
                </h3>
                <p className="text-[10px] text-slate-400 truncate max-w-[190px]">
                  {lectureTitle || subjectName || 'Context aware notes assistant'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearHistory}
                title="Clear chat history"
                className="rounded p-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close AI helper"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-2xs ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-xs'
                      : 'border border-slate-200/80 bg-slate-50 text-slate-800 rounded-bl-xs dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-100'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                    <div className="prose prose-xs dark:prose-invert max-w-none text-xs">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  )}
                </div>

                {/* Assistant Action Buttons (Insert into notes & Copy) */}
                {msg.role === 'assistant' && idx > 0 && (
                  <div className="mt-1 flex items-center gap-2 pl-1">
                    {onInsertText && (
                      <button
                        type="button"
                        onClick={() => handleInsert(msg.content, idx)}
                        className="text-[10px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition"
                      >
                        {insertedIndex === idx ? '✓ Inserted' : '+ Insert into notes'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(msg.content, idx)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
                    >
                      {copiedIndex === idx ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-slate-400 text-xs pl-2">
                <span className="h-2 w-2 rounded-full bg-violet-600 animate-pulse" />
                <span>Thinking…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-1.5 border-t border-slate-100/60 dark:border-slate-800/60 no-scrollbar">
            <button
              type="button"
              onClick={() => void handleSend('Can you explain this concept in simple terms?')}
              className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-violet-50 hover:text-violet-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
            >
              Explain concept
            </button>
            <button
              type="button"
              onClick={() => void handleSend('Give me a clear, concrete example of this.')}
              className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-violet-50 hover:text-violet-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
            >
              Give example
            </button>
            <button
              type="button"
              onClick={() => void handleSend('What is the formula or equation for this?')}
              className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-violet-50 hover:text-violet-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
            >
              Formula / Math
            </button>
          </div>

          {/* Input Area */}
          <div className="border-t border-slate-100 p-3 dark:border-slate-800">
            <div className="relative flex items-center">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this concept or topic… (Enter to send)"
                rows={1}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-10 text-xs outline-none focus:border-violet-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-violet-500"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim() || loading}
                title="Send message"
                className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700 transition"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.8 14.5a.5.5 0 0 1-.928 0L6.46 8.54.146 5.764a.5.5 0 0 1 0-.928L14.646.036a.5.5 0 0 1 .54.11z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
