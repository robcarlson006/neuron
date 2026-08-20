import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import FlashCard from '../../src/components/FlashCard'
import type { Card } from '../../src/types'

const mockCard: Card = {
  id: 1,
  subject_id: 1,
  material_id: undefined,
  type: 'flashcard',
  front: 'What is the capital of France?',
  back: 'Paris',
  is_manual: 0,
  created_at: new Date().toISOString()
}

describe('FlashCard Component', () => {
  const mockOnResult = jest.fn()
  const mockOnSkip = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the front of the card initially', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)
    expect(screen.getByText('What is the capital of France?')).toBeInTheDocument()
  })

  it('reveals the answer when the card is clicked', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('flashcard'))

    expect(screen.getByText('Paris')).toBeInTheDocument()
  })

  it('shows self-rating buttons after revealing', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('flashcard'))

    expect(screen.getByText(/How did you do\?/i)).toBeInTheDocument()
    expect(screen.getByText('Wrong')).toBeInTheDocument()
    expect(screen.getByText('Partially Right')).toBeInTheDocument()
    expect(screen.getByText('Got It')).toBeInTheDocument()
  })

  it('calls onResult(1) when "Wrong" is clicked', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('flashcard'))
    fireEvent.click(screen.getByText('Wrong'))

    expect(mockOnResult).toHaveBeenCalledTimes(1)
    expect(mockOnResult).toHaveBeenCalledWith(1)
  })

  it('calls onResult(3) when "Partially Right" is clicked', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('flashcard'))
    fireEvent.click(screen.getByText('Partially Right'))

    expect(mockOnResult).toHaveBeenCalledTimes(1)
    expect(mockOnResult).toHaveBeenCalledWith(3)
  })

  it('calls onResult(5) when "Got It" is clicked', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('flashcard'))
    fireEvent.click(screen.getByText('Got It'))

    expect(mockOnResult).toHaveBeenCalledTimes(1)
    expect(mockOnResult).toHaveBeenCalledWith(5)
  })

  it('shows skip button when onSkip is provided', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} onSkip={mockOnSkip} />)
    expect(screen.getByText(/Skip for now/i)).toBeInTheDocument()
  })

  it('calls onSkip when skip button is clicked', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} onSkip={mockOnSkip} />)

    fireEvent.click(screen.getByText(/Skip for now/i))
    expect(mockOnSkip).toHaveBeenCalledTimes(1)
  })

  it('does not show skip button when onSkip is omitted', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)
    expect(screen.queryByText(/Skip for now/i)).not.toBeInTheDocument()
  })

  it('shows progress bar when cardNumber and totalCards provided', () => {
    render(
      <FlashCard
        card={mockCard}
        onResult={mockOnResult}
        cardNumber={3}
        totalCards={10}
      />
    )
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })
})
