import React, { useState } from "react"
import { Sigma, ChevronDown, ChevronUp } from "../icons"

interface MathKeyboardProps {
  onInsert: (snippet: string) => void
}

interface SymbolCategory {
  name: string
  symbols: Array<{ label: string; snippet: string; tooltip?: string }>
}

const CATEGORIES: SymbolCategory[] = [
  {
    name: "Common",
    symbols: [
      { label: "x/y", snippet: "\\frac{a}{b}", tooltip: "Fraction" },
      { label: "x²", snippet: "^{2}", tooltip: "Squared" },
      { label: "xⁿ", snippet: "^{n}", tooltip: "Exponent" },
      { label: "xᵢ", snippet: "_{i}", tooltip: "Subscript" },
      { label: "√x", snippet: "\\sqrt{x}", tooltip: "Square Root" },
      { label: "ⁿ√x", snippet: "\\sqrt[n]{x}", tooltip: "N-th Root" },
      { label: "±", snippet: "\\pm ", tooltip: "Plus-Minus" },
      { label: "≈", snippet: "\\approx ", tooltip: "Approximately" },
      { label: "≠", snippet: "\\neq ", tooltip: "Not Equal" },
      { label: "≤", snippet: "\\le ", tooltip: "Less than or equal" },
      { label: "≥", snippet: "\\ge ", tooltip: "Greater than or equal" },
      { label: "×", snippet: "\\times ", tooltip: "Multiplication" },
      { label: "÷", snippet: "\\div ", tooltip: "Division" },
      { label: "·", snippet: "\\cdot ", tooltip: "Dot Product" }
    ]
  },
  {
    name: "Greek",
    symbols: [
      { label: "α", snippet: "\\alpha ", tooltip: "Alpha" },
      { label: "β", snippet: "\\beta ", tooltip: "Beta" },
      { label: "γ", snippet: "\\gamma ", tooltip: "Gamma" },
      { label: "δ", snippet: "\\delta ", tooltip: "Delta" },
      { label: "Δ", snippet: "\\Delta ", tooltip: "Capital Delta" },
      { label: "ε", snippet: "\\epsilon ", tooltip: "Epsilon" },
      { label: "θ", snippet: "\\theta ", tooltip: "Theta" },
      { label: "λ", snippet: "\\lambda ", tooltip: "Lambda (Lagrange)" },
      { label: "μ", snippet: "\\mu ", tooltip: "Mu (Mean)" },
      { label: "π", snippet: "\\pi ", tooltip: "Pi" },
      { label: "σ", snippet: "\\sigma ", tooltip: "Sigma (Std Dev)" },
      { label: "Σ", snippet: "\\sum ", tooltip: "Summation" },
      { label: "ω", snippet: "\\omega ", tooltip: "Omega" }
    ]
  },
  {
    name: "Calculus & Econ",
    symbols: [
      { label: "dy/dx", snippet: "\\frac{dy}{dx}", tooltip: "Derivative" },
      { label: "∂y/∂x", snippet: "\\frac{\\partial y}{\\partial x}", tooltip: "Partial Derivative" },
      { label: "∫", snippet: "\\int_{a}^{b} f(x)\\,dx", tooltip: "Definite Integral" },
      { label: "∑", snippet: "\\sum_{i=1}^{n} ", tooltip: "Summation Series" },
      { label: "lim", snippet: "\\lim_{x \\to \\infty} ", tooltip: "Limit" },
      { label: "∞", snippet: "\\infty ", tooltip: "Infinity" },
      { label: "MR = MC", snippet: "MR = MC", tooltip: "Profit Maximization" },
      { label: "MRS", snippet: "MRS = \\frac{MU_x}{MU_y}", tooltip: "Marginal Rate of Substitution" },
      { label: "Matrix", snippet: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", tooltip: "2x2 Matrix" },
      { label: "System", snippet: "\\begin{cases} eq1 \\\\ eq2 \\end{cases}", tooltip: "Equation System" }
    ]
  }
]

export default function MathKeyboard({ onInsert }: MathKeyboardProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<string>("Common")
  const [isExpanded, setIsExpanded] = useState<boolean>(true)

  const activeCategory = CATEGORIES.find((c) => c.name === activeTab) || CATEGORIES[0]

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/60 overflow-hidden text-xs">
      {/* Tab bar / toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50">
        <div className="flex items-center gap-1">
          <Sigma size={13} className="text-violet-600 dark:text-violet-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px] mr-2">Math Palette</span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => {
                setActiveTab(cat.name)
                setIsExpanded(true)
              }}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                activeTab === cat.name && isExpanded
                  ? "bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
          title={isExpanded ? "Collapse palette" : "Expand palette"}
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Symbol buttons */}
      {isExpanded && (
        <div className="p-2 grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 gap-1">
          {activeCategory.symbols.map((sym, idx) => (
            <button
              key={idx}
              type="button"
              title={sym.tooltip || sym.snippet}
              onClick={() => onInsert(sym.snippet)}
              className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:border-violet-300 dark:hover:border-violet-700 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 font-mono text-center transition-all shadow-2xs active:scale-95"
            >
              {sym.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
