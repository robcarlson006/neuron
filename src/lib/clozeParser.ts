export interface ParsedCloze {
  ordinal: number
  answer: string
}

export interface ClozeParsedResult {
  segments: Array<{ type: 'text' | 'cloze'; content: string; ordinal?: number; answer?: string }>
  clozes: ParsedCloze[]
}

export function parseClozeText(text: string): ClozeParsedResult {
  const regex = /\{\{c(\d+)::([^}]+)\}\}/g
  const segments: ClozeParsedResult['segments'] = []
  const clozes: ParsedCloze[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    const ordinal = parseInt(match[1], 10)
    const answer = match[2].trim()
    clozes.push({ ordinal, answer })
    segments.push({ type: 'cloze', content: answer, ordinal, answer: answer })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return { segments, clozes }
}

export function renderClozeHtml(text: string, revealed: Set<number>): string {
  const { segments } = parseClozeText(text)
  return segments
    .map((seg) => {
      if (seg.type === 'text') return escHtml(seg.content)
      if (seg.type === 'cloze' && seg.ordinal != null) {
        if (revealed.has(seg.ordinal)) {
          return `<span class="text-green-400 font-semibold">${escHtml(seg.answer || '')}</span>`
        }
        return `<span class="cloze-blank inline-block min-w-[60px] border-b-2 border-dashed border-purple-400 px-2 py-1 text-purple-300 cursor-pointer">[...]</span>`
      }
      return ''
    })
    .join('')
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
