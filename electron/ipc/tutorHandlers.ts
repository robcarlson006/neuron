import { ipcMain, BrowserWindow, dialog } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import fs from 'fs'
import { streamAI, callAIMessages } from './aiHandlers'
import { getApiKey, getAIConfig } from './aiConfigStore'
import { bktUpdate } from '../../src/lib/bkt'
import type { TutorSession, TutorStreamParams, PacingStatus } from '../../src/types'
import type { SyllabusModule, ModuleTopic } from '../../src/types'

let db: Database.Database

export function setTutorDatabase(database: Database.Database): void {
  db = database
}

/**
 * Ensure a matching conversations record exists for FK compatibility.
 * The `messages` table's FK refers to `conversations(id)`, but tutor
 * sessions store their messages under `tutor_sessions.id`.  This helper
 * creates a stub conversations row so inserts into `messages` don't fail.
 */
function ensureConversationRecord(sessionId: number): void {
  try {
    const exists = db.prepare('SELECT id FROM conversations WHERE id = ?').get(sessionId)
    if (exists) return
    const row = db
      .prepare('SELECT subject_id, user_id FROM tutor_sessions WHERE id = ?')
      .get(sessionId) as { subject_id: number | null; user_id: number | null } | undefined
    if (!row) return

    let subjectId = row.subject_id
    // General-chat sessions have subject_id = null — use the user's first subject
    if (!subjectId && row.user_id) {
      const first = db
        .prepare('SELECT id FROM subjects WHERE user_id = ? LIMIT 1')
        .get(row.user_id) as { id: number } | undefined
      if (first) subjectId = first.id
    }

    if (subjectId) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT OR IGNORE INTO conversations (id, subject_id, title, model, created_at, updated_at)
        VALUES (?, ?, 'Tutor Session', 'deepseek-chat', ?, ?)
      `).run(sessionId, subjectId, now, now)
    }
  } catch {
    // FK constraint may not be active on existing databases — no-op is fine
  }
}

// ── Time context builder ─────────────────────────────────────────────────

function buildTimeContext(params: {
  durationMinutes: number | null
  timeElapsedSeconds?: number
  timeRemainingSeconds?: number
  pacingStatus?: PacingStatus
  depthLevel?: number
}): string {
  if (params.durationMinutes === null) return ''

  const elapsed = Math.floor((params.timeElapsedSeconds ?? 0) / 60)
  const remaining = Math.floor((params.timeRemainingSeconds ?? params.durationMinutes * 60) / 60)
  const total = params.durationMinutes
  const status = params.pacingStatus ?? 'ON_TRACK'
  const depthNames: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Proficient', 4: 'Expert', 5: 'Professor' }
  const diffLabel = depthNames[params.depthLevel ?? 3] || 'Proficient'

  return [
    '',
    'SESSION TIME CONTEXT:',
    `- Total session duration: ${total} minutes`,
    `- Difficulty: ${diffLabel}`,
    `- Time elapsed: ~${elapsed} minutes`,
    `- Time remaining: ~${remaining} minutes`,
    `- Pacing status: ${status}`,
    '',
    'PACING RULES:',
    `- Use the time proportionally at ${diffLabel} difficulty: more time = more angles of approach on each topic.`,
    '- If AHEAD OF PACE: Use extra time to revisit covered topics from new angles. Ask harder follow-ups.',
    '- If BEHIND: Focus on core topics. Keep explanations tight but do NOT wrap up early.',
    '- If ON_TRACK: Alternate between new topics and deeper dives on current topics.',
    '- Do NOT introduce completely new topics in the final minute — deepen the current topic instead.',
    '- When time runs out, finish your current thought and include [SESSION_END] in your response.',
    '- CRITICAL: Keep generating questions and challenges as long as time remains. Do not let the session go silent.',
    ''
  ].join('\n')
}

// ── Depth / beginner instruction builder ────────────────────────────────

function buildDepthInstruction(
  depthLevel: 1 | 2 | 3 | 4 | 5,
  neverStudied: boolean,
  durationMinutes?: number | null
): string {
  const depthNames: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Proficient', 4: 'Expert', 5: 'Professor' }
  const instructions: Record<number, string> = {
    1: 'Explain each concept like the student has never encountered it. Use everyday analogies. Ask basic recall and comprehension questions. After each correct answer, add one small layer of complexity. If you have TIME available, cover more topics rather than going deeper on any single one. Keep the pace moving — introduce new subtopics regularly.',
    2: 'Provide guided walkthroughs. Expect basic familiarity with terminology after 2-3 rounds. Ask comprehension and simple application questions. Use remaining time to introduce related topics and show how concepts connect.',
    3: 'Build solid understanding with mechanisms and processes. Ask application and analysis questions. After the student demonstrates understanding of a topic, pivot to a new angle or related subtopic. Use time to diversify coverage at moderate depth — alternate between new content and deeper exploration.',
    4: 'Push hard. Ask "why" and "how" questions that require synthesis. Challenge with edge cases, counterexamples, and cross-topic connections. When you\'ve exhausted one angle on a topic, approach it from a completely different perspective — historical context, practical application, theoretical foundation, or opposing viewpoint.',
    5: 'Maximum depth. Require teach-back — ask the student to explain concepts as if teaching someone else. Probe with novel scenarios they haven\'t seen before. When the student masters one angle, immediately pivot to another: challenge assumptions, present edge cases, connect to adjacent fields. Exhaust every possible lens on the topic. Keep going until time runs out.'
  }

  const diffLabel = depthNames[depthLevel] || 'Proficient'
  let block = `\nDIFFICULTY LEVEL: ${depthLevel} (${diffLabel})\n${instructions[depthLevel] ?? instructions[3]}\n`

  // Add combined TIME × DIFFICULTY strategy when duration is set
  if (durationMinutes && durationMinutes > 0) {
    block += [
      '',
      `TIME × DIFFICULTY STRATEGY (${durationMinutes} min at ${diffLabel} level):`,
      `- Phase 1 (first ~25%, ~${Math.round(durationMinutes * 0.25)} min): Establish baseline understanding of core topics.`,
      `- Phase 2 (middle ~50%, ~${Math.round(durationMinutes * 0.5)} min): Iterate through approaches — explain, question, apply, connect, challenge.`,
      depthLevel >= 4
        ? '  After each correct answer, pivot to a NEW ANGLE on the same topic. Keep approaching from different perspectives.'
        : depthLevel <= 2
          ? '  After each correct answer, introduce a new topic or subtopic. Keep the breadth covering.'
          : '  After each correct answer, either go deeper OR introduce a related subtopic. Keep the momentum.',
      `- Phase 3 (final ~25%, ~${Math.round(durationMinutes * 0.25)} min): Synthesize. Ask integrative questions across topics covered.`,
      '- CRITICAL: Never let the session go silent. Keep generating questions, scenarios, and challenges until [SESSION_END].',
      '- When time is running low (under 3 min), begin wrapping up and include [SESSION_END] in your final response.',
      ''
    ].join('\n')
  }

  if (neverStudied) {
    block += [
      '',
      'BEGINNER MODE — STUDENT HAS NEVER STUDIED THIS',
      '',
      'RULES:',
      '1. NEVER assume prior knowledge. Define every term the first time you use it.',
      '2. For each topic, follow this EXPLAIN -> QUESTION -> VERIFY -> DEEPEN loop:',
      '   a) SEED: Explain the core concept in simple terms (one idea at a time). Use analogies and metaphors from everyday life.',
      '   b) CHECK: Ask ONE basic comprehension question about what you just explained.',
      '   c) VERIFY: Evaluate their answer. If wrong, explain DIFFERENTLY (don\'t repeat yourself).',
      '   d) DEEPEN: Add one layer of complexity, then ask a slightly harder question.',
      '   e) LOOP: Repeat until the user demonstrates solid understanding (3+ correct answers on this topic).',
      '3. Never introduce more than ONE new concept per interaction cycle.',
      '4. If they answer incorrectly: use a different analogy or approach — never just repeat the same explanation.',
      '5. Mark topics as covered by including [TOPIC: Topic Name] in your response.',
      ''
    ].join('\n')
  }

  return block
}

// ── Memory block builder (anti-repetition) ──────────────────────────────

function buildMemoryBlock(params: {
  topicsCovered?: string[]
  questionsAsked?: string[]
  topicsMastered?: string[]
  weakTopicsConcerns?: string[]
}): string {
  if (!params.topicsCovered?.length && !params.questionsAsked?.length) return ''

  const parts: string[] = []

  if (params.topicsCovered?.length) {
    parts.push(`Topics covered so far: ${params.topicsCovered.join(', ')}`)
  }
  if (params.questionsAsked?.length) {
    parts.push(`Questions already asked: ${params.questionsAsked.slice(-15).map(q => `"${q}"`).join(', ')}`)
  }
  if (params.topicsMastered?.length) {
    parts.push(`Topics user has mastered: ${params.topicsMastered.join(', ')} — don't re-ask basics, ask deeper application`)
  }
  if (params.weakTopicsConcerns?.length) {
    parts.push(`Areas user struggles with: ${params.weakTopicsConcerns.join(', ')} — spend more time here`)
  }

  if (!parts.length) return ''

  return [
    '',
    'SESSION MEMORY:',
    ...parts,
    '',
    'RULES:',
    '- NEVER repeat a question from QUESTIONS_ASKED.',
    '- NEVER re-explain a mastered topic at the same level — ask deeper application instead.',
    '- Focus on weak areas where possible.',
    '- Include [TOPIC: Topic Name] in your response so the system knows which topic you\'re covering.',
    ''
  ].join('\n')
}

// ── Response post-processing (fix garbled text) ──────────────────────────

function cleanupAIResponse(text: string): string {
  let cleaned = text
  // 1. Remove duplicate consecutive words ("WelcomeWelcome!" → "Welcome!")
  cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1')
  // 2. Fix missing space after punctuation marks before a capital letter
  cleaned = cleaned.replace(/([.!?])([A-Z])/g, '$1 $2')
  // 3. Normalize multiple spaces to single space
  cleaned = cleaned.replace(/\s{2,}/g, ' ')
  // 4. Fix whitespace around punctuation (remove space before period/comma)
  cleaned = cleaned.replace(/\s+([.,!?:;])/g, '$1')
  // 5. Fix asterisk in middle of words ("word*word" → "word *word")
  cleaned = cleaned.replace(/(\w)\*(\w)/g, '$1 *$2')
  // 6. Trim leading/trailing whitespace
  cleaned = cleaned.trim()

  // Quality gate: log warning if response still looks bad
  if (cleaned) {
    const duplicateCount = (cleaned.match(/\b(\w+)\s+\1\b/gi) || []).length
    const words = cleaned.split(/\s+/)
    const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / words.length
    if (duplicateCount > 2 || avgWordLen > 12) {
      console.warn(`[tutor] AI response quality warning: ${duplicateCount} dupes, avg word len ${avgWordLen.toFixed(1)}`)
    }
  }

  return cleaned
}

// ── Register all handlers ───────────────────────────────────────────────

export function registerTutorHandlers(): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // TUTOR SESSION CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tutor:createSession', (_event, subjectId: number, userId: number, sessionType?: string, moduleId?: number, config?: { duration_minutes: number | null; depth_level: number; never_studied: number | boolean }) => {
    const now = new Date().toISOString()
    // Use null for subject when 0 (general chat) — FK allows null
    const actualSubjectId = subjectId > 0 ? subjectId : null
    const actualUserId = userId > 0 ? userId : null
    const neverStudiedVal = config?.never_studied ? 1 : 0
    const result = db.prepare(`
      INSERT INTO tutor_sessions (subject_id, user_id, session_type, phase, module_id, started_at, duration_minutes, depth_level, never_studied)
      VALUES (?, ?, ?, 'structured_qa', ?, ?, ?, ?, ?)
    `).run(
      actualSubjectId,
      actualUserId,
      sessionType || 'tutor',
      moduleId || null,
      now,
      config?.duration_minutes ?? null,
      config?.depth_level ?? 3,
      neverStudiedVal
    )
    return db.prepare('SELECT * FROM tutor_sessions WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('tutor:getSession', (_event, sessionId: number) => {
    const session = db.prepare('SELECT * FROM tutor_sessions WHERE id = ?').get(sessionId) as TutorSession | undefined
    if (!session) return null

    const messages = db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
    `).all(sessionId) as {
      id: string
      conversation_id: number
      role: 'user' | 'assistant' | 'system'
      content: string
      content_type: string
      metadata?: string
      created_at: string
    }[]

    return { session, messages }
  })

  ipcMain.handle('tutor:listSessions', (_event, subjectId: number, limit: number = 20) => {
    return db.prepare(`
      SELECT * FROM tutor_sessions WHERE subject_id = ? ORDER BY started_at DESC LIMIT ?
    `).all(subjectId, limit)
  })

  ipcMain.handle('tutor:updateSessionPhase', (_event, sessionId: number, phase: string) => {
    db.prepare('UPDATE tutor_sessions SET phase = ? WHERE id = ?').run(phase, sessionId)
    return { success: true }
  })

  ipcMain.handle('tutor:endSession', (_event, sessionId: number, summary?: string) => {
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE tutor_sessions SET phase = 'complete', summary = ?, ended_at = ? WHERE id = ?
    `).run(summary || null, now, sessionId)
    return { success: true }
  })

  ipcMain.handle('tutor:deleteSession', (_event, sessionId: number) => {
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(sessionId)
    db.prepare('DELETE FROM tutor_sessions WHERE id = ?').run(sessionId)
    return { success: true }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // TUTOR MESSAGES
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tutor:saveMessage', (_event, params: {
    session_id: number
    role: 'user' | 'assistant' | 'system'
    content: string
    content_type?: string
  }) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // Ensure a conversations record exists so the FK on messages is satisfied
    ensureConversationRecord(params.session_id)

    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, content_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, params.session_id, params.role, params.content, params.content_type || 'text', now)

    // Update session timestamp
    db.prepare('UPDATE tutor_sessions SET ended_at = ? WHERE id = ?').run(now, params.session_id)

    return {
      id,
      conversation_id: params.session_id,
      role: params.role,
      content: params.content,
      content_type: params.content_type || 'text',
      created_at: now
    }
  })

  ipcMain.handle('tutor:getMessageHistory', (_event, sessionId: number, limit: number = 50) => {
    return db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?
    `).all(sessionId, limit)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // TUTOR CARD GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tutor:generateCards', async (_event, sessionId: number, subjectId: number, sessionContent: string) => {
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId) as { name: string } | undefined
    const subjectName = subject?.name || 'the subject'

    // Get the current session for context
    const session = db.prepare('SELECT * FROM tutor_sessions WHERE id = ?').get(sessionId) as TutorSession | undefined

    // Get module info if available
    let moduleContext = ''
    if (session?.module_id) {
      const mod = db.prepare('SELECT * FROM syllabus_modules WHERE id = ?').get(session.module_id) as SyllabusModule | undefined
      if (mod) moduleContext = `\nModule context: ${mod.title}\n`
    }

    // Get existing cards to avoid duplicates
    const existingCards = db.prepare(
      'SELECT front, back FROM cards WHERE subject_id = ?'
    ).all(subjectId) as { front: string; back: string }[]

    const existingCardHints = existingCards.length > 0
      ? `\nExisting cards you MUST NOT duplicate (avoid similar front/back):\n${existingCards.slice(0, 20).map(c => `- "${c.front}" -> "${c.back.substring(0, 60)}"`).join('\n')}`
      : ''

    const prompt = `You are an expert educator creating study cards from a tutoring session about "${subjectName}".${moduleContext}

SESSION CONTENT:
${sessionContent.substring(0, 6000)}

Create a MIX of flashcards (term -> definition) and active recall questions (question -> detailed answer) based on what was covered.

IMPORTANT: Cover BOTH concepts the student understood well AND areas they struggled with. Strong topics need maintenance cards too.${existingCardHints}

Generate 6-10 cards total. Format them as a numbered list using this exact format:

**1. [Term or Question]** -> [Definition or Answer]
**2. [Term or Question]** -> [Definition or Answer]

Rules:
- Use **bold** for the front of the card
- Use -> (arrow) to separate front from back
- Make backs thorough enough for self-evaluation (2-4 sentences for recall questions)
- For mathematical expressions, wrap in $$...$$
- For mathematical expressions, use proper LaTeX in $...$ or $$...$$ format (e.g. $E = mc^2$, not E = mc^2)
- Prioritize conceptual understanding over trivia
- Return ONLY the card list. No introduction, commentary, or closing.`

    const config = getAIConfig()
    const apiKey = getApiKey()
    if (!apiKey) throw new Error('AI API key not configured. Go to Settings to configure your AI provider.')

    const responseText = await callAIMessages(
      [{ role: 'user', content: prompt }],
      { ...config, apiKey }
    )

    // Update cards_generated count
    db.prepare('UPDATE tutor_sessions SET cards_generated = cards_generated + 1 WHERE id = ?').run(sessionId)

    return responseText
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DUPLICATE CHECKING
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tutor:checkDuplicates', (_event, subjectId: number, cards: { front: string; back: string }[]) => {
    return cards.map(card => {
      const existing = db.prepare(
        'SELECT id FROM cards WHERE subject_id = ? AND (front = ? OR back = ?) LIMIT 1'
      ).get(subjectId, card.front, card.back) as { id: number } | undefined
      return { isDuplicate: !!existing }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MASTERY UPDATE (Knowledge Tracing)
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tutor:updateMastery', (_event, userId: number, subjectId: number, topic: string, score: number) => {
    const wasCorrect = score >= 3

    const existing = db.prepare(
      'SELECT * FROM concept_mastery WHERE user_id = ? AND subject_id = ? AND concept = ?'
    ).get(userId, subjectId, topic) as { mastery_prob: number; observations: number } | undefined

    const priorProb = existing?.mastery_prob ?? 0.3
    const newProb = bktUpdate(priorProb, wasCorrect)

    if (existing) {
      db.prepare(`
        UPDATE concept_mastery SET mastery_prob = ?, observations = observations + 1, updated_at = ?
        WHERE user_id = ? AND subject_id = ? AND concept = ?
      `).run(newProb, new Date().toISOString(), userId, subjectId, topic)
    } else {
      db.prepare(`
        INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob, observations, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(userId, subjectId, topic, newProb, new Date().toISOString())
    }

    return { mastery_prob: newProb }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING TUTOR CHAT
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tutor:streamTutorChat', async (_event, params: TutorStreamParams) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No window available')

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(params.subjectId) as { name: string } | undefined
    const className = subject?.name || 'a subject'

    // Build syllabus context
    let syllabusContext = ''
    if (params.moduleContext) {
      const ctx = params.moduleContext
      syllabusContext = `\nCurrent module: ${ctx.moduleTitle || 'Unknown'}\nCurrent topic: ${ctx.currentTopic || 'Various'}`
      if (ctx.masteredTopics?.length) {
        syllabusContext += `\nStudent has MASTERED: ${ctx.masteredTopics.join(', ')}`
      }
      if (ctx.weakTopics?.length) {
        syllabusContext += `\nStudent still needs practice with: ${ctx.weakTopics.join(', ')}`
      }
      if (ctx.masteredTopics?.length || ctx.weakTopics?.length) {
        syllabusContext += `\nIMPORTANT: Cover BOTH mastered and weak topics in your questions. Mastered topics need spaced maintenance.`
      }
    }

    // Detect first turn — skip noisy context blocks that have no useful info yet
    const isFirstTurn = !params.conversationHistory?.length

    // Build time context (skip on first turn — all defaults, purely noise)
    const timeContext = !isFirstTurn ? buildTimeContext({
      durationMinutes: params.durationMinutes ?? null,
      timeElapsedSeconds: params.timeElapsedSeconds,
      timeRemainingSeconds: params.timeRemainingSeconds,
      pacingStatus: params.pacingStatus,
      depthLevel: params.depthLevel
    }) : ''

    // Build depth/beginner instruction
    const depthBlock = buildDepthInstruction(
      params.depthLevel ?? 3,
      params.neverStudied ?? false,
      params.durationMinutes
    )

    // Build anti-repeat memory block (skip on first turn — nothing to repeat yet)
    const memoryBlock = !isFirstTurn ? buildMemoryBlock({
      topicsCovered: params.topicsCovered,
      questionsAsked: params.questionsAsked,
      topicsMastered: params.topicsMastered,
      weakTopicsConcerns: params.weakTopicsConcerns
    }) : ''

    // Append all context blocks to syllabusContext
    syllabusContext += '\n' + timeContext + '\n' + depthBlock + '\n' + memoryBlock

    // Save session config to database if provided
    if (params.durationMinutes !== undefined || params.depthLevel !== undefined || params.neverStudied !== undefined) {
      try {
        db.prepare(`
          UPDATE tutor_sessions SET
            duration_minutes = COALESCE(?, duration_minutes),
            depth_level = COALESCE(?, depth_level),
            never_studied = COALESCE(?, never_studied)
          WHERE id = ?
        `).run(
          params.durationMinutes ?? null,
          params.depthLevel ?? null,
          params.neverStudied ? 1 : 0,
          params.sessionId
        )
      } catch { /* non-critical — config already saved on create */ }
    }

    // Build phase-specific system prompt
    const phaseInstructions: Record<string, string> = {
      structured_qa: `You are a rigorous university tutor teaching "${className}".

FIRST MESSAGE — Your opening response MUST follow this exact format:
Sentence 1: "Welcome! Let's dive into [topic]."
Sentence 2: A specific question about [topic].
Example: "Welcome! Let's explore the Prologue of The Alchemist. What lesson does the narrator draw from the myth of Narcissus and the lake?"

PEDAGOGICAL RULES:
1. Ask ONE question at a time — start with recall, progress to comprehension, then application
2. After the student answers, give brief corrective feedback (what they got right, what they missed)
3. If correct: increase difficulty or move to next concept. If wrong: explain simply, then ask a gentler follow-up
4. Use questions that require genuine thinking — not just yes/no
5. Suggest the deep dive phase when the student has demonstrated solid understanding across 3+ concepts
6. Keep responses conversational but structured. Use bullet points for feedback when helpful.
7. When time is up, include [SESSION_END] in your final response.
8. For formulas: wrap inline math in $...$ (e.g. $E = mc^2$) and standalone equations in $$...$$. Use proper LaTeX, never ^ for exponents.${syllabusContext}`,

      socratic: `You are now in the SOCRATIC DEEP DIVE phase for "${className}".

PEDAGOGICAL METHOD — Socratic Deep Dive:
1. Ask "why" and "how" questions that probe deeper understanding
2. Challenge the student to explain concepts in their own words as if teaching a beginner
3. Ask them to apply concepts to novel scenarios they haven't seen before
4. Ask them to connect this topic to previously covered material
5. Present a claim (sometimes incorrect) and ask them to evaluate it
6. When they struggle, scaffold: break the question down, don't give the answer
7. When instructed that time is up, include [SESSION_END] in your final response.
8. When explaining formulas or equations, wrap inline math in $...$ (e.g. $E = mc^2$) and standalone equations in $$...$$. Never use ^ for exponents — use proper LaTeX notation like $x^2$ or $x^{n+1}$.

Your goal: push beyond surface understanding. If the student can explain it simply, connect it across topics, and apply it to new situations — they've truly mastered it.${syllabusContext}`,

      summary: `You are wrapping up a tutoring session for "${className}".

PEDAGOGICAL METHOD — Session Summary Phase:
1. Summarize the key concepts that were covered
2. Identify what the student understood well (be specific)
3. Identify areas that still need work (be specific and constructive)
4. Generate 5-7 study cards in this format (one per line):
   **[Term or Question]** -> [Answer or Definition]
5. Mix flashcards AND active recall questions
6. Cover BOTH strong and weak areas (strong needs maintenance too!)
7. End with a clear recommendation for what to study next${syllabusContext}
8. When showing formulas or equations, wrap inline math in $...$ (e.g. $E = mc^2$) and standalone equations in $$...$$. Never use ^ for exponents.`
    }

    const systemInstruction = phaseInstructions[params.phase] ||
      `You are a helpful AI tutor for "${className}". Answer questions and help the student learn.${syllabusContext}`

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemInstruction }
    ]

    // Add conversation history (last 30 messages)
    const history = params.conversationHistory?.slice(-30) || []
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content })
    }

    // Add attached content if present
    let userMessage = params.message
    if (params.attachedContent) {
      userMessage = `[The student attached study material for context]\n\n${params.attachedContent.substring(0, 8000)}\n\n---\n\n${userMessage}`
    }
    messages.push({ role: 'user', content: userMessage })

    try {
      const abortController = new AbortController()
      let fullResponse = ''

      const config = getAIConfig()
      const apiKey = getApiKey()
      if (!apiKey) throw new Error('AI API key not configured')

      for await (const chunk of streamAI(messages, { ...config, apiKey }, abortController.signal)) {
        fullResponse += chunk
        win.webContents.send('tutor:chunk', {
          conversationId: params.sessionId,
          content: chunk,
          type: 'text'
        })
      }

      // Apply post-processing cleanup to fix garbled text
      fullResponse = cleanupAIResponse(fullResponse)

      win.webContents.send('tutor:chunk', {
        conversationId: params.sessionId,
        content: fullResponse,
        type: 'done'
      })

      return { success: true, fullResponse }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      win.webContents.send('tutor:chunk', {
        conversationId: params.sessionId,
        content: errMsg,
        type: 'error'
      })
      throw error
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('plan:getDailyPlan', (_event, userId: number, date?: string) => {
    const planDate = date || new Date().toISOString().split('T')[0]
    return db.prepare(`
      SELECT p.*, s.name as subject_name
      FROM daily_plans p
      JOIN subjects s ON s.id = p.subject_id
      WHERE p.user_id = ? AND p.plan_date = ?
      ORDER BY p.priority DESC, p.estimated_minutes DESC
    `).all(userId, planDate)
  })

  // Alias for plan:getPlan -> plan:getDailyPlan
  ipcMain.handle('plan:getPlan', (_event, userId: number, date: string) => {
    const planDate = date || new Date().toISOString().split('T')[0]
    return db.prepare(`
      SELECT p.*, s.name as subject_name
      FROM daily_plans p
      JOIN subjects s ON s.id = p.subject_id
      WHERE p.user_id = ? AND p.plan_date = ?
      ORDER BY p.priority DESC, p.estimated_minutes DESC
    `).all(userId, planDate)
  })

  ipcMain.handle('plan:generatePlan', async (_event, userId: number, date: string) => {
    // Clear existing plans for this date
    db.prepare('DELETE FROM daily_plans WHERE user_id = ? AND plan_date = ?').run(userId, date)

    // Collect all active subjects with syllabus data
    const subjects = db.prepare(
      "SELECT id, name, course_code, time_commitment_minutes FROM subjects WHERE user_id = ? AND status != 'archived'"
    ).all(userId) as { id: number; name: string; course_code?: string; time_commitment_minutes: number }[]

    if (subjects.length === 0) {
      return []
    }

    const subjectContexts: string[] = []

    for (const subject of subjects) {
      const modules = db.prepare(`
        SELECT * FROM syllabus_modules WHERE subject_id = ? ORDER BY sort_order ASC
      `).all(subject.id) as SyllabusModule[]

      const deadlines = db.prepare(`
        SELECT label, deadline_date FROM deadlines WHERE subject_id = ? ORDER BY deadline_date ASC
      `).all(subject.id) as { label: string; deadline_date: string }[]

      // Get due card count for this subject
      const dueCards = db.prepare(`
        SELECT COUNT(*) as count FROM card_schedule cs
        JOIN cards c ON c.id = cs.card_id
        WHERE cs.user_id = ? AND c.subject_id = ? AND cs.due_date <= ?
      `).get(userId, subject.id, date) as { count: number }

      // Get current in-progress module
      const currentModule = modules.find(m => m.status === 'in_progress')
      const nextModule = modules.find(m => m.status === 'pending')

      const parts = [`- ${subject.name}${subject.course_code ? ` (${subject.course_code})` : ''}`]
      if (currentModule) {
        parts.push(`  Currently working on: ${currentModule.title} (Week ${currentModule.week_number || '?'})`)
      } else if (nextModule) {
        parts.push(`  Next up: ${nextModule.title} (Week ${nextModule.week_number || '?'})`)
      }
      parts.push(`  ${modules.filter(m => m.status === 'completed').length}/${modules.length} modules completed`)
      parts.push(`  ${dueCards.count} cards due for review today`)
      parts.push(`  Weekly time budget: ${Math.max(1, Math.round((subject.time_commitment_minutes || 60) / 60))}h`)

      if (deadlines.length > 0) {
        parts.push(`  Deadlines: ${deadlines.map(d => `${d.label} (${d.deadline_date})`).join(', ')}`)
      }

      subjectContexts.push(parts.join('\n'))
    }

    const prompt = `You are a study planner. Create a daily study plan for a student based on their classes and current progress.

TODAY'S DATE: ${date}

CLASSES:
${subjectContexts.join('\n\n')}

For each class, suggest actions for today. Include:

1. **Reading** — If the student has an in-progress module with page ranges, suggest reading a specific portion
2. **Card review** — Always include card review if they have due cards
3. **Tutor session** — Suggest a tutor session if they have active modules
4. **Start new module** — If prerequisites are met and they have no in-progress module

Respond in JSON format:
{
  "plan_items": [
    {
      "subject_id": 1,
      "suggested_action": "Specific, actionable description of what to do today (e.g. 'Read Chapter 4 on Supply and Demand', 'Complete Module 2 tutor session', 'Review 15 due cards')",
      "estimated_minutes": 30,
      "priority": 1
    }
  ]
}

Rules:
- Create 1-3 items per class (reading + review + maybe tutor)
- Total estimated time should be reasonable for a day (2-4 hours max across all classes)
- Priority 1 = most important, 2 = important, 3 = nice to do
- Include card review as a plan item if the student has due cards
- Be specific about what to study (module names, chapter numbers, etc.)
- Return ONLY valid JSON. No markdown. No commentary.`

    const config = getAIConfig()
    const apiKey = getApiKey()
    if (!apiKey) throw new Error('AI API key not configured')

    const responseText = await callAIMessages(
      [{ role: 'user', content: prompt }],
      { ...config, apiKey },
      { type: 'json_object' }
    )

    let cleaned = responseText.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    const parsed = JSON.parse(cleaned)

    const planItems = parsed.plan_items || []
    if (!Array.isArray(planItems)) return []

    // Insert plan items
    const insertItems = db.transaction((items: typeof planItems) => {
      for (const item of items) {
        // Verify subject belongs to user
        const subject = subjects.find(s => s.id === item.subject_id)
        if (!subject) continue

        db.prepare(`
          INSERT OR REPLACE INTO daily_plans
            (user_id, plan_date, subject_id, suggested_action, estimated_minutes, priority)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, date, item.subject_id, item.suggested_action, item.estimated_minutes || 30, item.priority || 2)
      }
    })

    insertItems(planItems)

    return db.prepare(`
      SELECT p.*, s.name as subject_name
      FROM daily_plans p
      JOIN subjects s ON s.id = p.subject_id
      WHERE p.user_id = ? AND p.plan_date = ?
      ORDER BY p.priority DESC, p.estimated_minutes DESC
    `).all(userId, date)
  })

  ipcMain.handle('plan:completeAction', (_event, planId: number) => {
    db.prepare('UPDATE daily_plans SET is_completed = 1 WHERE id = ?').run(planId)
    return { success: true }
  })

  ipcMain.handle('plan:dismissAction', (_event, planId: number) => {
    db.prepare('DELETE FROM daily_plans WHERE id = ?').run(planId)
    return { success: true }
  })

  ipcMain.handle('plan:addPlanItem', (_event, item: {
    user_id: number
    plan_date: string
    subject_id: number
    suggested_action: string
    estimated_minutes?: number
    priority?: number
  }) => {
    const result = db.prepare(`
      INSERT INTO daily_plans
        (user_id, plan_date, subject_id, suggested_action, estimated_minutes, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      item.user_id, item.plan_date, item.subject_id,
      item.suggested_action, item.estimated_minutes || 30, item.priority || 2
    )
    return db.prepare(`
      SELECT p.*, s.name as subject_name
      FROM daily_plans p
      JOIN subjects s ON s.id = p.subject_id
      WHERE p.id = ?
    `).get(result.lastInsertRowid)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // SYLLABUS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('syllabus:listModules', (_event, subjectId: number) => {
    return db.prepare(`
      SELECT sm.*, COUNT(mt.id) as topic_count
      FROM syllabus_modules sm
      LEFT JOIN module_topics mt ON mt.module_id = sm.id
      WHERE sm.subject_id = ?
      GROUP BY sm.id
      ORDER BY sm.sort_order ASC
    `).all(subjectId)
  })

  ipcMain.handle('syllabus:listTopics', (_event, moduleId: number) => {
    return db.prepare(`
      SELECT * FROM module_topics WHERE module_id = ? ORDER BY sort_order ASC
    `).all(moduleId)
  })

  ipcMain.handle('syllabus:createModule', (_event, subjectId: number, data: Partial<SyllabusModule>) => {
    const now = new Date().toISOString()
    // Calculate next sort_order
    const maxOrder = db.prepare(
      'SELECT MAX(sort_order) as max_order FROM syllabus_modules WHERE subject_id = ?'
    ).get(subjectId) as { max_order: number | null }
    const sortOrder = data.sort_order ?? (maxOrder?.max_order ?? -1) + 1

    const result = db.prepare(`
      INSERT INTO syllabus_modules (subject_id, title, description, week_number, status, hours_estimated, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      subjectId,
      data.title || 'New Module',
      data.description || null,
      data.week_number || null,
      data.status || 'pending',
      data.hours_estimated || 1.0,
      sortOrder,
      now
    )
    return db.prepare('SELECT * FROM syllabus_modules WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('syllabus:updateModule', (_event, moduleId: number, data: Partial<SyllabusModule>) => {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.week_number !== undefined) { fields.push('week_number = ?'); values.push(data.week_number) }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status) }
    if (data.hours_estimated !== undefined) { fields.push('hours_estimated = ?'); values.push(data.hours_estimated) }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order) }

    if (fields.length > 0) {
      values.push(moduleId)
      db.prepare(`UPDATE syllabus_modules SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    return db.prepare('SELECT * FROM syllabus_modules WHERE id = ?').get(moduleId)
  })

  ipcMain.handle('syllabus:deleteModule', (_event, moduleId: number) => {
    db.prepare('DELETE FROM module_topics WHERE module_id = ?').run(moduleId)
    db.prepare('DELETE FROM syllabus_modules WHERE id = ?').run(moduleId)
    return { success: true }
  })

  ipcMain.handle('syllabus:createTopic', (_event, moduleId: number, data: Partial<ModuleTopic>) => {
    const now = new Date().toISOString()
    const maxOrder = db.prepare(
      'SELECT MAX(sort_order) as max_order FROM module_topics WHERE module_id = ?'
    ).get(moduleId) as { max_order: number | null }
    const sortOrder = data.sort_order ?? (maxOrder?.max_order ?? -1) + 1

    const result = db.prepare(`
      INSERT INTO module_topics (module_id, title, description, mastery_target, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      moduleId,
      data.title || 'New Topic',
      data.description || null,
      data.mastery_target ?? 0.8,
      sortOrder,
      now
    )
    return db.prepare('SELECT * FROM module_topics WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('syllabus:updateTopic', (_event, topicId: number, data: Partial<ModuleTopic>) => {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
    if (data.mastery_target !== undefined) { fields.push('mastery_target = ?'); values.push(data.mastery_target) }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order) }

    if (fields.length > 0) {
      values.push(topicId)
      db.prepare(`UPDATE module_topics SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    return db.prepare('SELECT * FROM module_topics WHERE id = ?').get(topicId)
  })

  ipcMain.handle('syllabus:deleteTopic', (_event, topicId: number) => {
    db.prepare('DELETE FROM module_topics WHERE id = ?').run(topicId)
    return { success: true }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // LIBRARY
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('library:openFileDialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Study Materials', extensions: ['pdf', 'docx', 'pptx', 'txt', 'md', 'html'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('library:saveFile', async (_event, subjectId: number, filePath: string) => {
    const filename = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown'
    const ext = filename.split('.').pop()?.toLowerCase() || 'txt'
    const fileType = ['pdf', 'docx', 'pptx', 'txt', 'md', 'html'].includes(ext) ? ext : 'txt'

    // Read the file content (for text-based files, read as text; for binary, store metadata)
    let contentText = ''
    let fileSize = 0
    try {
      const stats = fs.statSync(filePath)
      fileSize = stats.size

      // For supported text formats, extract content
      if (['txt', 'md', 'html'].includes(ext)) {
        contentText = fs.readFileSync(filePath, 'utf-8')
      }
    } catch {
      // If file can't be read, still store metadata
    }

    // Copy file to userData directory
    const userDataPath = app.getPath('userData')
    const libraryDir = join(userDataPath, 'library')
    fs.mkdirSync(libraryDir, { recursive: true })
    const destPath = join(libraryDir, `${Date.now()}_${filename}`)
    try {
      fs.copyFileSync(filePath, destPath)
    } catch {
      // If copy fails, store the original path
    }

    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO materials (subject_id, filename, file_type, content_text, file_size, file_path, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(subjectId, filename, fileType, contentText, fileSize || null, destPath || filePath, now)

    return db.prepare('SELECT * FROM materials WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('library:getFiles', (_event, subjectId: number) => {
    return db.prepare('SELECT * FROM materials WHERE subject_id = ? ORDER BY uploaded_at DESC').all(subjectId)
  })

  ipcMain.handle('library:getFileContent', (_event, fileId: number) => {
    const row = db.prepare('SELECT content_text, filename FROM materials WHERE id = ?').get(fileId) as
      { content_text: string; filename: string } | undefined
    if (!row) throw new Error('File not found')
    return { content_text: row.content_text || '', filename: row.filename }
  })
}
