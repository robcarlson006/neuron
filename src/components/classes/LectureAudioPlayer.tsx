import React, { useEffect, useRef, useState } from 'react'

interface LectureAudioPlayerProps {
  audioPath: string
  title?: string
  className?: string
}

export default function LectureAudioPlayer({
  audioPath,
  title,
  className = ''
}: LectureAudioPlayerProps): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState<number>(1)
  const [audioUrl, setAudioUrl] = useState('')

  useEffect(() => {
    let active = true
    if (window.electronAPI?.getLectureAudioUrl) {
      window.electronAPI.getLectureAudioUrl(audioPath).then((url) => {
        if (active) setAudioUrl(url)
      })
    } else {
      setAudioUrl(`neuron-audio://${encodeURIComponent(audioPath)}`)
    }
    return () => {
      active = false
    }
  }, [audioPath])

  const formatTime = (secs: number): string => {
    if (isNaN(secs) || secs < 0) return '00:00'
    const totalSecs = Math.floor(secs)
    const hrs = Math.floor(totalSecs / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const s = totalSecs % 60
    const mm = String(mins).padStart(2, '0')
    const ss = String(s).padStart(2, '0')
    return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setCurrentTime(val)
    if (audioRef.current) {
      audioRef.current.currentTime = val
    }
  }

  const changeSpeed = (newSpeed: number) => {
    setSpeed(newSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed
    }
  }

  return (
    <div className={`p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2 ${className}`}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          preload="metadata"
        />
      )}

      {title && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate font-medium text-slate-700 dark:text-slate-300">🎧 {title}</span>
          <span className="font-mono text-[11px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      )}

      {/* Scrub bar */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.5"
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-600 dark:accent-violet-400 focus:outline-none"
        />
      </div>

      {/* Controls & Speed */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="p-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white transition-colors flex items-center justify-center shadow-sm"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="4" height="12" rx="1" />
                <rect x="9" y="2" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2.5v11l9-5.5-9-5.5z" />
              </svg>
            )}
          </button>

          {!title && (
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          )}
        </div>

        {/* Speed Pills */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
          {[1, 1.25, 1.5, 2].map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                speed === s
                  ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
