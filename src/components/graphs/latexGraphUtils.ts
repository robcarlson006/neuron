/**
 * Mathematical Typography & Vega-Lite Sanitization Utilities
 * Converts LaTeX mathematical expressions, subscripts, superscripts, Greek letters,
 * and scientific symbols into elegant Unicode text suitable for SVG/Canvas chart rendering.
 */

// Greek letter mapping
const GREEK_MAP: Record<string, string> = {
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\Delta': 'Δ',
  '\\epsilon': 'ε',
  '\\zeta': 'ζ',
  '\\eta': 'η',
  '\\theta': 'θ',
  '\\Theta': 'Θ',
  '\\iota': 'ι',
  '\\kappa': 'κ',
  '\\lambda': 'λ',
  '\\Lambda': 'Λ',
  '\\mu': 'μ',
  '\\nu': 'ν',
  '\\xi': 'ξ',
  '\\Xi': 'Ξ',
  '\\pi': 'π',
  '\\Pi': 'Π',
  '\\rho': 'ρ',
  '\\sigma': 'σ',
  '\\Sigma': 'Σ',
  '\\tau': 'τ',
  '\\upsilon': 'υ',
  '\\phi': 'φ',
  '\\Phi': 'Φ',
  '\\chi': 'χ',
  '\\psi': 'ψ',
  '\\Psi': 'Ψ',
  '\\omega': 'ω',
  '\\Omega': 'Ω'
}

// Math symbols mapping
const SYMBOL_MAP: Record<string, string> = {
  '\\times': '×',
  '\\cdot': '·',
  '\\pm': '±',
  '\\mp': '∓',
  '\\le': '≤',
  '\\leq': '≤',
  '\\ge': '≥',
  '\\geq': '≥',
  '\\ne': '≠',
  '\\neq': '≠',
  '\\approx': '≈',
  '\\sim': '~',
  '\\propto': '∝',
  '\\infty': '∞',
  '\\partial': '∂',
  '\\nabla': '∇',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\int': '∫',
  '\\in': '∈',
  '\\notin': '∉',
  '\\subset': '⊂',
  '\\subseteq': '⊆',
  '\\cup': '∪',
  '\\cap': '∩',
  '\\forall': '∀',
  '\\exists': '∃',
  '\\rightarrow': '→',
  '\\leftarrow': '←',
  '\\Rightarrow': '⇒',
  '\\Leftarrow': '⇐',
  '\\leftrightarrow': '↔',
  '\\Leftrightarrow': '⇔'
}

// Subscript character mapping
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  'a': 'ₐ',
  'e': 'ₑ',
  'h': 'ₕ',
  'i': 'ᵢ',
  'j': 'ⱼ',
  'k': 'ₖ',
  'l': 'ₗ',
  'm': 'ₘ',
  'n': 'ₙ',
  'o': 'ₒ',
  'p': 'ₚ',
  'r': 'ᵣ',
  's': 'ₛ',
  't': 'ₜ',
  'u': 'ᵤ',
  'v': 'ᵥ',
  'x': 'ₓ'
}

// Superscript character mapping
const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  'a': 'ᵃ',
  'b': 'ᵇ',
  'c': 'ᶜ',
  'd': 'ᵈ',
  'e': 'ᵉ',
  'f': 'ᶠ',
  'g': 'ᵍ',
  'h': 'ʰ',
  'i': 'ⁱ',
  'j': 'ʲ',
  'k': 'ᵏ',
  'l': 'ˡ',
  'm': 'ᵐ',
  'n': 'ⁿ',
  'o': 'ᵒ',
  'p': 'ᵖ',
  'r': 'ʳ',
  's': 'ˢ',
  't': 'ᵗ',
  'u': 'ᵘ',
  'v': 'ᵛ',
  'w': 'ʷ',
  'x': 'ˣ',
  'y': 'ʸ',
  'z': 'ᶻ',
  'A': 'ᴬ',
  'B': 'ᴮ',
  'D': 'ᴰ',
  'E': 'ᴱ',
  'G': 'ᴳ',
  'H': 'ᴴ',
  'I': 'ᴵ',
  'J': 'ᴶ',
  'K': 'ᴷ',
  'L': 'ᴸ',
  'M': 'ᴹ',
  'N': 'ᴺ',
  'O': 'ᴼ',
  'P': 'ᴾ',
  'R': 'ᴿ',
  'T': 'ᵀ',
  'U': 'ᵁ',
  'V': 'ⱽ',
  'W': 'ᵂ'
}

/**
 * Converts subscript tokens like `_1` or `_{12}` or `_{max}` into Unicode subscripts.
 */
function toSubscript(str: string): string {
  let allMapped = true
  let res = ''
  for (const char of str) {
    if (SUBSCRIPT_MAP[char]) {
      res += SUBSCRIPT_MAP[char]
    } else {
      allMapped = false
      res += char
    }
  }
  return allMapped ? res : `_${str}`
}

/**
 * Converts superscript tokens like `^2` or `^{T}` or `^{-1}` into Unicode superscripts.
 */
function toSuperscript(str: string): string {
  let allMapped = true
  let res = ''
  for (const char of str) {
    if (SUPERSCRIPT_MAP[char]) {
      res += SUPERSCRIPT_MAP[char]
    } else {
      allMapped = false
      res += char
    }
  }
  return allMapped ? res : `^${str}`
}

/**
 * Converts a string containing LaTeX math (e.g. `Good 1 ($x_1$)`, `Future Value: $FV = C_0 \times (1 + r)^T$`)
 * into crisp, legible Unicode typography for chart titles, axis labels, and tooltips.
 */
export function latexToUnicodeText(text: string): string {
  if (!text || typeof text !== 'string') return ''

  let result = text

  // 1. Convert LaTeX commands with text / formatting: \text{...}, \mathbf{...}, \mathit{...}
  result = result.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|textit)\{([^}]+)\}/g, '$1')

  // 2. Convert Greek letters
  for (const [cmd, char] of Object.entries(GREEK_MAP)) {
    result = result.split(cmd).join(char)
  }

  // 3. Convert Math symbols
  for (const [cmd, char] of Object.entries(SYMBOL_MAP)) {
    result = result.split(cmd).join(char)
  }

  // 4. Convert complex subscripts: _{...} or _[a-zA-Z0-9]
  result = result.replace(/_\{([^}]+)\}/g, (_, sub) => toSubscript(sub))
  result = result.replace(/_([0-9a-zA-Z])/g, (_, sub) => toSubscript(sub))

  // 5. Convert complex superscripts: ^{...} or ^[a-zA-Z0-9]
  result = result.replace(/\^\{([^}]+)\}/g, (_, sup) => toSuperscript(sup))
  result = result.replace(/\^([0-9a-zA-Z+-])/g, (_, sup) => toSuperscript(sup))

  // 6. Clean fractions \frac{a}{b} -> a/b
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')

  // 7. Strip leftover math delimiters ($...$, $$...$$, \(...\), \[...\])
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, '$1')
  result = result.replace(/\$([^$]+)\$/g, '$1')
  result = result.replace(/\\\((.*?)\\\)/g, '$1')
  result = result.replace(/\\\[(.*?)\\\]/g, '$1')

  // 8. Clean leftover backslashes and redundant spaces
  result = result.replace(/\\[a-zA-Z]+/g, '')
  result = result.replace(/\s+/g, ' ').trim()

  return result
}

/**
 * Recursively sanitizes a Vega-Lite JSON specification to format all LaTeX titles,
 * axis labels, legend titles, and tooltips as clean Unicode.
 * Also auto-repairs common LLM calculation expressions (e.g. `^` -> `pow()`).
 */
export function sanitizeVegaSpecMath(spec: Record<string, any>): Record<string, any> {
  if (!spec || typeof spec !== 'object') return spec

  const cloned = JSON.parse(JSON.stringify(spec))

  function walk(node: any, keyName?: string) {
    if (!node || typeof node !== 'object') return

    // Sanitize string title properties
    if (typeof node.title === 'string') {
      node.title = latexToUnicodeText(node.title)
    } else if (node.title && typeof node.title === 'object') {
      if (typeof node.title.text === 'string') {
        node.title.text = latexToUnicodeText(node.title.text)
      }
      if (typeof node.title.subtitle === 'string') {
        node.title.subtitle = latexToUnicodeText(node.title.subtitle)
      }
    }

    // Sanitize description
    if (typeof node.description === 'string') {
      node.description = latexToUnicodeText(node.description)
    }

    // Sanitize parameter slider labels
    if (keyName === 'params' && Array.isArray(node)) {
      for (const param of node) {
        if (param.bind && typeof param.bind.name === 'string') {
          param.bind.name = latexToUnicodeText(param.bind.name)
        }
        // Ensure range slider bounds are defined
        if (param.bind && param.bind.input === 'range') {
          if (param.bind.min === undefined) param.bind.min = 0
          if (param.bind.max === undefined) param.bind.max = typeof param.value === 'number' && param.value > 0 ? param.value * 2 : 100
          if (param.bind.step === undefined) {
            const range = param.bind.max - param.bind.min
            param.bind.step = range > 10 ? 1 : 0.01
          }
        }
      }
    }

    // Sanitize calculate transforms: repair `a ^ b` into `pow(a, b)`
    if (keyName === 'transform' && Array.isArray(node)) {
      for (const t of node) {
        if (t && typeof t.calculate === 'string') {
          let expr = t.calculate
          expr = expr.replace(/([a-zA-Z0-9_.]+|\([^)]+\))\s*\^\s*([a-zA-Z0-9_.]+|\([^)]+\))/g, (_: string, base: string, exp: string) => {
            const cleanBase = base.startsWith('(') && base.endsWith(')') ? base.slice(1, -1).trim() : base
            const cleanExp = exp.startsWith('(') && exp.endsWith(')') ? exp.slice(1, -1).trim() : exp
            return `pow(${cleanBase}, ${cleanExp})`
          })
          t.calculate = expr
        }
      }
    }

    // Recursively walk children
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object') {
        walk(v, k)
      }
    }
  }

  walk(cloned)
  return cloned
}
