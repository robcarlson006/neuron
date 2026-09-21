import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import InteractiveGraph from '../../src/components/graphs/InteractiveGraph'
import GraphContainer from '../../src/components/graphs/GraphContainer'

describe('InteractiveGraph and GraphContainer Components', () => {
  const sampleSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: 'Market Equilibrium',
    description: 'Supply and Demand Curve Intersection',
    data: {
      values: [
        { price: 10, quantity: 100, type: 'Demand' },
        { price: 20, quantity: 80, type: 'Demand' },
        { price: 10, quantity: 50, type: 'Supply' },
        { price: 20, quantity: 80, type: 'Supply' }
      ]
    },
    mark: 'line',
    encoding: {
      x: { field: 'quantity', type: 'quantitative' },
      y: { field: 'price', type: 'quantitative' },
      color: { field: 'type', type: 'nominal' }
    }
  }

  describe('InteractiveGraph Sandbox Security', () => {
    it('renders an iframe with strict allow-scripts sandbox and no allow-same-origin', () => {
      const { container } = render(<InteractiveGraph spec={sampleSpec} />)
      const iframe = container.querySelector('iframe')

      expect(iframe).toBeInTheDocument()
      // Critical security invariant: allow-scripts ONLY, never allow-same-origin
      expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
      expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin')
    })

    it('enforces Content Security Policy on the iframe', () => {
      const { container } = render(<InteractiveGraph spec={sampleSpec} />)
      const iframe = container.querySelector('iframe')

      const srcdoc = iframe?.getAttribute('srcdoc') || ''
      expect(srcdoc).toContain("http-equiv=\"Content-Security-Policy\"")
      expect(srcdoc).toContain("default-src 'none'")
      expect(srcdoc).toContain("script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net")
    })

    it('handles resize events only when accompanied by matching nonce', () => {
      const { container } = render(<InteractiveGraph spec={sampleSpec} minHeight={300} />)
      const iframe = container.querySelector('iframe')
      expect(iframe).toHaveStyle({ height: '300px' })

      // Spoofed message without nonce should be ignored
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'RESIZE', payload: { height: 600 }, nonce: 'fake_spoofed_nonce' }
          })
        )
      })
      expect(iframe).toHaveStyle({ height: '300px' })
    })
  })

  describe('GraphContainer Controls', () => {
    it('renders title, description and action buttons', () => {
      render(<GraphContainer spec={sampleSpec} />)

      expect(screen.getByText('Market Equilibrium')).toBeInTheDocument()
      expect(screen.getByText('Supply and Demand Curve Intersection')).toBeInTheDocument()
      expect(screen.getByTitle('Reset model parameters')).toBeInTheDocument()
      expect(screen.getByTitle('Expand graph')).toBeInTheDocument()
    })

    it('toggles fullscreen state when expand button is clicked', () => {
      const { container } = render(<GraphContainer spec={sampleSpec} />)
      const expandBtn = screen.getByTitle('Expand graph')

      // Click expand
      fireEvent.click(expandBtn)
      expect(screen.getByTitle('Exit full screen')).toBeInTheDocument()

      // Click minimize
      const minimizeBtn = screen.getByTitle('Exit full screen')
      fireEvent.click(minimizeBtn)
      expect(screen.getByTitle('Expand graph')).toBeInTheDocument()
    })
  })
})
