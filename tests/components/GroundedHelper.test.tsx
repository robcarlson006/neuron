import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GroundedHelper from '../../src/pages/GroundedHelper'
import { useAppStore } from '../../src/store/appStore'

describe('GroundedHelper', () => {
  const api = window.electronAPI as unknown as Record<string, jest.Mock>

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    useAppStore.setState({
      subjects: [{
        id: 1,
        user_id: 1,
        name: 'Finance 1',
        status: 'active',
        created_at: new Date().toISOString()
      }]
    })
  })

  it('renders grounded answers with Markdown and KaTeX math', async () => {
    api.groundedAsk = jest.fn().mockResolvedValue({
      success: true,
      confidence: 'high',
      answer: `## Present value

$$\\text{PV} = \\frac{C}{(1+r)^T}$$

The inline form is $x_1^2$.

- Discount rate: $r$`,
      evidence: []
    })

    const { container } = render(<GroundedHelper />)
    fireEvent.change(screen.getByPlaceholderText(/ask for a formula/i), { target: { value: 'What is present value?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    await waitFor(() => expect(container.querySelectorAll('.katex')).toHaveLength(3))
    expect(screen.getByText('Present value')).toBeInTheDocument()
    expect(container.textContent).not.toContain('$$')
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument()
    expect(container.textContent).toContain('Discount rate:')
  })

  it('preserves the not-found state without rendering an empty answer', async () => {
    api.groundedAsk = jest.fn().mockResolvedValue({
      success: true,
      confidence: 'not_found',
      answer: 'I could not find enough support in the selected materials.',
      evidence: []
    })

    render(<GroundedHelper />)
    fireEvent.change(screen.getByPlaceholderText(/ask for a formula/i), { target: { value: 'Unknown topic' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('Not found in materials')).toBeInTheDocument()
    expect(screen.getByText('I could not find enough support in the selected materials.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Explain differently' })).not.toBeInTheDocument()
  })

  it('keeps the empty-answer fallback unchanged', async () => {
    api.groundedAsk = jest.fn().mockResolvedValue({
      success: false,
      confidence: 'low',
      answer: '',
      evidence: [],
      error: 'AI API key not configured.'
    })

    render(<GroundedHelper />)
    fireEvent.change(screen.getByPlaceholderText(/ask for a formula/i), { target: { value: 'Explain this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText('No grounded answer was returned.')).toBeInTheDocument()
    expect(screen.getByText('AI API key not configured.')).toBeInTheDocument()
  })
})
