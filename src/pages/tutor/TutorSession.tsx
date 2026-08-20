import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import ChatMessage from '../../components/tutor/ChatMessage'
import ChatInput from '../../components/tutor/ChatInput'
import TutorCardReviewModal from '../../components/tutor/TutorCardReviewModal'
import type { Message, SyllabusModule, TutorSessionConfig, TutorSessionRuntime, PacingStatus } from '../../types'

type SessionPhase = 'structured_qa' | 'socratic' | 'summary' | 'complete'
type PageState = 'loading' | 'streaming' | 'awaiting_input' | 'phase_transition' | 'session_complete' | 'error'

export default function TutorSession(): React.JSX.Element {
  const { classId } = useParams<{ classId: string }>()
  const subjectId = Number(classId)
  const navigate = useNavigate()
  const { user, subjects, addToast } = useAppStore()
  const subject = subjects.find(s => s.id === subjectId)

  // ── State ──
  const [pageState, setPageState] = useState<PageState>('loading')
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('structured_qa')
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCardReview, setShowCardReview] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)
  const [focusKey, setFocusKey] = useState(0)

  // Syllabus context
  const [currentModule, setCurrentModule] = useState<SyllabusModule | null>(null)
  const [masteredTopics, setMasteredTopics] = useState<string[]>([])
  const [weakTopics, setWeakTopics] = useState<string[]>([])

  // Session config (from URL params)
  const [searchParams] = useSearchParams()
  const [sessionConfig, setSessionConfig] = useState<TutorSessionConfig | null>(null)

  // Timer + memory runtime state
  const [runtime, setRuntime] = useState<TutorSessionRuntime>({
    config: { duration_minutes: null, depth_level: 3, never_studied: false },
    started_at: Date.now(),
    time_elapsed_seconds: 0,
    time_remaining_seconds: 0,
    is_time_up: false,
    topics_covered: [],
    questions_asked: [],
    topics_mastered: [],
    weak_topics: [],
  })
  const [showTimeUp, setShowTimeUp] = useState(false)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const streamingRef = useRef('')
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)
  const streamDoneRef = useRef(false) // guards against duplicate done events

  // ── Smart scroll ──
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
    if (isNearBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingContent])

  // ── Load / init session ──
  useEffect(() => {
    if (user && subjectId) {
      initSession()
    }
  }, [user, subjectId])

  async function initSession(): Promise<void> {
    if (!user) return
    setPageState('loading')
    setError(null)

    // Decode session config from URL params
    const configParam = searchParams.get('config')
    let config: TutorSessionConfig
    if (configParam) {
      try {
        config = JSON.parse(decodeURIComponent(configParam))
      } catch {
        config = { duration_minutes: null, depth_level: 3, never_studied: false }
      }
    } else {
      config = { duration_minutes: null, depth_level: 3, never_studied: false }
    }
    setSessionConfig(config)

    try {
      // Load syllabus modules
      const mods = await window.electronAPI.syllabusListModules(subjectId) as SyllabusModule[]
      const inProgressMod = mods.find(m => m.status === 'in_progress') || mods.find(m => m.status === 'pending')
      if (inProgressMod) setCurrentModule(inProgressMod)

      // Load mastery data
      try {
        const mastery = await window.electronAPI.getConceptMastery(user.id, subjectId) as { concept: string; mastery_prob: number }[]
        setMasteredTopics(mastery.filter(m => m.mastery_prob >= 0.8).map(m => m.concept))
        setWeakTopics(mastery.filter(m => m.mastery_prob < 0.45).map(m => m.concept))
      } catch { /* ignore */ }

      // Initialize timer state
      const now = Date.now()
      setRuntime({
        config,
        started_at: now,
        time_elapsed_seconds: 0,
        time_remaining_seconds: config.duration_minutes ? config.duration_minutes * 60 : 0,
        is_time_up: false,
        topics_covered: [],
        questions_asked: [],
        topics_mastered: [],
        weak_topics: [],
      })

      // Create a new tutor session
      const session = await window.electronAPI.tutorCreateSession(
        subjectId, user.id, 'tutor', inProgressMod?.id,
        config.duration_minutes !== null ? {
          duration_minutes: config.duration_minutes,
          depth_level: config.depth_level,
          never_studied: config.never_studied ? 1 : 0
        } : undefined
      ) as { id: number; phase: string }
      setSessionId(session.id)
      setSessionPhase(session.phase as SessionPhase)

      // Mark current module as in_progress if it was pending
      if (inProgressMod && inProgressMod.status === 'pending') {
        try {
          await window.electronAPI.syllabusUpdateModule(inProgressMod.id, { status: 'in_progress' })
        } catch { /* non-critical */ }
      }

      // Send a "ready to learn" system message to start the session
      const difficultyMap = ['', 'Beginner', 'Intermediate', 'Proficient', 'Expert', 'Professor']
      const difficultyLabel = difficultyMap[config.depth_level] || 'Proficient'
      const topic = inProgressMod?.title || subject?.name || 'this subject'
      const initialMsg = `Greet me and ask your first question in this exact format:
"Welcome! Let's dive into [topic]. [Specific question about the topic]?"

For example: "Welcome! Let's explore the Prologue of The Alchemist. What lesson does the narrator draw from the myth of Narcissus and the lake?"

Topic: ${topic}
Difficulty: ${difficultyLabel}
${config.duration_minutes ? `Duration: ${config.duration_minutes} min` : 'No time limit — go at your own pace'}
${config.never_studied ? 'The student has never studied this before. Start from absolute basics.' : ''}`

      // Save the initial user message
      await window.electronAPI.tutorSaveMessage({
        session_id: session.id,
        role: 'user',
        content: initialMsg,
        content_type: 'text'
      })

      setMessages([{
        id: 'init',
        conversation_id: session.id,
        role: 'user',
        content: initialMsg,
        content_type: 'text',
        created_at: new Date().toISOString()
      }])

      // Start streaming the AI's first response
      setPageState('streaming')
      await streamMessage(session.id, initialMsg, 'structured_qa', [])
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('Session init error:', errMsg)
      if (errMsg.includes('API key') || errMsg.includes('not configured') || errMsg.includes('401') || errMsg.includes('Unauthorized')) {
        setError('Failed to start tutor session. Make sure your API key is configured.')
      } else if (errMsg.includes('SQLITE_CONSTRAINT') || errMsg.includes('FOREIGN KEY')) {
        setError('Database error: tutor session could not be created. Please restart the app.')
      } else {
        setError(`Failed to start tutor session: ${errMsg}`)
      }
      setPageState('error')
    }
  }

  // ── Streaming ──
  async function streamMessage(
    convId: number,
    message: string,
    phase: SessionPhase,
    history: { role: 'user' | 'assistant'; content: string }[],
    attached?: { name: string; content: string }
  ): Promise<void> {
    setSending(true)
    setPageState('streaming')
    streamingRef.current = ''
    setStreamingContent('')
    streamDoneRef.current = false

    const timeoutId = setTimeout(() => {
      setSending(false)
      streamingRef.current = ''
      setStreamingContent('')
      addToast({ type: 'error', title: 'Request timed out', message: 'The AI took too long to respond.' })
    }, 120000)

    try {
      await window.electronAPI.tutorStreamChat({
        sessionId: convId,
        subjectId,
        message,
        sessionType: 'tutor',
        phase: phase as 'structured_qa' | 'socratic' | 'summary',
        conversationHistory: history,
        moduleContext: currentModule ? {
          moduleTitle: currentModule.title,
          currentTopic: currentModule.title,
          masteredTopics,
          weakTopics
        } : undefined,
        attachedContent: attached?.content,
        durationMinutes: runtime.config.duration_minutes,
        depthLevel: runtime.config.depth_level,
        neverStudied: runtime.config.never_studied,
        timeElapsedSeconds: runtime.time_elapsed_seconds,
        timeRemainingSeconds: runtime.time_remaining_seconds,
        pacingStatus: calcPacingStatus(runtime),
        topicsCovered: runtime.topics_covered,
        questionsAsked: runtime.questions_asked,
        topicsMastered: runtime.topics_mastered,
        weakTopicsConcerns: runtime.weak_topics,
      })
    } catch (err) {
      if (streamingRef.current) {
        // Partial response was received — save it
        clearTimeout(timeoutId)
        const partial = streamingRef.current
        if (partial) {
          await window.electronAPI.tutorSaveMessage({
            session_id: convId,
            role: 'assistant',
            content: partial,
            content_type: 'text'
          })
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            conversation_id: convId,
            role: 'assistant',
            content: partial,
            content_type: 'text',
            created_at: new Date().toISOString()
          }])
        }
      }
      if (!streamingRef.current) {
        setSending(false)
        setStreamingContent('')
        const errMsg = (err as Error).message || ''
        if (errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('API key')) {
          setError('API Key Invalid. Update your API key in Settings.')
          setPageState('error')
        } else {
          addToast({ type: 'error', title: 'Chat Error', message: errMsg || 'Something went wrong.' })
          setPageState('awaiting_input')
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ── Wall-clock timer ──
  useEffect(() => {
    if (sessionConfig?.duration_minutes === null) return
    if (runtime.is_time_up) return

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - runtime.started_at) / 1000)
      const remaining = Math.max(0, (runtime.config.duration_minutes ?? 0) * 60 - elapsed)

      setRuntime(prev => ({
        ...prev,
        time_elapsed_seconds: elapsed,
        time_remaining_seconds: remaining,
        is_time_up: remaining <= 0,
      }))

      if (remaining <= 0) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionConfig?.duration_minutes, runtime.started_at, runtime.is_time_up])

  // ── Time-up handler ──
  useEffect(() => {
    if (!runtime.is_time_up || pageState !== 'awaiting_input') return
    setShowTimeUp(true)
  }, [runtime.is_time_up, pageState])

  function handleAddTime(extraMinutes: number): void {
    const config = runtime.config
    const newDuration = (config.duration_minutes ?? 0) + extraMinutes
    setRuntime(prev => ({
      ...prev,
      config: { ...config, duration_minutes: newDuration },
      started_at: Date.now(),
      time_elapsed_seconds: 0,
      time_remaining_seconds: newDuration * 60,
      is_time_up: false,
    }))
    setShowTimeUp(false)
    setPageState('awaiting_input')
  }

  function calcPacingStatus(run: TutorSessionRuntime): PacingStatus {
    if (run.config.duration_minutes === null) return 'UNLIMITED'
    const elapsedMin = run.time_elapsed_seconds / 60
    const totalMin = run.config.duration_minutes
    if (totalMin <= 0) return 'UNLIMITED'
    if (elapsedMin < 2) return 'ON_TRACK' // Too early to judge

    const expectedPct = elapsedMin / totalMin
    const questionCount = run.questions_asked.length

    // Healthy pace: roughly 1 interaction per 3 minutes
    const expectedQuestions = Math.max(3, Math.round(elapsedMin / 3))
    const questionRatio = expectedQuestions > 0 ? questionCount / expectedQuestions : 1

    if (expectedPct < 0.1) return 'ON_TRACK'
    if (questionRatio < 0.4) return 'BEHIND'
    if (questionRatio > 1.8) return 'AHEAD'
    return 'ON_TRACK'
  }

  // ── Chunk listener ──
  useEffect(() => {
    const cleanup = window.electronAPI.onTutorChunk((chunk) => {
      if (chunk.type === 'text') {
        streamingRef.current += chunk.content
        setStreamingContent(streamingRef.current)
      } else if (chunk.type === 'done') {
        // Guard against duplicate done events
        if (streamDoneRef.current) return
        streamDoneRef.current = true

        setSending(false)
        const finalContent = streamingRef.current
        streamingRef.current = ''
        setStreamingContent('')

        if (finalContent) {
          // Save assistant message
          window.electronAPI.tutorSaveMessage({
            session_id: sessionId!,
            role: 'assistant',
            content: finalContent,
            content_type: 'text'
          }).catch(console.error)

          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            conversation_id: sessionId!,
            role: 'assistant',
            content: finalContent,
            content_type: 'text',
            created_at: new Date().toISOString()
          }])

          // Extract [TOPIC: ...] markers for memory tracking
          const topicRegex = /\[TOPIC:\s*([^\]]+)\]/g
          let match
          const newTopics: string[] = []
          while ((match = topicRegex.exec(finalContent)) !== null) {
            newTopics.push(match[1].trim())
          }

          // Extract questions from the AI's response
          const sentences = finalContent.split(/[.?!\n]+/)
          const newQuestions = sentences
            .filter(s => s.trim().endsWith('?') && s.trim().length > 10)
            .map(s => s.trim())

          if (newTopics.length > 0 || newQuestions.length > 0) {
            setRuntime(prev => ({
              ...prev,
              topics_covered: [...new Set([...prev.topics_covered, ...newTopics])],
              questions_asked: [...prev.questions_asked, ...newQuestions].slice(-50),
            }))
          }

          // Count how many assistant messages exist (guard against false triggers on early messages)
          const assistantCount = messages.filter(m => m.role === 'assistant').length

          // Check if AI suggested phase transition (require 2+ assistant messages to avoid first-message false triggers)
          const lower = finalContent.toLowerCase()
          const suggestsDeepDive = assistantCount >= 2 && lower.includes('deep dive')
          const suggestsSummary = assistantCount >= 2 && (lower.includes('session summary') || lower.includes('wrap up'))

          // Only honor transition suggestions if >30% time has elapsed or time is unlimited
          const canTransition = runtime.config.duration_minutes === null ||
            (runtime.config.duration_minutes > 0 &&
              runtime.time_elapsed_seconds / (runtime.config.duration_minutes * 60) > 0.3)

          if (sessionPhase === 'structured_qa' && suggestsDeepDive && canTransition) {
            setPageState('phase_transition')
            return
          }
          if (sessionPhase === 'socratic' && suggestsSummary && canTransition) {
            setPageState('phase_transition')
            return
          }
        }
        setFocusKey(prev => prev + 1)
        setPageState('awaiting_input')
      } else if (chunk.type === 'error') {
        setSending(false)
        streamingRef.current = ''
        setStreamingContent('')
        addToast({ type: 'error', title: 'AI Response Error', message: chunk.content || 'Something went wrong.' })
        setFocusKey(prev => prev + 1)
        setPageState('awaiting_input')
      }
    })
    return () => { cleanup() }
  }, [sessionId, sessionPhase])

  // ── Send message ──
  async function handleSend(message: string): Promise<void> {
    if (!sessionId || !message.trim() || sending) return

    // Save user message
    const userMsg = await window.electronAPI.tutorSaveMessage({
      session_id: sessionId,
      role: 'user',
      content: attachedFile
        ? `[Attached: ${attachedFile.name}]\n\n${message}`
        : message,
      content_type: 'text'
    }) as Message

    setMessages(prev => [...prev, userMsg])

    // Build conversation history for context
    const history = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    await streamMessage(sessionId, message, sessionPhase, history, attachedFile || undefined)

    // Clear attachment after sending
    setAttachedFile(null)
  }

  // ── Phase transition handlers ──
  async function handleTransitionToSocratic(): Promise<void> {
    setSessionPhase('socratic')
    await window.electronAPI.tutorUpdateSessionPhase(sessionId!, 'socratic')
    setPageState('streaming')

    const transitionMsg = "I'm ready for the deep dive. Challenge me with harder questions."
    const userMsg = await window.electronAPI.tutorSaveMessage({
      session_id: sessionId!,
      role: 'user',
      content: transitionMsg,
      content_type: 'text'
    }) as Message
    setMessages(prev => [...prev, userMsg])

    const history = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    await streamMessage(sessionId!, transitionMsg, 'socratic', history)
  }

  async function handleTransitionToSummary(): Promise<void> {
    setSessionPhase('summary')
    await window.electronAPI.tutorUpdateSessionPhase(sessionId!, 'summary')
    setPageState('streaming')

    const transitionMsg = "Let's wrap up the session. Please summarize what we covered and generate study cards."
    const userMsg = await window.electronAPI.tutorSaveMessage({
      session_id: sessionId!,
      role: 'user',
      content: transitionMsg,
      content_type: 'text'
    }) as Message
    setMessages(prev => [...prev, userMsg])

    const history = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    await streamMessage(sessionId!, transitionMsg, 'summary', history)
  }

  async function handleEndSession(): Promise<void> {
    setShowTimeUp(false)

    const allMessages = [...messages]
    const sessionContent = allMessages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n\n')

    await window.electronAPI.tutorEndSession(sessionId!, sessionContent.substring(0, 5000))

    // Mark current module as completed
    if (currentModule && currentModule.status !== 'completed') {
      try {
        await window.electronAPI.syllabusUpdateModule(currentModule.id, { status: 'completed' })
      } catch { /* non-critical */ }
    }

    setSessionEnded(true)
    setShowCardReview(true)
  }

  // ── File attachment handlers ──
  async function handleAttachFile(): Promise<void> {
    try {
      const filePath = await window.electronAPI.libraryOpenFileDialog()
      if (!filePath) return
      // Parse the file to get its text content
      const parseResult = await window.electronAPI.parseFile(filePath)
      if (parseResult) {
        await window.electronAPI.librarySaveFile(parseResult.filename, parseResult.contentText, subjectId)
        setAttachedFile({ name: parseResult.filename, content: parseResult.contentText })
      }
    } catch (err) {
      console.error('File attach error:', err)
    }
  }

  async function handleSelectFromLibrary(): Promise<void> {
    try {
      const files = await window.electronAPI.libraryGetFiles(subjectId) as { id: number; filename: string }[]
      if (files.length > 0) {
        const data = await window.electronAPI.libraryGetFileContent(files[0].id) as { content_text: string; filename: string } | null
        if (data) {
          setAttachedFile({ name: data.filename, content: data.content_text })
          addToast({ type: 'info', title: 'File attached', message: data.filename })
        }
      } else {
        addToast({ type: 'info', title: 'No files', message: 'Upload files in the class library first.' })
      }
    } catch (err) {
      console.error('Library select error:', err)
    }
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        if (showCardReview) setShowCardReview(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCardReview])

  // ── Handle card review complete ──
  function handleCardsSaved(count: number): void {
    setShowCardReview(false)
    addToast({ type: 'success', title: 'Cards saved!', message: `${count} cards added to your card bank.` })
  }

  // ── Subject not found ──
  if (!subject && subjectId) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50 dark:bg-slate-950">
        <div className="text-center max-w-sm px-6">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">Class not found</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">This class may have been deleted or the link is invalid.</p>
          <button onClick={() => navigate('/tutor')} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">Back to Tutor</button>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (pageState === 'error') {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center justify-center flex-1">
          <div className="text-center max-w-sm px-6">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">Session Error</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error || 'Something went wrong.'}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/tutor')} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">Back to Tutor</button>
              <button onClick={initSession} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">Retry</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading state ──
  if (pageState === 'loading') {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center justify-center flex-1">
          <div className="flex flex-col items-center gap-4">
            <span className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400 dark:text-slate-500">Starting your tutor session...</p>
            {currentModule && (
              <p className="text-xs text-slate-400 dark:text-slate-500">Module: {currentModule.title}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Session Complete ──
  if (sessionEnded && !showCardReview) {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center justify-center flex-1">
          <div className="text-center max-w-md px-6">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-2">Session Complete!</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Great work! You've completed this tutor session. Keep up the daily SM-2 practice to lock it in.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate('/tutor')} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">Back to Tutor</button>
              <button onClick={() => navigate(`/subject/${subjectId}`)} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">View Class</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Phase labels ──
  const phaseLabels: Record<SessionPhase, string> = {
    structured_qa: 'Structured Q&A',
    socratic: 'Socratic Deep Dive',
    summary: 'Summary',
    complete: 'Complete'
  }

  const phaseOrder: SessionPhase[] = ['structured_qa', 'socratic', 'summary', 'complete']
  const currentPhaseIdx = phaseOrder.indexOf(sessionPhase)

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
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {subject?.name || 'Tutor Session'}
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {sessionPhase === 'complete' ? 'Session ended' : phaseLabels[sessionPhase]}
              {currentModule && ` · ${currentModule.title}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Phase progress dots */}
          <div className="flex items-center gap-1.5">
            {phaseOrder.map((phase, idx) => (
              <div
                key={phase}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx < currentPhaseIdx ? 'bg-emerald-400' :
                  idx === currentPhaseIdx ? 'bg-violet-500' :
                  'bg-slate-200 dark:bg-slate-700'
                }`}
                title={phaseLabels[phase]}
              />
            ))}
          </div>

          {/* Timer display */}
          {runtime.config.duration_minutes !== null && !runtime.is_time_up && (
            <div className={`text-xs font-medium px-2 py-1 rounded-md ${
              runtime.time_remaining_seconds < 60
                ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                : runtime.time_remaining_seconds < 300
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                  : 'text-slate-400 dark:text-slate-500'
            }`}>
              ⏱️ {Math.floor(runtime.time_remaining_seconds / 60)}:{(runtime.time_remaining_seconds % 60).toString().padStart(2, '0')}
            </div>
          )}
          {runtime.config.duration_minutes === null && (
            <div className="text-xs text-slate-400 dark:text-slate-500 px-2 py-1">
              ♾️ No time limit
            </div>
          )}

          <button
            onClick={handleEndSession}
            disabled={sending}
            className="text-xs text-slate-400 hover:text-red-400 dark:hover:text-red-400 transition-colors px-2 py-1"
          >
            End Session
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" ref={chatContainerRef}>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Module context banner */}
          {currentModule && (
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800 px-4 py-3">
              <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-1">
                Current Module: {currentModule.title}
              </p>
              {weakTopics.length > 0 && (
                <p className="text-xs text-violet-500 dark:text-violet-400">
                  Focus areas: {weakTopics.slice(0, 3).join(', ')}
                </p>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              created_at={msg.created_at}
            />
          ))}

          {/* Streaming message */}
          {(sending || streamingContent) && (
            <ChatMessage
              role="assistant"
              content={streamingContent}
              isStreaming={true}
            />
          )}

          {/* Phase transition prompt */}
          {pageState === 'phase_transition' && !sending && (
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-xl border border-violet-200 dark:border-violet-800 p-5 text-center">
              <div className="text-2xl mb-2">
                {sessionPhase === 'structured_qa' ? '\u{1F30A}' : '\u{1F4DD}'}
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-2">
                {sessionPhase === 'structured_qa'
                  ? 'Ready for the deep dive?'
                  : 'Ready to wrap up?'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                {sessionPhase === 'structured_qa'
                  ? "You've done well with the basics. Now let's really test your understanding with deeper questions."
                  : "Let's summarize what you've learned and generate study cards for SM-2 practice."}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setPageState('awaiting_input')}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors"
                >
                  Ask one more question
                </button>
                <button
                  onClick={sessionPhase === 'structured_qa' ? handleTransitionToSocratic : handleTransitionToSummary}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {sessionPhase === 'structured_qa' ? 'Start Deep Dive →' : 'Generate Summary →'}
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Phase transition banner at bottom */}
      {pageState === 'phase_transition' && !sending && (
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-3 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Answer above or proceed to the next phase
          </p>
        </div>
      )}

      {/* Time-Up overlay */}
      {showTimeUp && (
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-6 text-center">
          <div className="max-w-sm mx-auto">
            <div className="text-4xl mb-3">⏰</div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50 mb-1">Time's Up!</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              You covered: {runtime.topics_covered.slice(0, 5).join(', ') || 'Getting started'}
              {runtime.topics_covered.length > 5 && ` +${runtime.topics_covered.length - 5} more`}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
              Keep going? Add more time and continue where you left off.
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => handleAddTime(15)} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">
                +15 min
              </button>
              <button onClick={() => handleAddTime(30)} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">
                +30 min
              </button>
              <button onClick={() => handleAddTime(60)} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">
                +1 hr
              </button>
              <button onClick={handleEndSession} className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
                End Session →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input bar */}
      {pageState !== 'phase_transition' && !showTimeUp && (
        <ChatInput
          onSend={handleSend}
          onAttachFile={handleAttachFile}
          onSelectFromLibrary={handleSelectFromLibrary}
          disabled={sending || sessionEnded}
          refocusKey={focusKey}
          attachedFile={attachedFile?.name || null}
          onClearAttachment={() => setAttachedFile(null)}
          placeholder={
            sending ? 'Waiting for tutor...' :
            sessionPhase === 'structured_qa' ? 'Type your answer...' :
            sessionPhase === 'socratic' ? 'Share your thoughts...' :
            'Any final questions?'
          }
        />
      )}

      {/* Card Review Modal */}
      {showCardReview && sessionId && subjectId && (
        <TutorCardReviewModal
          sessionId={sessionId}
          subjectId={subjectId}
          sessionContent={messages
            .filter(m => m.role !== 'system')
            .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
            .join('\n\n')
          }
          onSaved={handleCardsSaved}
          onClose={() => {
            setShowCardReview(false)
            setSessionEnded(true)
          }}
        />
      )}
    </div>
  )
}
