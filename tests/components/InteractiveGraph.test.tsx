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

  describe('InteractiveGraph Sandbox Security & Features', () => {
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

    it('converts LaTeX in axis titles and titles to clean Unicode in iframe srcdoc', () => {
      const mathSpec = {
        title: 'Indifference Curves ($U = x_1 \\cdot x_2$)',
        encoding: {
          x: { field: 'x1', title: 'Good 1 ($x_1$)' },
          y: { field: 'x2', title: 'Good 2 ($x_2$)' }
        }
      }

      const { container } = render(<InteractiveGraph spec={mathSpec} />)
      const iframe = container.querySelector('iframe')
      const srcdoc = iframe?.getAttribute('srcdoc') || ''

      expect(srcdoc).toContain('Indifference Curves (U = x₁ · x₂)')
      expect(srcdoc).toContain('Good 1 (x₁)')
      expect(srcdoc).toContain('Good 2 (x₂)')
    })

    it('includes point grabbing, dragging, and tooltip systems in iframe srcdoc', () => {
      const { container } = render(<InteractiveGraph spec={sampleSpec} />)
      const iframe = container.querySelector('iframe')
      const srcdoc = iframe?.getAttribute('srcdoc') || ''

      expect(srcdoc).toContain('initPointDragging')
      expect(srcdoc).toContain('drag-tooltip')
      expect(srcdoc).toContain('cursor: grab')
      expect(srcdoc).toContain('dragging-point')
    })
  })

  describe('GraphContainer Controls & Scale Adjustments', () => {
    it('renders title, description, scale controls, and action buttons', () => {
      render(<GraphContainer spec={sampleSpec} />)

      expect(screen.getByText('Market Equilibrium')).toBeInTheDocument()
      expect(screen.getByText('Supply and Demand Curve Intersection')).toBeInTheDocument()
      expect(screen.getByTitle('Reset model parameters and view')).toBeInTheDocument()
      expect(screen.getByTitle('Expand graph')).toBeInTheDocument()
      expect(screen.getByTitle('Zoom in (Scale up)')).toBeInTheDocument()
      expect(screen.getByTitle('Zoom out (Scale down)')).toBeInTheDocument()
      expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('allows zooming in and zooming out scale', () => {
      render(<GraphContainer spec={sampleSpec} />)

      const zoomInBtn = screen.getByTitle('Zoom in (Scale up)')
      const zoomOutBtn = screen.getByTitle('Zoom out (Scale down)')

      // Zoom in
      fireEvent.click(zoomInBtn)
      expect(screen.getByText('115%')).toBeInTheDocument()

      fireEvent.click(zoomInBtn)
      expect(screen.getByText('130%')).toBeInTheDocument()

      // Zoom out
      fireEvent.click(zoomOutBtn)
      expect(screen.getByText('115%')).toBeInTheDocument()

      // Reset scale by clicking scale indicator
      const scaleBadge = screen.getByTitle('Click to reset scale to 100%')
      fireEvent.click(scaleBadge)
      expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('switches height presets between Compact, Standard, and Tall', () => {
      const { container } = render(<GraphContainer spec={sampleSpec} />)

      const compactBtn = screen.getByTitle('Adjust graph height to compact')
      const tallBtn = screen.getByTitle('Adjust graph height to tall')

      fireEvent.click(tallBtn)
      const iframe = container.querySelector('iframe')
      expect(iframe).toHaveStyle({ minHeight: '480px' })

      fireEvent.click(compactBtn)
      expect(iframe).toHaveStyle({ minHeight: '280px' })
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
