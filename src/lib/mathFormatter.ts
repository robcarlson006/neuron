/**
 * Math Formatter Utility
 * Handles conversion of raw math formulas, exponents, equations, fractions,
 * AsciiMath, natural math, Unicode math, Anki tags ([latex], [$]),
 * and un-delimited LaTeX commands into clean KaTeX delimiters ($...$ or $$...$$).
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

const GREEK_MAP: Record<string, string> = {
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta',
  epsilon: '\\epsilon', zeta: '\\zeta', eta: '\\eta', theta: '\\theta',
  iota: '\\iota', kappa: '\\kappa', lambda: '\\lambda', mu: '\\mu',
  nu: '\\nu', xi: '\\xi', pi: '\\pi', rho: '\\rho',
  sigma: '\\sigma', tau: '\\tau', upsilon: '\\upsilon', phi: '\\phi',
  chi: '\\chi', psi: '\\psi', omega: '\\omega',
  Delta: '\\Delta', Gamma: '\\Gamma', Theta: '\\Theta', Lambda: '\\Lambda',
  Xi: '\\Xi', Pi: '\\Pi', Sigma: '\\Sigma', Phi: '\\Phi',
  Psi: '\\Psi', Omega: '\\Omega'
}

/**
 * Normalizes Unicode math characters and symbols into standard LaTeX equivalents.
 */
export function normalizeUnicodeMath(text: string): string {
  if (!text) return ''
  return text
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/½/g, '\\frac{1}{2}')
    .replace(/¼/g, '\\frac{1}{4}')
    .replace(/¾/g, '\\frac{3}{4}')
    .replace(/√\s*(\([^\)]+\)|[a-zA-Z0-9]+)/g, '\\sqrt{$1}')
    .replace(/√/g, '\\sqrt{}')
    .replace(/±/g, '\\pm')
    .replace(/≠/g, '\\neq')
    .replace(/≤/g, '\\le')
    .replace(/≥/g, '\\ge')
    .replace(/≈/g, '\\approx')
    .replace(/≡/g, '\\equiv')
    .replace(/∞/g, '\\infty')
    .replace(/∂/g, '\\partial')
    .replace(/∇/g, '\\nabla')
    .replace(/∑/g, '\\sum')
    .replace(/∫/g, '\\int')
    .replace(/∏/g, '\\prod')
    .replace(/α/g, '\\alpha')
    .replace(/β/g, '\\beta')
    .replace(/γ/g, '\\gamma')
    .replace(/δ/g, '\\delta')
    .replace(/ε/g, '\\epsilon')
    .replace(/θ/g, '\\theta')
    .replace(/λ/g, '\\lambda')
    .replace(/μ/g, '\\mu')
    .replace(/π/g, '\\pi')
    .replace(/σ/g, '\\sigma')
    .replace(/ω/g, '\\omega')
    .replace(/Δ/g, '\\Delta')
    .replace(/Σ/g, '\\Sigma')
    .replace(/Ω/g, '\\Omega')
    .replace(/[’′]/g, "'")
    .replace(/[″]/g, "''")
}

/**
 * Automatically converts AsciiMath and calculator-style notations into LaTeX.
 * Examples:
 * - sqrt(2x + 1) -> \sqrt{2x + 1}
 * - (x+1)/(x-1) -> \frac{x+1}{x-1}
 * - alpha + beta != 0 -> \alpha + \beta \neq 0
 * - x <= 5 and y >= 10 -> x \le 5 and y \ge 10
 */
export function convertAsciiMathToLatex(expr: string): string {
  if (!expr) return ''
  let s = normalizeUnicodeMath(expr)

  // 1. Convert sqrt(...)
  s = s.replace(/\bsqrt\(([^)]+)\)/gi, '\\sqrt{$1}')

  // 2. Convert fractions: (a+b)/(c+d) or single_token/single_token
  // e.g. (x + 1)/(y - 2) -> \frac{x + 1}{y - 2}
  s = s.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, '\\frac{$1}{$2}')
  s = s.replace(/\(([^()]+)\)\s*\/\s*([a-zA-Z0-9_\.\-]+)/g, '\\frac{$1}{$2}')
  s = s.replace(/([a-zA-Z0-9_\.\-]+)\s*\/\s*\(([^()]+)\)/g, '\\frac{$1}{$2}')
  s = s.replace(/\b([a-zA-Z0-9_\.\-]+)\s*\/\s*([a-zA-Z0-9_\.\-]+)\b/g, (match, num, den) => {
    // Avoid dates like 12/2026 or path slashes
    if (/^\d{1,2}$/.test(num) && /^\d{2,4}$/.test(den)) return match
    return `\\frac{${num}}{${den}}`
  })

  // 3. Convert exponents and subscripts: x^2 -> x^{2}, x^(2n+1) -> x^{2n+1}, x_1 -> x_{1}, x_(i+1) -> x_{i+1}
  s = s.replace(/([a-zA-Z0-9_\)]+)\^\(([^)]+)\)/g, '$1^{$2}')
  s = s.replace(/([a-zA-Z0-9_\)]+)\^([a-zA-Z0-9_\+\-]+)/g, '$1^{$2}')
  s = s.replace(/([a-zA-Z0-9_\)]+)_\(([^)]+)\)/g, '$1_{$2}')
  s = s.replace(/([a-zA-Z0-9_\)]+)_([a-zA-Z0-9_\+\-]+)/g, '$1_{$2}')

  // 4. Convert relational & arithmetic operators
  s = s.replace(/!=|<>/g, ' \\neq ')
  s = s.replace(/<=|=</g, ' \\le ')
  s = s.replace(/>=/g, ' \\ge ')
  s = s.replace(/\+-/g, ' \\pm ')
  s = s.replace(/~=|~~/g, ' \\approx ')
  s = s.replace(/<==>|<=>/g, ' \\iff ')
  s = s.replace(/==>|=>/g, ' \\implies ')
  s = s.replace(/-->|->/g, ' \\to ')
  s = s.replace(/\b(oo|infinity)\b/gi, '\\infty')

  // 5. Convert standalone Greek words
  for (const [word, latex] of Object.entries(GREEK_MAP)) {
    const regex = new RegExp(`(?<!\\\\)\\b${word}\\b`, 'g')
    s = s.replace(regex, latex)
  }

  // 6. Clean multiple spaces
  s = s.replace(/\s+/g, ' ').trim()

  return s
}

/**
 * Auto-repairs malformed LaTeX expressions so KaTeX never throws or renders broken error boxes.
 * Fixes unclosed braces, unbalanced delimiters, missing arguments, etc.
 */
export function repairMathSyntax(latex: string): string {
  if (!latex) return ''
  let s = latex.trim()

  // Normalize primes
  s = s.replace(/[’′]/g, "'").replace(/[″]/g, "''")

  // Fix unclosed curly braces {
  let openBraces = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{' && (i === 0 || s[i - 1] !== '\\')) openBraces++
    else if (s[i] === '}' && (i === 0 || s[i - 1] !== '\\')) openBraces--
  }
  while (openBraces > 0) {
    s += '}'
    openBraces--
  }

  // Fix incomplete trailing commands e.g. \frac{a}{ -> \frac{a}{}
  s = s.replace(/\\(?:frac|dfrac|tfrac)\{([^}]*)\}\s*$/g, '\\frac{$1}{}')
  s = s.replace(/\\(?:frac|dfrac|tfrac)\s*$/g, '\\frac{}{}')
  s = s.replace(/\\(?:sqrt|vec|hat|tilde|bar|dot|mathbf|mathrm)\s*$/g, '')

  // Fix unclosed brackets [
  let openBrackets = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '[' && (i === 0 || s[i - 1] !== '\\')) openBrackets++
    else if (s[i] === ']' && (i === 0 || s[i - 1] !== '\\')) openBrackets--
  }
  while (openBrackets > 0) {
    s += ']'
    openBrackets--
  }

  // Auto-balance \left without \right
  const leftMatches = (s.match(/\\left\b/g) || []).length
  const rightMatches = (s.match(/\\right\b/g) || []).length
  if (leftMatches > rightMatches) {
    for (let i = 0; i < leftMatches - rightMatches; i++) {
      s += ' \\right.'
    }
  }

  return s
}

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

  // Standalone numbers with or without dollar signs or escaped dollar signs e.g. "$5", "\$5", "$10.50", "5"
  if (/^\\?\$?\s*\d+(?:\.\d+)?\s*\$?$/.test(s)) {
    return false
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
 * Pre-processes text containing LaTeX, AsciiMath, or Anki math tags before parsing/rendering.
 */
export function preprocessLatexText(text: string): string {
  if (!text || typeof text !== 'string') return ''

  let s = text

  // 0. Clean up AI hallucinations of escaped currency dollars wrapped in LaTeX:
  // e.g. $\$5$ -> $5, \$$5$ -> $5, \$$5 -> $5, \$5$ -> $5, \$5 -> $5, $\$10.50$ -> $10.50, $\$3$ -> $3
  s = s.replace(/(?:\\+\$|\$)\s*(?:\\+\$|\$)\s*(\d+(?:\.\d+)?)\s*(?:\\+\$|\$)?/g, '$$$1')
  s = s.replace(/\\+\$\s*(\d+(?:\.\d+)?)\s*\$/g, '$$$1')
  s = s.replace(/\\+\$\s*(\d+(?:\.\d+)?)/g, '$$$1')

  // 1. Convert Anki LaTeX tags using function replacers
  s = s.replace(/\[latex\]([\s\S]*?)\[\/latex\]/gi, (_, inner) => `$$${inner}$$`)
  s = s.replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/gi, (_, inner) => `$$${inner}$$`)
  s = s.replace(/\[\$\]([\s\S]*?)\[\/\$\]/gi, (_, inner) => `$${inner}$`)
  s = s.replace(/\[math\]([\s\S]*?)\[\/math\]/gi, (_, inner) => `$${inner}$`)

  // 2. Convert inline backtick math if it contains math operators/equations: `x^2 + y^2 = 25` -> $x^2 + y^2 = 25$
  s = s.replace(/`([^`\n]+)`/g, (match, inner) => {
    if (isValidMathString(inner) && /[\\^_=+/><~*]|\b(sqrt|frac|alpha|beta|theta|pi)\b/i.test(inner)) {
      return `$${convertAsciiMathToLatex(inner)}$`
    }
    return match
  })

  // 3. Normalize double-escaped backslashes: e.g. \\( -> \(, \\[ -> \[, \\frac -> \frac
  s = s.replace(/\\\\([()\[\]])/g, '\\$1')
  s = s.replace(/\\\\([a-zA-Z]+)/g, '\\$1')

  // 4. Clean up accidental triple dollar signs e.g. $$$math$$$ -> $$math$$
  s = s.replace(/\${3,}([\s\S]*?)\${3,}/g, (_, inner) => `$$${inner}$$`)

  // 5. Normalize Unicode math inside text
  s = normalizeUnicodeMath(s)

  // 6. Auto-wrap un-delimited LaTeX expressions (e.g. -\frac{2}{3}, \frac{a}{b}, \sqrt{x}, etc.)
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

  // Detect raw sqrt expressions e.g. sqrt(2x + 1)
  const rawSqrtRegex = /(?:(?<!\$)\bsqrt\([^\)]+\)(?!\$))/gi
  s = s.replace(rawSqrtRegex, match => {
    if (/@@NEURON_MATH_MASK_\d+@@/.test(match)) return match
    return mask(`$${convertAsciiMathToLatex(match)}$`)
  })

  // Detect whole raw math equations containing =, <=, >=, !=, ~ e.g. a^2 + b^2 = c^2, x^2 + y^2 = 25
  const rawEquationRegex = /(?:(?<!\$|\w)[a-zA-Z0-9_\(\)\+\-\*\/\^\s]+\s*(?:=|<|>|<=|>=|!=|~=)\s*[a-zA-Z0-9_\(\)\+\-\*\/\^\s]+(?!\$))/g
  s = s.replace(rawEquationRegex, match => {
    if (/@@NEURON_MATH_MASK_\d+@@/.test(match)) return match
    const trimmed = match.trim()
    if (isValidMathString(trimmed) && /[\^_\/\\]|\b(sin|cos|tan|log|sqrt|frac)\b/i.test(trimmed)) {
      return mask(`$${convertAsciiMathToLatex(trimmed)}$`)
    }
    return match
  })

  // Detect raw exponent expressions (e.g. x^2, (a+b)^2, 2^10, e^(-x))
  const rawExponentRegex = /(?:(?<!\$|\w)[a-zA-Z0-9_\(\)]+\^[a-zA-Z0-9_\(\)\+\-\{\}]+(?!\$))/g
  s = s.replace(rawExponentRegex, match => {
    if (/@@NEURON_MATH_MASK_\d+@@/.test(match)) return match
    return mask(`$${convertAsciiMathToLatex(match)}$`)
  })

  // Restore all masked tokens
  for (let i = maskedMath.length - 1; i >= 0; i--) {
    s = s.replace(`@@NEURON_MATH_MASK_${i}@@`, () => maskedMath[i])
  }

  return s
}

/**
 * Detects if user input contains math symbols, expressions, or operators for live preview.
 */
export function hasMathInput(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const s = text.trim()
  if (!s) return false
  return (
    /[\$\\^_{}\[\]~=<>|±≠≤≥≈∞π√²³⁴]|\\(?:frac|sqrt|alpha|beta|theta|pi)|\b(sqrt|alpha|beta|gamma|delta|theta|lambda|pi|sigma|omega|sin|cos|tan|log|lim|sum|int)\b/i.test(s) ||
    /\b[a-zA-Z0-9_\(\)]+\s*\/\s*[a-zA-Z0-9_\(\)]+\b/.test(s)
  )
}

/**
 * Smart offline local math equation auto-formatter.
 * Converts raw mathematical formulas, exponents, fractions, square roots, and equations
 * into properly formatted LaTeX with $...$ delimiters.
 */
export function autoFormatMathLocal(text: string): string {
  if (!text) return ''

  // Preprocess any Anki tags & Unicode first
  let processed = preprocessLatexText(text)

  const lines = processed.split('\n')
  const formattedLines = lines.map(line => {
    let s = line

    // If line already contains valid $...$, $$...$$, \(...\), or \[...\], leave existing math intact
    if (/\$|\\\(|\\\[/.test(s)) {
      return s
    }

    const parts = s.split(/(\.{3}|;|\t)/)
    const formattedParts = parts.map(part => {
      const trimmed = part.trim()
      if (!trimmed || part === '...' || part === ';' || part === '\t') return part

      let p = part

      // Convert raw sqrt(...) to \sqrt{...}
      p = p.replace(/\bsqrt\(([^)]+)\)/gi, '\\sqrt{$1}')

      // Convert raw exponents e.g. x^2 -> x^{2}, a^2+b^2=c^2 -> a^{2}+b^{2}=c^{2}
      p = p.replace(/\b([a-zA-Z0-9_\(\)]+)\^([a-zA-Z0-9_\(\)\+\-]+)/g, '$1^{$2}')

      // Convert simple numerical/algebraic fractions e.g. (x+1)/(y-1) -> \frac{x+1}{y-1}
      p = p.replace(/\b\(?([a-zA-Z0-9_\+\-]+)\)?\s*\/\s*\(?([a-zA-Z0-9_\+\-]+)\)?\b/g, (match, num, den) => {
        if (/^\d{1,2}$/.test(num) && /^\d{2,4}$/.test(den)) return match
        return `\\frac{${num}}{${den}}`
      })

      // Convert AsciiMath elements if applicable
      const converted = convertAsciiMathToLatex(p)
      if (converted !== p && isValidMathString(converted)) {
        p = converted
      }

      const pTrimmed = p.trim()
      const hasMathSymbols = /\^|\\sqrt|\\frac|=|<=|>=|~|\\sim|\\neq|\\pm|\b(sin|cos|tan|log)\b/i.test(pTrimmed)

      if (hasMathSymbols && !pTrimmed.startsWith('$')) {
        if (/^[a-zA-Z\s,]+$/.test(pTrimmed) && !/\b(sin|cos|tan)\b/.test(pTrimmed)) {
          return p
        }
        return p.replace(pTrimmed, `$${pTrimmed}$`)
      }

      return p
    })

    return formattedParts.join('')
  })

  return formattedLines.join('\n')
}
