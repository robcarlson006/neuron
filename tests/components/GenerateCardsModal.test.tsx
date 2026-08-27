import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import GenerateCardsModal from '../../src/components/classes/GenerateCardsModal'
import type { SyllabusModule } from '../../src/types'

describe('GenerateCardsModal', () => {
  const mockModule: SyllabusModule = {
    id: 1,
    subject_id: 10,
    title: 'Cellular Respiration & ATP Production',
    chapter_number: 3,
    description: 'Overview of glycolysis, Krebs cycle, and electron transport chain.',
    hours_estimated: 3,
    status: 'in_progress',
    sort_order: 1,
    created_at: new Date().toISOString()
  }

  const mockOnClose = jest.fn()
  const mockOnGenerate = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders correctly when open', () => {
    render(
      <GenerateCardsModal
        isOpen={true}
        module={mockModule}
        subjectName="Biochemistry 101"
        onClose={mockOnClose}
        onGenerate={mockOnGenerate}
      />
    )

    expect(screen.getByText('Cellular Respiration & ATP Production')).toBeInTheDocument()
    expect(screen.getByText('Chapter 3')).toBeInTheDocument()
    expect(screen.getByText('Biochemistry 101')).toBeInTheDocument()
    expect(screen.getByText('Flashcards')).toBeInTheDocument()
    expect(screen.getByText('Active Recall')).toBeInTheDocument()
    expect(screen.getByText('Both (Mixed)')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <GenerateCardsModal
        isOpen={false}
        module={mockModule}
        onClose={mockOnClose}
        onGenerate={mockOnGenerate}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('allows selecting card format and presets', () => {
    render(
      <GenerateCardsModal
        isOpen={true}
        module={mockModule}
        onClose={mockOnClose}
        onGenerate={mockOnGenerate}
      />
    )

    // Select Active Recall
    const activeRecallBtn = screen.getByText('Active Recall').closest('button')!
    fireEvent.click(activeRecallBtn)

    // Select preset 30
    const preset30 = screen.getByRole('button', { name: '30' })
    fireEvent.click(preset30)

    // Submit
    const generateBtn = screen.getByRole('button', { name: /generate 30 questions/i })
    fireEvent.click(generateBtn)

    expect(mockOnGenerate).toHaveBeenCalledWith({
      type: 'active_recall',
      count: 30,
      flashcardCount: undefined,
      activeRecallCount: undefined
    })
  })

  it('calculates split when Both is selected', () => {
    render(
      <GenerateCardsModal
        isOpen={true}
        module={mockModule}
        onClose={mockOnClose}
        onGenerate={mockOnGenerate}
      />
    )

    // Select Both
    const bothBtn = screen.getByText('Both (Mixed)').closest('button')!
    fireEvent.click(bothBtn)

    // Select preset 20
    const preset20 = screen.getByRole('button', { name: '20' })
    fireEvent.click(preset20)

    // Verify breakdown helper text appears
    expect(screen.getByText(/Deck Breakdown:/i)).toBeInTheDocument()
    expect(screen.getByText(/13 Flashcards/i)).toBeInTheDocument()
    expect(screen.getByText(/7 Active Recall Questions/i)).toBeInTheDocument()

    // Submit
    const generateBtn = screen.getByRole('button', { name: /generate 20 cards/i })
    fireEvent.click(generateBtn)

    expect(mockOnGenerate).toHaveBeenCalledWith({
      type: 'both',
      count: 20,
      flashcardCount: 13,
      activeRecallCount: 7
    })
  })

  it('allows adjusting card count to any positive amount', () => {
    render(
      <GenerateCardsModal
        isOpen={true}
        module={mockModule}
        onClose={mockOnClose}
        onGenerate={mockOnGenerate}
      />
    )

    // Direct input of custom number (e.g. 75)
    const numberInput = screen.getByRole('spinbutton')
    fireEvent.change(numberInput, { target: { value: '75' } })

    // Submit
    const generateBtn = screen.getByRole('button', { name: /generate 75 cards/i })
    fireEvent.click(generateBtn)

    expect(mockOnGenerate).toHaveBeenCalledWith({
      type: 'flashcard',
      count: 75,
      flashcardCount: undefined,
      activeRecallCount: undefined
    })
  })

  it('calls onClose when Cancel button is clicked', () => {
    render(
      <GenerateCardsModal
        isOpen={true}
        module={mockModule}
        onClose={mockOnClose}
        onGenerate={mockOnGenerate}
      />
    )

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelBtn)

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('disables controls while generating', () => {
    render(
      <GenerateCardsModal
        isOpen={true}
        module={mockModule}
        isGenerating={true}
        onClose={mockOnClose}
        onGenerate={mockOnGenerate}
      />
    )

    expect(screen.getByText(/generating/i)).toBeInTheDocument()
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelBtn).toBeDisabled()
  })
})
