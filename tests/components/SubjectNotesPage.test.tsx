import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SubjectNotesPage from '../../src/pages/SubjectNotesPage'

describe('SubjectNotesPage', () => {
  const api = window.electronAPI as unknown as Record<string, jest.Mock>
  const materials = [{ id: 7, subject_id: 1, filename: 'lecture-01.pdf', file_type: 'pdf', content_text: '', uploaded_at: '' }]

  beforeEach(() => {
    jest.clearAllMocks()
    api.getNotebookPages.mockResolvedValue([
      { id: 1, subject_id: 1, page_number: 1, title: 'Page 1', body: '', links_json: '[]', created_at: '', updated_at: new Date().toISOString() }
    ])
    api.saveNotebookPage.mockImplementation((input) => Promise.resolve({
      id: input.id || 1,
      subject_id: input.subject_id,
      page_number: input.page_number,
      title: input.title || 'Page 1',
      body: input.body,
      links_json: JSON.stringify(input.links || []),
      created_at: '',
      updated_at: new Date().toISOString()
    }))
    api.createNotebookPage.mockResolvedValue({
      id: 2,
      subject_id: 1,
      page_number: 2,
      title: 'Page 2',
      body: '',
      links_json: '[]',
      created_at: '',
      updated_at: new Date().toISOString()
    })
    api.organizeNotes.mockResolvedValue({
      success: true,
      text: '## Lecture Summary\n- Organized point 1\n- Organized point 2'
    })
  })

  it('loads, links materials with slash autocomplete, and autosaves', async () => {
    render(<MemoryRouter><SubjectNotesPage subjectId={1} materials={materials} /></MemoryRouter>)
    const editor = await screen.findByPlaceholderText(/Start writing your lecture notes/i)
    fireEvent.change(editor, { target: { value: 'Review /lec' } })
    expect(await screen.findByText('lecture-01.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByText('lecture-01.pdf'))
    expect(editor).toHaveValue('Review [[material:7|lecture-01.pdf]]')
    await waitFor(() => expect(api.saveNotebookPage).toHaveBeenCalledWith(expect.objectContaining({
      subject_id: 1,
      body: 'Review [[material:7|lecture-01.pdf]]',
      links: [{ material_id: 7, label: 'lecture-01.pdf' }]
    })))
  })

  it('allows adding and flipping pages', async () => {
    render(<MemoryRouter><SubjectNotesPage subjectId={1} materials={materials} /></MemoryRouter>)
    expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument()

    // Mock create returning 2 pages
    api.getNotebookPages.mockResolvedValueOnce([
      { id: 1, subject_id: 1, page_number: 1, title: 'Page 1', body: 'Page 1 content', links_json: '[]', created_at: '', updated_at: '' },
      { id: 2, subject_id: 1, page_number: 2, title: 'Page 2', body: 'Page 2 content', links_json: '[]', created_at: '', updated_at: '' }
    ])

    const addBtn = screen.getByText('Add Page')
    fireEvent.click(addBtn)

    await waitFor(() => expect(api.createNotebookPage).toHaveBeenCalledWith(1, 1))
  })

  it('formats notes using the AI Format button and supports Undo', async () => {
    render(<MemoryRouter><SubjectNotesPage subjectId={1} materials={materials} /></MemoryRouter>)
    const editor = await screen.findByPlaceholderText(/Start writing your lecture notes/i)
    fireEvent.change(editor, { target: { value: 'rough unformatted notes here' } })

    const formatBtn = screen.getByRole('button', { name: /Format/i })
    fireEvent.click(formatBtn)

    await waitFor(() => expect(api.organizeNotes).toHaveBeenCalledWith('rough unformatted notes here'))
    await waitFor(() => expect(editor).toHaveValue('## Lecture Summary\n- Organized point 1\n- Organized point 2'))

    // Undo button appears
    const undoBtn = await screen.findByRole('button', { name: /Undo/i })
    fireEvent.click(undoBtn)
    expect(editor).toHaveValue('rough unformatted notes here')
  })
})
