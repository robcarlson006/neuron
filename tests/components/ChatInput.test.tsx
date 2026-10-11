import React, { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatInput from '../../src/components/tutor/ChatInput'

describe('ChatInput Component', () => {
  it('renders input area and sends messages on Enter', () => {
    const handleSend = jest.fn()
    render(<ChatInput onSend={handleSend} placeholder="Type a message..." />)

    const textarea = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(textarea, { target: { value: 'Hello Tutor' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    expect(handleSend).toHaveBeenCalledWith('Hello Tutor')
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

  it('clears a controlled draft immediately while send is pending', async () => {
    let resolveSend: (() => void) | undefined
    const handleSend = jest.fn(() => new Promise<void>(resolve => { resolveSend = resolve }))
    function Harness(): React.JSX.Element {
      const [draft, setDraft] = useState('Answer')
      return <ChatInput onSend={handleSend} value={draft} onChange={setDraft} />
    }
    render(<Harness />)

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    await waitFor(() => expect(handleSend).toHaveBeenCalledWith('Answer'))
    expect(textarea.value).toBe('')
    resolveSend?.()
  })

  it('ignores a rapid duplicate submit while the first send is pending', async () => {
    let resolveSend: (() => void) | undefined
    const handleSend = jest.fn(() => new Promise<void>(resolve => { resolveSend = resolve }))
    function Harness(): React.JSX.Element {
      const [draft, setDraft] = useState('Answer')
      return <ChatInput onSend={handleSend} value={draft} onChange={setDraft} />
    }
    render(<Harness />)

    const textarea = screen.getByRole('textbox')
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    await waitFor(() => expect(handleSend).toHaveBeenCalledTimes(1))
    resolveSend?.()
  })

  it.each([
    ['beginning', 'abc', 0, 0, '\\alpha abc', 7],
    ['middle', 'abcd', 2, 2, 'ab\\alpha cd', 9],
    ['end', 'abc', 3, 3, 'abc\\alpha ', 10]
  ])('inserts a snippet at the %s cursor position and preserves focus', (_position, draft, start, end, expected, caret) => {
    render(<ChatInput onSend={jest.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: draft } })
    textarea.focus()
    textarea.setSelectionRange(start, end)

    const toggle = screen.getByTitle('Toggle Math Keyboard Palette')
    fireEvent.mouseDown(toggle)
    fireEvent.click(toggle)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Greek' }))
    fireEvent.click(screen.getByRole('button', { name: 'Greek' }))
    const alpha = screen.getByTitle('Alpha')
    fireEvent.mouseDown(alpha)
    fireEvent.click(alpha)

    expect(textarea).toHaveValue(expected)
    expect(textarea).toHaveFocus()
    expect(textarea.selectionStart).toBe(caret)
    expect(textarea.selectionEnd).toBe(caret)
  })

  it('replaces the selected text and puts the caret in a LaTeX template field', () => {
    render(<ChatInput onSend={jest.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'before replace after' } })
    textarea.focus()
    textarea.setSelectionRange(7, 14)
    fireEvent.click(screen.getByTitle('Toggle Math Keyboard Palette'))
    fireEvent.mouseDown(screen.getByTitle('Fraction'))
    fireEvent.click(screen.getByTitle('Fraction'))

    expect(textarea).toHaveValue('before \\frac{a}{b} after')
    expect(textarea).toHaveFocus()
    expect(textarea.selectionStart).toBe(13)
    expect(textarea.selectionEnd).toBe(13)
  })

  it('updates controlled drafts through onChange and restores their selection after render', () => {
    function Harness(): React.JSX.Element {
      const [draft, setDraft] = useState('hello world')
      return <ChatInput onSend={jest.fn()} value={draft} onChange={setDraft} />
    }
    render(<Harness />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(5, 6)
    fireEvent.click(screen.getByTitle('Toggle Math Keyboard Palette'))
    fireEvent.click(screen.getByRole('button', { name: 'Greek' }))
    fireEvent.click(screen.getByTitle('Alpha'))

    expect(textarea).toHaveValue('hello\\alpha world')
    expect(textarea).toHaveFocus()
    expect(textarea.selectionStart).toBe(12)
  })

  it('keeps an uncontrolled draft when the palette is toggled closed and reopened', () => {
    render(<ChatInput onSend={jest.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'draft answer' } })

    const toggle = screen.getByTitle('Toggle Math Keyboard Palette')
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    fireEvent.click(toggle)

    expect(textarea).toHaveValue('draft answer')
    expect(screen.getByText('Math Palette')).toBeInTheDocument()
  })
})
