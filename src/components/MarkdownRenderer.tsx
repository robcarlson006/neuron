import React, { useState, useMemo } from 'react'
import LatexText from './LatexText'
import GraphContainer from './graphs/GraphContainer'
import {
  parseUniversalTable,
  parseMarkdownPipeTable,
  type CanonicalTable,
  type TableAlignment,
  exportTableAs,
  generateCardsFromTable
} from '../lib/tableEngine'
import { Check, Copy, ArrowUpDown, ArrowUp, ArrowDown, Search, Sparkles, ShieldCheck, AlertTriangle } from './icons'

export interface MarkdownRendererProps {
  content: string
  className?: string
  onGenerateCardsFromTable?: (cards: any[]) => void
}

export type ParsedTable = CanonicalTable

// Backward-compatible export
export function parseMarkdownTable(text: string): CanonicalTable | null {
  return parseUniversalTable(text) || parseMarkdownPipeTable(text)
}

/**
 * Renders inline formatting:
 * - `inline code`
 * - **bold** text (including bold math/symbols)
 * - *italic* text
 * - [links](url)
 * - LaTeX math ($...$, \(...\)) via LatexText
 */
export function renderInlineFormatting(text: string): React.ReactNode {
  if (!text) return null

  // Split tokens for `code`, **bold**, *italic*, [link](url)
  const tokens = text.split(/(`[^`\n]+`|\*\*(?:[^*]|\*(?!\*))+\*\*|\*(?:[^*]|\*(?!\*))+\*|\[[^\]]+\]\([^)]+\))/g)

  return (
    <>
      {tokens.map((token, i) => {
        if (!token) return null

        // Inline code: `code`
        if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-mono text-xs border border-slate-200/50 dark:border-slate-700/50 inline-block align-baseline"
            >
              {token.slice(1, -1)}
            </code>
          )
        }

        // Bold: **bold**
        const boldMatch = token.match(/^\*\*(.+)\*\*$/s)
        if (boldMatch) {
          return (
            <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
              <LatexText>{boldMatch[1]}</LatexText>
            </strong>
          )
        }

        // Italic: *italic*
        const italicMatch = token.match(/^\*(.+)\*$/s)
        if (italicMatch) {
          return (
            <em key={i} className="italic text-slate-800 dark:text-slate-200">
              <LatexText>{italicMatch[1]}</LatexText>
            </em>
          )
        }

        // Link: [text](url)
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (linkMatch) {
          return (
            <a
              key={i}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 dark:text-violet-400 hover:underline font-medium"
            >
              {linkMatch[1]}
            </a>
          )
        }

        // Standard text with LaTeX math
        return <LatexText key={i}>{token}</LatexText>
      })}
    </>
  )
}

/**
 * Rich Interactive Table Component
 * - Sortable columns (clickable header)
 * - Instant search / filter bar
 * - Multi-format copy toolbar (Markdown, CSV, LaTeX)
 * - Neurosymbolic Footing & Invariant Audit Status badges
 * - Hierarchical row depth indentation
 * - Econometric regression formatting
 */
export function MarkdownTable({
  table,
  onGenerateCards
}: {
  table: CanonicalTable
  onGenerateCards?: (cards: any[]) => void
}): React.JSX.Element {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const [showCardsFeedback, setShowCardsFeedback] = useState<boolean>(false)

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      if (sortAsc) {
        setSortAsc(false)
      } else {
        setSortCol(null)
        setSortAsc(true)
      }
    } else {
      setSortCol(colIdx)
      setSortAsc(true)
    }
  }

  const handleCopy = (format: 'markdown' | 'csv' | 'latex') => {
    const text = exportTableAs(table, format)
    navigator.clipboard.writeText(text)
    setCopiedFormat(format)
    setTimeout(() => setCopiedFormat(null), 2000)
  }

  const handleCreateCards = () => {
    const cards = generateCardsFromTable(table)
    if (onGenerateCards) {
      onGenerateCards(cards)
    } else {
      const json = JSON.stringify(cards, null, 2)
      navigator.clipboard.writeText(json)
      setShowCardsFeedback(true)
      setTimeout(() => setShowCardsFeedback(false), 2500)
    }
  }

  // Filter and sort rows
  const displayRows = useMemo(() => {
    let rows = table.rows.map((row, index) => ({
      row,
      origIndex: index,
      depth: table.hierarchicalDepth ? table.hierarchicalDepth[index] || 0 : 0
    }))

    // 1. Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(item => item.row.some(cell => cell.toLowerCase().includes(q)))
    }

    // 2. Sort (keep summary/total row at bottom if present)
    if (sortCol !== null) {
      rows.sort((a, b) => {
        const isTotalA = table.footingRowIndex === a.origIndex || /^(Total|Sum|Grand Total)\b/i.test(a.row[0] || '')
        const isTotalB = table.footingRowIndex === b.origIndex || /^(Total|Sum|Grand Total)\b/i.test(b.row[0] || '')
        if (isTotalA) return 1
        if (isTotalB) return -1

        const valA = (a.row[sortCol] || '').replace(/[*_$,%€£]/g, '').trim()
        const valB = (b.row[sortCol] || '').replace(/[*_$,%€£]/g, '').trim()

        const numA = parseFloat(valA)
        const numB = parseFloat(valB)

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortAsc ? numA - numB : numB - numA
        }
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      })
    }

    return rows
  }, [table.rows, table.hierarchicalDepth, table.footingRowIndex, searchQuery, sortCol, sortAsc])

  const getAlignmentClass = (align: TableAlignment) => {
    switch (align) {
      case 'center': return 'text-center'
      case 'right': return 'text-right'
      default: return 'text-left'
    }
  }

  const audit = table.auditResult

  return (
    <div className="my-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/60 shadow-xs max-w-full overflow-hidden">
      {/* Table Toolbar Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-50/90 dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700/80 text-xs">
        {/* Left: Audit Badge & Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          {audit && audit.auditBadge === 'verified' && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
              title={audit.summaryNote || 'Footing and cross-footing verified'}
            >
              <ShieldCheck size={12} className="text-emerald-600 dark:text-emerald-400" />
              <span>Verified Math</span>
            </span>
          )}

          {audit && audit.auditBadge === 'discrepancy' && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              title={audit.summaryNote}
            >
              <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
              <span>Footing Check</span>
            </span>
          )}

          {table.rows.length > 4 && (
            <div className="relative flex-1 max-w-xs">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filter table..."
                className="w-full pl-6 pr-2 py-0.5 text-xs rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          )}
        </div>

        {/* Right: Actions (Copy formats, Generate Cards) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCopy('markdown')}
            className="flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition-colors"
            title="Copy as Markdown Pipe Table"
          >
            {copiedFormat === 'markdown' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
            <span>MD</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopy('csv')}
            className="flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition-colors"
            title="Copy as CSV"
          >
            {copiedFormat === 'csv' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopy('latex')}
            className="flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition-colors"
            title="Copy as LaTeX Booktabs"
          >
            {copiedFormat === 'latex' ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
            <span>LaTeX</span>
          </button>

          <button
            type="button"
            onClick={handleCreateCards}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-950/60 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800 text-[11px] font-semibold text-violet-700 dark:text-violet-300 transition-colors"
            title="Extract high-yield flashcards from this table"
          >
            <Sparkles size={11} className="text-violet-600 dark:text-violet-400" />
            <span>{showCardsFeedback ? 'Copied Cards JSON!' : 'Make Cards'}</span>
          </button>
        </div>
      </div>

      {/* Main Table Scroll Container */}
      <div className="overflow-x-auto max-w-full">
        <table className="w-full text-xs md:text-sm border-collapse min-w-[320px]">
          <thead>
            <tr className="bg-slate-50/60 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              {table.headers.map((h, hi) => {
                const isSorted = sortCol === hi
                return (
                  <th
                    key={hi}
                    onClick={() => handleSort(hi)}
                    className={`px-3.5 py-2.5 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-200/60 dark:border-slate-700/60 last:border-r-0 cursor-pointer select-none hover:bg-slate-100/80 dark:hover:bg-slate-700/50 transition-colors ${getAlignmentClass(table.alignments[hi] || 'left')}`}
                  >
                    <div className={`inline-flex items-center gap-1.5 ${table.alignments[hi] === 'right' ? 'flex-row-reverse' : ''}`}>
                      <span>{renderInlineFormatting(h)}</span>
                      <span className="text-slate-400 dark:text-slate-500">
                        {isSorted ? (
                          sortAsc ? <ArrowUp size={12} className="text-violet-600 dark:text-violet-400" /> : <ArrowDown size={12} className="text-violet-600 dark:text-violet-400" />
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40" />
                        )}
                      </span>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {displayRows.map(({ row, origIndex, depth }, ri) => {
              const isFootingRow = table.footingRowIndex === origIndex || /^(Total|Sum|Grand Total|Net Total)\b/i.test(row[0] || '')
              return (
                <tr
                  key={ri}
                  className={`transition-colors ${
                    isFootingRow
                      ? 'bg-slate-100/70 dark:bg-slate-800/80 font-bold border-t-2 border-slate-300 dark:border-slate-600'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-700/30'
                  }`}
                >
                  {row.map((cell, ci) => {
                    const isFirstCol = ci === 0
                    // Econometric / statistical notation check: standard errors in parentheses e.g. "(0.052)"
                    const isStdError = cell.trim().startsWith('(') && cell.trim().endsWith(')')

                    return (
                      <td
                        key={ci}
                        className={`px-3.5 py-2 text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700/40 last:border-r-0 ${getAlignmentClass(table.alignments[ci] || 'left')} ${
                          isStdError ? 'text-slate-500 dark:text-slate-400 text-[11px] font-mono' : ''
                        }`}
                        style={isFirstCol && depth > 0 ? { paddingLeft: `${14 + depth * 16}px` } : undefined}
                      >
                        {isFirstCol && depth > 0 && (
                          <span className="text-slate-300 dark:text-slate-600 mr-1.5 select-none">└─</span>
                        )}
                        {renderInlineFormatting(cell)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CodeBlock({ language, code }: { language: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 text-slate-100 dark:bg-slate-950 font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50 text-[11px] text-slate-400">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="hover:text-slate-200 text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 hover:bg-slate-700 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderListLines(lines: string[]): React.ReactNode {
  return lines.map((line, li) => {
    const trimmed = line.trim()
    if (!trimmed) return <div key={li} className="h-1" />
    const match = trimmed.match(/^\s*([-*•]|\d+[.)]|\([a-zA-Z0-9]+\))\s+(.*)$/)
    if (match) {
      return (
        <div key={li} className="flex items-start gap-2 ml-2">
          <span className="inline-block text-slate-400 dark:text-slate-500 font-medium shrink-0 select-none">
            {match[1].startsWith('-') || match[1].startsWith('*') ? '•' : match[1]}
          </span>
          <span className="flex-1 min-w-0">{renderInlineFormatting(match[2])}</span>
        </div>
      )
    }
    return <div key={li} className="ml-2">{renderInlineFormatting(trimmed)}</div>
  })
}

/**
 * Splits markdown content into logical blocks while keeping fenced code blocks intact
 * even if they contain multiple internal newlines.
 */
export function splitMarkdownBlocks(content: string): string[] {
  if (!content) return []
  const blocks: string[] = []
  const fenceRegex = /```[\s\S]*?```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fenceRegex.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index)
    if (textBefore.trim()) {
      const subParagraphs = textBefore.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
      blocks.push(...subParagraphs)
    }
    blocks.push(match[0].trim())
    lastIndex = match.index + match[0].length
  }

  const remaining = content.slice(lastIndex)
  if (remaining.trim()) {
    const subParagraphs = remaining.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
    blocks.push(...subParagraphs)
  }

  return blocks
}

/**
 * Comprehensive Markdown Renderer with support for:
 * - Zero-Defect Tabular Systems: Markdown pipe, HTML tables, Markdown-KV, LaTeX tabular/booktabs, CSV
 * - Interactive Vega-Lite scientific & economic graphs
 * - Fenced code blocks with language tags
 * - Block display math ($$...$$, \[...\], \begin{...}...\end{...})
 * - Headings (#, ##, ###, ####)
 * - Blockquotes / Callouts (> text)
 * - Bullet and numbered lists
 * - Paragraphs with bold, italics, code, math
 */
export default function MarkdownRenderer({
  content,
  className = '',
  onGenerateCardsFromTable
}: MarkdownRendererProps): React.JSX.Element {
  if (!content || typeof content !== 'string') {
    return <div className={className} />
  }

  const paragraphs = splitMarkdownBlocks(content)

  return (
    <div className={`text-sm leading-relaxed space-y-2.5 ${className}`}>
      {paragraphs.map((para, pi) => {
        const trimmed = para.trim()
        if (!trimmed) return null

        // 1. Fenced Code Blocks ```lang ... ```
        const codeBlockMatch = trimmed.match(/^```([a-zA-Z0-9_:-]*)\n([\s\S]*?)```$/)
        if (codeBlockMatch) {
          const lang = (codeBlockMatch[1] || '').toLowerCase()
          const code = codeBlockMatch[2].trim()

          // Check if block is a Vega-Lite interactive visualization
          const isVegaLang = ['vega-lite', 'vegalite', 'vega', 'json:vega-lite', 'json:graph'].includes(lang)
          if (isVegaLang || lang === 'json') {
            try {
              const parsed = JSON.parse(code)
              if (
                isVegaLang ||
                (parsed && (parsed.$schema?.includes('vega') || (parsed.mark && (parsed.encoding || parsed.data))))
              ) {
                return <GraphContainer key={pi} spec={parsed} />
              }
            } catch {
              // Not valid JSON, continue to render regular code block
            }
          }

          // Check if code block contains a CSV/TSV table
          if (['csv', 'tsv', 'table'].includes(lang)) {
            const tableParsed = parseUniversalTable(code)
            if (tableParsed) {
              return (
                <MarkdownTable
                  key={pi}
                  table={tableParsed}
                  onGenerateCards={onGenerateCardsFromTable}
                />
              )
            }
          }

          return <CodeBlock key={pi} language={codeBlockMatch[1]} code={code} />
        }

        // 2. Standalone display math block $$...$$ or \[...\] or \begin{matrix}...\end{matrix}
        if (
          (trimmed.startsWith('$$') && trimmed.endsWith('$$')) ||
          (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) ||
          (/^\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix|align|equation|gather)\*?\}[\s\S]*\\end\{(?:matrix|pmatrix|bmatrix|vmatrix|align|equation|gather)\*?\}$/.test(trimmed))
        ) {
          return <LatexText key={pi} className="my-2 block">{trimmed}</LatexText>
        }

        // 3. Universal Table (Markdown pipe table, HTML <table>, Markdown-KV, LaTeX \begin{tabular})
        const universalTable = parseUniversalTable(para)
        if (universalTable) {
          return (
            <MarkdownTable
              key={pi}
              table={universalTable}
              onGenerateCards={onGenerateCardsFromTable}
            />
          )
        }

        // 4. Headings
        const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
        if (headingMatch) {
          const level = headingMatch[1].length
          const headingText = headingMatch[2]
          if (level === 1) {
            return <h1 key={pi} className="text-base font-bold text-slate-900 dark:text-slate-100 mt-3 mb-1">{renderInlineFormatting(headingText)}</h1>
          } else if (level === 2) {
            return <h2 key={pi} className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2.5 mb-1">{renderInlineFormatting(headingText)}</h2>
          } else if (level === 3) {
            return <h3 key={pi} className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-2 mb-0.5 uppercase tracking-wide">{renderInlineFormatting(headingText)}</h3>
          } else {
            return <h4 key={pi} className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1.5 mb-0.5">{renderInlineFormatting(headingText)}</h4>
          }
        }

        // 5. Blockquote / Callout (> quote)
        if (trimmed.startsWith('>')) {
          const quoteLines = trimmed.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n')
          return (
            <blockquote key={pi} className="border-l-2 border-violet-500 pl-3 py-1 my-2 text-slate-600 dark:text-slate-400 italic bg-violet-50/30 dark:bg-violet-950/20 rounded-r-lg text-xs">
              {renderInlineFormatting(quoteLines)}
            </blockquote>
          )
        }

        // 6. Lists (- , *, •, 1. , (a) )
        const lines = para.split('\n')
        const isList = lines.some(l => /^\s*([-*•]|\d+[.)]|\([a-zA-Z0-9]+\))\s/.test(l))
        if (isList) {
          return (
            <div key={pi} className="space-y-1 my-1">
              {renderListLines(lines)}
            </div>
          )
        }

        // 7. Regular paragraph
        return (
          <p key={pi} className="leading-relaxed">
            {renderInlineFormatting(para)}
          </p>
        )
      })}
    </div>
  )
}
