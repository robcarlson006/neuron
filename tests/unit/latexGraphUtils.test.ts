import { latexToUnicodeText, sanitizeVegaSpecMath } from '../../src/components/graphs/latexGraphUtils'

describe('latexGraphUtils', () => {
  describe('latexToUnicodeText', () => {
    it('converts subscripts correctly', () => {
      expect(latexToUnicodeText('Good 1 ($x_1$)')).toBe('Good 1 (x₁)')
      expect(latexToUnicodeText('Good 2 ($x_2$)')).toBe('Good 2 (x₂)')
      expect(latexToUnicodeText('$C_0$')).toBe('C₀')
      expect(latexToUnicodeText('Quantity ($Q_d$)')).toBe('Quantity (Q_d)')
      expect(latexToUnicodeText('$x_{12}$')).toBe('x₁₂')
    })

    it('converts superscripts correctly', () => {
      expect(latexToUnicodeText('Future Value: $FV = C_0 \\times (1 + r)^T$')).toBe('Future Value: FV = C₀ × (1 + r)ᵀ')
      expect(latexToUnicodeText('$x^2 + y^2 = z^2$')).toBe('x² + y² = z²')
      expect(latexToUnicodeText('$e^{-1}$')).toBe('e⁻¹')
    })

    it('converts Greek letters correctly', () => {
      expect(latexToUnicodeText('Utility parameter $\\alpha = 0.5$ and $\\beta = 0.5$')).toBe('Utility parameter α = 0.5 and β = 0.5')
      expect(latexToUnicodeText('Price change $\\Delta P$')).toBe('Price change Δ P')
      expect(latexToUnicodeText('Angle $\\theta$')).toBe('Angle θ')
    })

    it('converts mathematical operators and symbols', () => {
      expect(latexToUnicodeText('$P_1 \\le P_2$')).toBe('P₁ ≤ P₂')
      expect(latexToUnicodeText('$x \\approx 3.14$')).toBe('x ≈ 3.14')
      expect(latexToUnicodeText('$a \\cdot b$')).toBe('a · b')
      expect(latexToUnicodeText('$A \\times B$')).toBe('A × B')
    })
  })

  describe('sanitizeVegaSpecMath', () => {
    it('sanitizes axis titles, main titles, and descriptions', () => {
      const spec = {
        title: 'Indifference Curves: $U(x_1, x_2)$',
        description: 'Trade-off between Good 1 ($x_1$) and Good 2 ($x_2$)',
        encoding: {
          x: { field: 'x1', title: 'Good 1 ($x_1$)' },
          y: { field: 'x2', title: 'Good 2 ($x_2$)' }
        }
      }

      const sanitized = sanitizeVegaSpecMath(spec)
      expect(sanitized.title).toBe('Indifference Curves: U(x₁, x₂)')
      expect(sanitized.description).toBe('Trade-off between Good 1 (x₁) and Good 2 (x₂)')
      expect(sanitized.encoding.x.title).toBe('Good 1 (x₁)')
      expect(sanitized.encoding.y.title).toBe('Good 2 (x₂)')
    })

    it('repairs exponentiation syntax in calculate transforms', () => {
      const spec = {
        transform: [
          { calculate: 'C0 * (1 + r)^datum.t', as: 'FV' },
          { calculate: 'datum.x ^ 2', as: 'y' }
        ]
      }

      const sanitized = sanitizeVegaSpecMath(spec)
      expect(sanitized.transform[0].calculate).toBe('C0 * pow(1 + r, datum.t)')
      expect(sanitized.transform[1].calculate).toBe('pow(datum.x, 2)')
    })

    it('supplies defaults for slider range parameters', () => {
      const spec = {
        params: [
          { name: 'r', value: 0.05, bind: { input: 'range' } }
        ]
      }

      const sanitized = sanitizeVegaSpecMath(spec)
      expect(sanitized.params[0].bind.min).toBe(0)
      expect(sanitized.params[0].bind.max).toBe(0.1)
      expect(sanitized.params[0].bind.step).toBe(0.01)
    })
  })
})
