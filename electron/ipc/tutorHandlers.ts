import { ipcMain, BrowserWindow, dialog } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import fs from 'fs'
import { streamAI, callAIMessages } from './aiHandlers'
import { getApiKey, getAIConfig } from './aiConfigStore'
import { parseFileToText } from './documentParser'
import { bktUpdate } from '../../src/lib/bkt'
import { findCardDuplicates } from '../../src/lib/cardDeduplication'
import { safeParseAIJson } from '../../src/lib/jsonRepair'
import type {
  TutorSession,
  TutorStreamParams,
  PacingStatus,
  TutorTopicMemory,
  TutorSessionEvaluation,
  GapAnalysisResult,
  GapAnalysisItem
} from '../../src/types'
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

// ── Historical Memory builder ──────────────────────────────────────────

export function buildHistoricalMemoryBlock(database: Database.Database | undefined, subjectId: number, userId?: number): string {
  if (!database || !subjectId || !userId) return ''
  try {
    const memories = database.prepare(`
      SELECT topic, mastery_level, strengths, struggles
      FROM tutor_topic_memories
      WHERE subject_id = ? AND user_id = ?
      ORDER BY last_studied_at DESC
      LIMIT 20
    `).all(subjectId, userId) as { topic: string; mastery_level: string; strengths: string | null; struggles: string | null }[]

    if (!memories.length) return ''

    const mastered = memories.filter(m => m.mastery_level === 'mastered' || m.mastery_level === 'good')
    const struggling = memories.filter(m => m.mastery_level === 'struggling' || m.mastery_level === 'developing')

    const lines: string[] = ['', 'HISTORICAL LEARNING MEMORY (FROM PREVIOUS SESSIONS):']
    if (mastered.length > 0) {
      lines.push(`- Concepts student has strong command of: ${mastered.map(m => m.topic + (m.strengths ? ` (${m.strengths})` : '')).slice(0, 10).join('; ')}`)
    }
    if (struggling.length > 0) {
      lines.push(`- Concepts student has struggled with: ${struggling.map(m => m.topic + (m.struggles ? ` (${m.struggles})` : '')).slice(0, 10).join('; ')}`)
      lines.push(`- Pedagogical Note: Prioritize reinforcing these struggled areas with intuitive examples before advancing.`)
    }
    lines.push('')
    return lines.join('\n')
  } catch (err) {
    console.error('Failed to build historical memory block:', err)
    return ''
  }
}

// ── Topic Focus & Gap Filling directive builder ────────────────────────

export function buildTopicFocusBlock(params: {
  targetTopic?: string
  targetTopics?: string[]
  isFillGaps?: boolean
  gapTopics?: string[]
}): string {
  if (params.isFillGaps || params.gapTopics?.length) {
    const focusList = params.gapTopics?.length ? params.gapTopics.join(', ') : 'identified gaps and unstudied areas'
    return [
      '',
      'TARGETED GAP-FILLING FOCUS:',
      `The student specifically requested to FILL GAPS in their knowledge.`,
      `Identified gap topics: ${focusList}`,
      '1. Begin by addressing misconceptions or difficult aspects of these topics.',
      '2. Connect previous knowledge to newly introduced concepts with clear analogies.',
      '3. Ask targeted questions to verify the gap is closed before moving forward.',
      ''
    ].join('\n')
  }
  if (params.targetTopics && params.targetTopics.length > 0) {
    const list = params.targetTopics.map(t => `- ${t}`).join('\n')
    return [
      '',
      'SELECTED TOPICS FOCUS:',
      `The student explicitly selected the following topic(s) to study from their curriculum:`,
      list,
      '1. Guide the student step by step through each selected topic.',
      '2. Ask interactive questions to assess and reinforce understanding of each topic.',
      '3. Do not drift into unrelated concepts until these specific topics are addressed.',
      ''
    ].join('\n')
  }
  if (params.targetTopic) {
    return [
      '',
      'TARGET TOPIC FOCUS:',
      `The student explicitly chose to study: "${params.targetTopic}".`,
      `Focus the discussion, explanations, and questions squarely on this topic.`,
      ''
    ].join('\n')
  }
  return ''
}

// ── Gap Analysis Computation ───────────────────────────────────────────

export function computeGapAnalysis(
  database: Database.Database,
  subjectId: number,
  userId: number
): GapAnalysisResult {
  // 1. Fetch syllabus modules & topics
  const modules = database.prepare(`
    SELECT id, title, description, status, sort_order FROM syllabus_modules
    WHERE subject_id = ? ORDER BY sort_order ASC
  `).all(subjectId) as (SyllabusModule & { status: string })[]

  const moduleIds = modules.map(m => m.id)
  const topics: ModuleTopic[] = moduleIds.length > 0
    ? database.prepare(`
        SELECT id, module_id, title, description, sort_order FROM module_topics
        WHERE module_id IN (${moduleIds.map(() => '?').join(',')})
        ORDER BY sort_order ASC
      `).all(...moduleIds) as ModuleTopic[]
    : []

  // 2. Fetch past memories & mastery
  const memories = database.prepare(`
    SELECT topic, mastery_level, strengths, struggles, last_studied_at
    FROM tutor_topic_memories
    WHERE subject_id = ? AND user_id = ?
  `).all(subjectId, userId) as { topic: string; mastery_level: string; strengths: string | null; struggles: string | null; last_studied_at: string }[]

  const conceptMastery = database.prepare(`
    SELECT concept, mastery_prob FROM concept_mastery
    WHERE subject_id = ? AND user_id = ?
  `).all(subjectId, userId) as { concept: string; mastery_prob: number }[]

  const studiedTopics = database.prepare(`
    SELECT topic_id FROM module_topic_study_log
    WHERE user_id = ?
  `).all(userId) as { topic_id: number }[]
  const studiedTopicIds = new Set(studiedTopics.map(s => s.topic_id))

  // Build struggles list (Priority 1)
  const struggledItems: GapAnalysisItem[] = []
  const strugglingMemories = memories.filter(m => m.mastery_level === 'struggling' || m.mastery_level === 'developing')
  for (const m of strugglingMemories) {
    struggledItems.push({
      type: 'struggled',
      topic: m.topic,
      details: m.struggles || 'Struggled with this concept in a previous session',
      priority: 1
    })
  }
  for (const cm of conceptMastery) {
    if (cm.mastery_prob < 0.5 && !struggledItems.some(i => i.topic.toLowerCase() === cm.concept.toLowerCase())) {
      struggledItems.push({
        type: 'struggled',
        topic: cm.concept,
        details: `Low mastery level (${Math.round(cm.mastery_prob * 100)}%)`,
        priority: 1
      })
    }
  }

  // Build uncovered list (Priority 2)
  const uncoveredItems: GapAnalysisItem[] = []
  const memoryTopicsLower = new Set(memories.map(m => m.topic.toLowerCase()))

  // Check module topics
  for (const t of topics) {
    const mod = modules.find(m => m.id === t.module_id)
    const isStudied = studiedTopicIds.has(t.id) || memoryTopicsLower.has(t.title.toLowerCase())
    if (!isStudied) {
      uncoveredItems.push({
        type: 'uncovered',
        topic: t.title,
        moduleId: t.module_id,
        moduleTitle: mod?.title,
        details: mod ? `From module: ${mod.title}` : undefined,
        priority: 2
      })
    }
  }

  // Check unstudied modules (if no module_topics exist or if module is pending)
  if (topics.length === 0) {
    for (const mod of modules) {
      if (mod.status === 'pending' || !memoryTopicsLower.has(mod.title.toLowerCase())) {
        uncoveredItems.push({
          type: 'uncovered',
          topic: mod.title,
          moduleId: mod.id,
          moduleTitle: mod.title,
          details: 'Syllabus module not yet covered in tutor',
          priority: 2
        })
      }
    }
  }

  // Determine recommendation
  const recommendedTopics: string[] = []
  let recommendedFocus = ''
  let recommendedModuleId: number | undefined
  let recommendedMaterialId: number | undefined

  if (struggledItems.length > 0 && uncoveredItems.length > 0) {
    const sTop = struggledItems.slice(0, 2).map(i => i.topic)
    const uTop = uncoveredItems.slice(0, 1).map(i => i.topic)
    recommendedTopics.push(...sTop, ...uTop)
    recommendedModuleId = uncoveredItems[0]?.moduleId
    recommendedFocus = `Review ${sTop.join(' & ')} (struggled previously) and introduce ${uTop.join(', ')}.`
  } else if (struggledItems.length > 0) {
    const sTop = struggledItems.slice(0, 3).map(i => i.topic)
    recommendedTopics.push(...sTop)
    recommendedFocus = `Reinforce key struggled areas: ${sTop.join(', ')}.`
  } else if (uncoveredItems.length > 0) {
    const uTop = uncoveredItems.slice(0, 3).map(i => i.topic)
    recommendedTopics.push(...uTop)
    recommendedModuleId = uncoveredItems[0]?.moduleId
    recommendedFocus = `Cover upcoming unstudied material: ${uTop.join(', ')}.`
  } else {
    // Everything covered and strong!
    const subject = database.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId) as { name: string } | undefined
    recommendedFocus = `Comprehensive review across all covered concepts in ${subject?.name || 'this class'}.`
    if (modules.length > 0) {
      recommendedTopics.push(modules[0].title)
      recommendedModuleId = modules[0].id
    }
  }

  const totalGapsCount = struggledItems.length + uncoveredItems.length
  const hasHistory = memories.length > 0 || conceptMastery.length > 0

  return {
    struggledTopics: struggledItems,
    uncoveredTopics: uncoveredItems,
    recommendedFocus,
    recommendedTopics,
    recommendedModuleId,
    recommendedMaterialId,
    totalGapsCount,
    hasHistory
  }
}

// ── Module Completion Status Sync Helper ─────────────────────────────────

export function syncModuleCompletionStatus(database: Database.Database, moduleId: number, userId?: number): string {
  const allTopics = database.prepare('SELECT id FROM module_topics WHERE module_id = ?').all(moduleId) as { id: number }[]
  if (allTopics.length === 0) {
    const current = database.prepare('SELECT status FROM syllabus_modules WHERE id = ?').get(moduleId) as { status: string } | undefined
    return current?.status || 'pending'
  }

  let actualUserId = userId
  if (!actualUserId) {
    const u = database.prepare('SELECT id FROM users LIMIT 1').get() as { id: number } | undefined
    actualUserId = u?.id || 1
  }

  const placeholders = allTopics.map(() => '?').join(',')
  const completedRows = database.prepare(`
    SELECT COUNT(DISTINCT topic_id) as c FROM module_topic_study_log
    WHERE user_id = ? AND topic_id IN (${placeholders})
  `).get(actualUserId, ...allTopics.map(t => t.id)) as { c: number }

  let status = 'in_progress'
  if (completedRows.c >= allTopics.length) {
    status = 'completed'
  } else if (completedRows.c === 0) {
    const current = database.prepare('SELECT status FROM syllabus_modules WHERE id = ?').get(moduleId) as { status: string } | undefined
    status = current?.status === 'in_progress' ? 'in_progress' : 'pending'
  } else {
    status = 'in_progress'
  }

  database.prepare('UPDATE syllabus_modules SET status = ? WHERE id = ?').run(status, moduleId)
  return status
}

// ── Session End Analysis & Memory Persistence ──────────────────────────

export async function evaluateAndSaveSessionMemory(
  database: Database.Database,
  sessionId: number,
  summaryText?: string,
  options?: { targetTopics?: string[]; moduleId?: number }
): Promise<{ strengths: string[]; struggles: string[]; topics_covered: string[]; summary: string } | null> {
  const session = database.prepare('SELECT * FROM tutor_sessions WHERE id = ?').get(sessionId) as TutorSession | undefined
  if (!session || !session.subject_id || !session.user_id) return null

  const subject = database.prepare('SELECT name FROM subjects WHERE id = ?').get(session.subject_id) as { name: string } | undefined
  const className = subject?.name || 'the subject'

  const messages = database.prepare(`
    SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
  `).all(sessionId) as { role: string; content: string }[]

  if (messages.length < 2) return null

  const transcript = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n\n')
    .substring(0, 8000)

  const evaluation = {
    strengths: [] as string[],
    struggles: [] as string[],
    topics_covered: [] as string[],
    summary: summaryText || ''
  }

  try {
    const apiKey = getApiKey()
    const config = getAIConfig()

    if (apiKey) {
      const prompt = `You are an educational analytics AI. Analyze this tutoring session dialogue between Tutor and Student for class "${className}".

DIALOGUE:
${transcript}

Extract:
1. "strengths": Array of 1-4 specific concepts, topics, or skills the student demonstrated good understanding of or answered correctly.
2. "struggles": Array of 1-4 specific concepts, topics, or misconceptions the student struggled with, answered incorrectly, or needed hints for.
3. "topics_covered": Array of 1-5 syllabus/subject topics covered during this session.
4. "summary": A 1-2 sentence summary of what was accomplished and areas to focus on next.

Return STRICT JSON ONLY, no extra text, in this format:
{
  "strengths": ["string"],
  "struggles": ["string"],
  "topics_covered": ["string"],
  "summary": "string"
}`
      const response = await callAIMessages(
        [{ role: 'user', content: prompt }],
        { ...config, apiKey }
      )

      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed.strengths)) evaluation.strengths = parsed.strengths.filter((s: unknown) => typeof s === 'string' && s.trim())
        if (Array.isArray(parsed.struggles)) evaluation.struggles = parsed.struggles.filter((s: unknown) => typeof s === 'string' && s.trim())
        if (Array.isArray(parsed.topics_covered)) evaluation.topics_covered = parsed.topics_covered.filter((s: unknown) => typeof s === 'string' && s.trim())
        if (typeof parsed.summary === 'string' && parsed.summary.trim()) evaluation.summary = parsed.summary.trim()
      }
    }
  } catch (err) {
    console.warn('AI evaluation extraction failed, using fallback heuristic:', err)
  }

  // Fallback heuristic if empty
  if (evaluation.topics_covered.length === 0) {
    const topicRegex = /\[TOPIC:\s*([^\]]+)\]/g
    let match
    while ((match = topicRegex.exec(transcript)) !== null) {
      if (!evaluation.topics_covered.includes(match[1].trim())) {
        evaluation.topics_covered.push(match[1].trim())
      }
    }
    if (evaluation.topics_covered.length === 0 && session.module_id) {
      const mod = database.prepare('SELECT title FROM syllabus_modules WHERE id = ?').get(session.module_id) as { title: string } | undefined
      if (mod) evaluation.topics_covered.push(mod.title)
    }
  }

  const now = new Date().toISOString()

  // Save session evaluation
  database.prepare(`
    INSERT OR REPLACE INTO tutor_session_evaluations (session_id, user_id, subject_id, strengths_json, struggles_json, topics_covered_json, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    session.user_id,
    session.subject_id,
    JSON.stringify(evaluation.strengths),
    JSON.stringify(evaluation.struggles),
    JSON.stringify(evaluation.topics_covered),
    evaluation.summary,
    now
  )

  // Update topic memories for strengths
  for (const str of evaluation.strengths) {
    const cleanTopic = str.trim()
    if (!cleanTopic) continue
    database.prepare(`
      INSERT INTO tutor_topic_memories (user_id, subject_id, topic, mastery_level, strengths, struggles, session_id, last_studied_at)
      VALUES (?, ?, ?, 'good', ?, NULL, ?, ?)
      ON CONFLICT(user_id, subject_id, topic) DO UPDATE SET
        mastery_level = CASE WHEN mastery_level = 'good' THEN 'mastered' ELSE 'good' END,
        strengths = excluded.strengths,
        session_id = excluded.session_id,
        last_studied_at = excluded.last_studied_at
    `).run(session.user_id, session.subject_id, cleanTopic, cleanTopic, sessionId, now)

    // Update BKT concept mastery
    try {
      const existing = database.prepare('SELECT mastery_prob FROM concept_mastery WHERE user_id = ? AND subject_id = ? AND concept = ?').get(session.user_id, session.subject_id, cleanTopic) as { mastery_prob: number } | undefined
      const prior = existing?.mastery_prob ?? 0.3
      const newProb = bktUpdate(prior, true)
      if (existing) {
        database.prepare('UPDATE concept_mastery SET mastery_prob = ?, observations = observations + 1, updated_at = ? WHERE user_id = ? AND subject_id = ? AND concept = ?').run(newProb, now, session.user_id, session.subject_id, cleanTopic)
      } else {
        database.prepare('INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob, observations, updated_at) VALUES (?, ?, ?, ?, 1, ?)').run(session.user_id, session.subject_id, cleanTopic, newProb, now)
      }
    } catch { /* ignore */ }
  }

  // Update topic memories for struggles
  for (const stg of evaluation.struggles) {
    const cleanTopic = stg.trim()
    if (!cleanTopic) continue
    database.prepare(`
      INSERT INTO tutor_topic_memories (user_id, subject_id, topic, mastery_level, strengths, struggles, session_id, last_studied_at)
      VALUES (?, ?, ?, 'struggling', NULL, ?, ?, ?)
      ON CONFLICT(user_id, subject_id, topic) DO UPDATE SET
        mastery_level = 'struggling',
        struggles = excluded.struggles,
        session_id = excluded.session_id,
        last_studied_at = excluded.last_studied_at
    `).run(session.user_id, session.subject_id, cleanTopic, cleanTopic, sessionId, now)

    // Update BKT concept mastery
    try {
      const existing = database.prepare('SELECT mastery_prob FROM concept_mastery WHERE user_id = ? AND subject_id = ? AND concept = ?').get(session.user_id, session.subject_id, cleanTopic) as { mastery_prob: number } | undefined
      const prior = existing?.mastery_prob ?? 0.3
      const newProb = bktUpdate(prior, false)
      if (existing) {
        database.prepare('UPDATE concept_mastery SET mastery_prob = ?, observations = observations + 1, updated_at = ? WHERE user_id = ? AND subject_id = ? AND concept = ?').run(newProb, now, session.user_id, session.subject_id, cleanTopic)
      } else {
        database.prepare('INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob, observations, updated_at) VALUES (?, ?, ?, ?, 1, ?)').run(session.user_id, session.subject_id, cleanTopic, newProb, now)
      }
    } catch { /* ignore */ }
  }

  const effectiveModuleId = options?.moduleId || session.module_id

  // Collect topics to log: evaluation covered topics plus any explicitly selected target topics
  const topicsToLog = new Set<string>()
  if (options?.targetTopics && Array.isArray(options.targetTopics)) {
    for (const t of options.targetTopics) {
      if (t && typeof t === 'string' && t.trim()) {
        topicsToLog.add(t.trim())
      }
    }
  }
  for (const top of evaluation.topics_covered) {
    if (top && typeof top === 'string' && top.trim()) {
      topicsToLog.add(top.trim())
    }
  }

  // Log covered/targeted topics in module_topic_study_log
  for (const top of topicsToLog) {
    try {
      let modTopic: { id: number; module_id: number } | undefined
      if (effectiveModuleId) {
        modTopic = database.prepare(`
          SELECT mt.id, mt.module_id FROM module_topics mt
          WHERE mt.module_id = ? AND LOWER(TRIM(mt.title)) = LOWER(TRIM(?))
        `).get(effectiveModuleId, top) as { id: number; module_id: number } | undefined
      }
      if (!modTopic) {
        modTopic = database.prepare(`
          SELECT mt.id, mt.module_id FROM module_topics mt
          JOIN syllabus_modules sm ON sm.id = mt.module_id
          WHERE sm.subject_id = ? AND LOWER(TRIM(mt.title)) = LOWER(TRIM(?))
        `).get(session.subject_id, top) as { id: number; module_id: number } | undefined
      }
      if (modTopic) {
        database.prepare(`
          INSERT OR REPLACE INTO module_topic_study_log (topic_id, user_id, studied_at)
          VALUES (?, ?, ?)
        `).run(modTopic.id, session.user_id, now)
      }
    } catch { /* ignore */ }
  }

  // Recalculate and sync parent module completion status
  if (effectiveModuleId) {
    syncModuleCompletionStatus(database, effectiveModuleId, session.user_id)
  }

  return evaluation
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

  ipcMain.handle('tutor:endSession', async (_event, sessionId: number, summary?: string, options?: { targetTopics?: string[]; moduleId?: number }) => {
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE tutor_sessions SET phase = 'complete', summary = ?, ended_at = ? WHERE id = ?
    `).run(summary || null, now, sessionId)

    const evaluation = await evaluateAndSaveSessionMemory(db, sessionId, summary, options)
    return { success: true, evaluation }
  })

  ipcMain.handle('tutor:getGapAnalysis', (_event, subjectId: number, userId: number) => {
    return computeGapAnalysis(db, subjectId, userId)
  })

  ipcMain.handle('tutor:getTopicMemories', (_event, subjectId: number, userId: number) => {
    return db.prepare(`
      SELECT * FROM tutor_topic_memories
      WHERE subject_id = ? AND user_id = ?
      ORDER BY last_studied_at DESC
    `).all(subjectId, userId) as TutorTopicMemory[]
  })

  ipcMain.handle('tutor:getSessionEvaluation', (_event, sessionId: number) => {
    const row = db.prepare('SELECT * FROM tutor_session_evaluations WHERE session_id = ?').get(sessionId) as {
      id: number
      session_id: number
      user_id: number
      subject_id: number
      strengths_json: string
      struggles_json: string
      topics_covered_json: string
      summary: string | null
      created_at: string
    } | undefined

    if (!row) return null

    try {
      return {
        id: row.id,
        session_id: row.session_id,
        user_id: row.user_id,
        subject_id: row.subject_id,
        strengths: JSON.parse(row.strengths_json || '[]'),
        struggles: JSON.parse(row.struggles_json || '[]'),
        topics_covered: JSON.parse(row.topics_covered_json || '[]'),
        summary: row.summary || undefined,
        created_at: row.created_at
      } as TutorSessionEvaluation
    } catch {
      return null
    }
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
      ? `\n\nCRITICAL ANTI-DUPLICATION LIST: Existing cards in this deck that you MUST NOT duplicate (avoid similar questions, terms, or answers):\n${existingCards.slice(0, 80).map(c => `- "${c.front}" -> "${c.back.substring(0, 80)}"`).join('\n')}\nEvery generated card MUST introduce a novel concept or a distinctly fresh perspective not covered above.`
      : ''

    const prompt = `You are an expert cognitive scientist and flashcard designer creating high-yield, bite-sized study cards from a tutoring session about "${subjectName}".${moduleContext}

SESSION CONTENT:
${sessionContent.substring(0, 6000)}

Create a balanced MIX of flashcards (term -> concise definition) and active recall questions (focused question -> punchy answer) based on the session's key takeaways and trouble spots.${existingCardHints}

Generate 6-10 cards total. Format each card on its own line using this exact format:

**[Term or Question]** -> [Concise Answer or Definition]

STRICT DESIGN RULES (CRITICAL):
1. ATOMICITY (Minimum Information Principle): Each card must test exactly ONE idea, mechanism, or fact. Never create compound cards or multi-item lists.
2. CONCISENESS (NO LONG ANSWERS):
   - Front: 1 clear question or term (max 15 words). Do NOT include numbering (like "1.") inside the bold tags.
   - Back: 1 to 2 short, punchy sentences (STRICTLY under 30 words). Get straight to the point—no fluff, filler, or textbook paragraphs.
3. HIGH YIELD: Focus on the core mechanism or conceptual distinction that matters most for exam mastery.
4. For mathematical expressions, use proper LaTeX in $...$ or $$...$$ format (e.g. $E = mc^2$).
5. STRICT ANTI-DUPLICATION: Do NOT duplicate any existing cards listed above. Focus on fresh takeaways from this session.
6. Return ONLY the formatted cards. No introductory text, numbering outside format, or commentary.`

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
    const existingCards = db.prepare(
      'SELECT front, back FROM cards WHERE subject_id = ?'
    ).all(subjectId) as { front: string; back: string }[]

    return findCardDuplicates(cards, existingCards)
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

    // Retrieve userId for historical memory lookup
    let userId: number | undefined
    try {
      const sessRow = db.prepare('SELECT user_id FROM tutor_sessions WHERE id = ?').get(params.sessionId) as { user_id: number | null } | undefined
      if (sessRow?.user_id) userId = sessRow.user_id
    } catch { /* ignore */ }

    // Build historical cross-session learning memory block
    const historicalMemoryBlock = buildHistoricalMemoryBlock(db, params.subjectId, userId)

    // Build target topic & gap filling focus directive
    const topicFocusBlock = buildTopicFocusBlock({
      targetTopic: params.targetTopic,
      targetTopics: params.targetTopics,
      isFillGaps: params.isFillGaps,
      gapTopics: params.gapTopics
    })

    // Build material context (if studying a specific material or general subject materials)
    let materialContextBlock = ''
    if (params.materialId) {
      try {
        const mat = db.prepare('SELECT filename, content_text FROM materials WHERE id = ?').get(params.materialId) as { filename: string; content_text: string } | undefined
        if (mat && mat.content_text) {
          materialContextBlock = [
            '',
            `SPECIFIC MATERIAL STUDY FOCUS:`,
            `The student is studying ONLY the specific material: "${mat.filename}".`,
            `Base all questions, explanations, active recall challenges, and feedback STRICTLY on the contents of this material below:`,
            `--- MATERIAL CONTENT START ---`,
            mat.content_text.substring(0, 16000),
            `--- MATERIAL CONTENT END ---`,
            ''
          ].join('\n')
        }
      } catch (err) {
        console.error('Failed to load specific material for tutor session:', err)
      }
    } else if (params.materialContent) {
      materialContextBlock = [
        '',
        `SPECIFIC MATERIAL STUDY FOCUS:`,
        `Base all questions, explanations, and feedback STRICTLY on the content provided below:`,
        `--- MATERIAL CONTENT START ---`,
        params.materialContent.substring(0, 16000),
        `--- MATERIAL CONTENT END ---`,
        ''
      ].join('\n')
    } else {
      try {
        const subjectMaterials = db.prepare(`
          SELECT filename, content_text FROM materials
          WHERE subject_id = ? AND content_text IS NOT NULL AND LENGTH(content_text) > 50
          ORDER BY uploaded_at DESC LIMIT 5
        `).all(params.subjectId) as { filename: string; content_text: string }[]

        if (subjectMaterials.length > 0) {
          const combined = subjectMaterials.map(m =>
            `[DOCUMENT: ${m.filename}]\n${m.content_text.substring(0, 6000)}`
          ).join('\n\n---\n\n')

          materialContextBlock = [
            '',
            `SOURCE STUDY MATERIALS FOR THIS SUBJECT:`,
            `The student has uploaded the following course materials and lecture documents:`,
            `--- COURSE MATERIALS START ---`,
            combined,
            `--- COURSE MATERIALS END ---`,
            `Thoroughly draw upon these source materials to ground your Socratic questioning, test core mechanisms, verify accuracy, and quote relevant formulas or explanations when guiding the student.`,
            ''
          ].join('\n')
        }
      } catch (err) {
        console.error('Failed to load subject materials for tutor session:', err)
      }
    }

    // Append all context blocks to syllabusContext
    syllabusContext += '\n' + timeContext + '\n' + depthBlock + '\n' + topicFocusBlock + '\n' + historicalMemoryBlock + '\n' + memoryBlock + '\n' + materialContextBlock

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
        parts.push(`  Currently working on: ${currentModule.chapter_number ? `Ch. ${currentModule.chapter_number}: ` : ''}${currentModule.title}`)
      } else if (nextModule) {
        parts.push(`  Next up: ${nextModule.chapter_number ? `Ch. ${nextModule.chapter_number}: ` : ''}${nextModule.title}`)
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

    const parsed = safeParseAIJson<{ plan_items?: any[] }>(responseText, { plan_items: [] })

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

  ipcMain.handle('syllabus:listTopics', (_event, moduleId: number, userId?: number) => {
    const rows = db.prepare(`
      SELECT mt.*,
        CASE WHEN EXISTS (
          SELECT 1 FROM module_topic_study_log sl
          WHERE sl.topic_id = mt.id AND (? IS NULL OR sl.user_id = ?)
        ) THEN 1 ELSE 0 END as completed,
        CASE WHEN EXISTS (
          SELECT 1 FROM module_topic_study_log sl
          WHERE sl.topic_id = mt.id AND (? IS NULL OR sl.user_id = ?)
        ) THEN 1 ELSE 0 END as studied
      FROM module_topics mt
      WHERE mt.module_id = ?
    `).all(userId ?? null, userId ?? null, userId ?? null, userId ?? null, moduleId) as (Omit<ModuleTopic, 'completed' | 'studied'> & { completed: number; studied: number })[]

    return rows.map(r => ({
      ...r,
      completed: Boolean(r.completed),
      studied: Boolean(r.studied)
    }))
  })

  ipcMain.handle('syllabus:toggleTopicCompleted', (_event, topicId: number, completed: boolean, userId?: number) => {
    const topic = db.prepare('SELECT * FROM module_topics WHERE id = ?').get(topicId) as ModuleTopic | undefined
    if (!topic) return { success: false, error: 'Topic not found' }

    let actualUserId = userId
    if (!actualUserId) {
      const u = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: number } | undefined
      actualUserId = u?.id || 1
    }

    if (completed) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT OR REPLACE INTO module_topic_study_log (topic_id, user_id, studied_at)
        VALUES (?, ?, ?)
      `).run(topicId, actualUserId, now)
    } else {
      db.prepare(`
        DELETE FROM module_topic_study_log WHERE topic_id = ? AND user_id = ?
      `).run(topicId, actualUserId)
    }

    const newStatus = syncModuleCompletionStatus(db, topic.module_id, actualUserId)
    return { success: true, completed, moduleStatus: newStatus, moduleId: topic.module_id }
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
        {
          name: 'All Study Materials',
          extensions: ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'md', 'markdown', 'csv', 'tsv', 'rtf', 'html', 'htm']
        },
        { name: 'PowerPoint', extensions: ['pptx', 'ppt', 'pptm', 'potx', 'ppsx'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Word Documents', extensions: ['docx', 'doc'] },
        { name: 'Notes & Text', extensions: ['txt', 'md', 'csv', 'tsv', 'rtf', 'html'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('library:saveFile', async (_event, subjectId: number, filePath: string) => {
    const filename = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown'
    let contentText = ''
    let fileType = 'txt'
    let fileSize = 0

    try {
      const stats = fs.statSync(filePath)
      fileSize = stats.size
    } catch {}

    try {
      const parsed = await parseFileToText(filePath)
      contentText = parsed.contentText
      fileType = parsed.fileType
    } catch (err) {
      console.warn('Failed to extract text during library upload:', err)
      const ext = filename.split('.').pop()?.toLowerCase() || 'txt'
      fileType = ['pdf', 'docx', 'pptx', 'txt', 'md', 'html', 'ppt', 'doc', 'csv', 'tsv', 'rtf'].includes(ext) ? ext : 'txt'
      try {
        if (['txt', 'md', 'html', 'csv', 'tsv'].includes(ext)) {
          contentText = fs.readFileSync(filePath, 'utf-8')
        }
      } catch {}
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
