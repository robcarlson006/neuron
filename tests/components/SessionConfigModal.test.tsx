import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import SessionConfigModal from '../../src/components/tutor/SessionConfigModal'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}))

describe('SessionConfigModal - New Content & Multi-Module Study', () => {
  const mockModules = [
    {
      id: 1,
      subject_id: 101,
      title: 'Economic Models & Toolkit',
      topics: [
        { id: 11, module_id: 1, title: 'Building Models', has_new_material: 1 },
        { id: 12, module_id: 1, title: 'Linear Equations', has_new_material: 0 }
      ]
    },
    {
      id: 2,
      subject_id: 101,
      title: 'Consumer Theory',
      topics: [
        { id: 21, module_id: 2, title: 'Utility Functions', is_gap: 1 },
        { id: 22, module_id: 2, title: 'Indifference Curves', has_new_material: 0 }
      ]
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    window.electronAPI = {
      ...window.electronAPI,
      syllabusListModules: jest.fn().mockResolvedValue(mockModules),
      syllabusListTopics: jest.fn().mockImplementation((modId: number) => {
        const found = mockModules.find(m => m.id === modId)
        return Promise.resolve(found?.topics || [])
      }),
      libraryGetFiles: jest.fn().mockResolvedValue([]),
      tutorGetGapAnalysis: jest.fn().mockResolvedValue({
        struggledTopics: [],
        uncoveredTopics: [],
        recommendedTopics: [],
        recommendedFocus: 'None',
        totalGapsCount: 0
      })
    } as any
  })

  it('renders New Content tab with all new topics across modules selected by default', async () => {
    render(
      <MemoryRouter>
        <SessionConfigModal
          subjectId={101}
          subjectName="Principles of Microeconomics"
          initialMode="new_content"
          onClose={jest.fn()}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Building Models')).toBeInTheDocument()
    })

    // Both new topics across different modules should be present
    expect(screen.getByText('Utility Functions')).toBeInTheDocument()
    expect(screen.getAllByText(/2 new topics/i).length).toBeGreaterThan(0)

    // Click Start Session
    const startBtn = screen.getByRole('button', { name: /Start Session/i })
    fireEvent.click(startBtn)

    expect(mockNavigate).toHaveBeenCalled()
    const targetUrl = mockNavigate.mock.calls[0][0]
    expect(targetUrl).toContain('/tutor/101?config=')

    const configParam = new URLSearchParams(targetUrl.split('?')[1]).get('config')
    const parsedConfig = JSON.parse(decodeURIComponent(configParam!))
    expect(parsedConfig.target_topics).toEqual(['Building Models', 'Utility Functions'])
    expect(parsedConfig.never_studied).toBe(true)
  })

  it('allows selecting and deselecting topics across multiple modules', async () => {
    render(
      <MemoryRouter>
        <SessionConfigModal
          subjectId={101}
          subjectName="Principles of Microeconomics"
          initialMode="new_content"
          onClose={jest.fn()}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Building Models')).toBeInTheDocument()
    })

    // Clear all
    const clearBtn = screen.getByRole('button', { name: /clear/i })
    fireEvent.click(clearBtn)

    // Select only Utility Functions
    const utilityCheckbox = screen.getByLabelText(/Utility Functions/i)
    fireEvent.click(utilityCheckbox)

    const startBtn = screen.getByRole('button', { name: /Start Session/i })
    fireEvent.click(startBtn)

    const targetUrl = mockNavigate.mock.calls[0][0]
    const configParam = new URLSearchParams(targetUrl.split('?')[1]).get('config')
    const parsedConfig = JSON.parse(decodeURIComponent(configParam!))
    expect(parsedConfig.target_topics).toEqual(['Utility Functions'])
  })
})
