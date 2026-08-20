import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ActiveRecallCard from '../../src/components/ActiveRecallCard'
import type { Card } from '../../src/types'

const mockCard: Card = {
  id: 1,
  subject_id: 1,
  material_id: undefined,
  type: 'active_recall',
  front: 'What were the primary causes of World War I?',
  back: 'Nationalism, imperialism, militarism, alliance system, assassination of Franz Ferdinand',
  is_manual: 0,
  created_at: new Date().toISOString()
}

describe('ActiveRecallCard Component', () => {
  const mockOnResult = jest.fn()
  const mockOnSkip = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the question', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} />)
    expect(screen.getByText('What were the primary causes of World War I?')).toBeInTheDocument()
  })

  it('renders the answer textarea', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} />)
    expect(screen.getByTestId('answer-input')).toBeInTheDocument()
  })

  it('shows the model answer after clicking "Show Answer"', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('show-answer'))

    expect(screen.getByText(/Model Answer/i)).toBeInTheDocument()
    expect(screen.getByText(/Nationalism, imperialism, militarism/)).toBeInTheDocument()
  })

  it('shows self-rating buttons after revealing', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('show-answer'))

    expect(screen.getByText(/How did you do\?/i)).toBeInTheDocument()
    expect(screen.getByText('Wrong')).toBeInTheDocument()
    expect(screen.getByText('Partially Right')).toBeInTheDocument()
    expect(screen.getByText('Got It')).toBeInTheDocument()
  })

  it('calls onResult(1) when "Wrong" is clicked', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('show-answer'))
    fireEvent.click(screen.getByText('Wrong'))

    expect(mockOnResult).toHaveBeenCalledTimes(1)
    expect(mockOnResult).toHaveBeenCalledWith(1)
  })

  it('calls onResult(3) when "Partially Right" is clicked', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('show-answer'))
    fireEvent.click(screen.getByText('Partially Right'))

    expect(mockOnResult).toHaveBeenCalledTimes(1)
    expect(mockOnResult).toHaveBeenCalledWith(3)
  })

  it('calls onResult(5) when "Got It" is clicked', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} />)

    fireEvent.click(screen.getByTestId('show-answer'))
    fireEvent.click(screen.getByText('Got It'))

    expect(mockOnResult).toHaveBeenCalledTimes(1)
    expect(mockOnResult).toHaveBeenCalledWith(5)
  })

  it('shows skip button when onSkip is provided', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} onSkip={mockOnSkip} />)
    expect(screen.getByText(/Skip/i)).toBeInTheDocument()
  })

  it('calls onSkip when skip is clicked', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} onSkip={mockOnSkip} />)

    fireEvent.click(screen.getByText(/Skip/i))
    expect(mockOnSkip).toHaveBeenCalledTimes(1)
  })

  it('does not show skip button when onSkip is omitted', () => {
    render(<ActiveRecallCard card={mockCard} onResult={mockOnResult} />)
    expect(screen.queryByText(/Skip/i)).not.toBeInTheDocument()
  })

  it('shows progress when cardNumber and totalCards provided', () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onResult={mockOnResult}
        cardNumber={2}
        totalCards={5}
      />
    )
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })
})
