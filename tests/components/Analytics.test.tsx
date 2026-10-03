import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Analytics from '../../src/pages/Analytics'
import { formatStudyDuration } from '../../src/components/analytics/AnalyticsOverview'
import { useAppStore } from '../../src/store/appStore'

jest.mock('../../src/store/appStore')

const mockUseAppStore = useAppStore as jest.MockedFunction<typeof useAppStore>

const user = { id: 1, name: 'Alex Johnson', created_at: '2026-09-01T00:00:00.000Z' }
const subjects = [{ id: 1, user_id: 1, name: 'World History', status: 'active' as const, course_code: 'HIS-101', created_at: '2026-09-01T00:00:00.000Z', color: '#7c3aed' }]

function snapshot() {
  return {
    range_days: 30,
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    previous_start_date: '2026-08-02',
    previous_end_date: '2026-08-31',
    daily: [{ date: '2026-09-30', reviews: 10, correct: 8, incorrect: 2, accuracy: 0.8, study_minutes: 30, study_sessions: 1, tutor_minutes: 0, tutor_sessions: 0, practice_minutes: 0, practice_sessions: 0, focus_blocks: 0 }],
    modes: [
      { mode: 'flashcards', sessions: 1, minutes: 30, items: 10, correct: 8, total: 10 },
      { mode: 'tutor', sessions: 1, minutes: 74, items: 1, correct: 1, total: 1 },
      { mode: 'practice', sessions: 0, minutes: null, items: 0, correct: 0, total: 0 },
      { mode: 'focus', sessions: 1, minutes: 4, items: 1, correct: 1, total: 1 }
    ],
    subjects: [{ subject_id: 1, reviews: 10, correct: 8, accuracy: 0.8, study_minutes: 30, sessions: 1, retention: 0.86, mastery: 0.7, previous_reviews: 5, previous_correct: 3, previous_study_minutes: 20 }],
    totals: { reviews: 10, correct: 8, accuracy: 0.8, study_minutes: 30, sessions: 1, current_retention: 0.86 },
    previous_totals: { reviews: 5, correct: 3, accuracy: 0.6, study_minutes: 20, sessions: 1 },
    maintenance: { due_cards: 4, overdue_cards: 2, fading_cards: 3 }
  }
}

describe('Analytics workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAppStore.mockReturnValue({
      user,
      subjects,
      theme: 'light',
      isLoading: false,
      error: null,
      setUser: jest.fn(),
      setSubjects: jest.fn(),
      setTheme: jest.fn(),
      setLoading: jest.fn(),
      setError: jest.fn(),
      toggleTheme: jest.fn(),
      updateSubject: jest.fn(),
      removeSubject: jest.fn(),
      addSubject: jest.fn()
    })

    const api = (window as unknown as { electronAPI: Record<string, jest.Mock> }).electronAPI
    api.getAnalyticsSnapshot.mockResolvedValue(snapshot())
    api.getReviewLogs.mockResolvedValue([])
    api.getMasteryStats.mockResolvedValue([])
    api.getWeakestCards.mockResolvedValue([])
    api.getMCStats.mockResolvedValue({ total: 0, correct: 0 })
    api.getAvgResponseTime.mockResolvedValue({ avg_ms: null })
    api.getRetentionForecast.mockResolvedValue([])
    api.getCurrentRetentionBySubject.mockResolvedValue([])
    api.getConceptMastery.mockResolvedValue([])
    api.getCompletedTaskStats.mockResolvedValue({ completedTasksCount: 0, completedTopicsCount: 0, completedSessionsCount: 0, totalCompleted: 0 })
    api.syllabusListModules.mockResolvedValue([])
  })

  it('renders the trend-led overview and maintenance load', async () => {
    render(<MemoryRouter><Analytics /></MemoryRouter>)

    expect(await screen.findByText('Your learning pulse')).toBeInTheDocument()
    expect(screen.getByText('Activity trend')).toBeInTheDocument()
    expect(screen.getByText('Overdue cards')).toBeInTheDocument()
    expect(screen.getByText('Performance by subject')).toBeInTheDocument()
    expect(screen.getAllByText('80%').length).toBeGreaterThanOrEqual(1)
  })

  it('formats learning mix durations for bar labels and tooltips', () => {
    expect(formatStudyDuration(30)).toBe('30 min')
    expect(formatStudyDuration(74)).toBe('1h 14m')
    expect(formatStudyDuration(4)).toBe('4 min')
    expect(formatStudyDuration(null)).toBe('0 min')
  })

  it('reloads the snapshot when the range changes', async () => {
    render(<MemoryRouter><Analytics /></MemoryRouter>)
    await screen.findByText('Your learning pulse')

    fireEvent.click(screen.getByRole('button', { name: '7d' }))

    await waitFor(() => expect((window as unknown as { electronAPI: Record<string, jest.Mock> }).electronAPI.getAnalyticsSnapshot).toHaveBeenLastCalledWith(1, 7))
  })

  it('keeps an honest empty state when there is no activity', async () => {
    const api = (window as unknown as { electronAPI: Record<string, jest.Mock> }).electronAPI
    api.getAnalyticsSnapshot.mockResolvedValue({ ...snapshot(), daily: [], totals: { ...snapshot().totals, reviews: 0, accuracy: null, study_minutes: 0, sessions: 0, current_retention: null }, subjects: [], modes: snapshot().modes.map(mode => ({ ...mode, sessions: 0, minutes: null })) })
    render(<MemoryRouter><Analytics /></MemoryRouter>)

    expect(await screen.findByText('No activity in this window')).toBeInTheDocument()
    expect(screen.getByText('No completed sessions yet')).toBeInTheDocument()
  })
})
