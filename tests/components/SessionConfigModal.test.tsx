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

  it('exposes an accessible dialog and closes with Escape', async () => {
    const onClose = jest.fn()
    render(
      <MemoryRouter>
        <SessionConfigModal
          subjectId={101}
          subjectName="Principles of Microeconomics"
          onClose={onClose}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('dialog', { name: /start a study session/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close study session setup/i })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps all study paths available in the grouped launcher', () => {
    render(
      <MemoryRouter>
        <SessionConfigModal
          subjectId={101}
          subjectName="Principles of Microeconomics"
          onClose={jest.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /new content/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quick review/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fill gaps/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /active recall/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /syllabus/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /material/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /custom/i })).toBeInTheDocument()
  })

  it('shows every gap, preselects the recommended gap, and carries selected targets plus optional time', async () => {
    ;(window.electronAPI.tutorGetGapAnalysis as jest.Mock).mockResolvedValue({
      items: [
        { type: 'struggled', topic: 'Utility Functions', topicId: 21, priority: 1, recommendedMinutes: 25, details: 'Low mastery' },
        { type: 'uncovered', topic: 'Indifference Curves', topicId: 22, priority: 2, recommendedMinutes: 20, details: 'Not yet assessed' }
      ],
      struggledTopics: [{ type: 'struggled', topic: 'Utility Functions', topicId: 21, priority: 1, recommendedMinutes: 25 }],
      uncoveredTopics: [{ type: 'uncovered', topic: 'Indifference Curves', topicId: 22, priority: 2, recommendedMinutes: 20 }],
      recommendedTopics: ['Utility Functions'],
      recommendedFocus: 'Utility Functions',
      totalGapsCount: 2,
      hasHistory: true
    })

    render(
      <MemoryRouter>
        <SessionConfigModal subjectId={101} subjectName="Principles of Microeconomics" initialMode="fill_gaps" onClose={jest.fn()} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByLabelText(/Study Utility Functions/i)).toBeChecked())
    expect(screen.getByLabelText(/Study Indifference Curves/i)).not.toBeChecked()
    fireEvent.click(screen.getByLabelText(/Study Indifference Curves/i))
    fireEvent.click(screen.getByLabelText(/Use suggested time/i))
    fireEvent.click(screen.getByRole('button', { name: /Start session/i }))

    const targetUrl = mockNavigate.mock.calls[0][0]
    const configParam = new URLSearchParams(targetUrl.split('?')[1]).get('config')
    const parsedConfig = JSON.parse(decodeURIComponent(configParam!))
    expect(parsedConfig.target_topics).toEqual(['Utility Functions', 'Indifference Curves'])
    expect(parsedConfig.gap_topic_ids).toEqual([21, 22])
    expect(parsedConfig.duration_minutes).toBe(45)
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

  it('lets learners deselect an individual lecture annotation from tutor context', async () => {
    window.electronAPI = {
      ...window.electronAPI,
      libraryGetFiles: jest.fn().mockResolvedValue([{ id: 7, filename: 'Lecture slides.pdf' }]),
      listLectures: jest.fn().mockResolvedValue([{ id: 9, subject_id: 101, title: 'Week 1 lecture' }]),
      listDocumentAnnotations: jest.fn().mockImplementation(({ lectureId, materialId }: { lectureId?: number; materialId?: number }) => Promise.resolve(
        lectureId
          ? [{ id: 901, subject_id: 101, lecture_id: lectureId, kind: 'question', body: 'Why?' }]
          : materialId
            ? []
            : []
      ))
    } as any

    render(
      <MemoryRouter>
        <SessionConfigModal
          subjectId={101}
          subjectName="Principles of Microeconomics"
          initialMode="material"
          materialId={7}
          onClose={jest.fn()}
        />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/Week 1 lecture/)).toBeInTheDocument())
    const annotationCheckbox = screen.getByLabelText(/Why\?/i)
    expect(annotationCheckbox).not.toBeChecked()
    fireEvent.click(screen.getByText(/Week 1 lecture/))
    expect(annotationCheckbox).toBeChecked()
    fireEvent.click(annotationCheckbox)

    fireEvent.click(screen.getByRole('button', { name: /Start Session/i }))
    const targetUrl = mockNavigate.mock.calls[0][0]
    const configParam = new URLSearchParams(targetUrl.split('?')[1]).get('config')
    const parsedConfig = JSON.parse(decodeURIComponent(configParam!))
    expect(parsedConfig.annotation_ids).toEqual([])
    expect(parsedConfig.lecture_ids).toEqual([9])
  })

  it('supports selecting multiple materials without selecting lecture notes by default', async () => {
    window.electronAPI = {
      ...window.electronAPI,
      libraryGetFiles: jest.fn().mockResolvedValue([
        { id: 7, filename: 'Slides.pdf' },
        { id: 8, filename: 'Textbook.pdf' }
      ]),
      listLectures: jest.fn().mockResolvedValue([{ id: 9, subject_id: 101, title: 'Week 1 lecture' }]),
      listDocumentAnnotations: jest.fn().mockResolvedValue([])
    } as any

    render(
      <MemoryRouter>
        <SessionConfigModal
          subjectId={101}
          subjectName="Principles of Microeconomics"
          initialMode="material"
          onClose={jest.fn()}
        />
      </MemoryRouter>
    )

    const slides = await screen.findByRole('button', { name: /Slides\.pdf/i })
    const textbook = await screen.findByRole('button', { name: /Textbook\.pdf/i })
    expect(slides).not.toHaveClass('bg-violet-600')
    expect(textbook).not.toHaveClass('bg-violet-600')

    fireEvent.click(slides)
    fireEvent.click(textbook)
    fireEvent.click(screen.getByRole('button', { name: /Start session/i }))

    const targetUrl = mockNavigate.mock.calls[0][0]
    const configParam = new URLSearchParams(targetUrl.split('?')[1]).get('config')
    const parsedConfig = JSON.parse(decodeURIComponent(configParam!))
    expect(parsedConfig.material_ids).toEqual([7, 8])
    expect(parsedConfig.lecture_ids).toBeUndefined()
    expect(parsedConfig.annotation_ids).toEqual([])
  })

  it('selects material annotations by default and removes them from tutor context when deselected', async () => {
    window.electronAPI = {
      ...window.electronAPI,
      libraryGetFiles: jest.fn().mockResolvedValue([{ id: 7, filename: 'Lecture slides.pdf' }]),
      listLectures: jest.fn().mockResolvedValue([]),
      listDocumentAnnotations: jest.fn().mockImplementation(({ materialId }: { materialId?: number }) => Promise.resolve(
        materialId === 7
          ? [{ id: 701, subject_id: 101, material_id: 7, kind: 'highlight', selected_text: 'scarcity', body: '' }]
          : []
      ))
    } as any

    render(
      <MemoryRouter>
        <SessionConfigModal
          subjectId={101}
          subjectName="Principles of Microeconomics"
          initialMode="material"
          materialId={7}
          onClose={jest.fn()}
        />
      </MemoryRouter>
    )

    const annotationCheckbox = await screen.findByLabelText(/scarcity/i)
    expect(annotationCheckbox).toBeChecked()

    fireEvent.click(annotationCheckbox)
    fireEvent.click(screen.getByRole('button', { name: /Start Session/i }))
    const targetUrl = mockNavigate.mock.calls[0][0]
    const configParam = new URLSearchParams(targetUrl.split('?')[1]).get('config')
    expect(JSON.parse(decodeURIComponent(configParam!)).annotation_ids).toEqual([])
  })
})
