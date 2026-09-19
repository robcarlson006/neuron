import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { preprocessLatexText } from '../lib/mathFormatter'

interface Props {
  children: string
  className?: string
  forceInline?: boolean
}

/**
 * Renders text that may contain LaTeX in multiple formats:
 * - $$...$$ or \[...\] — display (block) math
 * - $...$ or \(...\) — inline math
 * - \begin{env}...\end{env} — LaTeX block environments
 * - [latex]...[/latex] or [$]...[/$] — Anki math tags
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
  let html = ''
  let error = false
  try {
    html = katex.renderToString(latex, {
      throwOnError: true,
      displayMode,
      output: 'html'
    })
  } catch {
    error = true
  }

  if (error) {
    const raw = displayMode ? `$$${latex}$$` : `$${latex}$`
    return <code className="text-red-500 text-xs bg-red-50 dark:bg-red-900/20 px-1 rounded break-words">{raw}</code>
  }

  return (
    <span
      className={displayMode ? 'block my-2 overflow-x-auto max-w-full text-center' : 'inline-block align-middle max-w-full break-words'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

interface TextPart {
  type: 'text' | 'math'
  content: string
  display: boolean
}

// Priority order matters — $$ must come before $ to avoid partial matches.
// Group 1: $$...$$ → display math
// Group 2: \[...\] → display math
// Group 3: \(...\) → inline math
// Group 4: \begin{env}...\end{env} → display math
// Group 6: $...$ → inline math (no newlines, no nested $ to avoid false positives)
const LATEX_REGEX = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\4\}|\$([^$\n]+?)\$/g

function isValidInlineMath(content: string): boolean {
  const s = content.trim()
  if (!s) return false

  // Pure numbers or currency values e.g. "835" or "835.50" or "835,000" are not LaTeX math
  if (/^\d+([.,]\d+)?$/.test(s)) return false

  // Check if it contains math operators/symbols or LaTeX commands
  const hasMathSymbols = /[\\^_=+/><{}]|\b(sin|cos|tan|log|lim|sqrt|sum|int|alpha|beta|gamma|theta|pi|frac|cdot|pm|times)\b/i.test(s)
  if (!hasMathSymbols) {
    // If it contains spaces and regular words (e.g. currency match like "$835 in food benefits ... up to $835"), treat as plain text
    if (s.includes(' ')) return false
  }

  return true
}

function splitLatex(text: string): TextPart[] {
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
      // \(...\) → inline math
      parts.push({ type: 'math', content: match[3].trim(), display: false })
    } else if (match[4] !== undefined) {
      // \begin{env}...\end{env} → display math
      parts.push({ type: 'math', content: match[0].trim(), display: true })
    } else if (match[6] !== undefined) {
      // $...$ → inline math (if valid)
      if (isValidInlineMath(match[6])) {
        parts.push({ type: 'math', content: match[6].trim(), display: false })
      } else {
        parts.push({ type: 'text', content: `$${match[6]}$`, display: false })
      }
    }

    lastIndex = LATEX_REGEX.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex), display: false })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text, display: false }]
}
