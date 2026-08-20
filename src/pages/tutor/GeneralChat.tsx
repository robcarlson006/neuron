import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import ChatMessage from '../../components/tutor/ChatMessage'
import ChatInput from '../../components/tutor/ChatInput'
import ChatWelcome from '../../components/tutor/ChatWelcome'
import SaveCardsModal from '../../components/tutor/SaveCardsModal'
import type { Message, LibraryFile } from '../../types'

export default function GeneralChat(): React.JSX.Element {
  const { user, subjects, addToast } = useAppStore()
  const navigate = useNavigate()

  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)
  const [showLibraryPicker, setShowLibraryPicker] = useState(false)
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([])
  const [saveCardsContent, setSaveCardsContent] = useState<string | null>(null)
  const [showSaveCards, setShowSaveCards] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)

  const streamingRef = useRef('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)
  const [focusKey, setFocusKey] = useState(0)

  const activeSubjects = subjects.filter(s => s.status !== 'archived')

  // Smart scroll
  useEffect(() => {
    const el = chatContainerRef.current
    if (!el) return
    function onScroll(): void {
      const container = chatContainerRef.current
      if (container) isNearBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight < 150
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (isNearBottom.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Init session on mount
  useEffect(() => {
    if (user) initSession()
  }, [user])

  async function initSession(): Promise<void> {
    if (!user) return
    try {
      const session = await window.electronAPI.tutorCreateSession(0, user.id, 'general') as { id: number }
      setSessionId(session.id)
    } catch (err) {
      console.error('Failed to create general chat session:', err)
    }
  }

  // ── Streaming listener ──
  useEffect(() => {
    const cleanup = window.electronAPI.onTutorChunk((chunk) => {
      if (chunk.type === 'text') {
        streamingRef.current += chunk.content
        setStreamingContent(streamingRef.current)
      } else if (chunk.type === 'done') {
        setSending(false)
        const finalContent = streamingRef.current
        streamingRef.current = ''
        setStreamingContent('')

        if (finalContent && sessionId) {
          window.electronAPI.tutorSaveMessage({
            session_id: sessionId,
            role: 'assistant',
            content: finalContent,
            content_type: 'text'
          }).catch(console.error)

          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            conversation_id: sessionId,
            role: 'assistant',
            content: finalContent,
            content_type: 'text',
            created_at: new Date().toISOString()
          }])
        }
        setFocusKey(prev => prev + 1)
      } else if (chunk.type === 'error') {
        setSending(false)
        streamingRef.current = ''
        setStreamingContent('')
        addToast({ type: 'error', title: 'AI Error', message: chunk.content || 'Something went wrong.' })
        setFocusKey(prev => prev + 1)
      }
    })
    return () => { cleanup() }
  }, [sessionId])

  // ── Send ──
  async function handleSend(message: string): Promise<void> {
    if (!navigator.onLine) {
      addToast({ type: 'error', title: 'No Internet Connection', message: 'Check your connection and try again.' })
      return
    }

    let convId = sessionId
    if (!convId) {
      if (!user) {
        addToast({ type: 'error', title: 'Error', message: 'User not found.' })
        return
      }
      try {
        const session = await window.electronAPI.tutorCreateSession(0, user.id, 'general') as { id: number }
        convId = session.id
        setSessionId(session.id)
      } catch (err) {
        addToast({ type: 'error', title: 'Error', message: 'Could not create chat session.' })
        return
      }
    }

    setSending(true)

    // Build context from selected subject
    let attachedContent = attachedFile?.content || ''
    if (selectedSubjectId && !attachedContent) {
      const selectedSubject = subjects.find(s => s.id === selectedSubjectId)
      if (selectedSubject) {
        attachedContent = `[Context from class: ${selectedSubject.name}]`
        // Try to attach first library file for context
        try {
          const files = await window.electronAPI.libraryGetFiles(selectedSubjectId) as LibraryFile[]
          if (files.length > 0) {
            const content = await window.electronAPI.libraryGetFileContent(files[0].id) as { content_text: string } | null
            if (content) {
              attachedContent += `\n\nRelevant material:\n${content.content_text.substring(0, 3000)}`
            }
          }
        } catch { /* ignore */ }
      }
    }

    // Save user message
    const userMsg = await window.electronAPI.tutorSaveMessage({
      session_id: convId,
      role: 'user',
      content: message,
      content_type: 'text'
    }) as Message

    setMessages(prev => [...prev, userMsg])

    // Build history
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const timeoutId = setTimeout(() => {
      setSending(false)
      streamingRef.current = ''
      setStreamingContent('')
      addToast({ type: 'error', title: 'Request timed out', message: 'The AI took too long.' })
    }, 120000)

    try {
      await window.electronAPI.tutorStreamChat({
        sessionId: convId,
        subjectId: selectedSubjectId || 0,
        message,
        sessionType: 'general',
        phase: 'structured_qa',
        conversationHistory: history,
        attachedContent
      })
    } catch (err) {
      clearTimeout(timeoutId)
      console.error('Chat error:', err)
      setSending(false)
      setStreamingContent('')
      addToast({ type: 'error', title: 'Chat Error', message: (err as Error).message || 'Something went wrong.' })
    } finally {
      clearTimeout(timeoutId)
    }

    setAttachedFile(null)
  }

  // ── Suggested prompt handler ──
  function handleSuggestedPrompt(prompt: string): void {
    handleSend(prompt)
  }

  // ── Card saving ──
  function handleSaveCards(content: string): void {
    setSaveCardsContent(content)
    setShowSaveCards(true)
  }

  function handleCardsSaved(_count: number): void {
    setShowSaveCards(false)
    setSaveCardsContent(null)
  }

  // ── File attachment ──
  async function handleAttachFile(): Promise<void> {
    try {
      const filePath = await window.electronAPI.libraryOpenFileDialog()
      if (!filePath) return
      const parseResult = await window.electronAPI.parseFile(filePath)
      if (parseResult) {
        await window.electronAPI.librarySaveFile(parseResult.filename, parseResult.contentText, 0)
        setAttachedFile({ name: parseResult.filename, content: parseResult.contentText })
      }
    } catch (err) {
      console.error('File attach error:', err)
    }
  }

  async function handleSelectFromLibrary(): Promise<void> {
    if (selectedSubjectId) {
      try {
        const files = await window.electronAPI.libraryGetFiles(selectedSubjectId) as LibraryFile[]
        setLibraryFiles(files)
        setShowLibraryPicker(true)
      } catch { /* ignore */ }
    }
  }

  function handleLibrarySelect(file: LibraryFile): void {
    window.electronAPI.libraryGetFileContent(file.id)
      .then(data => {
        if (data) {
          setAttachedFile({ name: file.filename, content: data.content_text })
          setShowLibraryPicker(false)
        }
      })
      .catch(console.error)
  }

  const isNewConversation = messages.length === 0

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Top bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/tutor')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-50">General Chat</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">Ask anything about your studies</p>
          </div>
        </div>

        {/* Class context selector */}
        {activeSubjects.length > 0 && (
          <select
            value={selectedSubjectId ?? ''}
            onChange={e => setSelectedSubjectId(e.target.value ? Number(e.target.value) : null)}
            className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-violet-400"
          >
            <option value="">No class context</option>
            {activeSubjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" ref={chatContainerRef}>
        {isNewConversation ? (
          <ChatWelcome
            subjectName={selectedSubjectId ? subjects.find(s => s.id === selectedSubjectId)?.name : undefined}
            onSelectPrompt={handleSuggestedPrompt}
          />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                created_at={msg.created_at}
                onSaveCards={msg.role === 'assistant' ? handleSaveCards : undefined}
              />
            ))}

            {(sending || streamingContent) && (
              <ChatMessage role="assistant" content={streamingContent} isStreaming={true} />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Library picker */}
      {showLibraryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowLibraryPicker(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg max-h-[60vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-3">Attach from Library</h3>
            {libraryFiles.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No files in this class library.</p>
            ) : (
              <div className="space-y-1">
                {libraryFiles.map(file => (
                  <button
                    key={file.id}
                    onClick={() => handleLibrarySelect(file)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-sm text-slate-600 dark:text-slate-300 truncate transition-colors"
                  >
                    {file.filename}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowLibraryPicker(false)} className="w-full mt-3 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Save cards modal */}
      {showSaveCards && saveCardsContent && (
        <SaveCardsModal
          subjectId={selectedSubjectId || (subjects.length > 0 ? subjects[0].id : 0)}
          messageContent={saveCardsContent}
          messageRole="assistant"
          onClose={() => setShowSaveCards(false)}
          onSaved={handleCardsSaved}
        />
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onAttachFile={handleAttachFile}
        onSelectFromLibrary={handleSelectFromLibrary}
        disabled={sending}
        attachedFile={attachedFile?.name || null}
        onClearAttachment={() => setAttachedFile(null)}
        refocusKey={focusKey}
        placeholder={selectedSubjectId ? `Ask about ${subjects.find(s => s.id === selectedSubjectId)?.name}...` : 'Ask anything...'}
      />
    </div>
  )
}
