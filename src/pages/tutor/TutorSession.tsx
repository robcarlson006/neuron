import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import ChatMessage from '../../components/tutor/ChatMessage'
import ChatInput from '../../components/tutor/ChatInput'
import TutorCardReviewModal from '../../components/tutor/TutorCardReviewModal'
import TutorChatSidebar from './TutorChatSidebar'
import LoadingProgressBar from '../../components/common/LoadingProgressBar'
import type { Message, SyllabusModule, TutorSessionConfig, TutorSessionRuntime, PacingStatus, TutorSessionEvaluation } from '../../types'

type SessionPhase = 'structured_qa' | 'socratic' | 'summary' | 'complete'
type PageState = 'loading' | 'streaming' | 'awaiting_input' | 'phase_transition' | 'session_complete' | 'error'

export default function TutorSession(): React.JSX.Element {
  const { classId, sessionId: routeSessionId } = useParams<{ classId: string; sessionId?: string }>()
  const subjectId = Number(classId)
  const navigate = useNavigate()
  const { user, subjects, addToast, focusBlock, endFocusBlock } = useAppStore()
  const subject = subjects.find(s => s.id === subjectId)

  // ── State ──
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem('neuron_tutor_sidebar') !== 'false')
  const [pageState, setPageState] = useState<PageState>('loading')
  const [sessionId, setSessionId] = useState<number | null>(routeSessionId ? Number(routeSessionId) : null)
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('structured_qa')
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEndModal, setShowEndModal] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [showCardReview, setShowCardReview] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [viewTranscript, setViewTranscript] = useState(false)
  const [sessionEvaluation, setSessionEvaluation] = useState<TutorSessionEvaluation | null>(null)
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  const [quickApiKey, setQuickApiKey] = useState('')
  const [savingQuickKey, setSavingQuickKey] = useState(false)

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
  const [isPaused, setIsPaused] = useState(false)
  const [breakSeconds, setBreakSeconds] = useState(0)
  const [showTimeUp, setShowTimeUp] = useState(false)
  const [showTimerMenu, setShowTimerMenu] = useState(false)
  const timerMenuRef = useRef<HTMLDivElement>(null)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const streamingRef = useRef('')
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)
  const streamDoneRef = useRef(false) // guards against duplicate done events
  const sessionIdRef = useRef<number | null>(null)
  const sessionPhaseRef = useRef<SessionPhase>('structured_qa')
  const createdSessionIdRef = useRef<number | null>(null)

  sessionIdRef.current = sessionId
  sessionPhaseRef.current = sessionPhase

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

  // ── Focus Block Next/Finish prompt listener ──
  useEffect(() => {
    function onFocusBlockEndRequested() {
      setShowEndModal(true)
    }
    window.addEventListener('focus-block:prompt-end-session', onFocusBlockEndRequested)
    return () => window.removeEventListener('focus-block:prompt-end-session', onFocusBlockEndRequested)
  }, [])

  // ── Keyboard shortcut to toggle sidebar (Cmd+H / Ctrl+H) ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        setIsSidebarOpen(prev => {
          const next = !prev
          localStorage.setItem('neuron_tutor_sidebar', String(next))
          return next
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Close timer menu on outside click ──
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (timerMenuRef.current && !timerMenuRef.current.contains(e.target as Node)) {
        setShowTimerMenu(false)
      }
    }
    if (showTimerMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    return undefined
  }, [showTimerMenu])

  // ── Load / init session ──
  useEffect(() => {
    if (user && subjectId) {
      initSession()
    }
  }, [user, subjectId, routeSessionId])

  async function initSession(): Promise<void> {
    if (!user) return

    // Guard against re-initializing if we just navigated to the newly created session
    if (routeSessionId && Number(routeSessionId) === createdSessionIdRef.current) {
      return
    }

    setPageState('loading')
    setError(null)
    setSessionEnded(false)
    setSessionEvaluation(null)

    const isExplicitNew = searchParams.get('new') === 'true'
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

      // Load mastery data
      try {
        const mastery = await window.electronAPI.getConceptMastery(user.id, subjectId) as { concept: string; mastery_prob: number }[]
        setMasteredTopics(mastery.filter(m => m.mastery_prob >= 0.8).map(m => m.concept))
        setWeakTopics(mastery.filter(m => m.mastery_prob < 0.45).map(m => m.concept))
      } catch { /* ignore */ }

      // ── CASE 1: Resume specific session from URL route ──
      if (routeSessionId && !isExplicitNew) {
        const targetId = Number(routeSessionId)
        const sessionData = await window.electronAPI.tutorGetSession(targetId)
        if (sessionData && sessionData.session) {
          const s = sessionData.session
          setSessionId(s.id)
          sessionIdRef.current = s.id
          setSessionPhase(s.phase as SessionPhase)
          sessionPhaseRef.current = s.phase as SessionPhase

          const restoredConfig: TutorSessionConfig = {
            duration_minutes: s.duration_minutes ?? null,
            depth_level: ((s.depth_level as 1 | 2 | 3 | 4 | 5) ?? 3),
            never_studied: Boolean(s.never_studied),
            module_id: s.module_id || undefined
          }
          setSessionConfig(restoredConfig)

          if (s.module_id) {
            const targetMod = mods.find(m => m.id === s.module_id)
            if (targetMod) setCurrentModule(targetMod)
          }

          // Hydrate messages, filtering out the hidden system prompt
          const hydrated = (sessionData.messages || [])
            .filter(m => !(m.role === 'user' && m.content.startsWith('Greet me and')))
            .map(m => ({
              id: String(m.id),
              conversation_id: m.conversation_id,
              role: m.role as 'user' | 'assistant' | 'system',
              content: m.content,
              content_type: m.content_type || 'text',
              created_at: m.created_at
            }))
          setMessages(hydrated)

          // Restore timer state
          const startedAt = new Date(s.started_at).getTime()
          const now = Date.now()
          const durationMins = s.duration_minutes ?? null
          const totalSecs = durationMins ? durationMins * 60 : 0
          let elapsedSecs = 0
          let remainingSecs = 0

          if (durationMins !== null) {
            const wallElapsed = Math.max(0, Math.round((now - startedAt) / 1000))
            if (s.phase === 'complete') {
              elapsedSecs = totalSecs
              remainingSecs = 0
            } else if (wallElapsed < totalSecs) {
              elapsedSecs = wallElapsed
              remainingSecs = totalSecs - wallElapsed
            } else {
              // Resumed an incomplete session after elapsed time expired:
              // Give them fresh durationMins so student can continue learning without being locked out
              elapsedSecs = 0
              remainingSecs = durationMins * 60
            }
          }

          setRuntime({
            config: restoredConfig,
            started_at: now - (elapsedSecs * 1000),
            time_elapsed_seconds: elapsedSecs,
            time_remaining_seconds: remainingSecs,
            is_time_up: s.phase === 'complete',
            topics_covered: [],
            questions_asked: [],
            topics_mastered: [],
            weak_topics: []
          })

          if (s.phase === 'complete') {
            setSessionEnded(true)
            setViewTranscript(true)
            try {
              const evalData = await window.electronAPI.tutorGetSessionEvaluation(s.id)
              if (evalData) setSessionEvaluation(evalData)
            } catch { /* ignore */ }
          }

          setPageState('awaiting_input')
          return
        }
      }

      // ── CASE 2: No specific session requested — check if there is an existing session to resume ──
      if (!isExplicitNew && !configParam) {
        const existingList = await window.electronAPI.tutorListSessions(subjectId, 1)
        if (existingList && existingList.length > 0) {
          navigate(`/tutor/${subjectId}/session/${existingList[0].id}`, { replace: true })
          return
        }
      }

      // ── CASE 3: Start a brand new session ──
      const targetMod = config.module_id ? mods.find(m => m.id === config.module_id) : null
      const inProgressMod = targetMod || (!config.material_name && !config.target_topic && !config.is_fill_gaps
        ? (mods.find(m => m.status === 'in_progress') || mods.find(m => m.status === 'pending') || null)
        : null)
      if (inProgressMod) setCurrentModule(inProgressMod)

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

      createdSessionIdRef.current = session.id
      setSessionId(session.id)
      sessionIdRef.current = session.id
      setSessionPhase(session.phase as SessionPhase)
      sessionPhaseRef.current = session.phase as SessionPhase

      // Replace URL so user can return/refresh to this exact session
      navigate(`/tutor/${subjectId}/session/${session.id}`, { replace: true })

      // Mark current module as in_progress if it was pending
      if (inProgressMod && inProgressMod.status === 'pending') {
        try {
          await window.electronAPI.syllabusUpdateModule(inProgressMod.id, { status: 'in_progress' })
        } catch { /* non-critical */ }
      }

      // Send a "ready to learn" system message to start the session
      const difficultyMap = ['', 'Beginner', 'Intermediate', 'Proficient', 'Expert', 'Professor']
      const difficultyLabel = difficultyMap[config.depth_level] || 'Proficient'
      const topic = config.target_topic || (config.material_name ? `${config.material_name} (Material)` : (inProgressMod?.title || subject?.name || 'this subject'))

      let initialMsg = ''
      if (config.is_spaced_review) {
        const reviewTopics = config.spaced_review_topics?.length ? config.spaced_review_topics.join(', ') : 'decaying curriculum concepts'
        initialMsg = `Greet me and launch immediately into a rapid active recall question in this exact format:
"Welcome! Today is a targeted Spaced Retention Drill for ${subject?.name || 'this subject'}. We're reinforcing ${reviewTopics} to lock them into long-term memory. [Sharp recall question testing the first concept]?"

Mode: SPACED RETENTION MAINTENANCE (Target: ${reviewTopics})
Subject: ${subject?.name || 'this subject'}
Difficulty: ${difficultyLabel}
${config.duration_minutes ? `Duration: ${config.duration_minutes} min` : '15 min maintenance sprint'}`
      } else if (config.is_fill_gaps) {
        const gapSummary = config.gap_topics?.length ? config.gap_topics.join(', ') : 'identified gap concepts'
        initialMsg = `Greet me and ask your first question in this exact format:
"Welcome! Today we're filling in knowledge gaps in ${subject?.name || 'this subject'}. We'll focus on ${gapSummary}. [Specific question addressing the first gap topic]?"

Mode: FILL IN GAPS (Target: ${gapSummary})
Subject: ${subject?.name || 'this subject'}
Difficulty: ${difficultyLabel}
${config.duration_minutes ? `Duration: ${config.duration_minutes} min` : 'No time limit — go at your own pace'}
${config.never_studied ? 'The student has never studied this material before. Start from absolute basics.' : ''}`
      } else if (config.material_name) {
        initialMsg = `Greet me and ask your first question in this exact format:
"Welcome! Let's dive into ${config.material_name}. [Specific question about this material]?"

Topic: ${config.material_name}
Specific Material Focus: "${config.material_name}"
Difficulty: ${difficultyLabel}
${config.duration_minutes ? `Duration: ${config.duration_minutes} min` : 'No time limit — go at your own pace'}
${config.never_studied ? 'The student has never studied this material before. Start from absolute basics.' : ''}`
      } else if (config.target_topics && config.target_topics.length > 0) {
        const topicsList = config.target_topics.join(', ')
        initialMsg = `Greet me and ask your first question in this exact format:
"Welcome! Today we'll cover ${topicsList} from ${inProgressMod?.title || subject?.name || 'this module'}. Let's start with ${config.target_topics[0]}. [Specific question about ${config.target_topics[0]}]?"

Topics to teach: ${topicsList}
Module: ${inProgressMod?.title || 'Current Module'}
Difficulty: ${difficultyLabel}
${config.duration_minutes ? `Duration: ${config.duration_minutes} min` : 'No time limit — go at your own pace'}
${config.never_studied ? 'The student has never studied this material before. Start from absolute basics.' : ''}`
      } else {
        initialMsg = `Greet me and ask your first question in this exact format:
"Welcome! Let's dive into ${topic}. [Specific question about ${topic}]?"

Topic: ${topic}
Difficulty: ${difficultyLabel}
${config.duration_minutes ? `Duration: ${config.duration_minutes} min` : 'No time limit — go at your own pace'}
${config.never_studied ? 'The student has never studied this before. Start from absolute basics.' : ''}`
      }

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
      if (errMsg.includes('API key') || errMsg.includes('not configured') || errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('Authentication failed')) {
        setError('Authentication failed (401). Your API key is invalid or not configured.')
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
      setError('Connection timed out. The AI server did not respond in time. Check your internet connection or AI configuration in Settings.')
      setPageState('error')
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
        materialId: sessionConfig?.material_id || runtime.config.material_id,
        targetTopic: sessionConfig?.target_topic || runtime.config.target_topic,
        targetTopics: sessionConfig?.target_topics || runtime.config.target_topics,
        isFillGaps: sessionConfig?.is_fill_gaps || runtime.config.is_fill_gaps,
        gapTopics: sessionConfig?.gap_topics || runtime.config.gap_topics,
        isSpacedReview: sessionConfig?.is_spaced_review || runtime.config.is_spaced_review,
        spacedReviewTopics: sessionConfig?.spaced_review_topics || runtime.config.spaced_review_topics,
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
        if (errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('API key') || errMsg.includes('Authentication failed')) {
          setError('API Key Invalid or Expired (401). Update your API key in Settings.')
          setPageState('error')
        } else if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('Rate limit')) {
          setError('Quota or Rate Limit Exceeded (429). Check your API provider account or try again shortly.')
          setPageState('error')
        } else {
          setError(errMsg || 'Something went wrong while connecting to the AI.')
          setPageState('error')
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ── Wall-clock timer ──
  useEffect(() => {
    if (runtime.config.duration_minutes === null) return
    if (runtime.is_time_up || isPaused) return

    let lastTick = Date.now()
    const interval = setInterval(() => {
      const now = Date.now()
      const delta = Math.max(1, Math.round((now - lastTick) / 1000))
      lastTick = now

      setRuntime(prev => {
        if (prev.config.duration_minutes === null || prev.is_time_up || isPaused) return prev
        const newElapsed = prev.time_elapsed_seconds + delta
        const totalSecs = prev.config.duration_minutes * 60
        const newRemaining = Math.max(0, totalSecs - newElapsed)
        const isUp = newRemaining <= 0

        return {
          ...prev,
          time_elapsed_seconds: newElapsed,
          time_remaining_seconds: newRemaining,
          is_time_up: isUp,
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [runtime.config.duration_minutes, runtime.is_time_up, isPaused])

  // ── Break timer when paused ──
  useEffect(() => {
    if (!isPaused) {
      setBreakSeconds(0)
      return
    }

    const interval = setInterval(() => {
      setBreakSeconds(prev => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [isPaused])

  function handleTogglePause(): void {
    setIsPaused(prev => {
      const next = !prev
      if (!next) {
        setFocusKey(f => f + 1)
      }
      return next
    })
  }

  function handleResume(): void {
    setIsPaused(false)
    setFocusKey(f => f + 1)
  }

  // ── Time-up handler ──
  useEffect(() => {
    if (focusBlock?.isRunning) return
    if (!runtime.is_time_up || pageState !== 'awaiting_input') return
    setShowTimeUp(true)
  }, [runtime.is_time_up, pageState, focusBlock?.isRunning])

  async function handleAdjustTime(deltaMinutes: number): Promise<void> {
    const currentDuration = runtime.config.duration_minutes ?? 15
    const newDuration = Math.max(1, currentDuration + deltaMinutes)
    const newRemaining = Math.max(0, runtime.time_remaining_seconds + (deltaMinutes * 60))
    const isUp = newRemaining <= 0

    const updatedConfig: TutorSessionConfig = {
      ...runtime.config,
      duration_minutes: newDuration
    }
    setSessionConfig(updatedConfig)
    setRuntime(prev => ({
      ...prev,
      config: updatedConfig,
      time_remaining_seconds: newRemaining,
      is_time_up: isUp
    }))
    if (isUp) {
      setShowTimeUp(true)
    } else {
      setShowTimeUp(false)
      if (pageState === 'error') setPageState('awaiting_input')
    }

    if (sessionId) {
      try {
        await window.electronAPI.tutorUpdateSessionDuration(sessionId, newDuration)
      } catch (err) {
        console.error('Failed to update session duration:', err)
      }
    }
  }

  async function handleSetDuration(durationMinutes: number | null): Promise<void> {
    const updatedConfig: TutorSessionConfig = {
      ...runtime.config,
      duration_minutes: durationMinutes
    }
    setSessionConfig(updatedConfig)

    let newRemaining = 0
    if (durationMinutes !== null) {
      const totalSec = durationMinutes * 60
      if (runtime.time_elapsed_seconds >= totalSec) {
        newRemaining = totalSec
      } else {
        newRemaining = totalSec - runtime.time_elapsed_seconds
      }
    }

    setRuntime(prev => ({
      ...prev,
      config: updatedConfig,
      time_remaining_seconds: newRemaining,
      is_time_up: false
    }))
    setShowTimeUp(false)

    if (sessionId) {
      try {
        await window.electronAPI.tutorUpdateSessionDuration(sessionId, durationMinutes)
      } catch (err) {
        console.error('Failed to update session duration:', err)
      }
    }
  }

  function handleAddTime(extraMinutes: number): void {
    const config = runtime.config
    const newDuration = (config.duration_minutes ?? 0) + extraMinutes
    const newRemaining = extraMinutes * 60
    const updatedConfig: TutorSessionConfig = { ...config, duration_minutes: newDuration }
    setSessionConfig(updatedConfig)
    setRuntime(prev => ({
      ...prev,
      config: updatedConfig,
      time_remaining_seconds: newRemaining,
      is_time_up: false,
    }))
    setShowTimeUp(false)
    setPageState('awaiting_input')
    if (sessionId) {
      window.electronAPI.tutorUpdateSessionDuration(sessionId, newDuration).catch(() => {})
    }
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

  // ── Chunk listener (stable, bound once on mount) ──
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

        const activeSessionId = chunk.conversationId || sessionIdRef.current
        if (finalContent && activeSessionId) {
          // If session is timed and still has time remaining, strip premature [SESSION_END] tag
          const hasTimeRemaining = runtime.config.duration_minutes !== null && runtime.time_remaining_seconds > 30 && !runtime.is_time_up
          const displayContent = hasTimeRemaining
            ? finalContent.replace(/\[SESSION_END\]/g, '').trim()
            : finalContent

          // Save assistant message
          window.electronAPI.tutorSaveMessage({
            session_id: activeSessionId,
            role: 'assistant',
            content: displayContent,
            content_type: 'text'
          }).catch(console.error)

          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            conversation_id: activeSessionId,
            role: 'assistant',
            content: displayContent,
            content_type: 'text',
            created_at: new Date().toISOString()
          }])

          // Extract [TOPIC: ...] markers for memory tracking
          const topicRegex = /\[TOPIC:\s*([^\]]+)\]/g
          let match
          const newTopics: string[] = []
          while ((match = topicRegex.exec(displayContent)) !== null) {
            newTopics.push(match[1].trim())
          }

          // Extract questions from the AI's response
          const sentences = displayContent.split(/[.?!\n]+/)
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
          const lower = displayContent.toLowerCase()
          const suggestsDeepDive = assistantCount >= 2 && lower.includes('deep dive')
          const suggestsSummary = assistantCount >= 2 && (lower.includes('session summary') || lower.includes('wrap up'))

          // Only honor transition suggestions if remaining time is under 30s or duration is unlimited
          const isNearTimeUp = runtime.config.duration_minutes === null ||
            runtime.time_remaining_seconds <= 30 ||
            runtime.is_time_up

          const curPhase = sessionPhaseRef.current
          if (curPhase === 'structured_qa' && suggestsDeepDive && isNearTimeUp) {
            setPageState('phase_transition')
            return
          }
          if (curPhase === 'socratic' && suggestsSummary && isNearTimeUp) {
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
  }, [])

  // ── Send message ──
  async function handleSend(message: string): Promise<void> {
    if (!sessionId || !message.trim() || sending) return
    if (isPaused) {
      setIsPaused(false)
    }

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

  function handleOpenEndModal(): void {
    setShowTimeUp(false)
    setShowEndModal(true)
  }

  async function executeEndSession(options: { generateCards: boolean }): Promise<void> {
    if (!sessionId || endingSession) return
    setEndingSession(true)
    setShowTimeUp(false)
    setShowEndModal(false)

    try {
      const allMessages = [...messages]
      const sessionContent = allMessages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
        .join('\n\n')

      const res = await window.electronAPI.tutorEndSession(
        sessionId,
        sessionContent.substring(0, 5000),
        {
          targetTopics: sessionConfig?.target_topics,
          moduleId: currentModule?.id || sessionConfig?.module_id
        }
      )
      if (res && (res as { evaluation?: TutorSessionEvaluation }).evaluation) {
        setSessionEvaluation((res as { evaluation: TutorSessionEvaluation }).evaluation)
      }

      setSessionEnded(true)
      if (options.generateCards) {
        setShowCardReview(true)
      }
    } catch (err) {
      console.error('Error ending tutor session:', err)
      addToast({ type: 'error', title: 'Session Error', message: 'Failed to record session completion.' })
      setSessionEnded(true)
    } finally {
      setEndingSession(false)
    }
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
        if (showEndModal) setShowEndModal(false)
        else if (showCardReview) setShowCardReview(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showEndModal, showCardReview])

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
    const isAuthError = error?.toLowerCase().includes('api key') ||
      error?.toLowerCase().includes('401') ||
      error?.toLowerCase().includes('unauthorized') ||
      error?.toLowerCase().includes('authentication')

    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center justify-center flex-1">
          <div className="text-center max-w-md px-6 w-full">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">Session Error</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error || 'Something went wrong.'}</p>

            {isAuthError && (
              <div className="mb-6 p-4 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 text-left">
                <label className="block text-xs font-semibold text-violet-900 dark:text-violet-200 mb-1.5">
                  Update API Key:
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Enter valid API key (e.g. sk-...)"
                    value={quickApiKey}
                    onChange={e => setQuickApiKey(e.target.value)}
                    className="input flex-1 font-mono text-xs"
                  />
                  <button
                    disabled={!quickApiKey.trim() || savingQuickKey}
                    onClick={async () => {
                      setSavingQuickKey(true)
                      try {
                        const cleanKey = quickApiKey.trim().replace(/^["'`]|["'`]$/g, '').replace(/^Bearer\s+/i, '').trim()
                        const currentCfg = await window.electronAPI.getAIConfig().catch(() => null)
                        await window.electronAPI.saveAIConfig({
                          provider: currentCfg?.provider || 'openai-compatible',
                          baseUrl: currentCfg?.baseUrl || 'https://api.deepseek.com',
                          model: currentCfg?.model || 'deepseek-flash',
                          apiKey: cleanKey
                        })
                        addToast({ type: 'success', title: 'API Key Saved', message: 'Starting tutor session...' })
                        setQuickApiKey('')
                        initSession()
                      } catch (e) {
                        addToast({ type: 'error', title: 'Save Failed', message: (e as Error).message })
                      } finally {
                        setSavingQuickKey(false)
                      }
                    }}
                    className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    {savingQuickKey ? 'Saving...' : 'Save & Retry'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                  Paste your active API key and click "Save & Retry" to launch immediately.
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={() => navigate('/tutor')} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors">
                Back to Tutor
              </button>
              <button onClick={() => navigate('/settings')} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
                <span>⚙️</span> Open Settings
              </button>
              <button onClick={initSession} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
                Retry
              </button>
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
            {sessionConfig?.is_fill_gaps ? (
              <p className="text-xs text-violet-600 dark:text-violet-400 font-semibold">⚡ Mode: Fill in Knowledge Gaps</p>
            ) : sessionConfig?.target_topic ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Topic: {sessionConfig.target_topic}</p>
            ) : sessionConfig?.material_name ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Material: 📄 {sessionConfig.material_name}</p>
            ) : currentModule && (
              <p className="text-xs text-slate-400 dark:text-slate-500">Module: {currentModule.title}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Session Complete ──
  if (sessionEnded && !showCardReview && !viewTranscript) {
    return (
      <div className="flex h-full w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {!focusBlock?.isRunning && (
          <TutorChatSidebar
            subjectId={subjectId}
            currentSessionId={sessionId}
            isOpen={isSidebarOpen}
            onToggleOpen={() => {
              setIsSidebarOpen(prev => {
                const next = !prev
                localStorage.setItem('neuron_tutor_sidebar', String(next))
                return next
              })
            }}
            onSelectSession={(selId) => {
              navigate(`/tutor/${subjectId}/session/${selId}`)
            }}
            onNewSession={() => {
              navigate(`/tutor/${subjectId}?new=true`)
            }}
          />
        )}
        <div className="flex flex-col flex-1 min-w-0 h-full p-6 overflow-y-auto">
          <div className="flex items-center justify-center min-h-[80vh]">
            <div className="text-center max-w-lg w-full px-6 py-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl space-y-5">
              <div className="text-5xl mb-2">🎯</div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-1">Session Complete!</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Neuron recorded your learning progress for future gap analysis and adaptive tutoring.
                </p>
              </div>

              {/* Evaluation Insights Card */}
              {sessionEvaluation && (sessionEvaluation.strengths?.length > 0 || sessionEvaluation.struggles?.length > 0) && (
                <div className="text-left p-4 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>🧠</span> Learning Memory Snapshot
                  </div>

                  {sessionEvaluation.strengths && sessionEvaluation.strengths.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                        🌟 What you understood well
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {sessionEvaluation.strengths.map((str, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60 font-medium">
                            ✓ {str}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {sessionEvaluation.struggles && sessionEvaluation.struggles.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">
                        💡 Areas saved for future gap review
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {sessionEvaluation.struggles.map((stg, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 font-medium">
                            • {stg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {sessionEvaluation.summary && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 italic pt-1 border-t border-slate-200 dark:border-slate-600">
                      "{sessionEvaluation.summary}"
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-center pt-2 flex-wrap">
                <button
                  onClick={() => setViewTranscript(true)}
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md flex items-center gap-1.5"
                >
                  <span>💬 View Transcript</span>
                </button>
                <button
                  onClick={async () => {
                    if (sessionId) {
                      await window.electronAPI.tutorUpdateSessionPhase(sessionId, 'socratic')
                      setSessionPhase('socratic')
                      sessionPhaseRef.current = 'socratic'
                      setSessionEnded(false)
                      setViewTranscript(true)
                      setPageState('awaiting_input')
                    }
                  }}
                  className="px-5 py-2.5 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-colors"
                >
                  <span>⚡ Continue Discussion</span>
                </button>
                <button onClick={() => setShowCardReview(true)} className="px-5 py-2.5 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-xl text-xs font-bold transition-colors">
                  🃏 Generate Flashcards
                </button>
                <button
                  onClick={() => {
                    if (focusBlock?.isRunning) {
                      endFocusBlock(true)
                    }
                    navigate('/tutor')
                  }}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
                >
                  Tutor Hub
                </button>
              </div>
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
    <div className="flex h-full w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Collapsible Chat History Sidebar */}
      {!focusBlock?.isRunning && (
        <TutorChatSidebar
          subjectId={subjectId}
          currentSessionId={sessionId}
          isOpen={isSidebarOpen}
          onToggleOpen={() => {
            setIsSidebarOpen(prev => {
              const next = !prev
              localStorage.setItem('neuron_tutor_sidebar', String(next))
              return next
            })
          }}
          onSelectSession={(selId) => {
            navigate(`/tutor/${subjectId}/session/${selId}`)
          }}
          onNewSession={() => {
            navigate(`/tutor/${subjectId}?new=true`)
          }}
        />
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Top bar - hidden when in Focus Block */}
        {!focusBlock?.isRunning && (
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => navigate('/tutor')}
                title="Back to Tutor Hub"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M11 4l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <button
                onClick={() => {
                  setIsSidebarOpen(prev => {
                    const next = !prev
                    localStorage.setItem('neuron_tutor_sidebar', String(next))
                    return next
                  })
                }}
                title={isSidebarOpen ? "Collapse history (⌘H)" : "Open history (⌘H)"}
                className={`p-1.5 rounded-lg transition-colors ${
                  isSidebarOpen
                    ? 'text-violet-600 bg-violet-50 dark:bg-violet-950/50 dark:text-violet-300'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2"/>
                  <path d="M9 3v18"/>
                  <path d="m14 9 3 3-3 3"/>
                </svg>
              </button>

              <div>
                <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {subject?.name || 'Tutor Session'}
                </h1>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {sessionPhase === 'complete' ? 'Session ended' : phaseLabels[sessionPhase]}
                {sessionConfig?.material_name ? ` · 📄 ${sessionConfig.material_name}` : (currentModule && ` · ${currentModule.title}`)}
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

            {/* Pause / Resume Button */}
            {!sessionEnded && (
              <button
                type="button"
                onClick={handleTogglePause}
                title={isPaused ? "Resume session (timer continues)" : "Pause session (timer freezes, take a break)"}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                  isPaused
                    ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/70 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/80'
                }`}
              >
                <span>{isPaused ? '▶️' : '⏸️'}</span>
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>
            )}

            {/* Timer interactive dropdown */}
            <div className="relative" ref={timerMenuRef}>
              <button
                type="button"
                onClick={() => setShowTimerMenu(prev => !prev)}
                title="Click to adjust session duration and pacing"
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-all ${
                  isPaused
                    ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-semibold'
                    : runtime.config.duration_minutes === null
                      ? 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/80 dark:border-slate-700/80'
                      : runtime.is_time_up || runtime.time_remaining_seconds === 0
                        ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 font-semibold'
                        : runtime.time_remaining_seconds < 60
                          ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 font-semibold'
                          : runtime.time_remaining_seconds < 300
                            ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 font-semibold'
                            : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/80'
                }`}
              >
                <span>⏱️</span>
                <span>
                  {runtime.config.duration_minutes === null
                    ? isPaused ? 'Paused' : 'No limit'
                    : runtime.is_time_up || runtime.time_remaining_seconds === 0
                      ? '0:00 (Time up)'
                      : isPaused
                        ? `Paused (${Math.floor(runtime.time_remaining_seconds / 60)}:${(runtime.time_remaining_seconds % 60).toString().padStart(2, '0')})`
                        : `${Math.floor(runtime.time_remaining_seconds / 60)}:${(runtime.time_remaining_seconds % 60).toString().padStart(2, '0')}`
                  }
                </span>
                <svg className="w-3 h-3 text-slate-400 dark:text-slate-500 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Popover Dropdown */}
              {showTimerMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span>⏱️ Session Timer</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        AI tutor paces questions to fit your available time.
                      </p>
                    </div>
                  </div>

                  {/* Pause / Resume inside popover */}
                  <div className="my-3">
                    <button
                      type="button"
                      onClick={() => {
                        handleTogglePause()
                        setShowTimerMenu(false)
                      }}
                      className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        isPaused
                          ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600 shadow-sm'
                          : 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      <span>{isPaused ? '▶️ Resume Session' : '⏸️ Pause Session (Take Break)'}</span>
                    </button>
                  </div>

                  {/* Current Status Pill */}
                  <div className="mb-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 block">Remaining</span>
                      <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {runtime.config.duration_minutes === null
                          ? 'Unlimited'
                          : `${Math.floor(runtime.time_remaining_seconds / 60)}m ${(runtime.time_remaining_seconds % 60).toString().padStart(2, '0')}s`
                        }
                      </span>
                    </div>
                    {runtime.config.duration_minutes !== null && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isPaused
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                          : runtime.time_remaining_seconds < 120
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : runtime.time_remaining_seconds < 300
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      }`}>
                        {isPaused ? 'Paused' : runtime.time_remaining_seconds < 120 ? 'Wrapping Up' : runtime.time_remaining_seconds < 300 ? 'Final Questions' : 'Pacing Well'}
                      </span>
                    )}
                  </div>

                  {/* Quick Adjustments */}
                  {runtime.config.duration_minutes !== null && (
                    <div className="mb-3">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                        Quick Adjust
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAdjustTime(5)}
                          className="px-2 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-semibold transition-colors"
                        >
                          +5 min
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustTime(10)}
                          className="px-2 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-semibold transition-colors"
                        >
                          +10 min
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustTime(15)}
                          className="px-2 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-semibold transition-colors"
                        >
                          +15 min
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustTime(-5)}
                          disabled={runtime.time_remaining_seconds <= 300}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                        >
                          -5 min
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Duration Presets */}
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                      Set Session Length
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[5, 10, 15, 20, 30, 45].map(mins => {
                        const isSelected = runtime.config.duration_minutes === mins
                        return (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => handleSetDuration(mins)}
                            className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                              isSelected
                                ? 'border-violet-500 bg-violet-500 text-white shadow-sm'
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {mins} min
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSetDuration(null)}
                      className={`w-full mt-2 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                        runtime.config.duration_minutes === null
                          ? 'border-violet-500 bg-violet-500 text-white shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>♾️</span> No time limit (Open-ended)
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleOpenEndModal}
              disabled={sending || endingSession}
              className="text-xs text-slate-400 hover:text-red-400 dark:hover:text-red-400 transition-colors px-2 py-1 font-medium"
            >
              End Session
            </button>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto" ref={chatContainerRef}>
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

          {/* Completed banner */}
          {sessionEnded && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3 flex items-center justify-between text-xs mb-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-medium">
                <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                <span>This session was completed. You can review the transcript or continue exploring.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewTranscript(false)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors text-[11px]"
                >
                  View Summary
                </button>
                <button
                  onClick={async () => {
                    if (sessionId) {
                      await window.electronAPI.tutorUpdateSessionPhase(sessionId, 'socratic')
                      setSessionPhase('socratic')
                      sessionPhaseRef.current = 'socratic'
                      setSessionEnded(false)
                      setPageState('awaiting_input')
                    }
                  }}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors shadow-sm text-[11px]"
                >
                  Continue Discussion →
                </button>
              </div>
            </div>
          )}

          {messages
            .filter(msg => !(msg.role === 'user' && msg.content.startsWith('Greet me and')))
            .map((msg) => (
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

          {/* Pause Banner */}
          {isPaused && (
            <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/30 dark:via-orange-950/30 dark:to-amber-950/30 rounded-2xl border border-amber-200/80 dark:border-amber-800/60 p-6 text-center shadow-xs animate-in fade-in zoom-in-95 duration-150">
              <div className="text-3xl mb-2">☕</div>
              <h3 className="text-base font-bold text-amber-900 dark:text-amber-100 mb-1">
                Session Paused — Take a Breather!
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-300/90 max-w-md mx-auto mb-3 leading-relaxed">
                Your session timer and pacing are frozen. The AI tutor will not record idle time or assume you are struggling.
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200/70 dark:bg-amber-900/70 text-amber-900 dark:text-amber-100 text-xs font-semibold mb-4">
                <span>⏱️</span>
                <span>Break duration: {Math.floor(breakSeconds / 60)}m {(breakSeconds % 60).toString().padStart(2, '0')}s</span>
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={handleResume}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>▶️</span> Resume Session
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
              <button onClick={handleOpenEndModal} className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors">
                End Session →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input bar */}
      {!showTimeUp && (
        <div className="flex-shrink-0">
          {isPaused ? (
            <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-3">
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Session paused (on break for {Math.floor(breakSeconds / 60)}m {(breakSeconds % 60).toString().padStart(2, '0')}s)</span>
                </div>
                <button
                  type="button"
                  onClick={handleResume}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>▶️</span> Resume
                </button>
              </div>
            </div>
          ) : (
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
        </div>
      )}
      </div>

      {/* End Session Modal */}
      {showEndModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => !endingSession && setShowEndModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-md w-full p-6 text-center animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 flex items-center justify-center text-2xl mx-auto mb-3">
              🎓
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 mb-1">
              End Tutor Session
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              How would you like to finish your session?
            </p>

            <div className="space-y-3">
              {/* Option 1: Generate Flashcards */}
              <button
                onClick={() => executeEndSession({ generateCards: true })}
                disabled={endingSession}
                className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-violet-500/80 bg-violet-50/70 dark:bg-violet-900/20 hover:bg-violet-100/70 dark:hover:bg-violet-900/30 text-left transition-all group shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0">🃏</span>
                  <div>
                    <div className="text-sm font-semibold text-violet-900 dark:text-violet-100 flex items-center gap-1.5">
                      Generate Flashcards
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200 font-medium">
                        Recommended
                      </span>
                    </div>
                    <p className="text-xs text-violet-700/80 dark:text-violet-300/70 mt-0.5 leading-relaxed">
                      Extract key concepts from this session into bite-sized, high-yield study cards
                    </p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-violet-500 group-hover:translate-x-0.5 transition-transform flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Option 2: End Session (no cards) */}
              <button
                onClick={() => executeEndSession({ generateCards: false })}
                disabled={endingSession}
                className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700/60 text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0">🏁</span>
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      End Session
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Save learning progress and finish without creating new flashcards
                    </p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-slate-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Cancel option */}
            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex justify-center">
              <button
                onClick={() => setShowEndModal(false)}
                disabled={endingSession}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium py-1.5 px-4 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Continue Studying
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ending Session Loading Progress Overlay */}
      {endingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center text-2xl mx-auto">
              📊
            </div>
            <LoadingProgressBar
              label="Finishing Tutor Session..."
              sublabel="Analyzing dialogue, recording strengths & struggles, and updating your curriculum progress..."
              size="lg"
            />
          </div>
        </div>
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
