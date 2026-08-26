import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import CurriculumView from '../../src/components/classes/CurriculumView'
import type { SyllabusModule, ModuleTopic } from '../../src/types'

describe('CurriculumView', () => {
  const mockModules: (SyllabusModule & { topics: ModuleTopic[] })[] = [
    {
      id: 1,
      subject_id: 10,
      title: 'Module 1: Cellular Respiration',
      chapter_number: 1,
      description: 'Understanding glycolysis and Krebs cycle',
      hours_estimated: 4,
      status: 'in_progress',
      sort_order: 1,
      created_at: new Date().toISOString(),
      topics: [
        {
          id: 101,
          module_id: 1,
          title: 'Glycolysis pathway',
          mastery_target: 80,
          sort_order: 1,
          created_at: new Date().toISOString()
        }
      ]
    },
    {
      id: 2,
      subject_id: 10,
      title: 'Module 2: Photosynthesis',
      chapter_number: 2,
      description: 'Light and dark reactions',
      hours_estimated: 3,
      status: 'pending',
      sort_order: 2,
      created_at: new Date().toISOString(),
      topics: []
    }
  ]

  const mockOnStartTutor = jest.fn()
  const mockOnGenerateCards = jest.fn()
  const mockOnToggleTopic = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders modules and opens GenerateCardsModal on button click', async () => {
    render(
      <CurriculumView
        modules={mockModules}
        subjectName="Biology 101"
        onStartTutor={mockOnStartTutor}
        onGenerateCards={mockOnGenerateCards}
        onToggleTopic={mockOnToggleTopic}
      />
    )

    expect(screen.getByText(/Cellular Respiration/i)).toBeInTheDocument()

    // Find Generate Cards button in expanded module
    const generateBtn = screen.getByRole('button', { name: /generate cards/i })
    fireEvent.click(generateBtn)

    // Verify modal opens with module title and choices
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('1. Choose Card Format')).toBeInTheDocument()
    expect(screen.getByText('2. How many cards do you want?')).toBeInTheDocument()

    // Select Active Recall and generate
    const recallBtn = screen.getByText('Active Recall').closest('button')!
    fireEvent.click(recallBtn)

    const modalGenerateBtn = screen.getByRole('button', { name: /generate 15 questions/i })
    await React.act(async () => {
      fireEvent.click(modalGenerateBtn)
    })

    expect(mockOnGenerateCards).toHaveBeenCalledWith(1, {
      type: 'active_recall',
      count: 15,
      flashcardCount: undefined,
      activeRecallCount: undefined
    })
  })

  it('renders empty message when no modules are provided', () => {
    render(
      <CurriculumView
        modules={[]}
        onStartTutor={mockOnStartTutor}
        onGenerateCards={mockOnGenerateCards}
        onToggleTopic={mockOnToggleTopic}
      />
    )

    expect(screen.getByText(/No modules yet/i)).toBeInTheDocument()
  })
})
