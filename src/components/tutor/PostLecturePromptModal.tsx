import React, { useState } from 'react'
import type { CalendarEvent } from '../../types'

interface PostLecturePromptModalProps {
  isOpen: boolean
  onClose: () => void
  event: CalendarEvent
  minutesSinceEnd?: number
  onStartSprint: (options: { minutes: number; lectureTopic: string; materialsSummary?: string }) => void
  materials?: { id: number; filename: string }[]
}

export default function PostLecturePromptModal({
  isOpen,
  onClose,
  event,
  minutesSinceEnd,
  onStartSprint,
  materials = []
}: PostLecturePromptModalProps): React.JSX.Element | null {
  const [topic, setTopic] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | ''>('')
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<number>(30)

  if (!isOpen) return null

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      setDroppedFileName(file.name)
      if (!topic.trim()) {
        const inferred = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
        setTopic(inferred)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const selectedMat = materials.find(m => m.id === selectedMaterialId)
    const summary = droppedFileName
      ? `Uploaded slides: ${droppedFileName}`
      : selectedMat
      ? `Course material: ${selectedMat.filename}`
      : undefined

    onStartSprint({
      minutes,
      lectureTopic: topic.trim() || event.title,
      materialsSummary: summary
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">🎓</span>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Lock In Today's Lecture
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {event.title}
                {minutesSinceEnd !== undefined && ` · Ended ${minutesSinceEnd}m ago`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Science Callout */}
          <div className="bg-violet-50/70 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-violet-700 dark:text-violet-300">🧠 Retention Protocol:</span> Active retrieval right after class prevents 50%+ forgetting. Your sprint will pair a 3-min brain dump with targeted Socratic questions.
          </div>

          {/* Topic Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              What topic or chapter was covered today?
            </label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Fiscal Policy Multipliers, Photosynthesis, Chapter 4"
              className="input text-sm w-full"
              autoFocus
            />
          </div>

          {/* Material selection or File Drop */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Attach Lecture Slides or Notes (Optional)
            </label>

            {materials.length > 0 && (
              <select
                value={selectedMaterialId}
                onChange={e => setSelectedMaterialId(e.target.value === '' ? '' : Number(e.target.value))}
                className="input text-xs w-full mb-2"
              >
                <option value="">Select from existing class materials...</option>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>
                    📄 {m.filename}
                  </option>
                ))}
              </select>
            )}

            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border border-dashed border-slate-300 dark:border-slate-600 hover:border-violet-400 rounded-xl p-3.5 text-center bg-slate-50/50 dark:bg-slate-900/30 transition-colors cursor-pointer"
            >
              {droppedFileName ? (
                <div className="flex items-center justify-center gap-2 text-xs text-violet-700 dark:text-violet-300 font-medium">
                  <span>📄</span>
                  <span>{droppedFileName} attached</span>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      setDroppedFileName(null)
                    }}
                    className="text-slate-400 hover:text-red-500 ml-1"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Drag & drop today's slide deck, handout, or notes here
                </p>
              )}
            </div>
          </div>

          {/* Duration Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Available Time
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[15, 30, 45].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    minutes === m
                      ? 'bg-violet-600 border-violet-600 text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-violet-300'
                  }`}
                >
                  {m} Minutes
                  <span className="block text-[10px] font-normal opacity-80">
                    {m === 15 ? 'Quick Recall' : m === 30 ? 'High Yield' : 'Deep Mastery'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-2 px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              <span>🚀</span> Start Lock-In Sprint
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
