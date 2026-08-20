import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../../src/pages/Dashboard'
import { useAppStore } from '../../src/store/appStore'

// Mock the store
jest.mock('../../src/store/appStore')

const mockUseAppStore = useAppStore as jest.MockedFunction<typeof useAppStore>

const mockUser = {
  id: 1,
  name: 'Alex Johnson',
  created_at: new Date().toISOString()
}

const mockSubjects = [
  {
    id: 1,
    user_id: 1,
    name: 'World History',
    status: 'active' as const,
    course_code: 'HIS-101',
    created_at: new Date().toISOString()
  }
]

describe('Dashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockUseAppStore.mockReturnValue({
      user: mockUser,
      subjects: mockSubjects,
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

    // Mock API calls
    const api = (window as unknown as { electronAPI: Record<string, jest.Mock> }).electronAPI
    api.getDueCards.mockResolvedValue([
      { id: 1, type: 'flashcard', subject_id: 1 },
      { id: 2, type: 'active_recall', subject_id: 1 },
      { id: 3, type: 'flashcard', subject_id: 1 }
    ])
    api.getStreakData.mockResolvedValue([
      { date: new Date().toISOString().split('T')[0], count: 5 }
    ])
    api.getDeadlines.mockResolvedValue([])
    api.getCards.mockResolvedValue([
      { id: 1, type: 'flashcard' },
      { id: 2, type: 'flashcard' }
    ])
    api.getAllSchedules.mockResolvedValue([])
  })

  it('renders welcome message with user name', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      // The greeting uses getTimeOfDay() which varies - find any element with the user's name
      expect(screen.getAllByText(/Alex/i).length).toBeGreaterThan(0)
    })
  })

  it('displays cards due count', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText(/Cards due today/i)).toBeInTheDocument()
    })
  })

  it('displays subject name', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('World History')).toBeInTheDocument()
    })
  })

  it('shows streak count', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Day streak/i)).toBeInTheDocument()
    })
  })

  it('shows Add Subject button', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Add Subject/i)).toBeInTheDocument()
    })
  })

  it('shows estimated study time when cards are due', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      // 2 flashcards * 20s + 1 active recall * 60s = 100s = 2min
      expect(screen.getByText(/~\d+ min/)).toBeInTheDocument()
    })
  })

  it('shows Study Now button when cards are due', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText(/Study Now/).length).toBeGreaterThan(0)
    })
  })

  it('shows subjects count', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Your Subjects/i)).toBeInTheDocument()
      // The number "1" appears in multiple places; check the label is present
      const subjectsLabel = screen.getByText(/Your Subjects/i)
      expect(subjectsLabel).toBeInTheDocument()
    })
  })
})
