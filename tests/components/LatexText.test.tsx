import React from 'react'
import { render } from '@testing-library/react'
import LatexText from '../../src/components/LatexText'

describe('LatexText', () => {
  it('renders plain text unchanged', () => {
    const { container } = render(<LatexText>Just plain text</LatexText>)
    expect(container.textContent).toBe('Just plain text')
  })

  it('renders inline math via KaTeX', () => {
    const { container } = render(<LatexText>Area is $x^2$ meters</LatexText>)
    // KaTeX produces an element with the katex class.
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('renders display math via KaTeX', () => {
    const { container } = render(<LatexText>{'$$\\frac{1}{2}$$'}</LatexText>)
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('shows raw fallback for invalid LaTeX', () => {
    const { container } = render(<LatexText>{'$\\undefinedcommand{x}$'}</LatexText>)
    expect(container.querySelector('code')).not.toBeNull()
  })
})
