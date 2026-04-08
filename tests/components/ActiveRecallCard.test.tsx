import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActiveRecallCard from '../../src/components/ActiveRecallCard'
import type { Card, EvaluationResult } from '../../src/types'

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

const mockEvaluation: EvaluationResult = {
  correct: true,
  score: 4,
  feedback: 'Good answer! You covered the main points. Consider also mentioning the Alliance system.'
}

describe('ActiveRecallCard Component', () => {
  const mockOnSubmit = jest.fn()
  const mockOnConfidence = jest.fn()
  const mockOnSkip = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockOnSubmit.mockResolvedValue(mockEvaluation)
  })

  it('renders the question', () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )
    expect(screen.getByText('What were the primary causes of World War I?')).toBeInTheDocument()
  })

  it('renders the answer textarea', () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )
    expect(screen.getByTestId('answer-input')).toBeInTheDocument()
  })

  it('submit button is disabled when answer is empty', () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )
    const submitBtn = screen.getByTestId('submit-answer')
    expect(submitBtn).toBeDisabled()
  })

  it('submit button is enabled when answer is typed', async () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )
    const textarea = screen.getByTestId('answer-input')
    await userEvent.type(textarea, 'Some answer')
    expect(screen.getByTestId('submit-answer')).not.toBeDisabled()
  })

  it('shows feedback after submitting', async () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )

    const textarea = screen.getByTestId('answer-input')
    await userEvent.type(textarea, 'Nationalism, imperialism, militarism')
    fireEvent.click(screen.getByTestId('submit-answer'))

    await waitFor(() => {
      expect(screen.getByText(/Good answer!/i)).toBeInTheDocument()
    })
  })

  it('shows model answer in feedback phase', async () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )

    await userEvent.type(screen.getByTestId('answer-input'), 'My answer')
    fireEvent.click(screen.getByTestId('submit-answer'))

    await waitFor(() => {
      expect(screen.getByText(/Model Answer/i)).toBeInTheDocument()
    })
  })

  it('shows correct indicator when answer is correct', async () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )

    await userEvent.type(screen.getByTestId('answer-input'), 'Correct answer')
    fireEvent.click(screen.getByTestId('submit-answer'))

    await waitFor(() => {
      expect(screen.getByText(/Correct!/i)).toBeInTheDocument()
    })
  })

  it('shows incorrect indicator when answer is wrong', async () => {
    mockOnSubmit.mockResolvedValue({ correct: false, score: 1, feedback: 'Wrong answer' })

    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )

    await userEvent.type(screen.getByTestId('answer-input'), 'Wrong answer')
    fireEvent.click(screen.getByTestId('submit-answer'))

    await waitFor(() => {
      expect(screen.getByText(/Not quite/i)).toBeInTheDocument()
    })
  })

  it('calls onConfidence when confidence level is selected', async () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )

    await userEvent.type(screen.getByTestId('answer-input'), 'My answer')
    fireEvent.click(screen.getByTestId('submit-answer'))

    await waitFor(() => screen.getByText(/Got it perfectly!/i))
    fireEvent.click(screen.getByText(/Got it perfectly!/i))

    expect(mockOnConfidence).toHaveBeenCalledWith(5, mockEvaluation)
  })

  it('shows skip button when onSkip is provided', () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
        onSkip={mockOnSkip}
      />
    )
    expect(screen.getByText(/Skip/i)).toBeInTheDocument()
  })

  it('calls onSkip when skip is clicked', () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
        onSkip={mockOnSkip}
      />
    )
    fireEvent.click(screen.getByText(/Skip/i))
    expect(mockOnSkip).toHaveBeenCalledTimes(1)
  })

  it('shows progress when cardNumber and totalCards provided', () => {
    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
        cardNumber={2}
        totalCards={5}
      />
    )
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('shows error when submission fails', async () => {
    mockOnSubmit.mockRejectedValue(new Error('API error'))

    render(
      <ActiveRecallCard
        card={mockCard}
        onSubmit={mockOnSubmit}
        onConfidence={mockOnConfidence}
      />
    )

    await userEvent.type(screen.getByTestId('answer-input'), 'My answer')
    fireEvent.click(screen.getByTestId('submit-answer'))

    await waitFor(() => {
      expect(screen.getByText(/Failed to evaluate/i)).toBeInTheDocument()
    })
  })
})
