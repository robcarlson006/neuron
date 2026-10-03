import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SubjectNotesPage from '../../src/pages/SubjectNotesPage'

describe('SubjectNotesPage', () => {
  const api = window.electronAPI as unknown as Record<string, jest.Mock>
  const materials = [{ id: 7, subject_id: 1, filename: 'lecture-01.pdf', file_type: 'pdf', content_text: '', uploaded_at: '' }]

  beforeEach(() => {
    jest.clearAllMocks()
    api.getSubjectNote.mockResolvedValue(null)
    api.saveSubjectNote.mockResolvedValue({ id: 1, subject_id: 1, body: '', links_json: '[]', created_at: '', updated_at: new Date().toISOString() })
  })

  it('loads, links materials with slash autocomplete, and autosaves', async () => {
    render(<MemoryRouter><SubjectNotesPage subjectId={1} materials={materials} /></MemoryRouter>)
    const editor = await screen.findByPlaceholderText(/Start writing your lecture notes/i)
    fireEvent.change(editor, { target: { value: 'Review /lec' } })
    expect(await screen.findByText('lecture-01.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByText('lecture-01.pdf'))
    expect(editor).toHaveValue('Review [[material:7|lecture-01.pdf]]')
    await waitFor(() => expect(api.saveSubjectNote).toHaveBeenCalledWith(expect.objectContaining({ subject_id: 1, body: 'Review [[material:7|lecture-01.pdf]]', links: [{ material_id: 7, label: 'lecture-01.pdf' }] })))
  })
})
