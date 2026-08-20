export function evaluateSemantically(
  studentAnswer: string,
  modelAnswer: string,
  keyConcepts?: string[]
): { correct: boolean; score: number; feedback: string } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const student = norm(studentAnswer)
  const model = norm(modelAnswer)

  if (!student) return { correct: false, score: 0, feedback: 'No answer provided.' }

  const score = computeWordOverlap(student, model)
  const concepts = keyConcepts || extractKeyConcepts(modelAnswer)
  const conceptsMatched = concepts.filter((c: string) => student.includes(c.toLowerCase()))

  const conceptScore = concepts.length > 0 ? conceptsMatched.length / concepts.length : 0
  const combined = score * 0.6 + conceptScore * 0.4

  let feedback = ''
  if (combined >= 0.75) {
    feedback = 'Great answer! You covered the key concepts well.'
  } else if (combined >= 0.5) {
    const missing = concepts.filter((c: string) => !student.includes(c.toLowerCase()))
    feedback = `Good start! Consider covering: ${missing.slice(0, 3).join(', ')}.`
  } else {
    feedback = `Your answer needs more detail. Key points to include: ${concepts.slice(0, 3).join(', ')}.`
  }

  return {
    correct: combined >= 0.6,
    score: Math.round(combined * 100) / 100,
    feedback,
  }
}

export function computeWordOverlap(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 2))
  const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 2))
  if (words1.size === 0 || words2.size === 0) return 0
  let intersection = 0
  for (const w of words1) if (words2.has(w)) intersection++
  return intersection / Math.max(words1.size, words2.size)
}

export function extractKeyConcepts(text: string): string[] {
  const matches = text.match(/[A-Z][a-z]+\b|\b[a-z]{4,}\b|"[^"]+"/g) || []
  return [...new Set(matches.map((w: string) => w.toLowerCase().replace(/"/g, '')))].slice(0, 10)
}
