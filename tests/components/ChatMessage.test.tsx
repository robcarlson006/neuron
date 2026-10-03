import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import ChatMessage from '../../src/components/tutor/ChatMessage'

describe('ChatMessage Component', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders user message plainly', () => {
    render(<ChatMessage role="user" content="Hello tutor, what is the slope?" />)
    expect(screen.getByText('Hello tutor, what is the slope?')).toBeInTheDocument()
  })

  it('shows a Card action for selected assistant text and passes only the selection', () => {
    const onExtractCard = jest.fn()
    const { container } = render(
      <ChatMessage
        role="assistant"
        content="Scarcity means resources are limited relative to human wants."
        onExtractCard={onExtractCard}
      />
    )
    const message = container.querySelector('.relative') as HTMLElement
    const selection = {
      anchorNode: message,
      focusNode: message,
      toString: () => 'resources are limited',
      rangeCount: 1,
      getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 100, right: 220, top: 80, bottom: 100, width: 120 }) } as Range)
    } as unknown as Selection
    jest.spyOn(window, 'getSelection').mockReturnValue(selection)

    fireEvent.mouseUp(message)

    const cardButton = screen.getByRole('button', { name: 'Card' })
    fireEvent.click(cardButton)

    expect(onExtractCard).toHaveBeenCalledWith('resources are limited')
    expect(screen.queryByRole('button', { name: 'Card' })).not.toBeInTheDocument()
  })

  it('does not show the selection Card action for empty selections or user messages', () => {
    const selection = {
      anchorNode: document.createElement('span'),
      toString: () => '',
      rangeCount: 0
    } as unknown as Selection
    jest.spyOn(window, 'getSelection').mockReturnValue(selection)

    const { container } = render(
      <>
        <ChatMessage role="assistant" content="An assistant explanation with enough text." onExtractCard={jest.fn()} />
        <ChatMessage role="user" content="A learner message with enough text." onExtractCard={jest.fn()} />
      </>
    )

    const assistantMessage = container.querySelector('.relative') as HTMLElement
    fireEvent.mouseUp(assistantMessage)

    expect(screen.queryByRole('button', { name: 'Card' })).not.toBeInTheDocument()
  })

  it('dismisses the selection Card action when clicking outside the message', () => {
    const onExtractCard = jest.fn()
    const { container } = render(
      <ChatMessage role="assistant" content="A tutor explanation with selected text." onExtractCard={onExtractCard} />
    )
    const message = container.querySelector('.relative') as HTMLElement
    const selection = {
      anchorNode: message,
      focusNode: message,
      toString: () => 'selected text',
      rangeCount: 1,
      getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 100, right: 180, top: 80, bottom: 100, width: 80 }) } as Range)
    } as unknown as Selection
    jest.spyOn(window, 'getSelection').mockReturnValue(selection)

    fireEvent.mouseUp(message)
    expect(screen.getByRole('button', { name: 'Card' })).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('button', { name: 'Card' })).not.toBeInTheDocument()
  })

  it('renders user message containing typed math equations with KaTeX', () => {
    const { container } = render(<ChatMessage role="user" content="Is the equation $x^2 + y^2 = 25$ or \\frac{1}{2}?" />)
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBe(2)
  })

  it('renders assistant message with mixed math and currency without raw stray dollar signs', () => {
    const content = `Great question! Here is the breakdown:

- The vertical intercept rose from $4 to $8.
- Income doubles to $60 while $p_2$ doubles to $12 and $p_1$ stays at $5.
- The slope changed from -\\frac{2}{3} to -\\frac{4}{3}.`

    const { container } = render(<ChatMessage role="assistant" content={content} />)

    // Currency should be present in readable text
    expect(container.textContent).toContain('from $4 to $8')
    expect(container.textContent).toContain('doubles to $60')
    expect(container.textContent).toContain('doubles to $12')
    expect(container.textContent).toContain('stays at $5')

    // KaTeX should render p_2, p_1, and the two fractions
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBeGreaterThanOrEqual(4)
  })

  it('renders bold text and display math correctly', () => {
    const content = `**Key Formula**:
$$p_1 x_1 + p_2 x_2 = m$$`

    const { container } = render(<ChatMessage role="assistant" content={content} />)
    expect(screen.getByText('Key Formula')).toBeInTheDocument()
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('renders standard Markdown tables with proper thead, tbody, and cell formatting', () => {
    const content = `Here is the payoff matrix:

| | Firm 2 Advertises | Firm 2 Doesn't |
|---|---|---|
| **Firm 1 Advertises** | (2, 2) | (5, 1) |
| **Firm 1 Doesn't** | (1, 5) | (4, 4) |`

    const { container } = render(<ChatMessage role="assistant" content={content} />)

    const table = container.querySelector('table')
    expect(table).not.toBeNull()

    const ths = container.querySelectorAll('th')
    expect(ths.length).toBe(3)
    expect(ths[1].textContent).toContain('Firm 2 Advertises')
    expect(ths[2].textContent).toContain("Firm 2 Doesn't")

    const trs = container.querySelectorAll('tbody tr')
    expect(trs.length).toBe(2)

    const tds = container.querySelectorAll('td')
    expect(tds.length).toBe(6)
    expect(tds[0].textContent).toContain('Firm 1 Advertises')
    expect(tds[1].textContent).toContain('(2, 2)')
    expect(tds[2].textContent).toContain('(5, 1)')
  })

  it('renders single-line flattened Markdown tables correctly', () => {
    const content = `| | Firm 2 Advertises | Firm 2 Doesn't | |---|---|---| | **Firm 1 Advertises** | (2, 2) | (5, 1) | | **Firm 1 Doesn't** | (1, 5) | (4, 4) |`

    const { container } = render(<ChatMessage role="assistant" content={content} />)

    const table = container.querySelector('table')
    expect(table).not.toBeNull()

    const trs = container.querySelectorAll('tbody tr')
    expect(trs.length).toBe(2)
  })

  it('renders bold question containing LaTeX coordinates and constraint equations (Image 2)', () => {
    const content = `Answer those three, and then tell me: **does the bundle $(1, 2)$ even lie on this budget line? Check it against the constraint $1 \\cdot x_1 + 10 \\cdot x_2 = 30$.**`

    const { container } = render(<ChatMessage role="assistant" content={content} />)

    // Should render KaTeX for (1, 2) and the equation
    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBe(2)
    expect(container.textContent).toContain('does the bundle')
  })

  it('renders bullet lists containing LaTeX coordinates and decimals (Image 3)', () => {
    const content = `- Is $(0, 3)$ a **point** on the budget line, or is it a **slope**?
- Is $(1, 2)$ a **point** on the budget line, or is it a **slope**?
- And is $-0.1$ a **point** or a **slope**?`

    const { container } = render(<ChatMessage role="assistant" content={content} />)

    const katexElements = container.querySelectorAll('.katex')
    expect(katexElements.length).toBe(3)
    expect(screen.getAllByText('point').length).toBe(3)
    expect(screen.getAllByText('slope').length).toBe(3)
  })
})
