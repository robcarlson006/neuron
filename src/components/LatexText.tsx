import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface Props {
  children: string
  className?: string
  block?: boolean // if true, renders display math for standalone $$ blocks
}

/**
 * Renders text that may contain LaTeX wrapped in $$...$$
 * Example: "The formula $$E = mc^2$$ is famous."
 */
export default function LatexText({ children, className, block }: Props): React.JSX.Element {
  const parts = splitLatex(children)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'math' ? (
          <KatexSpan key={i} latex={part.content} displayMode={block ?? false} />
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
      throwOnError: false,
      displayMode,
      output: 'html'
    })
  } catch {
    error = true
  }

  if (error) {
    return <code className="text-red-500 text-xs bg-red-50 dark:bg-red-900/20 px-1 rounded">{`$$${latex}$$`}</code>
  }

  return (
    <span
      className={displayMode ? 'block my-2 overflow-x-auto' : 'inline-block align-middle'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

interface TextPart {
  type: 'text' | 'math'
  content: string
}

function splitLatex(text: string): TextPart[] {
  const parts: TextPart[] = []
  // Match $$...$$ (non-greedy)
  const regex = /\$\$([\s\S]*?)\$\$/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'math', content: match[1] })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}
