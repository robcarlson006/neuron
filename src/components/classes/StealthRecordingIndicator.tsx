import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLectureRecordingStore } from '../../store/lectureRecordingStore'

export default function StealthRecordingIndicator(): React.JSX.Element | null {
  const {
    isRecording,
    isPaused,
    elapsedSeconds,
    subjectName,
    lectureTitle,
    subjectId,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    audioLevel
  } = useLectureRecordingStore()

  const [showPopover, setShowPopover] = useState(false)
  const [stopping, setStopping] = useState(false)
  const navigate = useNavigate()

  if (!isRecording) return null

  const formatTime = (secs: number): string => {
    const hrs = Math.floor(secs / 3600)
    const mins = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const mm = String(mins).padStart(2, '0')
    const ss = String(s).padStart(2, '0')
    return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`
  }

  const handleFinish = async () => {
    setStopping(true)
    const res = await stopRecording()
    setStopping(false)
    setShowPopover(false)
    if (res?.lectureId && subjectId) {
      navigate(`/subject/${subjectId}`)
    }
  }

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to discard this lecture recording?')) {
      await cancelRecording()
      setShowPopover(false)
    }
  }

  return (
    <div className="fixed top-3 right-6 z-50 select-none">
      {/* Discreet pill button */}
      <button
        onClick={() => setShowPopover(!showPopover)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all text-xs font-medium text-slate-700 dark:text-slate-300 group"
        title="Lecture Recording Active (Click for controls)"
      >
        <span className="relative flex h-2 w-2">
          {!isPaused && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isPaused ? 'bg-amber-400' : 'bg-violet-600 dark:bg-violet-400'
            }`}
          />
        </span>
        <span className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-400">
          {formatTime(elapsedSeconds)}
        </span>
      </button>

      {/* Popover Controls */}
      {showPopover && (
        <div className="absolute right-0 mt-2 w-64 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-xs space-y-3 animate-in fade-in zoom-in-95 duration-100">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
              {subjectName || 'Recording Lecture'}
            </div>
            <div className="font-medium text-slate-800 dark:text-slate-200 truncate" title={lectureTitle}>
              {lectureTitle}
            </div>
          </div>

          {/* Discreet audio level indicator */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Status</span>
            <span className="flex items-center gap-1.5 font-medium">
              {isPaused ? (
                <span className="text-amber-500">Paused</span>
              ) : (
                <span className="text-violet-600 dark:text-violet-400 flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-500 transition-all duration-75"
                    style={{ opacity: Math.max(0.3, audioLevel / 100) }}
                  />
                  Recording
                </span>
              )}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="flex-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition-colors"
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>

            <button
              onClick={handleFinish}
              disabled={stopping}
              className="flex-1 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {stopping ? 'Saving...' : 'Finish & Save'}
            </button>
          </div>

          <div className="text-center">
            <button
              onClick={handleCancel}
              className="text-[11px] text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
            >
              Discard recording
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
