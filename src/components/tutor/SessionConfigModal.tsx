import React, { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TutorSessionConfig,
  DEPTH_LEVELS,
  TIME_PRESETS,
  TIME_SLIDER_MIN,
  TIME_SLIDER_MAX,
  TIME_SLIDER_STEP,
} from '../../types'

interface SessionConfigModalProps {
  subjectId: number
  subjectName: string
  onClose: () => void
}

export default function SessionConfigModal({ subjectId, subjectName, onClose }: SessionConfigModalProps): React.JSX.Element {
  const navigate = useNavigate()

  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [selectedDepth, setSelectedDepth] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [neverStudied, setNeverStudied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [sliderValue, setSliderValue] = useState<number>(30)
  const [inputValue, setInputValue] = useState('')

  const sliderRef = useRef<HTMLInputElement>(null)

  // Beginner mode forces minimum depth 3
  const finalDepth = neverStudied && selectedDepth < 3 ? 3 : selectedDepth

  function handleTimePreset(minutes: number | null): void {
    setSelectedTime(minutes)
    if (minutes !== null) {
      setSliderValue(minutes)
      setInputValue(String(minutes))
    } else {
      setSliderValue(TIME_SLIDER_MIN)
      setInputValue('')
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = Number(e.target.value)
    setSliderValue(val)
    setSelectedTime(val)
    setInputValue(String(val))
  }

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setInputValue(raw)
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && parsed >= TIME_SLIDER_MIN && parsed <= TIME_SLIDER_MAX) {
      setSliderValue(parsed)
      setSelectedTime(parsed)
    }
  }, [])

  function handleInputBlur(): void {
    const parsed = parseInt(inputValue, 10)
    if (!isNaN(parsed) && parsed >= TIME_SLIDER_MIN && parsed <= TIME_SLIDER_MAX) {
      setSliderValue(parsed)
      setSelectedTime(parsed)
      setInputValue(String(parsed))
    } else if (inputValue !== '') {
      // Reset to slider value if invalid
      setInputValue(selectedTime !== null ? String(selectedTime) : '')
    }
  }

  function handleStart(): void {
    if (starting) return
    setStarting(true)

    const config: TutorSessionConfig = {
      duration_minutes: selectedTime,
      depth_level: finalDepth,
      never_studied: neverStudied,
    }

    const encoded = encodeURIComponent(JSON.stringify(config))
    navigate(`/tutor/${subjectId}?config=${encoded}`)
  }

  // Whether a preset button should be visually active
  function isPresetActive(minutes: number | null): boolean {
    if (minutes === null) return selectedTime === null
    return selectedTime === minutes
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Start Tutor Session
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {subjectName}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Difficulty Selector (mandatory) ── */}
        <div className="mb-6">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
            🎯 Difficulty
          </label>

          <div className="space-y-1.5">
            {DEPTH_LEVELS.map(dl => {
              const isSelected = selectedDepth === dl.level
              return (
                <button
                  key={dl.level}
                  onClick={() => setSelectedDepth(dl.level)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20'
                      : 'border-transparent bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{dl.icon}</span>
                    <div className="flex-1">
                      <span className={`text-sm font-medium ${
                        isSelected ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'
                      }`}>
                        {dl.name}
                      </span>
                      <span className={`text-xs ml-2 ${
                        isSelected ? 'text-violet-500 dark:text-violet-400' : 'text-slate-400 dark:text-slate-500'
                      }`}>
                        {dl.description}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {neverStudied && selectedDepth < 3 && (
            <p className="text-xs text-amber-500 mt-1.5">
              Beginner mode requires at least Proficient difficulty. Using Level 3.
            </p>
          )}
        </div>

        {/* ── Time Selector (optional) ── */}
        <div className="mb-6">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
            ⏱️ Session Duration <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
          </label>

          {/* Preset buttons */}
          <div className="flex gap-2 flex-wrap mb-3">
            {TIME_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => handleTimePreset(preset.minutes)}
                className={`flex-1 min-w-[60px] px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isPresetActive(preset.minutes)
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Slider + input (only when not unlimited) */}
          {selectedTime !== null ? (
            <div className="flex items-center gap-3">
              <input
                ref={sliderRef}
                type="range"
                min={TIME_SLIDER_MIN}
                max={TIME_SLIDER_MAX}
                step={TIME_SLIDER_STEP}
                value={sliderValue}
                onChange={handleSliderChange}
                className="flex-1 accent-violet-600 h-2 rounded-full cursor-pointer"
              />
              <div className="flex items-center gap-1 flex-shrink-0">
                <input
                  type="number"
                  min={TIME_SLIDER_MIN}
                  max={TIME_SLIDER_MAX}
                  value={inputValue}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  className="w-14 text-center text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <span className="text-xs text-slate-400 dark:text-slate-500">min</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
              No time limit — study at your own pace
            </p>
          )}
        </div>

        {/* ── Never Studied Toggle ── */}
        <div className="mb-6 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={neverStudied}
              onChange={e => setNeverStudied(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500"
            />
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                🆕 I've never studied this before
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Start from absolute basics. No assumed knowledge — explain everything from the ground up.
              </p>
            </div>
          </label>
        </div>

        {/* ── Summary & Start ── */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-400 dark:text-slate-500">
            <b className="text-violet-600 dark:text-violet-400">{DEPTH_LEVELS.find(d => d.level === finalDepth)?.name}</b>
            {selectedTime !== null && <span> · {selectedTime} min</span>}
            {selectedTime === null && <span> · Unlimited</span>}
            {neverStudied && <span> · 🆕 Beginner</span>}
          </div>
          <button
            onClick={handleStart}
            disabled={starting}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
              starting
                ? 'bg-violet-400 text-white cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm'
            }`}
          >
            {starting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Starting...
              </span>
            ) : (
              'Start Session →'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
