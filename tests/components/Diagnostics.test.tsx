import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Diagnostics from '../../src/pages/Diagnostics'
import { useAppStore } from '../../src/store/appStore'

jest.mock('react-router-dom', () => ({
  useParams: () => ({ subjectId: '1' }),
  useNavigate: () => jest.fn()
}))

jest.mock('../../src/components/PomodoroWidget', () => () => <div data-testid="pomodoro" />)

const mockCards = [
  {
    id: 101,
    subject_id: 1,
    front: 'What is the function of mitochondria?',
    back: 'Mitochondria produce ATP through cellular respiration.',
    type: 'flashcard',
    is_manual: 0,
    created_at: new Date().toISOString()
  }
]

describe('Diagnostics Page with Auto-Grader', () => {
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()

    useAppStore.setState({
      user: { id: 1, name: 'Test User', created_at: new Date().toISOString() },
      subjects: [{ id: 1, name: 'Biology', status: 'active', user_id: 1, created_at: new Date().toISOString() }]
    })

    window.electronAPI.getCards = jest.fn().mockResolvedValue(mockCards)
    window.electronAPI.getAllSchedules = jest.fn().mockResolvedValue([])
    window.electronAPI.processReview = jest.fn().mockResolvedValue({ success: true })
    window.electronAPI.saveDiagnostics = jest.fn().mockResolvedValue({ id: 1 })
    window.electronAPI.getConceptMastery = jest.fn().mockResolvedValue([])
  })

  it('renders question and answer textarea after starting diagnostic', async () => {
    render(<Diagnostics />)

    // Wait for cards to load and click Start Diagnostic Test
    const startBtn = await screen.findByRole('button', { name: /^Start Diagnostic$/i })
    fireEvent.click(startBtn)

    expect(await screen.findByText('What is the function of mitochondria?')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Think it through/i)).toBeInTheDocument()
  })

  it('triggers auto-grader and suggests rating when typed answer is revealed', async () => {
    render(<Diagnostics />)

    const startBtn = await screen.findByRole('button', { name: /^Start Diagnostic$/i })
    fireEvent.click(startBtn)

    const textarea = await screen.findByPlaceholderText(/Think it through/i)
    fireEvent.change(textarea, {
      target: { value: 'Mitochondria produce ATP for the cell via respiration' }
    })

    const revealBtn = screen.getByText(/Reveal Answer/i)
    fireEvent.click(revealBtn)

    expect(await screen.findByTestId('autograde-feedback')).toBeInTheDocument()
    expect(screen.getByText('Suggested')).toBeInTheDocument()
  })

  it('allows accepting suggested rating with Space key', async () => {
    render(<Diagnostics />)

    const startBtn = await screen.findByRole('button', { name: /^Start Diagnostic$/i })
    fireEvent.click(startBtn)

    const textarea = await screen.findByPlaceholderText(/Think it through/i)
    fireEvent.change(textarea, {
      target: { value: 'Mitochondria produce ATP through cellular respiration.' }
    })

    fireEvent.click(screen.getByText(/Reveal Answer/i))

    await screen.findByTestId('autograde-feedback')

    // Press Space to accept suggested rating
    fireEvent.keyDown(window, { key: ' ' })

    await waitFor(() => {
      expect(window.electronAPI.processReview).toHaveBeenCalled()
    })
  })

  it('allows overriding auto-grader rating with manual 1-5 keys', async () => {
    render(<Diagnostics />)

    const startBtn = await screen.findByRole('button', { name: /^Start Diagnostic$/i })
    fireEvent.click(startBtn)

    const textarea = await screen.findByPlaceholderText(/Think it through/i)
    fireEvent.change(textarea, {
      target: { value: 'Mitochondria produce ATP' }
    })

    fireEvent.click(screen.getByText(/Reveal Answer/i))

    await screen.findByTestId('autograde-feedback')

    // Press '1' to override with "Don't know it" (quality 0)
    fireEvent.keyDown(window, { key: '1' })

    await waitFor(() => {
      expect(window.electronAPI.processReview).toHaveBeenCalledWith(
        expect.objectContaining({ quality: 0 })
      )
    })
  })
})
