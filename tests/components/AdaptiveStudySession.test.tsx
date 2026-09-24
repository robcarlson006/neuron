import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import StudySession from '../../src/pages/StudySession'
import { useAppStore } from '../../src/store/appStore'

const mockCards = [
  {
    id: 1,
    subject_id: 1,
    type: 'flashcard',
    front: 'What is photosynthesis?',
    back: 'Process used by plants to convert light into energy',
    is_manual: 0,
    created_at: '2026-05-01',
    interval: 1,
    repetitions: 0,
    ease_factor: 2.5,
    due_date: '2026-05-01'
  }
]

describe('Unified Hybrid Adaptive Study Session', () => {
  beforeEach(() => {
    useAppStore.setState({
      user: { id: 1, name: 'Test User', created_at: '2026-01-01' },
      subjects: [{ id: 1, user_id: 1, name: 'Biology', status: 'active', created_at: '2026-01-01' }]
    })

    window.electronAPI = {
      ...window.electronAPI,
      getMeta: jest.fn().mockResolvedValue('true'),
      getDueCards: jest.fn().mockResolvedValue(mockCards),
      getInterleavedDueCards: jest.fn().mockResolvedValue(mockCards),
      getAllCardsWithSchedule: jest.fn().mockResolvedValue(mockCards),
      getSchedule: jest.fn().mockResolvedValue(mockCards[0]),
      startStudySession: jest.fn().mockResolvedValue({ id: 1 }),
      endStudySession: jest.fn().mockResolvedValue({}),
      processReview: jest.fn().mockResolvedValue({ success: true, sm2Result: { interval: 1, repetitions: 1, ease_factor: 2.5, due_date: '2026-05-02' } })
    } as any
  })

  it('renders adaptive study mode selector and active recall for new/unmastered cards in adaptive mode', async () => {
    render(
      <MemoryRouter initialEntries={['/study/1']}>
        <Routes>
          <Route path="/study/:subjectId" element={<StudySession />} />
        </Routes>
      </MemoryRouter>
    )

    // Verify top-bar mode selector pills
    expect(await screen.findByRole('button', { name: /🧠 adaptive/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /📇 flashcards/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /✍️ active recall/i })).toBeInTheDocument()

    // Verify in-card adaptive badge for zero-repetition card (escalated to Active Recall)
    expect(screen.getByText(/adaptive: active recall/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /switch to flashcard/i })).toBeInTheDocument()
  })

  it('allows live switching between Flashcard and Active Recall on the fly', async () => {
    render(
      <MemoryRouter initialEntries={['/study/1']}>
        <Routes>
          <Route path="/study/:subjectId" element={<StudySession />} />
        </Routes>
      </MemoryRouter>
    )

    const switchBtn = await screen.findByRole('button', { name: /switch to flashcard/i })
    fireEvent.click(switchBtn)

    // Modality banner should now reflect manual switch to Flashcard
    expect(screen.getByText(/adaptive: flashcard/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /switch to active recall/i })).toBeInTheDocument()
  })
})
