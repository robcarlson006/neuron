import { preprocessLatexText, autoFormatMathLocal } from '../../src/lib/mathFormatter'

describe('mathFormatter', () => {
  describe('preprocessLatexText', () => {
    it('converts Anki [latex]...[/latex] tags to $$...$$', () => {
      const input = 'Equation: [latex]\\frac{a}{b}[/latex]'
      const result = preprocessLatexText(input)
      expect(result).toBe('Equation: $$\\frac{a}{b}$$')
    })

    it('converts Anki [$]...[/$] tags to $...$', () => {
      const input = 'Area [$]x^2[/$] square meters'
      const result = preprocessLatexText(input)
      expect(result).toBe('Area $x^2$ square meters')
    })

    it('unescapes double-escaped backslashes', () => {
      const input = 'Formula \\\\( x^2 + y^2 = z^2 \\\\)'
      const result = preprocessLatexText(input)
      expect(result).toBe('Formula \\( x^2 + y^2 = z^2 \\)')
    })
  })

  describe('autoFormatMathLocal', () => {
    it('formats raw exponents into $...$', () => {
      const input = 'Pythagorean...a^2 + b^2 = c^2'
      const result = autoFormatMathLocal(input)
      expect(result).toContain('$a^{2} + b^{2} = c^{2}$')
    })

    it('formats raw sqrt expressions into $...$', () => {
      const input = 'Hypotenuse...sqrt(a^2 + b^2)'
      const result = autoFormatMathLocal(input)
      expect(result).toContain('$\\sqrt{a^{2} + b^{2}}$')
    })

    it('leaves existing $...$ intact', () => {
      const input = 'Quadratic...$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$'
      const result = autoFormatMathLocal(input)
      expect(result).toBe(input)
    })
  })
})
