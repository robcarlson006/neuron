import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ExamReadinessCard from '../../src/components/readiness/ExamReadinessCard'
import CramOptimizerModal from '../../src/components/readiness/CramOptimizerModal'
import type { ExamReadinessResult } from '../../src/types'
import type { CardWithSchedule } from '../../src/lib/readinessEngine'

const mockReadiness: ExamReadinessResult = {
  subjectId: 1,
  deadlineLabel: 'Midterm Exam',
  examDate: '2026-05-15',
  daysRemaining: 10,
  projectedScore: 78,
  confidenceMargin: 4,
  tier: 'proficient',
  tierLabel: 'Proficient (Targeting Pass / B Grade)',
  coveragePercent: 85,
  totalCards: 50,
  weakTopics: [
    {
      topicTitle: 'Thermodynamics',
      cardCount: 5,
      masteredCount: 1,
      retrievability: 0.45,
      projectedScore: 48,
      status: 'weak',
      priorityRank: 1
    }
  ],
  allTopics: []
}

const mockCards: CardWithSchedule[] = [
  {
    id: 101,
    subject_id: 1,
    type: 'flashcard',
    front: 'What is entropy?',
    back: 'Measure of disorder',
    is_manual: 0,
    created_at: '2026-05-01',
    concept: 'Thermodynamics',
    stability: 2,
    last_reviewed_at: '2026-05-01'
  }
]

describe('ExamReadinessCard & CramOptimizerModal', () => {
  it('renders ExamReadinessCard with projected score and tier label', () => {
    const mockOpen = jest.fn()
    render(
      <ExamReadinessCard
        readiness={mockReadiness}
        subjectName="Physics 101"
        onOpenCramOptimizer={mockOpen}
      />
    )

    expect(screen.getByText('78%')).toBeInTheDocument()
    expect(screen.getByText(/Proficient/i)).toBeInTheDocument()
    expect(screen.getByText(/Thermodynamics/i)).toBeInTheDocument()

    const btn = screen.getByRole('button', { name: /launch cram optimizer/i })
    fireEvent.click(btn)
    expect(mockOpen).toHaveBeenCalled()
  })

  it('renders CramOptimizerModal and updates boost projection on slider change', () => {
    const mockClose = jest.fn()
    const mockStart = jest.fn()
    const mockApply = jest.fn()

    render(
      <CramOptimizerModal
        isOpen={true}
        readiness={mockReadiness}
        cards={mockCards}
        subjectName="Physics 101"
        onClose={mockClose}
        onStartCramSession={mockStart}
        onApplyDailyPlan={mockApply}
      />
    )

    expect(screen.getByText(/Cram Schedule Optimizer/i)).toBeInTheDocument()
    expect(screen.getByText(/45 minutes/i)).toBeInTheDocument()

    // Adjust slider to 90 min
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '90' } })
    expect(screen.getByText(/90 minutes/i)).toBeInTheDocument()

    // Trigger start day 1 cram session
    const startBtn = screen.getByRole('button', { name: /start day 1 cram session/i })
    fireEvent.click(startBtn)
    expect(mockStart).toHaveBeenCalledWith([101], expect.stringContaining('Day 1'))

    // Trigger add to daily plan
    const applyBtn = screen.getByRole('button', { name: /add to daily plan/i })
    fireEvent.click(applyBtn)
    expect(mockApply).toHaveBeenCalled()
  })
})
