import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { preprocessLatexText, isValidMathString, convertAsciiMathToLatex, repairMathSyntax } from '../lib/mathFormatter'

interface Props {
  children: string
  className?: string
  forceInline?: boolean
}

/**
 * Renders text that may contain math in multiple formats:
 * - $$...$$ or \[...\] — display (block) math
 * - $...$ or \(...\) — inline math
 * - \begin{env}...\end{env} — LaTeX block environments
 * - [latex]...[/latex] or [$]...[/$] — Anki math tags
 * - AsciiMath e.g. sqrt(x), (a+b)/(c+d), alpha != beta
 * - Unicode math e.g. x², √x, ±, ≠, ≤, ≥, π, ∑, ∫
 */
export default function LatexText({ children, className, forceInline = false }: Props): React.JSX.Element {
  if (!children || typeof children !== 'string') {
    return <span className={className}>{children || ''}</span>
  }
  const processed = preprocessLatexText(children)
  const parts = splitLatex(processed)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'math' ? (
          <KatexSpan key={i} latex={part.content} displayMode={forceInline ? false : part.display} />
        ) : (
          <span key={i}>{part.content}</span>
        )
      )}
    </span>
  )
}

function KatexSpan({ latex, displayMode }: { latex: string; displayMode: boolean }): React.JSX.Element {
  let cleanLatex = latex
  // Convert any remaining un-escaped AsciiMath tokens inside delimiters
  if (!/^\\[a-zA-Z]+/.test(cleanLatex)) {
    cleanLatex = convertAsciiMathToLatex(cleanLatex)
  }

  let html = ''
  let error = false
  try {
    html = katex.renderToString(cleanLatex, {
      throwOnError: false,
      displayMode,
      output: 'html'
    })
    // Check if KaTeX returned an error element
    if (html.includes('katex-error')) {
      error = true
    }
  } catch {
    error = true
  }

  // Attempt auto-repair if KaTeX threw or returned an error
  if (error) {
    const repaired = repairMathSyntax(cleanLatex)
    try {
      html = katex.renderToString(repaired, {
        throwOnError: false,
        displayMode,
        output: 'html'
      })
      if (!html.includes('katex-error')) {
        error = false
      }
    } catch {
      error = true
    }
  }

  if (error || !html) {
    // Graceful fallback: render clean styled math text rather than a broken red error box
    return (
      <span
        className={
          displayMode
            ? 'block my-2 text-center font-mono text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
            : 'inline-block font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 mx-0.5 align-baseline'
        }
      >
        {latex}
      </span>
    )
  }

  return (
    <span
      className={displayMode ? 'block my-2 overflow-x-auto max-w-full text-center' : 'inline-block align-middle max-w-full break-words'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export interface TextPart {
  type: 'text' | 'math'
  content: string
  display: boolean
}

// Priority order matters — $$ and \[ must come before $ to avoid partial matches.
// Group 1: $$...$$ → display math
// Group 2: \[...\] → display math
// Group 3: \begin{env}...\end{env} → display math
// Group 4: \(...\) → inline math
// Group 5: $...$ → inline math (guarded against currency & greedy pairing across lines/spaces)
const LATEX_REGEX = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\3\}|\\\(([\s\S]*?)\\\)|(?<!\\|\$)\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g

export function splitLatex(text: string): TextPart[] {
  const parts: TextPart[] = []
  LATEX_REGEX.lastIndex = 0

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = LATEX_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index), display: false })
    }

    if (match[1] !== undefined) {
      // $$...$$ → display math
      parts.push({ type: 'math', content: match[1].trim(), display: true })
    } else if (match[2] !== undefined) {
      // \[...\] → display math
      parts.push({ type: 'math', content: match[2].trim(), display: true })
    } else if (match[3] !== undefined) {
      // \begin{env}...\end{env} → display math
      parts.push({ type: 'math', content: match[0].trim(), display: true })
    } else if (match[5] !== undefined) {
      // \(...\) → inline math
      parts.push({ type: 'math', content: match[5].trim(), display: false })
    } else if (match[6] !== undefined) {
      // $...$ → inline math (if valid)
      const mathContent = match[6].trim()
      if (isValidMathString(mathContent)) {
        parts.push({ type: 'math', content: mathContent, display: false })
      } else {
        parts.push({ type: 'text', content: match[0], display: false })
      }
    }

    lastIndex = LATEX_REGEX.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex), display: false })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text, display: false }]
}
