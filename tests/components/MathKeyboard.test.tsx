import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import MathKeyboard from '../../src/components/practice/MathKeyboard'

describe('MathKeyboard', () => {
  it('exposes valid common math templates', () => {
    const onInsert = jest.fn()
    render(<MathKeyboard onInsert={onInsert} />)

    fireEvent.click(screen.getByTitle('Fraction'))
    fireEvent.click(screen.getByTitle('Square Root'))
    fireEvent.click(screen.getByTitle('Squared'))
    fireEvent.click(screen.getByTitle('Subscript'))

    expect(onInsert.mock.calls.map(([snippet]) => snippet)).toEqual([
      '\\frac{a}{b}', '\\sqrt{x}', '^{2}', '_{i}'
    ])
  })

  it('switches categories without focusing tabs or symbol buttons', () => {
    const onInsert = jest.fn()
    render(<MathKeyboard onInsert={onInsert} />)
    const outside = document.createElement('textarea')
    document.body.appendChild(outside)
    outside.focus()

    const greekTab = screen.getByRole('button', { name: 'Greek' })
    fireEvent.mouseDown(greekTab)
    fireEvent.click(greekTab)
    expect(document.activeElement).toBe(outside)
    fireEvent.mouseDown(screen.getByTitle('Alpha'))
    fireEvent.click(screen.getByTitle('Alpha'))
    expect(document.activeElement).toBe(outside)
    expect(onInsert).toHaveBeenLastCalledWith('\\alpha ')
    document.body.removeChild(outside)
  })

  it('offers Greek, calculus, economics, matrix, and system snippets', () => {
    const onInsert = jest.fn()
    render(<MathKeyboard onInsert={onInsert} />)
    fireEvent.click(screen.getByRole('button', { name: 'Calculus & Econ' }))

    for (const title of ['Derivative', 'Partial Derivative', 'Definite Integral', 'Summation Series', '2x2 Matrix', 'Equation System']) {
      fireEvent.click(screen.getByTitle(title))
    }

    expect(onInsert.mock.calls.map(([snippet]) => snippet)).toEqual([
      '\\frac{dy}{dx}',
      '\\frac{\\partial y}{\\partial x}',
      '\\int_{a}^{b} f(x)\\,dx',
      '\\sum_{i=1}^{n} ',
      '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
      '\\begin{cases} eq1 \\\\ eq2 \\end{cases}'
    ])
  })
})
