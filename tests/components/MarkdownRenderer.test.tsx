import React from 'react'
import { render, screen } from '@testing-library/react'
import MarkdownRenderer, { parseMarkdownTable } from '../../src/components/MarkdownRenderer'

describe('MarkdownRenderer Component', () => {
  describe('parseMarkdownTable', () => {
    it('parses standard markdown table with alignment', () => {
      const input = `| Item | Qty | Price |
| :--- | :---: | ---: |
| Apple | 10 | $1.50 |
| Banana | 25 | $0.80 |`

      const table = parseMarkdownTable(input)
      expect(table).not.toBeNull()
      expect(table?.headers).toEqual(['Item', 'Qty', 'Price'])
      expect(table?.alignments).toEqual(['left', 'center', 'right'])
      expect(table?.rows).toHaveLength(2)
      expect(table?.rows[0]).toEqual(['Apple', '10', '$1.50'])
      expect(table?.rows[1]).toEqual(['Banana', '25', '$0.80'])
    })

    it('returns null for plain text without tables', () => {
      expect(parseMarkdownTable('Just regular paragraph text')).toBeNull()
    })
  })

  describe('Component Rendering', () => {
    it('renders tables with proper alignment classes and LaTeX math inside cells', () => {
      const content = `| Variable | Description | Value |
| :--- | :---: | ---: |
| $x_1$ | Good 1 | $10$ |
| $x_2$ | Good 2 | $2$ |`

      const { container } = render(<MarkdownRenderer content={content} />)

      const table = container.querySelector('table')
      expect(table).not.toBeNull()

      const ths = container.querySelectorAll('th')
      expect(ths[0]).toHaveClass('text-left')
      expect(ths[1]).toHaveClass('text-center')
      expect(ths[2]).toHaveClass('text-right')

      // Should render KaTeX elements inside cells
      const katexElements = container.querySelectorAll('.katex')
      expect(katexElements.length).toBeGreaterThanOrEqual(4)
    })

    it('renders code blocks with language badge', () => {
      const content = `Here is Python code:

\`\`\`python
def calculate_utility(x1, x2):
    return x1 * x2
\`\`\``

      const { container } = render(<MarkdownRenderer content={content} />)
      expect(screen.getByText('python')).toBeInTheDocument()
      expect(container.textContent).toContain('def calculate_utility')
    })

    it('renders blockquotes / callouts with italic math and primes', () => {
      const content = `> *Take a reference bundle $x'$. The set of all bundles equally preferred to $x'$ is the indifference curve containing $x'$; the set of all bundles $y \\sim x'$.*`

      const { container } = render(<MarkdownRenderer content={content} />)
      const bq = container.querySelector('blockquote')
      expect(bq).not.toBeNull()
      const katexElements = container.querySelectorAll('.katex')
      expect(katexElements.length).toBe(4)
      expect(container.textContent).not.toContain("$x'")
    })

    it('renders interactive Vega-Lite graph blocks properly', () => {
      const spec = {
        title: 'IS-LM Equilibrium',
        mark: 'line',
        encoding: {
          x: { field: 'Y', type: 'quantitative' },
          y: { field: 'r', type: 'quantitative' }
        }
      }
      const content = `Below is the macroeconomic equilibrium:

\`\`\`vega-lite
${JSON.stringify(spec, null, 2)}
\`\`\`

End of explanation.`

      const { container } = render(<MarkdownRenderer content={content} />)
      expect(screen.getByText('IS-LM Equilibrium')).toBeInTheDocument()
      const iframe = container.querySelector('iframe')
      expect(iframe).toBeInTheDocument()
      expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
    })

    it('cleans up stray dangling asterisks and fixes split bold delimiters across table cells/phrases', () => {
      const content = `when own price falls, quantity demanded rises, so we move down and to the right* along the curve.`
      const { container } = render(<MarkdownRenderer content={content} />)

      // Should not contain stray trailing asterisk
      expect(container.textContent).not.toContain('right*')
      expect(container.textContent).toContain('down and to the right along the curve')
    })

    it('renders unclosed or split bold headers cleanly without raw asterisks', () => {
      const content = `| **Question 3: Income rises | coffee is a normal good.** |
| :--- | :--- |
| A | B |`
      const { container } = render(<MarkdownRenderer content={content} />)

      // Both headers should render cleanly without raw **
      expect(container.textContent).not.toContain('**Question')
      expect(container.textContent).not.toContain('good.**')
      expect(container.textContent).toContain('Question 3: Income rises')
      expect(container.textContent).toContain('coffee is a normal good.')
    })

    it('preserves economics equilibrium notation (P*, Q*, (P*, Q*), P_1*) as KaTeX math', () => {
      const content = `At market equilibrium (P*, Q*), the equilibrium price is P* and the quantity is Q*. Additionally, P_1* exceeds P_0*.`
      const { container } = render(<MarkdownRenderer content={content} />)

      // KaTeX should render the equilibrium symbols
      const katexElements = container.querySelectorAll('.katex')
      expect(katexElements.length).toBeGreaterThanOrEqual(4)
      expect(container.textContent).toContain('P')
      expect(container.textContent).toContain('Q')
    })

    it('cleans up random stray asterisks in text while keeping bold intact', () => {
      const content = `* Note: when income rises*, demand shifts right* for **normal goods** and decreases* for inferior goods.`
      const { container } = render(<MarkdownRenderer content={content} />)

      // Stray asterisks should be cleaned
      expect(container.textContent).not.toContain('rises*')
      expect(container.textContent).not.toContain('right*')
      expect(container.textContent).not.toContain('decreases*')
      expect(container.textContent).toContain('normal goods')
      expect(container.querySelector('strong')).not.toBeNull()
    })
  })
})

