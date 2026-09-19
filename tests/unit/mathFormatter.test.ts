import { preprocessLatexText, autoFormatMathLocal, isValidMathString } from '../../src/lib/mathFormatter'

describe('mathFormatter', () => {
  describe('isValidMathString', () => {
    it('recognizes variables and math expressions as valid math', () => {
      expect(isValidMathString('p_1')).toBe(true)
      expect(isValidMathString('x_1 \\ge 0')).toBe(true)
      expect(isValidMathString('m = 12')).toBe(true)
      expect(isValidMathString('-\\frac{2}{3}')).toBe(true)
      expect(isValidMathString('x^2 + y^2')).toBe(true)
    })

    it('rejects multi-word plain English phrases with spaces and no math', () => {
      expect(isValidMathString('4 to 8')).toBe(false)
      expect(isValidMathString('835 in food benefits per month')).toBe(false)
      expect(isValidMathString('doubles to 12 and')).toBe(false)
      expect(isValidMathString('stays at 5')).toBe(false)
    })
  })

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

    it('auto-wraps unwrapped raw LaTeX commands like -\\frac{2}{3}', () => {
      const input = 'slope went from -\\frac{2}{3} to -\\frac{4}{3}'
      const result = preprocessLatexText(input)
      expect(result).toContain('$-\\frac{2}{3}$')
      expect(result).toContain('$-\\frac{4}{3}$')
    })

    it('preserves standalone currency symbols without corrupting them', () => {
      const input = 'vertical intercept rose from $4 to $8'
      const result = preprocessLatexText(input)
      expect(result).toBe('vertical intercept rose from $4 to $8')
    })

    it('handles mixed currency and math formulas correctly', () => {
      const input = 'income doubles to $60 while $p_2$ doubles to $12 and $p_1$ stays at $5'
      const result = preprocessLatexText(input)
      expect(result).toBe('income doubles to $60 while $p_2$ doubles to $12 and $p_1$ stays at $5')
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
