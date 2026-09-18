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
      cardsBatchGenerate: jest.fn().mockResolvedValue({ success: true, totalGenerated: 20, results: [{ success: true, count: 10 }, { success: true, count: 10 }] }),
      cardsGenerateFromMultiple: jest.fn().mockResolvedValue({ success: true, count: 16 }),
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
        userId: 1,
        autoCount: false
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

  it('selects Auto (AI Decides) and generates cards with autoCount: true', async () => {
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
    fireEvent.change(textarea, { target: { value: 'Neurotransmitters cross the synaptic cleft.' } })

    // Click Auto (AI Decides) button
    const autoBtn = screen.getByRole('button', { name: /auto \(ai decides\)/i })
    fireEvent.click(autoBtn)

    expect(screen.getAllByText(/ai decides/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/ai auto-sizing active/i)).toBeInTheDocument()

    // Click Generate button
    const generateBtn = screen.getByRole('button', { name: /generate flashcards \(ai decides\)/i })
    await React.act(async () => {
      fireEvent.click(generateBtn)
    })

    expect(window.electronAPI.cardsGenerateFromText).toHaveBeenCalledWith(
      10,
      'Neurotransmitters cross the synaptic cleft.',
      expect.objectContaining({
        type: 'flashcard',
        autoCount: true
      })
    )

    expect(mockOnSuccess).toHaveBeenCalledWith(15, 'generate')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('preloads material when initialMaterialId and initialAutoCount are passed', async () => {
    await React.act(async () => {
      render(
        <CardImportModal
          isOpen={true}
          subjectId={10}
          subjectName="Neuroscience 101"
          subjects={[mockSubject]}
          folders={mockFolders}
          userId={1}
          initialMaterialId={101}
          initialAutoCount={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )
    })

    // Wait for material to be selected
    await waitFor(() => {
      expect(screen.getByText(/using: lecture_03_action_potentials\.pdf/i)).toBeInTheDocument()
    })

    // Verify Auto is active
    expect(screen.getAllByText(/ai decides/i).length).toBeGreaterThan(0)

    // Generate button should have AI Decides label
    const generateBtn = screen.getByRole('button', { name: /generate flashcards \(ai decides\)/i })
    await React.act(async () => {
      fireEvent.click(generateBtn)
    })

    expect(window.electronAPI.cardsGenerateFromText).toHaveBeenCalledWith(
      10,
      mockMaterials[0].content_text,
      expect.objectContaining({
        type: 'flashcard',
        materialId: 101,
        autoCount: true
      })
    )
  })

  it('switches back to fixed count when clicking a preset chip after selecting Auto', async () => {
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

    // Select Auto
    const autoBtn = screen.getByRole('button', { name: /auto \(ai decides\)/i })
    fireEvent.click(autoBtn)
    expect(screen.getAllByText(/ai decides/i).length).toBeGreaterThan(0)

    // Click preset 30
    const preset30 = screen.getByRole('button', { name: '30' })
    fireEvent.click(preset30)

    // Should no longer show AI Decides in badge
    expect(screen.queryByText(/ai auto-sizing active/i)).toBeNull()

    const textarea = screen.getByPlaceholderText(/paste lecture notes/i)
    fireEvent.change(textarea, { target: { value: 'Synaptic plasticity mechanisms.' } })

    const generateBtn = screen.getByRole('button', { name: /generate 30 flashcards/i })
    await React.act(async () => {
      fireEvent.click(generateBtn)
    })

    expect(window.electronAPI.cardsGenerateFromText).toHaveBeenCalledWith(
      10,
      'Synaptic plasticity mechanisms.',
      expect.objectContaining({
        type: 'flashcard',
        count: 30,
        autoCount: false
      })
    )
  })

  it('auto-formats math equations to LaTeX when clicking Auto-Format Math button', async () => {
    window.electronAPI.formatMathEquations = jest.fn().mockResolvedValue({
      success: true,
      text: 'Pythagorean Theorem...$a^2 + b^2 = c^2$'
    })

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

    // Switch to manual tab
    const manualTabBtn = screen.getByRole('button', { name: /manual & file import/i })
    fireEvent.click(manualTabBtn)

    const manualTextarea = screen.getByPlaceholderText(/Term\.\.\.Definition/i)
    fireEvent.change(manualTextarea, {
      target: { value: 'Pythagorean Theorem...a^2 + b^2 = c^2' }
    })

    const formatBtn = screen.getByRole('button', { name: /auto-format math/i })
    await React.act(async () => {
      fireEvent.click(formatBtn)
    })

    expect(window.electronAPI.formatMathEquations).toHaveBeenCalledWith('Pythagorean Theorem...a^2 + b^2 = c^2')
    expect(manualTextarea).toHaveValue('Pythagorean Theorem...$a^2 + b^2 = c^2$')
  })

  it('allows selecting multiple materials and combines their text for generation', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('Lecture_03_Action_Potentials.pdf')).toBeInTheDocument()
    })

    // Select first material
    const useBtns = screen.getAllByRole('button', { name: /use material/i })
    await React.act(async () => {
      fireEvent.click(useBtns[0])
    })

    expect(screen.getByText(/using: lecture_03_action_potentials\.pdf/i)).toBeInTheDocument()

    // Select second material
    const secondUseBtn = screen.getByRole('button', { name: /use material/i })
    await React.act(async () => {
      fireEvent.click(secondUseBtn)
    })

    // Verify multi-selection banner
    expect(screen.getByText(/using: 2 materials selected/i)).toBeInTheDocument()

    // Both should show Selected button
    const selectedBtns = screen.getAllByRole('button', { name: /^selected$/i })
    expect(selectedBtns.length).toBe(2)

    // Generate cards
    const generateBtn = screen.getByRole('button', { name: /generate 15 flashcards/i })
    await React.act(async () => {
      fireEvent.click(generateBtn)
    })

    expect(window.electronAPI.cardsGenerateFromText).toHaveBeenCalledWith(
      10,
      expect.stringContaining('# Lecture_03_Action_Potentials.pdf'),
      expect.objectContaining({
        type: 'flashcard',
        count: 15,
        materialIds: [101, 102],
        materialId: undefined
      })
    )
    expect(window.electronAPI.cardsGenerateFromText).toHaveBeenCalledWith(
      10,
      expect.stringContaining('# Neurotransmitters_Overview.docx'),
      expect.anything()
    )
  })

  it('allows removing an individual material via its tag/chip and using Select All / Deselect All', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('Lecture_03_Action_Potentials.pdf')).toBeInTheDocument()
    })

    // Click Select All
    const selectAllBtn = screen.getByRole('button', { name: /select all/i })
    await React.act(async () => {
      fireEvent.click(selectAllBtn)
    })

    expect(screen.getByText(/using: 2 materials selected/i)).toBeInTheDocument()

    // Remove first material via chip
    const removeBtn = screen.getByRole('button', { name: /remove lecture_03_action_potentials\.pdf/i })
    await React.act(async () => {
      fireEvent.click(removeBtn)
    })

    // Now only 1 material remains selected
    expect(screen.getByText(/using: neurotransmitters_overview\.docx/i)).toBeInTheDocument()

    // Select All again to select both
    const selectAllBtnAgain = screen.getByRole('button', { name: /select all/i })
    await React.act(async () => {
      fireEvent.click(selectAllBtnAgain)
    })

    // Now it should show Deselect All
    const deselectAllBtn = screen.getByRole('button', { name: /deselect all/i })
    await React.act(async () => {
      fireEvent.click(deselectAllBtn)
    })

    // Banner should be gone
    expect(screen.queryByText(/using:/i)).toBeNull()
  })

  it('supports toggling multi-material strategy between Synthesize and Batch generation', async () => {
    await React.act(async () => {
      render(
        <CardImportModal
          isOpen={true}
          subjectId={10}
          subjectName="Neuroscience 101"
          subjects={[mockSubject]}
          folders={mockFolders}
          userId={1}
          initialMaterialIds={[101, 102]}
          initialAutoCount={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
        />
      )
    })

    // Both materials preloaded from initialMaterialIds
    await waitFor(() => {
      expect(screen.getByText(/using: 2 materials selected/i)).toBeInTheDocument()
    })

    // Strategy switcher should be visible
    expect(screen.getByText(/multi-material generation strategy:/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /synthesize \(unified\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate for each/i })).toBeInTheDocument()

    // Default is Synthesize Selected
    const synthesizeBtn = screen.getByRole('button', { name: /synthesize selected \(2\)/i })
    expect(synthesizeBtn).toBeInTheDocument()

    // Switch to Batch mode
    const batchToggle = screen.getByRole('button', { name: /generate for each/i })
    await React.act(async () => {
      fireEvent.click(batchToggle)
    })

    // Button should now be Generate Flashcards (2)
    const batchBtn = screen.getByRole('button', { name: /generate flashcards \(2\)/i })
    expect(batchBtn).toBeInTheDocument()

    // Click Generate in Batch mode
    await React.act(async () => {
      fireEvent.click(batchBtn)
    })

    expect(window.electronAPI.cardsBatchGenerate).toHaveBeenCalledWith(10, [101, 102])
    expect(mockOnSuccess).toHaveBeenCalledWith(20, 'generate')
  })
})


