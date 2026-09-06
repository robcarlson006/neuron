import React, { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import type { CalendarEventType, Subject } from '../../types'
import { EVENT_TYPE_ICONS } from './DayScheduleTimeline'

interface AddEventModalProps {
  isOpen: boolean
  onClose: () => void
  onEventSaved: () => void
  initialDate?: string
  subjects: Subject[]
}

const EVENT_TYPES: { type: CalendarEventType; label: string }[] = [
  { type: 'lecture', label: 'Lecture' },
  { type: 'seminar', label: 'Seminar' },
  { type: 'lab', label: 'Lab' },
  { type: 'workshop', label: 'Workshop / Recitation' },
  { type: 'study', label: 'Study Session' },
  { type: 'personal', label: 'Personal / Routine' }
]

export default function AddEventModal({
  isOpen,
  onClose,
  onEventSaved,
  initialDate,
  subjects
}: AddEventModalProps): React.JSX.Element | null {
  const { user, addToast } = useAppStore()
  const todayStr = new Date().toISOString().split('T')[0]

  const [title, setTitle] = useState('')
  const [eventType, setEventType] = useState<CalendarEventType>('lecture')
  const [subjectId, setSubjectId] = useState<number | ''>(subjects[0]?.id || '')
  const [date, setDate] = useState(initialDate || todayStr)
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('11:15')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !title.trim() || !startTime || !endTime) return

    setSaving(true)
    try {
      const startIso = `${date}T${startTime}:00`
      const endIso = `${date}T${endTime}:00`

      await window.electronAPI.calendar.saveEvent(user.id, {
        title: title.trim(),
        event_type: eventType,
        subject_id: subjectId === '' ? undefined : Number(subjectId),
        start_time: startIso,
        end_time: endIso,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        all_day: 0
      })

      addToast({
        type: 'success',
        title: 'Event Created',
        message: `Added "${title.trim()}" to your calendar.`
      })

      onEventSaved()
      onClose()
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error',
        message: err.message || 'Failed to save event.'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
            Add Calendar Event
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Event Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Organic Chemistry Lecture"
              className="input text-sm w-full"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Event Type
              </label>
              <select
                value={eventType}
                onChange={e => setEventType(e.target.value as CalendarEventType)}
                className="input text-sm w-full"
              >
                {EVENT_TYPES.map(t => (
                  <option key={t.type} value={t.type}>
                    {EVENT_TYPE_ICONS[t.type]} {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Subject (Optional)
              </label>
              <select
                value={subjectId}
                onChange={e => setSubjectId(e.target.value === '' ? '' : Number(e.target.value))}
                className="input text-sm w-full"
              >
                <option value="">None / General</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="input text-sm w-full"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="input text-sm w-full"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="input text-sm w-full"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Location (Optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Science Hall Room 302"
              className="input text-sm w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Key topics, chapters, or agenda items"
              rows={2}
              className="input text-sm w-full"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-2 px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="btn-primary text-xs py-2 px-4"
            >
              {saving ? 'Saving...' : 'Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
