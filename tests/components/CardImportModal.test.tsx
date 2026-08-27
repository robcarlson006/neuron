import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import CardImportModal from '../../src/components/CardImportModal'
import type { Subject, CardFolder, Material } from '../../src/types'

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

  const mockMaterials: Material[] = [
    {
      id: 101,
      subject_id: 10,
      filename: 'Lecture_03_Action_Potentials.pdf',
      file_type: 'pdf',
      content_text: 'The resting membrane potential is typically -70mV. Voltage-gated sodium channels open rapidly during depolarization.',
      uploaded_at: new Date().toISOString()
    },
    {
      id: 102,
      subject_id: 10,
      filename: 'Neurotransmitters_Overview.docx',
      file_type: 'docx',
      content_text: 'Glutamate is the primary excitatory neurotransmitter in the vertebrate CNS.',
      uploaded_at: new Date().toISOString()
    }
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
      getFolders: jest.fn().mockResolvedValue(mockFolders),
      getMaterials: jest.fn().mockResolvedValue(mockMaterials),
      getSubjects: jest.fn().mockResolvedValue([mockSubject])
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
    expect(screen.queryByText('Both (Mixed)')).toBeNull()
  })

  it('generates cards with AI successfully using pasted text', async () => {
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
        folderId: null,
        materialId: undefined,
        userId: 1
      }
    )

    expect(mockOnSuccess).toHaveBeenCalledWith(15, 'generate')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('selects from Subject Materials and generates cards from the material', async () => {
    await React.act(async () => {
      render(
        <CardImportModal
          isOpen={true}
          subjectId={10}
          subjectName="Neuroscience 101"
          subjects={[mockSubject]}
          folders={mockFolders}
          userId={1}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )
    })

    // Switch to Subject Materials mode
    const materialsTabBtn = screen.getByRole('button', { name: /subject materials/i })
    await React.act(async () => {
      fireEvent.click(materialsTabBtn)
    })

    // Wait for materials to load and appear
    await waitFor(() => {
      expect(screen.getByText('Lecture_03_Action_Potentials.pdf')).toBeInTheDocument()
    })
    expect(screen.getByText('Neurotransmitters_Overview.docx')).toBeInTheDocument()

    // Select the first material
    const useMaterialBtn = screen.getAllByRole('button', { name: /use material/i })[0]
    await React.act(async () => {
      fireEvent.click(useMaterialBtn)
    })

    // Verify active selection banner
    expect(screen.getByText(/using: lecture_03_action_potentials\.pdf/i)).toBeInTheDocument()

    // Click Generate button
    const generateBtn = screen.getByRole('button', { name: /generate 15 flashcards/i })
    await React.act(async () => {
      fireEvent.click(generateBtn)
    })

    expect(window.electronAPI.cardsGenerateFromText).toHaveBeenCalledWith(
      10,
      mockMaterials[0].content_text,
      expect.objectContaining({
        type: 'flashcard',
        count: 15
      })
    )

    expect(mockOnSuccess).toHaveBeenCalledWith(15, 'generate')
  })

  it('allows entering any custom uncapped card count', async () => {
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
    fireEvent.change(textarea, { target: { value: 'Comprehensive biology notes for exam review.' } })

    // Enter a custom count (e.g. 75)
    const numberInput = screen.getByRole('spinbutton')
    fireEvent.change(numberInput, { target: { value: '75' } })

    // Generate button should reflect 75
    const generateBtn = screen.getByRole('button', { name: /generate 75 flashcards/i })
    await React.act(async () => {
      fireEvent.click(generateBtn)
    })

    expect(window.electronAPI.cardsGenerateFromText).toHaveBeenCalledWith(
      10,
      'Comprehensive biology notes for exam review.',
      expect.objectContaining({
        count: 75
      })
    )
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
