import React, { useState } from 'react'
import type { Deadline } from '../types'

interface DayInfo {
  date: string
  cardsDue: number
  deadlines: Deadline[]
}

interface CalendarViewProps {
  daysInfo: DayInfo[]
  onDayClick: (date: string) => void
  selectedDate: string | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function CalendarView({ daysInfo, onDayClick, selectedDate }: CalendarViewProps): React.JSX.Element {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const dayInfoMap = new Map(daysInfo.map(d => [d.date, d]))

  function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate()
  }

  function getFirstDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 1).getDay()
  }

  function prevMonth(): void {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  function nextMonth(): void {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const todayStr = today.toISOString().split('T')[0]

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          ←
        </button>
        <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-lg">
          {MONTHS[viewMonth]} {viewYear}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          →
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(day => (
          <div key={day} className="text-center text-xs font-semibold text-slate-400 dark:text-slate-500 py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />
          }

          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const info = dayInfoMap.get(dateStr)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const hasDeadline = info && info.deadlines.length > 0
          const cardsDue = info?.cardsDue || 0

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={`relative p-1 rounded-lg text-sm transition-colors text-center min-h-[48px] flex flex-col items-center justify-start gap-0.5 ${
                isSelected
                  ? 'bg-emerald-600 text-white'
                  : isToday
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-semibold'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className={`text-xs font-medium leading-tight ${isToday && !isSelected ? 'font-bold' : ''}`}>
                {day}
              </span>

              {cardsDue > 0 && (
                <span className={`text-[10px] font-semibold leading-tight px-1 rounded-sm ${
                  isSelected
                    ? 'text-white/90'
                    : 'text-amber-600 dark:text-amber-400'
                }`} title={`${cardsDue} cards due`}>
                  {cardsDue}
                </span>
              )}

              {hasDeadline && (
                <span className={`w-1 h-1 rounded-full flex-shrink-0 ${
                  isSelected ? 'bg-white/70' : 'bg-red-400'
                }`} title="Deadline" />
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-amber-500">12</span>
          Cards due (projected)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          Deadline
        </div>
      </div>
    </div>
  )
}
