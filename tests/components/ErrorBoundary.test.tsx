import React from 'react'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../../src/components/ErrorBoundary'

function Bomb(): React.JSX.Element {
  throw new Error('test explosion')
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>healthy child</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('healthy child')).toBeInTheDocument()
  })

  it('catches errors and shows the fallback UI', () => {
    // Suppress React's expected error logging for this test.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    expect(screen.getByText(/test explosion/i)).toBeInTheDocument()
    expect(screen.getByText(/Reload Neuron/i)).toBeInTheDocument()
    spy.mockRestore()
  })
})
