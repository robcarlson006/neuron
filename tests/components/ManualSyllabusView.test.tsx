import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ManualSyllabusView from '../../src/components/classes/ManualSyllabusView'
import type { ManualSyllabusWeek, Material, Card } from '../../src/types'

describe('ManualSyllabusView', () => {
  const sampleMaterials: Material[] = [
    {
      id: 101,
      subject_id: 1,
      filename: 'Lecture 1 - 15 Sep.pptx',
      file_type: 'presentation',
      content_text: 'Economics is the study of scarcity.',
      uploaded_at: '2026-09-15T09:00:00Z'
    },
    {
      id: 102,
      subject_id: 1,
      filename: 'Intermediate Microeconomics Chapter 1.pdf',
      file_type: 'document',
      content_text: 'Chapter 1 covers consumer choice.',
      uploaded_at: '2026-09-16T09:00:00Z'
    }
  ]

  const sampleWeeks: ManualSyllabusWeek[] = [
    {
      id: 1,
      subject_id: 1,
      title: 'Week 1',
      sort_order: 1,
      created_at: '2026-09-15T09:00:00Z',
      materials: sampleMaterials
    }
  ]

  const sampleCards: Card[] = [
    {
      id: 501,
      subject_id: 1,
      material_id: 101,
      type: 'flashcard',
      front: 'What is scarcity?',
      back: 'The limited nature of society resources.',
      is_manual: 0,
      created_at: '2026-09-15T10:00:00Z'
    }
  ]

  const mockOnReload = jest.fn().mockResolvedValue(undefined)
  const mockOnTutorMaterial = jest.fn()
  const mockOnTutorMaterials = jest.fn()
  const mockOnOpenMaterial = jest.fn()
  const mockOnGenerateCards = jest.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    jest.clearAllMocks()
    ;(window as any).electronAPI = {
      ...(window as any).electronAPI,
      manualSyllabusCreateWeek: jest.fn().mockResolvedValue({}),
      manualSyllabusAssignMaterial: jest.fn().mockResolvedValue({ success: true }),
      manualSyllabusUnassignMaterial: jest.fn().mockResolvedValue({ success: true }),
      manualSyllabusUpdateWeek: jest.fn().mockResolvedValue({ success: true }),
      manualSyllabusDeleteWeek: jest.fn().mockResolvedValue({ success: true }),
      manualSyllabusReorderWeeks: jest.fn().mockResolvedValue({ success: true }),
      manualSyllabusReorderMaterials: jest.fn().mockResolvedValue({ success: true })
    }
  })

  it('renders weeks, materials, cards badge, and action buttons', () => {
    render(
      <ManualSyllabusView
        subjectId={1}
        subjectName="Microeconomics"
        weeks={sampleWeeks}
        materials={sampleMaterials}
        cards={sampleCards}
        onReload={mockOnReload}
        onTutorMaterial={mockOnTutorMaterial}
        onTutorMaterials={mockOnTutorMaterials}
        onOpenMaterial={mockOnOpenMaterial}
        onGenerateCards={mockOnGenerateCards}
      />
    )

    // Check week header
    expect(screen.getByText('Week 1')).toBeInTheDocument()
    expect(screen.getByText('MATERIALS (2)')).toBeInTheDocument()

    // Check materials rendered
    expect(screen.getByText('Lecture 1 - 15 Sep.pptx')).toBeInTheDocument()
    expect(screen.getByText('Intermediate Microeconomics Chapter 1.pdf')).toBeInTheDocument()

    // Check card count badge (101 has 1 card, 102 has 0 cards)
    expect(screen.getByText('1 card')).toBeInTheDocument()
    expect(screen.getByText('⚠️ 0 cards')).toBeInTheDocument()

    // Check footer action buttons
    expect(screen.getByRole('button', { name: /Start Tutor/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate Cards/i })).toBeInTheDocument()
  })

  it('updates button labels when materials are checked and calls onTutorMaterials', () => {
    render(
      <ManualSyllabusView
        subjectId={1}
        subjectName="Microeconomics"
        weeks={sampleWeeks}
        materials={sampleMaterials}
        cards={sampleCards}
        onReload={mockOnReload}
        onTutorMaterial={mockOnTutorMaterial}
        onTutorMaterials={mockOnTutorMaterials}
        onOpenMaterial={mockOnOpenMaterial}
        onGenerateCards={mockOnGenerateCards}
      />
    )

    // Select the first material's checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    // Buttons should now show count
    expect(screen.getByText('Start Tutor (1 material)')).toBeInTheDocument()
    expect(screen.getByText('Generate Cards (1)')).toBeInTheDocument()

    // Click Start Tutor
    fireEvent.click(screen.getByRole('button', { name: /Start Tutor \(1 material\)/i }))
    expect(mockOnTutorMaterials).toHaveBeenCalledWith([sampleMaterials[0]], 'Week 1')
  })

  it('selects all materials and clears selections via the header buttons', () => {
    render(
      <ManualSyllabusView
        subjectId={1}
        subjectName="Microeconomics"
        weeks={sampleWeeks}
        materials={sampleMaterials}
        cards={sampleCards}
        onReload={mockOnReload}
        onTutorMaterial={mockOnTutorMaterial}
        onTutorMaterials={mockOnTutorMaterials}
        onOpenMaterial={mockOnOpenMaterial}
        onGenerateCards={mockOnGenerateCards}
      />
    )

    // Click Select all
    fireEvent.click(screen.getByText('Select all'))
    expect(screen.getByText('Start Tutor (2 materials)')).toBeInTheDocument()
    expect(screen.getByText('Generate Cards (2)')).toBeInTheDocument()

    // Click Clear
    fireEvent.click(screen.getByText('Clear'))
    expect(screen.getByText('Start Tutor')).toBeInTheDocument()
    expect(screen.getByText('Generate Cards')).toBeInTheDocument()
  })

  it('opens GenerateCardsModal when Generate Cards button is clicked', () => {
    render(
      <ManualSyllabusView
        subjectId={1}
        subjectName="Microeconomics"
        weeks={sampleWeeks}
        materials={sampleMaterials}
        cards={sampleCards}
        onReload={mockOnReload}
        onTutorMaterial={mockOnTutorMaterial}
        onTutorMaterials={mockOnTutorMaterials}
        onOpenMaterial={mockOnOpenMaterial}
        onGenerateCards={mockOnGenerateCards}
      />
    )

    // Click Generate Cards
    fireEvent.click(screen.getByRole('button', { name: /Generate Cards/i }))

    // Modal should be open
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Manual Syllabus')).toBeInTheDocument()
    expect(screen.getByText(/Entire Week \(2\)/)).toBeInTheDocument()
    expect(screen.getByText('Flashcards')).toBeInTheDocument()
    expect(screen.getByText('Active Recall')).toBeInTheDocument()
  })
})
