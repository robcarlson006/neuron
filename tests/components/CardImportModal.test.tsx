import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import CardImportModal from '../../src/components/CardImportModal'
import type { Subject, CardFolder } from '../../src/types'

describe('CardImportModal', () => {
  const mockSubject: Subject = {
    id: 10,
    user_id: 1,
    name: 'Neuroscience 101',
    status: 'active',
    course_code: 'NEU-101',
    created_at: new Date().toISOString()
  }

  const mockFolders: CardFolder[] = [
    { id: 1, subject_id: 10, name: 'Synaptic Transmission', created_at: new Date().toISOString() }
  ]

  const mockOnClose = jest.fn()
  const mockOnSuccess = jest.fn()
  const mockOnManualSave = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    window.electronAPI = {
      ...window.electronAPI,
      cardsGenerateFromText: jest.fn().mockResolvedValue({ success: true, count: 15, duplicates_filtered: 0 }),
      saveManyCards: jest.fn().mockResolvedValue(true),
      getFolders: jest.fn().mockResolvedValue(mockFolders)
    } as any
  })

  it('renders correctly when open with default AI Generation tab', async () => {
    await React.act(async () => {
      render(
        <CardImportModal
          isOpen={true}
          subjectId={10}
          subjectName="Neuroscience 101"
          folders={mockFolders}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )
    })

    expect(screen.getByText(/Import & Generate Cards/i)).toBeInTheDocument()
    expect(screen.getByText('Neuroscience 101')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate with ai/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /manual & file import/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/paste lecture notes/i)).toBeInTheDocument()
    expect(screen.getByText('Flashcards')).toBeInTheDocument()
    expect(screen.getByText('Active Recall')).toBeInTheDocument()
    expect(screen.getByText('Both (Mixed)')).toBeInTheDocument()
  })

  it('generates cards with AI successfully', async () => {
    await React.act(async () => {
      render(
        <CardImportModal
          isOpen={true}
          subjectId={10}
          subjectName="Neuroscience 101"
          folders={mockFolders}
          userId={1}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )
    })

    // Fill source text
    const textarea = screen.getByPlaceholderText(/paste lecture notes/i)
    fireEvent.change(textarea, { target: { value: 'Action potentials are caused by depolarization of the membrane.' } })

    // Select Active Recall
    const recallBtn = screen.getByText('Active Recall').closest('button')!
    fireEvent.click(recallBtn)

    // Select preset 20
    const preset20 = screen.getByRole('button', { name: '20' })
    fireEvent.click(preset20)

    // Click Generate button
    const generateBtn = screen.getByRole('button', { name: /generate 20 questions/i })
    await React.act(async () => {
      fireEvent.click(generateBtn)
    })

    expect(window.electronAPI.cardsGenerateFromText).toHaveBeenCalledWith(
      10,
      'Action potentials are caused by depolarization of the membrane.',
      {
        type: 'active_recall',
        count: 20,
        flashcardCount: undefined,
        activeRecallCount: undefined,
        folderId: null,
        userId: 1
      }
    )

    expect(mockOnSuccess).toHaveBeenCalledWith(15, 'generate')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('switches to Manual & File Import tab and parses cards', async () => {
    await React.act(async () => {
      render(
        <CardImportModal
          isOpen={true}
          subjectId={10}
          subjectName="Neuroscience 101"
          folders={mockFolders}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          onManualSave={mockOnManualSave}
        />
      )
    })

    // Switch to manual tab
    const manualTabBtn = screen.getByRole('button', { name: /manual & file import/i })
    fireEvent.click(manualTabBtn)

    expect(screen.getByText(/Import from file/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Term\.\.\.Definition/i)).toBeInTheDocument()

    // Enter formatted text
    const manualTextarea = screen.getByPlaceholderText(/Term\.\.\.Definition/i)
    fireEvent.change(manualTextarea, {
      target: { value: 'Dopamine...Neurotransmitter involved in reward; Serotonin...Regulates mood' }
    })

    // Verify preview renders
    expect(screen.getByText('2 cards found')).toBeInTheDocument()
    expect(screen.getByText('Dopamine')).toBeInTheDocument()
    expect(screen.getByText('Neurotransmitter involved in reward')).toBeInTheDocument()

    // Click Import Cards
    const importBtn = screen.getByRole('button', { name: /import 2 cards/i })
    await React.act(async () => {
      fireEvent.click(importBtn)
    })

    expect(mockOnManualSave).toHaveBeenCalledWith([
      { front: 'Dopamine', back: 'Neurotransmitter involved in reward', type: 'flashcard', folder_id: null },
      { front: 'Serotonin', back: 'Regulates mood', type: 'flashcard', folder_id: null }
    ])

    expect(mockOnSuccess).toHaveBeenCalledWith(2, 'import')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('allows subject selection when multiple subjects are passed', async () => {
    const multiSubjects: Subject[] = [
      { id: 1, user_id: 1, name: 'Biology', status: 'active', created_at: '' },
      { id: 2, user_id: 1, name: 'Chemistry', status: 'active', created_at: '' }
    ]

    await React.act(async () => {
      render(
        <CardImportModal
          isOpen={true}
          subjects={multiSubjects}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )
    })

    const select = screen.getByRole('combobox', { name: /select subject/i })
    expect(select).toBeInTheDocument()
    expect(screen.getByText('Biology')).toBeInTheDocument()
    expect(screen.getByText('Chemistry')).toBeInTheDocument()
  })

  it('shows error message if trying to generate with empty text', async () => {
    await React.act(async () => {
      render(
        <CardImportModal
          isOpen={true}
          subjectId={10}
          subjectName="Neuroscience 101"
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )
    })

    const generateBtn = screen.getByRole('button', { name: /generate 15 flashcards/i })
    fireEvent.click(generateBtn)

    // Button should be disabled when text is empty
    expect(generateBtn).toBeDisabled()
  })
})
