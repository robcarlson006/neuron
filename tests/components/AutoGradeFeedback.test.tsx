import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import AutoGradeFeedback from '../../src/components/AutoGradeFeedback'
import type { AutoGradeResult } from '../../src/lib/semanticEvaluator'

describe('AutoGradeFeedback Component', () => {
  it('renders loading state when loading is true', () => {
    render(<AutoGradeFeedback result={null} loading={true} />)
    expect(screen.getByTestId('autograde-loading')).toBeInTheDocument()
    expect(screen.getByText('Grading...')).toBeInTheDocument()
  })

  it('renders nothing when result is null and loading is false', () => {
    const { container } = render(<AutoGradeFeedback result={null} loading={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders result with score, feedback, tier, and concept tags', () => {
    const mockResult: AutoGradeResult = {
      correct: true,
      score: 0.85,
      quality: 5,
      diagnosticQuality: 4,
      feedback: 'Great job capturing the key points!',
      matchedConcepts: ['Mitochondria', 'ATP'],
      missingConcepts: ['Matrix'],
      tierUsed: 'ai'
    }

    render(
      <AutoGradeFeedback
        result={mockResult}
        suggestedLabel="Mastered"
      />
    )

    expect(screen.getByTestId('autograde-feedback')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('🤖 AI Graded')).toBeInTheDocument()
    expect(screen.getByText('Great job capturing the key points!')).toBeInTheDocument()
    expect(screen.getByText('Mitochondria')).toBeInTheDocument()
    expect(screen.getByText('ATP')).toBeInTheDocument()
    expect(screen.getByText('Matrix')).toBeInTheDocument()
    expect(screen.getByText(/Mastered/)).toBeInTheDocument()
  })

  it('calls onAcceptSuggested when clicking the suggestion button', () => {
    const mockResult: AutoGradeResult = {
      correct: true,
      score: 0.9,
      quality: 5,
      diagnosticQuality: 4,
      feedback: 'Perfect!',
      matchedConcepts: [],
      missingConcepts: [],
      tierUsed: 'exact'
    }

    const onAccept = jest.fn()
    render(
      <AutoGradeFeedback
        result={mockResult}
        suggestedLabel="Got It"
        onAcceptSuggested={onAccept}
      />
    )

    const btn = screen.getByTitle('Click or press Space to accept')
    fireEvent.click(btn)
    expect(onAccept).toHaveBeenCalledTimes(1)
  })
})
