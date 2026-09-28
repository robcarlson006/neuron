import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatInput from '../../src/components/tutor/ChatInput'

describe('ChatInput Component', () => {
  it('renders input area and sends messages on Enter', async () => {
    const handleSend = jest.fn()
    render(<ChatInput onSend={handleSend} placeholder="Type a message..." />)

    const textarea = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(textarea, { target: { value: 'Hello Tutor' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    expect(handleSend).toHaveBeenCalledWith('Hello Tutor')
    await waitFor(() => expect(textarea).toHaveValue(''))
  })

  it('does not send Enter while an IME composition is active', () => {
    const handleSend = jest.fn()
    render(<ChatInput onSend={handleSend} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '構成中' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', isComposing: true })
    expect(handleSend).not.toHaveBeenCalled()
  })

  it('keeps the draft when saving the message fails', async () => {
    const handleSend = jest.fn().mockRejectedValue(new Error('save failed'))
    render(<ChatInput onSend={handleSend} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Please keep this draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('draft has been kept'))
    expect(textarea).toHaveValue('Please keep this draft')
  })

  it('shows a stop action while a response is streaming', () => {
    const onStop = jest.fn()
    render(<ChatInput onSend={jest.fn()} onStop={onStop} disabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('renders live math preview with KaTeX when user types raw exponent like x^2', () => {
    const handleSend = jest.fn()
    const { container } = render(<ChatInput onSend={handleSend} placeholder="Type math..." />)

    const textarea = screen.getByPlaceholderText('Type math...')
    fireEvent.change(textarea, { target: { value: 'What is x^2 + y^2 = 25?' } })

    // Live math preview heading should be visible
    expect(screen.getByText(/Live Math Preview:/i)).toBeInTheDocument()

    // KaTeX elements should be rendered inside the preview box
    const katexElement = container.querySelector('.katex')
    expect(katexElement).not.toBeNull()
  })

  it('renders live math preview when user types square root or slash fraction', () => {
    const handleSend = jest.fn()
    const { container } = render(<ChatInput onSend={handleSend} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Solve sqrt(2x + 1)' } })

    expect(screen.getByText(/Live Math Preview:/i)).toBeInTheDocument()
    expect(container.querySelector('.katex')).not.toBeNull()
  })
})
