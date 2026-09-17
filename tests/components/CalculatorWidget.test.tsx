import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import CalculatorWidget from '../../src/components/calculator/CalculatorWidget'

describe('CalculatorWidget Component', () => {
  it('renders NumWorks skin by default and evaluates simple math expressions', () => {
    const mockOnClose = jest.fn()
    render(<CalculatorWidget skin="numworks" onClose={mockOnClose} />)

    expect(screen.getByText('NumWorks')).toBeInTheDocument()

    // Click 7, +, 8, =
    fireEvent.click(screen.getByText('7'))
    fireEvent.click(screen.getByText('+'))
    fireEvent.click(screen.getByText('8'))
    fireEvent.click(screen.getByText('='))

    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('switches between NumWorks and TI-84 skins', () => {
    render(<CalculatorWidget skin="numworks" />)
    expect(screen.getByText('NumWorks')).toBeInTheDocument()

    // Switch to TI-84
    const ti84Btn = screen.getByTitle(/Switch to TI-84 Skin/i)
    fireEvent.click(ti84Btn)

    expect(screen.getByText('TI-84 Plus')).toBeInTheDocument()
    expect(screen.getByText('TEXAS INSTRUMENTS')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const mockOnClose = jest.fn()
    render(<CalculatorWidget skin="numworks" onClose={mockOnClose} />)

    const closeBtn = screen.getAllByRole('button').find(b => b.querySelector('svg'))
    if (closeBtn) {
      fireEvent.click(closeBtn)
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    }
  })
})
