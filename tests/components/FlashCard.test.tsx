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
  const mockOnGotIt = jest.fn()
  const mockOnAlmost = jest.fn()
  const mockOnForgot = jest.fn()
  const mockOnSkip = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the front of the card initially', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
      />
    )
    expect(screen.getByText('What is the capital of France?')).toBeInTheDocument()
  })

  it('shows "Term / Question" label on front', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
      />
    )
    expect(screen.getByText(/Term \/ Question/i)).toBeInTheDocument()
  })

  it('shows confidence buttons after flipping', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
      />
    )

    const cardEl = screen.getByTestId('flashcard')
    fireEvent.click(cardEl)

    expect(screen.getByText(/Got it!/i)).toBeInTheDocument()
    expect(screen.getByText(/Almost/i)).toBeInTheDocument()
    expect(screen.getByText(/Forgot it/i)).toBeInTheDocument()
  })

  it('calls onGotIt when "Got it!" is clicked', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
      />
    )

    // Flip first
    fireEvent.click(screen.getByTestId('flashcard'))
    fireEvent.click(screen.getByText(/Got it!/i))
    expect(mockOnGotIt).toHaveBeenCalledTimes(1)
  })

  it('calls onAlmost when "Almost" is clicked', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
      />
    )

    fireEvent.click(screen.getByTestId('flashcard'))
    fireEvent.click(screen.getByText(/Almost/i))
    expect(mockOnAlmost).toHaveBeenCalledTimes(1)
  })

  it('calls onForgot when "Forgot it" is clicked', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
      />
    )

    fireEvent.click(screen.getByTestId('flashcard'))
    fireEvent.click(screen.getByText(/Forgot it/i))
    expect(mockOnForgot).toHaveBeenCalledTimes(1)
  })

  it('shows skip button when onSkip is provided (before flip)', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
        onSkip={mockOnSkip}
      />
    )
    expect(screen.getByText(/Skip for now/i)).toBeInTheDocument()
  })

  it('calls onSkip when skip button is clicked', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
        onSkip={mockOnSkip}
      />
    )

    fireEvent.click(screen.getByText(/Skip for now/i))
    expect(mockOnSkip).toHaveBeenCalledTimes(1)
  })

  it('shows progress bar when cardNumber and totalCards provided', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
        cardNumber={3}
        totalCards={10}
      />
    )
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('resets to front after confidence is chosen', () => {
    render(
      <FlashCard
        card={mockCard}
        onGotIt={mockOnGotIt}
        onAlmost={mockOnAlmost}
        onForgot={mockOnForgot}
      />
    )

    // Flip
    fireEvent.click(screen.getByTestId('flashcard'))
    expect(screen.getByText(/Got it!/i)).toBeInTheDocument()

    // Choose confidence
    fireEvent.click(screen.getByText(/Got it!/i))

    // Should now show the "Reveal Answer" button (front state, button specifically)
    expect(screen.getByRole('button', { name: /Reveal Answer/i })).toBeInTheDocument()
  })
})
