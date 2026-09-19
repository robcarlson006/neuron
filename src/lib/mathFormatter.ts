/**
 * Math Formatter Utility
 * Handles conversion of raw math formulas, exponents, equations, fractions,
 * Anki tags ([latex], [$]), and un-delimited LaTeX commands into clean KaTeX delimiters ($...$ or $$...$$).
 */

/**
 * Pre-processes text containing LaTeX or Anki math tags before parsing/rendering.
 */
export function preprocessLatexText(text: string): string {
  if (!text || typeof text !== 'string') return ''

  let s = text

  // 1. Convert Anki LaTeX tags
  // [latex]...[/latex] -> $$...$$
  s = s.replace(/\[latex\]([\s\S]*?)\[\/latex\]/gi, '$$$$$1$$$$')
  // [$]...[/$] or [$$]...[/$$] -> $...$ or $$...$$
  s = s.replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/gi, '$$$$$1$$$$')
  s = s.replace(/\[\$\]([\s\S]*?)\[\/\$\]/gi, '$$$1$$')
  // [math]...[/math] -> $...$
  s = s.replace(/\[math\]([\s\S]*?)\[\/math\]/gi, '$$$1$$')

  // 2. Normalize double-escaped backslashes: e.g. \\( -> \(, \\[ -> \[, \\frac -> \frac
  s = s.replace(/\\\\([()\[\]])/g, '\\$1')
  s = s.replace(/\\\\([a-zA-Z]+)/g, '\\$1')

  // 3. Auto-wrap un-delimited LaTeX commands like \frac{a}{b}, \sqrt{x}, \int_a^b, \sum, \alpha, \beta, \infty, etc. if not already inside $ or $$
  const rawLatexCmdRegex = /(?<!\$|\\\[|\\\()\\(?:frac\{[^}]*\}\{[^}]*\}|sqrt\{[^}]*\}|int(?:_[^{\s]+)?(?:\^[^{\s]+)?|sum(?:_[^{\s]+)?(?:\^[^{\s]+)?|prod|lim(?:_[^{\s]+)?|alpha|beta|gamma|delta|theta|pi|sigma|omega|infty|neq|le|ge|cdot|times|vec\{[^}]*\}|[a-zA-Z]+)(?!\$|\\\]|\\\))/g

  if (rawLatexCmdRegex.test(s) && !s.includes('$') && !s.includes('\\(') && !s.includes('\\[')) {
    s = s.replace(/(\\ (?:frac\{[^}]*\}\{[^}]*\}|sqrt\{[^}]*\}|[a-zA-Z]+(?:\{[^}]*\})*)(?:\s*[\+\-\*\/=><^_\d\w\(\)]+)*)/g, match => {
      const trimmed = match.trim()
      if (!trimmed.startsWith('$') && !trimmed.endsWith('$')) {
        return `$${trimmed}$`
      }
      return match
    })
  }

  return s
}

/**
 * Smart offline local math equation auto-formatter.
 * Converts raw mathematical formulas, exponents, fractions, square roots, and equations
 * into properly formatted LaTeX with $...$ delimiters.
 */
export function autoFormatMathLocal(text: string): string {
  if (!text) return ''

  // Preprocess any Anki tags first
  let processed = preprocessLatexText(text)

  const lines = processed.split('\n')
  const formattedLines = lines.map(line => {
    let s = line

    // If line already contains valid $...$, $$...$$, \(...\), or \[...\], leave existing math intact
    if (/\$|\\\(|\\\[/.test(s)) {
      return s
    }

    // Convert raw sqrt(...) to \sqrt{...}
    s = s.replace(/\bsqrt\(([^)]+)\)/gi, '\\sqrt{$1}')

    // Convert raw exponents e.g. x^2 -> x^{2}, a^2+b^2=c^2 -> a^{2}+b^{2}=c^{2}
    s = s.replace(/\b([a-zA-Z0-9_\(\)]+)\^([a-zA-Z0-9_\(\)\+\-]+)/g, '$1^{$2}')

    // Convert simple numerical/algebraic fractions e.g. 1/2 or (x+1)/(y-1) -> \frac{x+1}{y-1}
    s = s.replace(/\b\(?([a-zA-Z0-9_\+\-]+)\)?\s*\/\s*\(?([a-zA-Z0-9_\+\-]+)\)?\b/g, (match, num, den) => {
      // Don't format dates like 12/2026 or URLs
      if (/^\d{1,2}$/.test(num) && /^\d{2,4}$/.test(den)) return match
      return `\\frac{${num}}{${den}}`
    })

    // Detect mathematical equations / expressions containing =, <, >, <=, >=, \frac, \sqrt, ^, or Greek letters
    // Wrap candidate math expressions in $...$
    const hasMathSymbols = /\^|\\sqrt|\\frac|=|<=|>=|\b(sin|cos|tan|log)\b/i.test(s)

    if (hasMathSymbols) {
      // If the string contains front/back separators like '...' or ';', format each chunk separately
      const parts = s.split(/(\.{3}|;|\t)/)
      const formattedParts = parts.map(part => {
        const trimmed = part.trim()
        if (!trimmed || part === '...' || part === ';' || part === '\t') return part
        if (/\^|\\sqrt|\\frac|=|<=|>=/.test(trimmed) && !trimmed.startsWith('$')) {
          // Check it's not a plain English sentence without math
          if (/^[a-zA-Z\s,]+$/.test(trimmed) && !/\b(sin|cos|tan)\b/.test(trimmed)) {
            return part
          }
          return part.replace(trimmed, `$${trimmed}$`)
        }
        return part
      })
      s = formattedParts.join('')
    }

    return s
  })

  return formattedLines.join('\n')
}
