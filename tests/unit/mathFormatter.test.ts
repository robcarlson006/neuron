import {
  preprocessLatexText,
  autoFormatMathLocal,
  isValidMathString,
  convertAsciiMathToLatex,
  normalizeUnicodeMath,
  repairMathSyntax
} from '../../src/lib/mathFormatter'

describe('mathFormatter', () => {
  describe('isValidMathString', () => {
    it('recognizes variables and math expressions as valid math', () => {
      expect(isValidMathString('p_1')).toBe(true)
      expect(isValidMathString('x_1 \\ge 0')).toBe(true)
      expect(isValidMathString('m = 12')).toBe(true)
      expect(isValidMathString('-\\frac{2}{3}')).toBe(true)
      expect(isValidMathString('x^2 + y^2')).toBe(true)
    })

    it('recognizes coordinate pairs, tuples, intervals, and vectors as valid math', () => {
      expect(isValidMathString('(1, 2)')).toBe(true)
      expect(isValidMathString('(0, 3)')).toBe(true)
      expect(isValidMathString('(2, 2)')).toBe(true)
      expect(isValidMathString('(5, 1)')).toBe(true)
      expect(isValidMathString('(x, y)')).toBe(true)
      expect(isValidMathString('(x_1, x_2)')).toBe(true)
      expect(isValidMathString('[0, 1]')).toBe(true)
      expect(isValidMathString('[-1, 5]')).toBe(true)
      expect(isValidMathString('-0.1')).toBe(true)
      expect(isValidMathString('1 \\cdot x_1 + 10 \\cdot x_2 = 30')).toBe(true)
    })

    it('recognizes prime notation, asterisks, and preference relations as valid math', () => {
      expect(isValidMathString("x'")).toBe(true)
      expect(isValidMathString("x''")).toBe(true)
      expect(isValidMathString("x^*")).toBe(true)
      expect(isValidMathString("y'")).toBe(true)
      expect(isValidMathString("f'(x)")).toBe(true)
      expect(isValidMathString("(x', y')")).toBe(true)
      expect(isValidMathString("y \\sim x'")).toBe(true)
      expect(isValidMathString("x \\succ y")).toBe(true)
      expect(isValidMathString("x \\succeq y")).toBe(true)
      expect(isValidMathString("y ~ x'")).toBe(true)
    })

    it('rejects multi-word plain English phrases with spaces and no math', () => {
      expect(isValidMathString('4 to 8')).toBe(false)
      expect(isValidMathString('835 in food benefits per month')).toBe(false)
      expect(isValidMathString('doubles to 12 and')).toBe(false)
      expect(isValidMathString('stays at 5')).toBe(false)
    })
  })

  describe('convertAsciiMathToLatex', () => {
    it('converts slash fractions into LaTeX \\frac', () => {
      expect(convertAsciiMathToLatex('(x + 1)/(y - 2)')).toBe('\\frac{x + 1}{y - 2}')
      expect(convertAsciiMathToLatex('1/2')).toBe('\\frac{1}{2}')
      expect(convertAsciiMathToLatex('dy/dx')).toBe('\\frac{dy}{dx}')
    })

    it('converts sqrt into \\sqrt', () => {
      expect(convertAsciiMathToLatex('sqrt(2x + 1)')).toBe('\\sqrt{2x + 1}')
    })

    it('converts Greek words and relational operators', () => {
      expect(convertAsciiMathToLatex('alpha + beta != 0')).toBe('\\alpha + \\beta \\neq 0')
      expect(convertAsciiMathToLatex('x <= 10 and y >= 5')).toBe('x \\le 10 and y \\ge 5')
      expect(convertAsciiMathToLatex('a +- b')).toBe('a \\pm b')
      expect(convertAsciiMathToLatex('theta ~= pi')).toBe('\\theta \\approx \\pi')
      expect(convertAsciiMathToLatex('x -> infinity')).toBe('x \\to \\infty')
    })
  })

  describe('normalizeUnicodeMath', () => {
    it('normalizes superscripts and common unicode math symbols', () => {
      expect(normalizeUnicodeMath('x² + y² = z²')).toBe('x^2 + y^2 = z^2')
      expect(normalizeUnicodeMath('√x ± 2')).toContain('\\sqrt{x}')
      expect(normalizeUnicodeMath('√x ± 2')).toContain('\\pm')
      expect(normalizeUnicodeMath('α + β = π')).toBe('\\alpha + \\beta = \\pi')
      expect(normalizeUnicodeMath('a ≠ b and c ≤ d and e ≥ f')).toBe('a \\neq b and c \\le d and e \\ge f')
    })
  })

  describe('repairMathSyntax', () => {
    it('auto-closes unclosed curly braces and brackets', () => {
      expect(repairMathSyntax('\\frac{1}{2')).toBe('\\frac{1}{2}')
      expect(repairMathSyntax('\\sqrt{x^2 + 1')).toBe('\\sqrt{x^2 + 1}')
      expect(repairMathSyntax('[0, 1')).toBe('[0, 1]')
    })

    it('balances \\left without \\right', () => {
      expect(repairMathSyntax('\\left( x + y')).toBe('\\left( x + y \\right.')
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

    it('converts backtick math containing equations into $...$', () => {
      const input = 'Use `x^2 + y^2 = 25` to find radius'
      const result = preprocessLatexText(input)
      expect(result).toContain('$x^{2} + y^{2} = 25$')
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
