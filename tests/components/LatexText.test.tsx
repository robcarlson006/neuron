import React from 'react'
import { render } from '@testing-library/react'
import LatexText, { splitLatex } from '../../src/components/LatexText'

describe('LatexText', () => {
  describe('splitLatex', () => {
    it('splits text with display math $$...$$', () => {
      const parts = splitLatex('Formula: $$\\frac{a}{b}$$ done')
      expect(parts).toHaveLength(3)
      expect(parts[0]).toEqual({ type: 'text', content: 'Formula: ', display: false })
      expect(parts[1]).toEqual({ type: 'math', content: '\\frac{a}{b}', display: true })
      expect(parts[2]).toEqual({ type: 'text', content: ' done', display: false })
    })

    it('splits text with inline math $p_1$', () => {
      const parts = splitLatex('Let $p_1 = 5$ be the price')
      expect(parts).toHaveLength(3)
      expect(parts[0]).toEqual({ type: 'text', content: 'Let ', display: false })
      expect(parts[1]).toEqual({ type: 'math', content: 'p_1 = 5', display: false })
      expect(parts[2]).toEqual({ type: 'text', content: ' be the price', display: false })
    })

    it('does not treat currency $4 to $8 as a single math block', () => {
      const parts = splitLatex('rose from $4 to $8, slope...')
      // All should be preserved as plain text without mangling
      const fullText = parts.map(p => p.content).join('')
      expect(fullText).toBe('rose from $4 to $8, slope...')
    })

    it('handles mixed currency and math variables', () => {
      const parts = splitLatex('income doubles to $60 while $p_2$ doubles to $12 and $p_1$ stays at $5')
      const mathParts = parts.filter(p => p.type === 'math')
      expect(mathParts).toHaveLength(2)
      expect(mathParts[0].content).toBe('p_2')
      expect(mathParts[1].content).toBe('p_1')
    })
  })

  describe('Component Rendering', () => {
    it('renders plain text unchanged', () => {
      const { container } = render(<LatexText>Just plain text</LatexText>)
      expect(container.textContent).toBe('Just plain text')
    })

    it('renders inline math via KaTeX', () => {
      const { container } = render(<LatexText>Area is $x^2$ meters</LatexText>)
      expect(container.querySelector('.katex')).not.toBeNull()
    })

    it('renders display math via KaTeX', () => {
      const { container } = render(<LatexText>{'$$\\frac{1}{2}$$'}</LatexText>)
      expect(container.querySelector('.katex')).not.toBeNull()
    })

    it('renders currency and raw LaTeX without stray dollar signs or errors', () => {
      const { container } = render(
        <LatexText>
          {'Same horizontal intercept (6), vertical intercept rose from $4 to $8, slope went from -\\frac{2}{3} to -\\frac{4}{3}'}
        </LatexText>
      )
      expect(container.textContent).toContain('from $4 to $8')
      expect(container.querySelectorAll('.katex').length).toBe(2)
    })

    it('renders income and price changes with KaTeX math and currency', () => {
      const { container } = render(
        <LatexText>
          {'income doubles to $60 while $p_2$ doubles to $12 and $p_1$ stays at $5'}
        </LatexText>
      )
      expect(container.textContent).toContain('doubles to $60')
      expect(container.textContent).toContain('doubles to $12')
      expect(container.textContent).toContain('stays at $5')
      expect(container.querySelectorAll('.katex').length).toBe(2)
    })

    it('renders coordinates, tuples, and equations via KaTeX', () => {
      const { container } = render(
        <LatexText>
          {'Check point $(1, 2)$ and $(0, 3)$ against constraint $1 \\cdot x_1 + 10 \\cdot x_2 = 30$ and slope $-0.1$.'}
        </LatexText>
      )
      const katexElements = container.querySelectorAll('.katex')
      expect(katexElements.length).toBe(4)
    })

    it('renders prime variables and indifference curves with KaTeX', () => {
      const { container } = render(
        <LatexText>
          {"Take a reference bundle $x'$. The set of all bundles equally preferred to $x'$ is the indifference curve containing $x'$; the set of all bundles $y \\sim x'$."}
        </LatexText>
      )
      const katexElements = container.querySelectorAll('.katex')
      // Should have 4 KaTeX elements: 3 for $x'$ and 1 for $y \sim x'$
      expect(katexElements.length).toBe(4)
      expect(container.textContent).not.toContain("$x'")
    })
  })
})
