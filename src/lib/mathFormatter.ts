/**
 * Math Formatter Utility
 * Handles conversion of raw math formulas, exponents, equations, fractions,
 * Anki tags ([latex], [$]), and un-delimited LaTeX commands into clean KaTeX delimiters ($...$ or $$...$$).
 */

const MATH_WORDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'lim', 'sqrt', 'sum', 'int',
  'prod', 'det', 'dim', 'ker', 'gcd', 'lcm', 'min', 'max', 'sup', 'inf',
  'deg', 'arg', 'mod', 'rank', 'tr', 'var', 'cov', 'std', 'diag',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
  'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'frac', 'dfrac', 'tfrac', 'cdot', 'pm', 'times', 'approx', 'equiv',
  'le', 'ge', 'neq', 'infty', 'partial', 'nabla',
  'sim', 'succ', 'prec', 'succeq', 'preceq', 'cong', 'simeq', 'propto', 'perp',
  'parallel', 'notin', 'subset', 'supset', 'subseteq', 'supseteq',
  'cap', 'cup', 'setminus', 'forall', 'exists', 'implies', 'iff',
  'hat', 'tilde', 'bar', 'dot', 'ddot', 'vec', 'mathbf', 'boldsymbol', 'mathrm',
  'mathbb', 'mathcal', 'prime', 'mrs', 'mrt', 'mu', 'mc', 'mr', 'atc', 'avc',
  'afc', 'tc', 'tr', 'gdp', 'cpi'
])

/**
 * Checks if a string contains valid math content (operators, variables, symbols, tuples, primes)
 * versus plain text / currency phrases (e.g. "4 to 8" or "835 in benefits").
 */
export function isValidMathString(content: string): boolean {
  const s = content.trim()
  if (!s) return false

  // If it starts with backslash or has explicit LaTeX commands, it is math
  if (/\\[a-zA-Z]+/.test(s)) {
    return true
  }

  // If it contains explicit math operators, relations, primes, or superscripts/subscripts
  if (/[\\^_=+/><{}~|'’′*]|\b(sin|cos|tan|log|lim|sqrt|sum|int|prod|alpha|beta|gamma|delta|epsilon|theta|pi|sigma|omega|Delta|Sigma|frac|dfrac|tfrac|cdot|pm|times|approx|equiv|le|ge|neq|sim|succ|prec|succeq|preceq)\b/i.test(s)) {
    // Check that it's not contaminated with non-math English prose words (unless in \text{})
    const words = s.replace(/\\text\{[^}]*\}/g, '').match(/[a-zA-Z]{2,}/g) || []
    const hasInvalidProseWords = words.some(w => !MATH_WORDS.has(w.toLowerCase()) && !/^[a-zA-Z]\d+$/.test(w))
    if (!hasInvalidProseWords) {
      return true
    }
  }

  // Check for coordinates, points, tuples, intervals, vectors, comma-separated math:
  // e.g. "(1, 2)", "(0, 3)", "(x, y)", "(-1, 2.5)", "[0, 1]", "x, y", "1, 2, 3", "(2, 2)", "(5, 1)", "(x', y')", "(x^*, y^*)"
  const isTupleOrCoord = /^[\(\[\{]?\s*[\+\-]?[a-zA-Z0-9_\.\'’′\*]+(\s*,\s*[\+\-]?[a-zA-Z0-9_\.\'’′\*]+)*\s*[\)\]\}]?$/.test(s)
  if (isTupleOrCoord) {
    return true
  }

  // Single variable, symbol, prime, asterisk, or signed number (e.g. "x", "x'", "x''", "x^*", "p_1", "m", "12", "-0.1", "3.14", "x1")
  if (/^[\+\-]?[a-zA-Z0-9_\.\(\)\'’′\*]+$/.test(s) && !/\s/.test(s)) {
    return true
  }

  // Expressions with variables, numbers, basic operators, primes, and parentheses without plain English words
  if (/^[a-zA-Z0-9_\-\+\*\/\(\)\.,\s\'’′\^~=<>|]+$/.test(s)) {
    const words = s.match(/[a-zA-Z]{2,}/g) || []
    if (words.length === 0 || words.every(w => MATH_WORDS.has(w.toLowerCase()) || /^[a-zA-Z]\d+$/.test(w))) {
      return true
    }
  }

  return false
}

/**
 * Pre-processes text containing LaTeX or Anki math tags before parsing/rendering.
 */
export function preprocessLatexText(text: string): string {
  if (!text || typeof text !== 'string') return ''

  let s = text

  // 1. Convert Anki LaTeX tags using function replacers
  s = s.replace(/\[latex\]([\s\S]*?)\[\/latex\]/gi, (_, inner) => `$$${inner}$$`)
  s = s.replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/gi, (_, inner) => `$$${inner}$$`)
  s = s.replace(/\[\$\]([\s\S]*?)\[\/\$\]/gi, (_, inner) => `$${inner}$`)
  s = s.replace(/\[math\]([\s\S]*?)\[\/math\]/gi, (_, inner) => `$${inner}$`)

  // 2. Normalize double-escaped backslashes: e.g. \\( -> \(, \\[ -> \[, \\frac -> \frac
  s = s.replace(/\\\\([()\[\]])/g, '\\$1')
  s = s.replace(/\\\\([a-zA-Z]+)/g, '\\$1')

  // 3. Clean up accidental triple dollar signs e.g. $$$math$$$ -> $$math$$
  s = s.replace(/\${3,}([\s\S]*?)\${3,}/g, (_, inner) => `$$${inner}$$`)

  // 4. Auto-wrap un-delimited LaTeX expressions (e.g. -\frac{2}{3}, \frac{a}{b}, \sqrt{x}, etc.)
  // We first mask all existing math blocks, code blocks, and markdown links
  const maskedMath: string[] = []
  const mask = (match: string) => {
    const placeholder = `@@NEURON_MATH_MASK_${maskedMath.length}@@`
    // Normalize unicode primes / curly apostrophes inside math blocks for KaTeX compatibility
    const normalized = match.replace(/[’′]/g, "'").replace(/[″]/g, "''")
    maskedMath.push(normalized)
    return placeholder
  }

  // Mask code blocks first
  s = s.replace(/```[\s\S]*?```|`[^`\n]+`/g, mask)

  // Mask existing display math $$...$$, \[...\], \begin{...}...\end{...}
  s = s.replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\1\}/g, mask)

  // Mask existing \(...\)
  s = s.replace(/\\\([\s\S]*?\\\)/g, mask)

  // Mask existing inline $...$ where the content is valid inline math
  s = s.replace(/(?<!\\|\$)\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g, (match, content) => {
    if (isValidMathString(content)) {
      return mask(match)
    }
    return match
  })

  // In the remaining unmasked text, detect standalone LaTeX expressions (e.g. -\frac{2}{3}, \sqrt{x^2+1}, \alpha, \sim, etc.)
  const rawLatexRegex = /(?:-?\s*\\(?:frac|dfrac|tfrac)\{[^}]*\}\{[^}]*\}|-?\s*\\(?:sqrt|vec|mathbf|boldsymbol|mathrm|text)\{[^}]*\}|\\(?:int|sum|prod|lim)(?:_[^{\s]+|\{[^}]*\})?(?:\^[^{\s]+|\{[^}]*\})?|\\(?:alpha|beta|gamma|delta|epsilon|theta|pi|sigma|omega|Delta|Sigma|partial|nabla|infty|pm|times|cdot|approx|equiv|le|ge|neq|sim|succ|prec|succeq|preceq|cong|simeq|propto|perp|parallel|in|notin|subset|supset|forall|exists|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow)\b)/g

  s = s.replace(rawLatexRegex, match => {
    const trimmed = match.trim()
    if (!trimmed || trimmed.startsWith('$') || trimmed.startsWith('\\(') || trimmed.startsWith('\\[')) {
      return match
    }
    if (/@@NEURON_MATH_MASK_\d+@@/.test(trimmed)) {
      return match
    }
    return `$${trimmed}$`
  })

  // Restore all masked tokens
  for (let i = maskedMath.length - 1; i >= 0; i--) {
    s = s.replace(`@@NEURON_MATH_MASK_${i}@@`, () => maskedMath[i])
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

    // Convert simple numerical/algebraic fractions e.g. (x+1)/(y-1) -> \frac{x+1}{y-1}
    s = s.replace(/\b\(?([a-zA-Z0-9_\+\-]+)\)?\s*\/\s*\(?([a-zA-Z0-9_\+\-]+)\)?\b/g, (match, num, den) => {
      // Don't format dates like 12/2026 or URLs
      if (/^\d{1,2}$/.test(num) && /^\d{2,4}$/.test(den)) return match
      return `\\frac{${num}}{${den}}`
    })

    // Detect mathematical equations / expressions containing =, <, >, <=, >=, \frac, \sqrt, ^, Greek letters, or relations
    const hasMathSymbols = /\^|\\sqrt|\\frac|=|<=|>=|~|\\sim|\b(sin|cos|tan|log)\b/i.test(s)

    if (hasMathSymbols) {
      const parts = s.split(/(\.{3}|;|\t)/)
      const formattedParts = parts.map(part => {
        const trimmed = part.trim()
        if (!trimmed || part === '...' || part === ';' || part === '\t') return part
        if (/\^|\\sqrt|\\frac|=|<=|>=|~|\\sim/.test(trimmed) && !trimmed.startsWith('$')) {
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
