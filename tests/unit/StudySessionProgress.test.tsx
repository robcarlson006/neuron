import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StudySession from '../../src/pages/StudySession'
import { useAppStore } from '../../src/store/appStore'

jest.mock('../../src/store/appStore')

const mockUseAppStore = useAppStore as jest.MockedFunction<typeof useAppStore>

const mockUser = {
  id: 1,
  name: 'Test Student',
  created_at: new Date().toISOString()
}

const mockCard1 = {
  id: 10,
  subject_id: 1,
  folder_id: 5,
  front: 'What is the powerhouse of the cell?',
  back: 'Mitochondria',
  type: 'flashcard' as const,
  interval: 1,
  repetitions: 1,
  ease_factor: 2.5,
  due_date: '2026-09-17',
  created_at: '2026-09-01'
}

const mockCard2 = {
  id: 11,
  subject_id: 1,
  folder_id: 5,
  front: 'Explain active recall',
  back: 'Testing yourself to stimulate memory retrieval',
  type: 'active_recall' as const,
  interval: 1,
  repetitions: 1,
  ease_factor: 2.5,
  due_date: '2026-09-17',
  created_at: '2026-09-01'
}

describe('StudySession Progress Saving', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()

    mockUseAppStore.mockReturnValue({
      user: mockUser,
      subjects: [{ id: 1, user_id: 1, name: 'Biology', status: 'active' as const, created_at: '' }],
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

    const api = (window as any).electronAPI
    api.getMeta.mockResolvedValue('false')
    api.getDueCards.mockResolvedValue([mockCard1, mockCard2])
    api.getInterleavedDueCards.mockResolvedValue([mockCard1, mockCard2])
    api.getAllCardsWithSchedule.mockResolvedValue([mockCard1, mockCard2])
    api.getSchedule.mockResolvedValue({
      id: 1,
      card_id: 10,
      user_id: 1,
      interval: 1,
      repetitions: 1,
      ease_factor: 2.5,
      due_date: '2026-09-17'
    })
    api.startStudySession.mockResolvedValue({ id: 999, user_id: 1, subject_id: 1 })
    api.endStudySession.mockResolvedValue({ success: true })
    api.processReview.mockResolvedValue({ success: true, sm2Result: { interval: 3, repetitions: 2, ease_factor: 2.5, due_date: '2026-09-20' } })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('starts a database study session when cards are loaded', async () => {
    render(
      <MemoryRouter initialEntries={['/study/1']}>
        <Routes>
          <Route path="/study/:subjectId" element={<StudySession />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('What is the powerhouse of the cell?')).toBeInTheDocument()
    })

    const api = (window as any).electronAPI
    expect(api.startStudySession).toHaveBeenCalledWith(1, 1)
  })

  it('persists reviews in folder mode and does not skip processReview', async () => {
    render(
      <MemoryRouter initialEntries={['/study/1?folderId=5']}>
        <Routes>
          <Route path="/study/:subjectId" element={<StudySession />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('What is the powerhouse of the cell?')).toBeInTheDocument()
    })

    // Reveal flashcard and rate
    fireEvent.click(screen.getByTestId('flashcard'))
    await waitFor(() => {
      expect(screen.getByText('Mitochondria')).toBeInTheDocument()
    })

    // Click "Good" (quality 4)
    fireEvent.click(screen.getByText('Got It'))

    const api = (window as any).electronAPI
    await waitFor(() => {
      expect(api.processReview).toHaveBeenCalledWith(expect.objectContaining({
        cardId: 10,
        userId: 1,
        quality: 5,
        wasCorrect: true
      }))
    })

    // endStudySession should also be called with updated review count
    expect(api.endStudySession).toHaveBeenCalledWith(999, 1, 1)

    // And local storage should have saved progress
    const storageKey = 'study-session-progress-1-1-5-study'
    const saved = localStorage.getItem(storageKey)
    expect(saved).not.toBeNull()
    const parsed = JSON.parse(saved!)
    expect(parsed.summary.cardsReviewed).toHaveLength(1)
    expect(parsed.summary.correct).toBe(1)
  })

  it('handles Exit Session by saving progress, updating DB, and showing completion summary', async () => {
    render(
      <MemoryRouter initialEntries={['/study/1']}>
        <Routes>
          <Route path="/study/:subjectId" element={<StudySession />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('What is the powerhouse of the cell?')).toBeInTheDocument()
    })

    // Answer first card
    fireEvent.click(screen.getByTestId('flashcard'))
    await waitFor(() => {
      expect(screen.getByText('Mitochondria')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Got It'))

    // Now on second card (Explain active recall)
    await waitFor(() => {
      expect(screen.getByText('Explain active recall')).toBeInTheDocument()
    })

    // Press Exit Session
    fireEvent.click(screen.getByText('Exit session'))

    // DB session should be finalized
    const api = (window as any).electronAPI
    expect(api.endStudySession).toHaveBeenCalledWith(999, 1, 1)

    // Completion summary should be visible with confirmation
    await waitFor(() => {
      expect(screen.getByText('Session Paused & Saved!')).toBeInTheDocument()
      expect(screen.getByText(/Progress Saved/)).toBeInTheDocument()
      expect(screen.getByText(/You answered 1 question/)).toBeInTheDocument()
      expect(screen.getByText(/Resume Session/)).toBeInTheDocument()
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('View Subject')).toBeInTheDocument()
    })
  })

  it('resumes an in-progress session from localStorage', async () => {
    const storageKey = 'study-session-progress-1-1-all-study'
    const savedProgress = {
      v: 1,
      subjectId: '1',
      isMCMode: false,
      isFolderMode: false,
      cards: [mockCard1, mockCard2],
      allCards: [mockCard1, mockCard2],
      currentIdx: 1,
      phase: 'studying',
      skippedCards: [],
      summary: {
        total: 2,
        correct: 1,
        incorrect: 0,
        skipped: 0,
        cardsReviewed: [{ cardId: 10, quality: 4, wasCorrect: true }]
      },
      sessionId: 999,
      savedAt: Date.now()
    }
    localStorage.setItem(storageKey, JSON.stringify(savedProgress))

    render(
      <MemoryRouter initialEntries={['/study/1']}>
        <Routes>
          <Route path="/study/:subjectId" element={<StudySession />} />
        </Routes>
      </MemoryRouter>
    )

    // Card 2 should immediately be displayed because currentIdx = 1 was restored!
    await waitFor(() => {
      expect(screen.getByText('Explain active recall')).toBeInTheDocument()
      expect(screen.getByText('Resumed')).toBeInTheDocument()
      expect(screen.getByText('Restart')).toBeInTheDocument()
    })
  })
})
