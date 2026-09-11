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

  it('reveals the card when Enter is pressed in the answer textarea', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)
    const textarea = screen.getByPlaceholderText(/write your answer here/i)
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(screen.getByText(/How did you do\?/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/write your answer here/i)).not.toBeInTheDocument()
  })

  it('does not reveal the card when Shift+Enter is pressed in the answer textarea', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)
    const textarea = screen.getByPlaceholderText(/write your answer here/i)
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(screen.queryByText(/How did you do\?/i)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/write your answer here/i)).toBeInTheDocument()
  })

  it('reveals the card when Enter is pressed outside inputs', () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByText(/How did you do\?/i)).toBeInTheDocument()
  })

  it('automatically focuses the answer textarea on render and card changes', () => {
    const { rerender } = render(<FlashCard card={mockCard} onResult={mockOnResult} />)
    const textarea = screen.getByPlaceholderText(/write your answer here/i)
    expect(document.activeElement).toBe(textarea)

    // Simulate advancing to the next card
    const nextCard: Card = {
      ...mockCard,
      id: 2,
      front: 'What is the capital of Italy?',
      back: 'Rome'
    }
    rerender(<FlashCard card={nextCard} onResult={mockOnResult} />)
    const nextTextarea = screen.getByPlaceholderText(/write your answer here/i)
    expect(document.activeElement).toBe(nextTextarea)
  })

  it('runs auto-grader when an answer is typed and revealed on flashcard', async () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)
    const textarea = screen.getByPlaceholderText(/write your answer here/i)
    fireEvent.change(textarea, { target: { value: 'Paris' } })

    fireEvent.click(screen.getByTestId('flashcard'))

    expect(await screen.findByTestId('autograde-feedback')).toBeInTheDocument()
    expect(screen.getByText(/Suggested:/i)).toBeInTheDocument()
  })

  it('accepts suggested rating when pressing Space after reveal on flashcard', async () => {
    render(<FlashCard card={mockCard} onResult={mockOnResult} />)
    const textarea = screen.getByPlaceholderText(/write your answer here/i)
    fireEvent.change(textarea, { target: { value: 'Paris' } })

    fireEvent.click(screen.getByTestId('flashcard'))

    await screen.findByTestId('autograde-feedback')

    // Press Space to accept suggested rating
    fireEvent.keyDown(window, { key: ' ' })
    expect(mockOnResult).toHaveBeenCalledWith(5)
  })
})
