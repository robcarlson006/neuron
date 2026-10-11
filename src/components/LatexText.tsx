import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { preprocessLatexText, splitMathText, convertAsciiMathToLatex, repairMathSyntax, type MathTextPart } from '../lib/mathFormatter'

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
      output: 'htmlAndMathml',
      trust: false
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
        output: 'htmlAndMathml',
        trust: false
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
      aria-label={cleanLatex}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export type TextPart = MathTextPart
export const splitLatex = splitMathText
