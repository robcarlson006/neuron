import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import NoteAIHelper from '../../src/components/notes/NoteAIHelper'

describe('NoteAIHelper', () => {
  const api = window.electronAPI as unknown as Record<string, jest.Mock>

  beforeEach(() => {
    jest.clearAllMocks()
    api.noteHelperChat.mockResolvedValue({
      success: true,
      text: 'An Engel curve shows how quantity demanded responds to changes in household income.'
    })
  })

  it('renders collapsed toggle button and expands on click', () => {
    render(<NoteAIHelper subjectName="Microeconomics" />)
    const toggleBtn = screen.getByRole('button', { name: /Ask AI Helper/i })
    expect(toggleBtn).toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(screen.getByText('Note AI Helper')).toBeInTheDocument()
    expect(screen.getAllByText('Microeconomics').length).toBeGreaterThan(0)
  })

  it('sends question with context and renders the response', async () => {
    render(<NoteAIHelper subjectName="Microeconomics" currentNotes="Demand curve slope" />)
    fireEvent.click(screen.getByRole('button', { name: /Ask AI Helper/i }))

    const input = screen.getByPlaceholderText(/Ask about this concept/i)
    fireEvent.change(input, { target: { value: 'What is an Engel curve?' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    await waitFor(() => expect(api.noteHelperChat).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'What is an Engel curve?' })
      ]),
      context: expect.objectContaining({
        subjectName: 'Microeconomics',
        currentNotes: 'Demand curve slope'
      })
    })))

    expect(await screen.findByText(/An Engel curve shows how quantity demanded/i)).toBeInTheDocument()
  })

  it('triggers onInsertText callback when Insert into notes is clicked', async () => {
    const handleInsert = jest.fn()
    render(<NoteAIHelper subjectName="Microeconomics" onInsertText={handleInsert} />)
    fireEvent.click(screen.getByRole('button', { name: /Ask AI Helper/i }))

    const input = screen.getByPlaceholderText(/Ask about this concept/i)
    fireEvent.change(input, { target: { value: 'Explain Engel curve' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    const insertBtn = await screen.findByRole('button', { name: /\+ Insert into notes/i })
    fireEvent.click(insertBtn)

    expect(handleInsert).toHaveBeenCalledWith('An Engel curve shows how quantity demanded responds to changes in household income.')
    expect(await screen.findByRole('button', { name: /✓ Inserted/i })).toBeInTheDocument()
  })
})
