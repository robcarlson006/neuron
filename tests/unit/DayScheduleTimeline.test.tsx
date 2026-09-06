import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import DayScheduleTimeline, { calculateGaps } from '../../src/components/calendar/DayScheduleTimeline'
import type { CalendarEvent } from '../../src/types'

describe('DayScheduleTimeline & Gap Detection', () => {
  const mockEvents: CalendarEvent[] = [
    {
      id: 1,
      user_id: 1,
      title: 'Macroeconomics Lecture',
      start_time: '2026-09-06T09:00:00',
      end_time: '2026-09-06T10:00:00',
      all_day: 0,
      event_type: 'lecture',
      subject_name: 'Macroeconomics',
      subject_color: '#8b5cf6',
      created_at: '',
      updated_at: ''
    },
    {
      id: 2,
      user_id: 1,
      title: 'Chemistry Lab',
      start_time: '2026-09-06T11:00:00',
      end_time: '2026-09-06T13:00:00',
      all_day: 0,
      event_type: 'lab',
      subject_name: 'Chemistry',
      subject_color: '#10b981',
      created_at: '',
      updated_at: ''
    }
  ]

  test('calculates 60m free gap between 10:00 and 11:00', () => {
    const gaps = calculateGaps(mockEvents, '2026-09-06', 9, 14)
    const midGap = gaps.find(g => g.startTime === '10:00' && g.endTime === '11:00')
    expect(midGap).toBeDefined()
    expect(midGap?.durationMinutes).toBe(60)
  })

  test('renders events and gaps in timeline', () => {
    const handleSlotClick = jest.fn()
    render(
      <DayScheduleTimeline
        events={mockEvents}
        selectedDate="2026-09-06"
        onSlotClick={handleSlotClick}
      />
    )

    expect(screen.getByText('Macroeconomics Lecture')).toBeInTheDocument()
    expect(screen.getByText('Chemistry Lab')).toBeInTheDocument()
    expect(screen.getAllByText(/60m Free Window/i).length).toBeGreaterThanOrEqual(1)

    // Clicking slot invokes callback
    const slotButton = screen.getAllByRole('button', { name: /\+ Focus Block/i })[0]
    fireEvent.click(slotButton)
    expect(handleSlotClick).toHaveBeenCalled()
  })

  test('renders empty state when day has no events', () => {
    render(
      <DayScheduleTimeline
        events={[]}
        selectedDate="2026-09-07"
        onSlotClick={() => {}}
      />
    )

    expect(screen.getByText(/No events scheduled for this day/i)).toBeInTheDocument()
  })
})
