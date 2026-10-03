import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LectureNotetakerPage from '../../src/pages/LectureNotetakerPage'

describe('LectureNotetakerPage', () => {
  const api = window.electronAPI as unknown as Record<string, jest.Mock>

  beforeEach(() => {
    jest.clearAllMocks()
    api.getSubjects.mockResolvedValue([{ id: 1, name: 'Biology' }])
    api.getLecture.mockResolvedValue({
      id: 9,
      subject_id: 1,
      title: 'Cell membranes',
      audio_path: '',
      raw_transcript: '[00:01] Membranes regulate transport.',
      material_id: 7
    })
    api.getMaterial.mockResolvedValue({ id: 7, filename: 'Lecture - Cell Membrane.md', file_type: 'md' })
    api.listDocumentAnnotations.mockResolvedValue([
      { id: 11, kind: 'question', body: 'Why does diffusion stop?', deleted_at: null },
      { id: 12, kind: 'cue', body: '- Selective permeability', deleted_at: null },
      { id: 13, kind: 'summary', body: 'The membrane controls movement of substances.', deleted_at: null }
    ])
  })

  function renderPage(): void {
    render(
      <MemoryRouter initialEntries={['/subject/1/lecture/9/notes']}>
        <Routes>
          <Route path="/subject/:subjectId/lecture/:lectureId/notes" element={<LectureNotetakerPage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('reloads independent questions, lecture notes, and summary sections', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('Why does diffusion stop?')).toBeInTheDocument()
    expect(screen.getByDisplayValue('- Selective permeability')).toBeInTheDocument()
    expect(screen.getByDisplayValue('The membrane controls movement of substances.')).toBeInTheDocument()
    expect(screen.getByText('Show generated transcript / structured notes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open related material' })).toBeInTheDocument()
  })

  it('saves edited lecture notes as a cue without merging them into the transcript', async () => {
    renderPage()
    const notes = await screen.findByDisplayValue('- Selective permeability') as HTMLTextAreaElement
    fireEvent.change(notes, { target: { value: '- Selective permeability\n- Transport proteins' } })
    fireEvent.blur(notes)

    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      lecture_id: 9,
      kind: 'cue',
      body: '- Selective permeability\n- Transport proteins',
      source_snapshot: '[00:01] Membranes regulate transport.'
    })))
    expect(api.saveDocumentAnnotation).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'summary' }))
  })

  it('clears a saved section when the learner deletes its text', async () => {
    renderPage()
    const summary = await screen.findByDisplayValue('The membrane controls movement of substances.')
    fireEvent.change(summary, { target: { value: '' } })
    fireEvent.blur(summary)

    await waitFor(() => expect(api.deleteDocumentAnnotation).toHaveBeenCalledWith(13))
  })

  it('offers formatting controls that insert Markdown bullets and math into lecture notes', async () => {
    renderPage()
    const notes = await screen.findByDisplayValue('- Selective permeability') as HTMLTextAreaElement
    fireEvent.change(notes, { target: { value: 'x^2 + y^2 = r^2' } })
    notes.focus()
    notes.setSelectionRange(0, notes.value.length)
    fireEvent.click(screen.getByRole('button', { name: 'Insert equation' }))

    await waitFor(() => expect(notes).toHaveValue('$x^2 + y^2 = r^2$'))
    notes.setSelectionRange(0, notes.value.length)
    fireEvent.click(screen.getByRole('button', { name: 'Insert bullet list' }))
    await waitFor(() => expect(notes).toHaveValue('- $x^2 + y^2 = r^2$'))
  })
})
