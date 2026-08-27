import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import CardBrowser from '../../src/components/CardBrowser'
import type { Card, CardFolder, Material } from '../../src/types'

const mockFolders: CardFolder[] = [
  { id: 1, subject_id: 10, name: 'Chapter 1', created_at: '2026-08-01' },
  { id: 2, subject_id: 10, name: 'Chapter 2', created_at: '2026-08-01' }
]

const mockMaterials: Material[] = [
  {
    id: 101,
    subject_id: 10,
    filename: 'Neuroscience_Ch1.pdf',
    file_type: 'pdf',
    content_text: 'Action potentials and synapses',
    uploaded_at: '2026-08-01'
  },
  {
    id: 102,
    subject_id: 10,
    filename: 'BioChemistry_Guide.docx',
    file_type: 'docx',
    content_text: 'ATP synthesis and glycolysis',
    uploaded_at: '2026-08-02'
  }
]

const mockCards: Card[] = [
  {
    id: 1,
    subject_id: 10,
    material_id: 101,
    type: 'flashcard',
    front: 'What triggers vesicle exocytosis at the axon terminal?',
    back: 'Calcium ion (Ca2+) influx through voltage-gated channels.',
    folder_id: 1,
    is_manual: 0,
    created_at: '2026-08-10T12:00:00Z'
  },
  {
    id: 2,
    subject_id: 10,
    material_id: 102,
    type: 'active_recall',
    front: 'Explain the mechanism of ATP synthase in oxidative phosphorylation.',
    back: 'Proton-motive force drives the rotary catalytic synthesis of ATP from ADP and Pi.',
    folder_id: 2,
    is_manual: 0,
    created_at: '2026-08-11T12:00:00Z'
  },
  {
    id: 3,
    subject_id: 10,
    material_id: 101,
    type: 'flashcard',
    front: 'What is the net ATP yield per glucose in glycolysis?',
    back: '2 net ATP and 2 NADH.',
    folder_id: null,
    is_manual: 0,
    created_at: '2026-08-12T12:00:00Z'
  }
]

describe('CardBrowser - Material-Based Organization & Search', () => {
  it('renders cards organized by Material with badges', () => {
    render(
      <CardBrowser
        cards={mockCards}
        folders={mockFolders}
        materials={mockMaterials}
      />
    )

    expect(screen.getByText(/What triggers vesicle exocytosis/i)).toBeInTheDocument()
    expect(screen.getByText(/Explain the mechanism of ATP synthase/i)).toBeInTheDocument()
    expect(screen.getByText(/What is the net ATP yield/i)).toBeInTheDocument()

    // Badges
    expect(screen.getAllByText(/Neuroscience_Ch1.pdf/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/BioChemistry_Guide.docx/i).length).toBeGreaterThan(0)
  })

  it('defaults to "By Material" view mode and displays grouped sections', () => {
    render(
      <CardBrowser
        cards={mockCards}
        folders={mockFolders}
        materials={mockMaterials}
      />
    )

    // Material group headers and badges
    expect(screen.getAllByText(/Neuroscience_Ch1.pdf/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/BioChemistry_Guide.docx/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/2 cards/i)).toBeInTheDocument() // Material 101 has 2 cards
  })

  it('switches between "By Material" and "All Cards" flat list mode', () => {
    render(
      <CardBrowser
        cards={mockCards}
        folders={mockFolders}
        materials={mockMaterials}
      />
    )

    const listModeBtn = screen.getByRole('button', { name: /all cards/i })
    fireEvent.click(listModeBtn)

    expect(screen.getByText(/What triggers vesicle exocytosis/i)).toBeInTheDocument()
    expect(screen.getByText(/Explain the mechanism of ATP synthase/i)).toBeInTheDocument()
  })

  it('filters cards by material dropdown selector', () => {
    render(
      <CardBrowser
        cards={mockCards}
        folders={mockFolders}
        materials={mockMaterials}
      />
    )

    const materialSelect = screen.getByLabelText(/filter by material/i)
    fireEvent.change(materialSelect, { target: { value: '102' } })

    // Only card 2 (from BioChemistry_Guide) should be present
    expect(screen.queryByText(/What triggers vesicle exocytosis/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Explain the mechanism of ATP synthase/i)).toBeInTheDocument()
    expect(screen.queryByText(/What is the net ATP yield/i)).not.toBeInTheDocument()
  })

  it('performs multi-field search across material name and card content', () => {
    render(
      <CardBrowser
        cards={mockCards}
        folders={mockFolders}
        materials={mockMaterials}
      />
    )

    const searchInput = screen.getByPlaceholderText(/search questions/i)
    fireEvent.change(searchInput, { target: { value: 'BioChemistry' } })

    // Only cards from BioChemistry_Guide.docx match
    expect(screen.queryByText(/What triggers vesicle exocytosis/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Explain the mechanism of ATP synthase/i)).toBeInTheDocument()

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } })
    expect(screen.getByText(/What triggers vesicle exocytosis/i)).toBeInTheDocument()
  })

  it('handles collapsible accordions in material view', () => {
    render(
      <CardBrowser
        cards={mockCards}
        folders={mockFolders}
        materials={mockMaterials}
      />
    )

    const collapseBtn = screen.getByRole('button', { name: /collapse all/i })
    fireEvent.click(collapseBtn)

    // After collapsing, cards should be hidden
    expect(screen.queryByText(/What triggers vesicle exocytosis/i)).not.toBeInTheDocument()

    const expandBtn = screen.getByRole('button', { name: /expand all/i })
    fireEvent.click(expandBtn)

    // After expanding, cards should be visible again
    expect(screen.getByText(/What triggers vesicle exocytosis/i)).toBeInTheDocument()
  })

  it('allows bulk selecting and deleting cards', () => {
    const onDeleteCards = jest.fn()
    window.confirm = jest.fn(() => true)

    render(
      <CardBrowser
        cards={mockCards}
        folders={mockFolders}
        materials={mockMaterials}
        onDeleteCards={onDeleteCards}
      />
    )

    const selectAllCheckbox = screen.getByLabelText(/select all cards/i)
    fireEvent.click(selectAllCheckbox)

    const deleteBtn = screen.getByRole('button', { name: /delete selected/i })
    expect(deleteBtn).toBeInTheDocument()
    fireEvent.click(deleteBtn)

    expect(onDeleteCards).toHaveBeenCalledWith(expect.arrayContaining([1, 2, 3]))
  })
})
