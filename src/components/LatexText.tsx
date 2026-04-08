import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface Props {
  children: string
  className?: string
}

/**
 * Renders text that may contain LaTeX in multiple formats:
 * - $$...$$ or \[...\] — display (block) math
 * - $...$ or \(...\) — inline math
 */
export default function LatexText({ children, className }: Props): React.JSX.Element {
  const parts = splitLatex(children)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'math' ? (
          <KatexSpan key={i} latex={part.content} displayMode={part.display} />
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
    return <code className="text-red-500 text-xs bg-red-50 dark:bg-red-900/20 px-1 rounded">{raw}</code>
  }

  return (
    <span
      className={displayMode ? 'block my-2 overflow-x-auto text-center' : 'inline-block align-middle'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

interface TextPart {
  type: 'text' | 'math'
  content: string
  display: boolean
}

function splitLatex(text: string): TextPart[] {
  const parts: TextPart[] = []

  // Priority order matters — $$ must come before $ to avoid partial matches.
  // Group 1: $$...$$ → display math
  // Group 2: \[...\] → display math
  // Group 3: \(...\) → inline math
  // Group 4: $...$ → inline math (no newlines, no nested $ to avoid false positives)
  const regex = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$([^$\n]+?)\$/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
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
      parts.push({ type: 'math', content: match[3], display: false })
    } else if (match[4] !== undefined) {
      // $...$ → inline math
      parts.push({ type: 'math', content: match[4], display: false })
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex), display: false })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text, display: false }]
}
