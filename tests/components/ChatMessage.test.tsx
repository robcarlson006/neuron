import React from 'react'
import { render, screen } from '@testing-library/react'
import ChatMessage from '../../src/components/tutor/ChatMessage'

describe('ChatMessage Component', () => {
  it('renders user message plainly', () => {
    render(<ChatMessage role="user" content="Hello tutor, what is the slope?" />)
    expect(screen.getByText('Hello tutor, what is the slope?')).toBeInTheDocument()
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
})
