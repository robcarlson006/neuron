import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import KnowledgeGraphView from '../../src/components/graphs/KnowledgeGraphView'
import type { ConceptDependency, ConceptMastery, Card } from '../../src/types'

// Mock react-router-dom useNavigate
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}))

describe('KnowledgeGraphView', () => {
  const dependencies: ConceptDependency[] = [
    { subject_id: 1, prerequisite_concept: 'Derivatives', target_concept: 'Backpropagation', weight: 1.0 }
  ]

  const concepts: ConceptMastery[] = [
    { id: 1, user_id: 1, subject_id: 1, concept: 'Derivatives', mastery_prob: 0.90, observations: 10, updated_at: '2026-01-01' },
    { id: 2, user_id: 1, subject_id: 1, concept: 'Backpropagation', mastery_prob: 0.30, observations: 2, updated_at: '2026-01-01' }
  ]

  const cards: Card[] = [
    { id: 101, subject_id: 1, type: 'flashcard', front: 'What is a derivative?', back: 'Slope', is_manual: 0, concept: 'Derivatives', created_at: '2026-01-01' }
  ]

  it('renders graph header, summary badges, and concept node labels', () => {
    render(
      <KnowledgeGraphView
        subjectId={1}
        subjectName="Machine Learning"
        dependencies={dependencies}
        concepts={concepts}
        cards={cards}
      />
    )

    expect(screen.getByText('Knowledge & Concept Dependency Graph')).toBeInTheDocument()
    expect(screen.getByText('1 Mastered')).toBeInTheDocument()
    expect(screen.getByText('1 Gaps')).toBeInTheDocument()
    expect(screen.getByText('Derivatives')).toBeInTheDocument()
    expect(screen.getByText('Backpropagation')).toBeInTheDocument()
  })

  it('filters nodes when typing into the search input', () => {
    render(
      <KnowledgeGraphView
        subjectId={1}
        dependencies={dependencies}
        concepts={concepts}
        cards={cards}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search concepts or topics...')
    fireEvent.change(searchInput, { target: { value: 'Deriv' } })

    expect(screen.getByText('Derivatives')).toBeInTheDocument()
    expect(screen.queryByText('Backpropagation')).not.toBeInTheDocument()
  })

  it('opens inspector panel when node is clicked and handles study action', () => {
    const mockTutor = jest.fn()
    render(
      <KnowledgeGraphView
        subjectId={1}
        dependencies={dependencies}
        concepts={concepts}
        cards={cards}
        onOpenTutor={mockTutor}
      />
    )

    // Click on node label Derivatives
    const nodeLabel = screen.getByText('Derivatives')
    fireEvent.click(nodeLabel)

    // Inspector should open
    expect(screen.getByText('BKT Knowledge Level')).toBeInTheDocument()
    expect(screen.getAllByText('90%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('10 test observations')).toBeInTheDocument()

    // Study cards button click
    const studyBtn = screen.getByText(/Study Derivatives Cards/i)
    fireEvent.click(studyBtn)

    expect(mockNavigate).toHaveBeenCalledWith('/study/1?concept=Derivatives')
  })

  it('opens add dependency modal on "+ Link Dependency" button click', () => {
    render(
      <KnowledgeGraphView
        subjectId={1}
        dependencies={dependencies}
        concepts={concepts}
        cards={cards}
      />
    )

    const addLinkBtn = screen.getByText('+ Link Dependency')
    fireEvent.click(addLinkBtn)

    expect(screen.getByText('Add Concept Dependency Link')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Linear Algebra or Derivatives/i)).toBeInTheDocument()
  })
})
