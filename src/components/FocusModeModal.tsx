import React, { useState, useEffect, useCallback, useRef } from 'react'

interface FocusSessionConfig {
  focusMinutes: number
  breakMinutes: number
  subjectId?: number
}

interface FocusModeModalProps {
  isOpen: boolean
  onClose: () => void
  userId: number
  config: FocusSessionConfig
  onStartSession: (sessionId: number) => void
}

type Phase = 'focusing' | 'break' | 'completed'

const FocusModeModal: React.FC<FocusModeModalProps> = ({
  isOpen,
  onClose,
  userId,
  config,
  onStartSession,
}) => {
  const [phase, setPhase] = useState<Phase>('focusing')
  const [timeLeft, setTimeLeft] = useState(config.focusMinutes * 60)
  const [isPaused, setIsPaused] = useState(false)
  const [cardsReviewed] = useState(0)
  const [correctCount] = useState(0)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initialize session
  useEffect(() => {
    if (!isOpen) return
    const init = async () => {
      try {
        const api = (window as any).electronAPI
        if (!api) return
        const session = await api.startStudySession(userId, config.subjectId)
        setSessionId(session.id)
        onStartSession(session.id)
      } catch (err) {
        console.error('Failed to start study session:', err)
      }
    }
    init()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isOpen, userId, config.subjectId])

  // Timer
  useEffect(() => {
    if (!isOpen || isPaused || phase === 'completed') {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          if (phase === 'focusing') {
            setPhase('completed')
            setShowSummary(true)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isOpen, isPaused, phase])

  // End session on close
  const handleClose = useCallback(async () => {
    if (sessionId) {
      try {
        const api = (window as any).electronAPI
        if (api) {
          await api.endStudySession(sessionId, cardsReviewed, correctCount)
        }
      } catch (err) {
        console.error('Failed to end session:', err)
      }
    }
    onClose()
  }, [sessionId, cardsReviewed, correctCount, onClose])

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev)
  }, [])

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="Focus study session"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-6">
        <button
          onClick={togglePause}
          className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button
          onClick={handleClose}
          className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
        >
          ✕ End Session
        </button>
      </div>

      {/* Timer */}
      <div className="text-center mb-8">
        <div className="text-7xl font-bold text-white font-mono tracking-wider mb-2">
          {formatTime(timeLeft)}
        </div>
        <div className="text-white/60 text-sm uppercase tracking-widest">
          {phase === 'focusing' ? 'Focus Time' : phase === 'break' ? 'Break' : 'Session Complete'}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-8 text-white/70 text-sm mb-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">{cardsReviewed}</div>
          <div>Cards</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">{correctCount}</div>
          <div>Correct</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {cardsReviewed > 0 ? Math.round((correctCount / cardsReviewed) * 100) : 0}%
          </div>
          <div>Accuracy</div>
        </div>
      </div>

      {/* Session Summary */}
      {showSummary && (
        <div className="bg-white/10 backdrop-blur rounded-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-2">Great Focus Session!</h2>
          <p className="text-white/70 mb-6">
            You reviewed {cardsReviewed} cards with {Math.round((correctCount / Math.max(1, cardsReviewed)) * 100)}% accuracy.
          </p>
          <button
            onClick={handleClose}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* Keyboard shortcut hint */}
      <div className="absolute bottom-6 text-white/30 text-xs">
        <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">Space</kbd> Pause/Resume{' '}
        <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs ml-2">Esc</kbd> End Session
      </div>
    </div>
  )
}

export type { FocusSessionConfig }
export default FocusModeModal
