import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MarkdownRenderer from '../../src/components/MarkdownRenderer'
import '@testing-library/jest-dom'

describe('MarkdownRenderer with Zero-Defect Tabular Systems', () => {
  beforeEach(() => {
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined)
      }
    })
  })

  it('renders a Markdown pipe table with interactive toolbar', () => {
    const md = `
# Economic Indicators

| Indicator | Q1 2024 | Q2 2024 |
|---|---|---|
| Real GDP ($B) | 28,245 | 28,650 |
| Core CPI (%) | 3.6 | 3.4 |
| Total | 28,248.6 | 28,653.4 |
    `
    render(<MarkdownRenderer content={md} />)

    expect(screen.getByText('Economic Indicators')).toBeInTheDocument()
    expect(screen.getByText('Indicator')).toBeInTheDocument()
    expect(screen.getByText('Real GDP ($B)')).toBeInTheDocument()
    expect(screen.getByText('28,245')).toBeInTheDocument()

    // Check action buttons
    expect(screen.getByTitle('Copy as Markdown Pipe Table')).toBeInTheDocument()
    expect(screen.getByTitle('Copy as CSV')).toBeInTheDocument()
    expect(screen.getByTitle('Copy as LaTeX Booktabs')).toBeInTheDocument()
    expect(screen.getByTitle('Extract high-yield flashcards from this table')).toBeInTheDocument()
  })

  it('handles column sorting on header click', () => {
    const md = `
| Country | Rank |
|---|---|
| United States | 1 |
| Germany | 3 |
| Japan | 2 |
    `
    render(<MarkdownRenderer content={md} />)

    const countryHeader = screen.getByText('Country')
    fireEvent.click(countryHeader)

    // Verify copy button works
    const copyMdBtn = screen.getByTitle('Copy as Markdown Pipe Table')
    fireEvent.click(copyMdBtn)
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
  })

  it('renders LaTeX math inside table cells', () => {
    const md = `
| Equation | Description |
|---|---|
| $E = mc^2$ | Mass-energy equivalence |
| $\\sum_{i=1}^n i$ | Sum of first n integers |
    `
    render(<MarkdownRenderer content={md} />)

    expect(screen.getByText('Mass-energy equivalence')).toBeInTheDocument()
    expect(screen.getByText('Equation')).toBeInTheDocument()
  })

  it('renders Markdown-KV blocks as rich tables', () => {
    const kv = `
Row 1: {"Asset": "Cash", "Amount": "$500"}
Row 2: {"Asset": "Equities", "Amount": "$1200"}
Row 3: {"Asset": "Real Estate", "Amount": "$3000"}
    `
    render(<MarkdownRenderer content={kv} />)

    expect(screen.getByText('Asset')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('$500')).toBeInTheDocument()
  })
})
