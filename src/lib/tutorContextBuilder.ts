import type {
  EvidenceRef,
  MemoryRef,
  TutorContextInput,
  TutorContextResult,
  TutorMessage
} from '../types'

const DEFAULT_MAX_TOKENS = 24000
const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / CHARS_PER_TOKEN))
}

function takeWithinBudget(items: string[], budget: number): { text: string; used: number; truncated: boolean } {
  const selected: string[] = []
  let used = 0
  for (const item of items) {
    const next = estimateTokens(item)
    if (used + next > budget) {
      if (selected.length === 0 && budget > 0) {
        selected.push(`${item.slice(0, budget * CHARS_PER_TOKEN)}\n[…truncated to fit context budget…]`)
        used = budget
      }
      return { text: selected.join('\n\n'), used, truncated: true }
    }
    selected.push(item)
    used += next
  }
  return { text: selected.join('\n\n'), used, truncated: selected.length < items.length }
}

export function formatEvidence(evidence: EvidenceRef[]): string[] {
  return evidence.map(item => [
    `[SOURCE ${item.materialId}:${item.chunkIndex}] ${item.sourceLabel}`,
    item.text?.trim() || '(source text unavailable)'
  ].join('\n'))
}

export function formatMemories(memories: MemoryRef[]): string[] {
  return memories.map(memory => {
    const confidence = Math.round(Math.max(0, Math.min(1, memory.confidence)) * 100)
    return `[MEMORY ${memory.memoryType}:${memory.memoryKey} · confidence ${confidence}% · ${memory.status}] ${JSON.stringify(memory.value)}`
  })
}

export function buildTutorContext(input: TutorContextInput, maxTokens = DEFAULT_MAX_TOKENS): TutorContextResult {
  const systemInstruction = input.systemInstruction?.trim() || 'You are a helpful, evidence-grounded tutor.'
  const history = input.history || []
  const evidence = input.evidence || []
  const memories = input.memories || []
  const truncatedSections: string[] = []

  // Reserve space for the current question and keep the prompt predictable.
  const questionTokens = estimateTokens(input.query)
  const systemBudget = Math.min(7000, Math.max(1000, Math.floor(maxTokens * 0.32)))
  const historyBudget = Math.min(6000, Math.max(1000, Math.floor(maxTokens * 0.25)))
  const memoryBudget = Math.min(3000, Math.max(500, Math.floor(maxTokens * 0.12)))
  const evidenceBudget = Math.max(3000, maxTokens - systemBudget - historyBudget - memoryBudget - questionTokens - 100)

  const system = takeWithinBudget([systemInstruction], systemBudget)
  if (system.truncated) truncatedSections.push('system')

  const recentHistory: TutorMessage[] = []
  let historyTokens = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]
    const cost = estimateTokens(message.content) + 4
    if (historyTokens + cost > historyBudget) break
    recentHistory.unshift(message)
    historyTokens += cost
  }
  if (recentHistory.length < history.length) truncatedSections.push('history')

  const memory = takeWithinBudget(formatMemories(memories), memoryBudget)
  if (memory.truncated) truncatedSections.push('memory')
  const source = takeWithinBudget(formatEvidence(evidence), evidenceBudget)
  if (source.truncated) truncatedSections.push('evidence')

  const messages: TutorMessage[] = [{ role: 'system', content: [
    system.text,
    memory.text ? `\nRELEVANT LEARNER MEMORY (use only as probabilistic context):\n${memory.text}` : '',
    source.text ? `\nVERIFIED SOURCE EVIDENCE:\n${source.text}` : '',
    source.text ? '\nCITATION RULE: Cite supported source claims internally as [SOURCE material:chunk]. If the evidence is insufficient, say so.' : ''
  ].filter(Boolean).join('\n') }]
  messages.push(...recentHistory)
  messages.push({ role: 'user', content: input.query })

  const usedTokens = estimateTokens(messages.map(message => message.content).join('\n'))
  return {
    messages,
    evidence,
    memories,
    budget: {
      maxTokens,
      usedTokens,
      evidenceTokens: source.used,
      memoryTokens: memory.used,
      historyTokens,
      truncatedSections
    }
  }
}
