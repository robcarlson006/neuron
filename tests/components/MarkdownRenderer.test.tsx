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
  })
})
