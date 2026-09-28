import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import MathInput from '../../src/components/MathInput'

describe('MathInput', () => {
  it('keeps the raw expression editable and renders exponent notation', () => {
    const onChange = jest.fn()
    const { container } = render(<MathInput value="5^2" onChange={onChange} placeholder="Math" />)

    expect(screen.getByDisplayValue('5^2')).toBeInTheDocument()
    expect(screen.getByText('Math preview')).toBeInTheDocument()
    expect(container.querySelector('.katex')).not.toBeNull()
  })

  it('updates from typing a slash fraction', () => {
    const onChange = jest.fn()
    render(<MathInput value="" onChange={onChange} placeholder="Math" />)

    fireEvent.change(screen.getByPlaceholderText('Math'), { target: { value: '5x/2' } })
    expect(onChange).toHaveBeenCalledWith('5x/2')
  })
})
