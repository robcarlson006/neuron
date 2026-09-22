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
import { parseDocumentTopology } from '../../src/lib/coverage/documentTopologyParser'
import {
  buildCKRFMemoryBlock,
  recordTopicAssessment,
  recordMisconception,
  recordConceptSuccess,
  recordEpisodicMemory
} from '../../src/lib/memory/ckrfMemoryService'
import {
  updateTopicSrsState,
  getTopicsRetention,
  getSubjectRetentionSummary,
  getTopDueMaintenanceTopics
} from '../../src/lib/memory/topicSrsEngine'
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
  try {
    db.prepare('ALTER TABLE daily_plans ADD COLUMN is_dismissed INTEGER DEFAULT 0').run()
  } catch {
    // already exists
  }
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
        VALUES (?, ?, 'Tutor Session', 'deepseek-flash', ?, ?)
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
  if (params.durationMinutes === null || params.durationMinutes <= 0) return ''

  const elapsed = Math.floor((params.timeElapsedSeconds ?? 0) / 60)
  const remaining = Math.max(0, Math.floor((params.timeRemainingSeconds ?? params.durationMinutes * 60) / 60))
  const remainingSecs = params.timeRemainingSeconds !== undefined ? params.timeRemainingSeconds : params.durationMinutes * 60
  const total = params.durationMinutes
  const status = params.pacingStatus ?? 'ON_TRACK'
  const depthNames: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Proficient', 4: 'Expert', 5: 'Professor' }
  const diffLabel = depthNames[params.depthLevel ?? 3] || 'Proficient'

  const lines = [
    '',
    'SESSION TIME & DURATION CONTEXT:',
    `- Total planned session: ${total} minutes`,
    `- Difficulty: ${diffLabel}`,
    `- Time elapsed: ~${elapsed} minutes`,
    `- Time remaining: ~${remaining} minutes (${Math.max(0, Math.round(remainingSecs))} seconds)`,
    `- Pacing status: ${status}`,
    ''
  ]

  if (remainingSecs > 60) {
    lines.push(
      'STRICT DURATION & CONTINUOUS ENGAGEMENT MANDATE:',
      `- MANDATORY ACTIVE LEARNING: You have ~${remaining} minutes remaining out of ${total} minutes.`,
      `- NEVER END EARLY: You are STRICTLY FORBIDDEN from ending the session early, saying farewell ("Great work today"), summarizing as if done, or emitting [SESSION_END] while time remains.`,
      `- CONTINUOUS QUESTIONING MANDATE: Every single response MUST end with a concrete, thought-provoking question, problem, Socratic scenario, or active recall challenge for the student to solve.`,
      `- WHEN A TOPIC/CONCEPT IS MASTERED: Do NOT stop! Seamlessly advance to:`,
      `  1) A harder application or subtle counterfactual edge case testing boundary conditions`,
      `  2) An integrative question connecting this topic to previous concepts or the next syllabus topic`,
      `  3) A Socratic "Why/How" deep dive into underlying causal mechanisms`,
      `- KEEP THE MOMENTUM ACTIVE: Keep challenging and teaching the student continuously until the clock fully expires.`
    )
  } else if (remainingSecs > 0) {
    lines.push(
      'FINAL MINUTE PACING (< 1 min remaining):',
      `- You have under 1 minute remaining. Ask one concise final synthesis question or test a core takeaway. Do NOT emit [SESSION_END] until time is fully 0.`
    )
  } else {
    lines.push(
      'TIME IS UP (0 minutes remaining):',
      `- The scheduled session duration has expired. Provide a concise closing summary of key takeaways and include [SESSION_END] at the very end.`
    )
  }

  return lines.join('\n')
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
      `- Phase 1 (first ~25%, ~${Math.round(durationMinutes * 0.25)} min): Establish baseline understanding of core topics through active recall and explanation.`,
      `- Phase 2 (middle ~50%, ~${Math.round(durationMinutes * 0.5)} min): Iterate through approaches — question, apply, connect, challenge with edge cases.`,
      depthLevel >= 4
        ? '  After each correct answer, pivot to a NEW ANGLE on the topic. Challenge assumptions and probe edge cases.'
        : depthLevel <= 2
          ? '  After each correct answer, introduce a new related topic or subtopic. Keep breadth expanding.'
          : '  After each correct answer, either go deeper with application or introduce a related subtopic.',
      `- Phase 3 (final ~25%, ~${Math.round(durationMinutes * 0.25)} min): Synthesize across covered concepts. Ask integrative questions.`,
      '- CRITICAL: Never let the session go silent or conclude early. Keep generating questions and challenges continuously throughout the entire scheduled time block.',
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
      '   e) ADVANCE: When the student demonstrates solid understanding, DO NOT STOP — immediately transition to the next subtopic or elevate to application scenarios. Keep the dialogue moving forward.',
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
    const ckrfBlock = buildCKRFMemoryBlock(database, userId, subjectId)

    const memories = database.prepare(`
      SELECT topic, mastery_level, strengths, struggles
      FROM tutor_topic_memories
      WHERE subject_id = ? AND user_id = ?
      ORDER BY last_studied_at DESC
      LIMIT 20
    `).all(subjectId, userId) as { topic: string; mastery_level: string; strengths: string | null; struggles: string | null }[]

    const blocks: string[] = []

    if (ckrfBlock.trim()) {
      blocks.push(ckrfBlock.trim())
    }

    // Include legacy summary if CKRF ratings aren't yet populated
    if (memories.length > 0 && !ckrfBlock.includes('COGNITIVE KNOWLEDGE & PSYCHOMETRIC RATINGS')) {
      const mastered = memories.filter(m => m.mastery_level === 'mastered' || m.mastery_level === 'good')
      const struggling = memories.filter(m => m.mastery_level === 'struggling' || m.mastery_level === 'developing')

      const lines: string[] = ['HISTORICAL LEARNING MEMORY (FROM PREVIOUS SESSIONS):']
      if (mastered.length > 0) {
        lines.push(`- Concepts student has strong command of: ${mastered.map(m => m.topic + (m.strengths ? ` (${m.strengths})` : '')).slice(0, 10).join('; ')}`)
      }
      if (struggling.length > 0) {
        lines.push(`- Concepts student has struggled with: ${struggling.map(m => m.topic + (m.struggles ? ` (${m.struggles})` : '')).slice(0, 10).join('; ')}`)
        lines.push(`- Pedagogical Note: Prioritize reinforcing these struggled areas with intuitive examples before advancing.`)
      }
      blocks.push(lines.join('\n'))
    }

    if (!blocks.length) return ''
    return '\n' + blocks.join('\n\n') + '\n'
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
    summary: summaryText || '',
    breakthroughs: [] as Array<{ topic: string; summary: string; effective_intervention?: string; importance_score?: number }>,
    misconceptions: [] as Array<{ concept: string; misconception_title: string; description: string }>
  }

  try {
    const apiKey = getApiKey()
    const config = getAIConfig()

    if (apiKey) {
      const prompt = `You are an educational analytics AI and cognitive memory specialist. Analyze this tutoring session dialogue between Tutor and Student for class "${className}".

DIALOGUE:
${transcript}

Extract:
1. "strengths": Array of 1-4 specific concepts, topics, or skills the student demonstrated good understanding of or answered correctly.
2. "struggles": Array of 1-4 specific concepts, topics, or misconceptions the student struggled with, answered incorrectly, or needed hints for.
3. "topics_covered": Array of 1-5 syllabus/subject topics covered during this session.
4. "summary": A 1-2 sentence summary of what was accomplished and areas to focus on next.
5. "breakthroughs": Array of 0-3 objects for moments where the student had a clear breakthrough or where a specific explanation/analogy worked well:
   [{"topic": "string", "summary": "what clicked", "effective_intervention": "analogy or prompt that helped", "importance_score": 7}]
6. "misconceptions": Array of 0-3 objects for specific conceptual errors or mental model traps exhibited:
   [{"concept": "string", "misconception_title": "short title", "description": "precise misconception explanation"}]

Return STRICT JSON ONLY, no extra text, in this format:
{
  "strengths": ["string"],
  "struggles": ["string"],
  "topics_covered": ["string"],
  "summary": "string",
  "breakthroughs": [{"topic": "string", "summary": "string", "effective_intervention": "string", "importance_score": 7}],
  "misconceptions": [{"concept": "string", "misconception_title": "string", "description": "string"}]
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
        if (Array.isArray(parsed.breakthroughs)) {
          evaluation.breakthroughs = parsed.breakthroughs.filter((b: any) => b && typeof b.topic === 'string' && typeof b.summary === 'string')
        }
        if (Array.isArray(parsed.misconceptions)) {
          evaluation.misconceptions = parsed.misconceptions.filter((m: any) => m && typeof m.concept === 'string' && typeof m.description === 'string')
        }
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
    if (evaluation.topics_covered.length === 0 && options?.targetTopics && options.targetTopics.length <= 2) {
      for (const t of options.targetTopics) {
        if (t && typeof t === 'string' && t.trim() && !evaluation.topics_covered.includes(t.trim())) {
          evaluation.topics_covered.push(t.trim())
        }
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

    // Update CKRF Rating & advance concept remediation
    try {
      recordTopicAssessment(database, session.user_id, session.subject_id, cleanTopic, {
        itemDifficulty: 3,
        score: 1.0
      })
      recordConceptSuccess(database, session.user_id, session.subject_id, cleanTopic)
    } catch (ckrfErr) {
      console.warn('CKRF strength update error:', ckrfErr)
    }
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

    // Update CKRF Rating for struggle
    try {
      recordTopicAssessment(database, session.user_id, session.subject_id, cleanTopic, {
        itemDifficulty: 3,
        score: 0.25
      })
    } catch (ckrfErr) {
      console.warn('CKRF struggle update error:', ckrfErr)
    }
  }

  // Persist CKRF Misconceptions
  for (const misc of evaluation.misconceptions) {
    try {
      const misconceptionKey = `${misc.concept.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_misconception`
      recordMisconception(database, session.user_id, session.subject_id, {
        concept: misc.concept,
        misconceptionKey,
        misconceptionTitle: misc.misconception_title || `Misconception on ${misc.concept}`,
        description: misc.description
      })
    } catch (miscErr) {
      console.warn('CKRF misconception recording error:', miscErr)
    }
  }

  // Persist CKRF Episodic Memories (Breakthroughs & Session Profile)
  for (const bt of evaluation.breakthroughs) {
    try {
      recordEpisodicMemory(database, {
        userId: session.user_id,
        subjectId: session.subject_id,
        topic: bt.topic,
        memoryType: bt.effective_intervention ? 'analogy' : 'breakthrough',
        importanceScore: bt.importance_score || 7,
        summary: bt.summary,
        effectiveIntervention: bt.effective_intervention,
        sessionId
      })
    } catch (btErr) {
      console.warn('CKRF episodic memory recording error:', btErr)
    }
  }

  // Save session profile summary node
  if (evaluation.summary) {
    try {
      recordEpisodicMemory(database, {
        userId: session.user_id,
        subjectId: session.subject_id,
        topic: evaluation.topics_covered[0] || className,
        memoryType: 'pedagogical_profile',
        importanceScore: 6,
        summary: evaluation.summary,
        sessionId
      })
    } catch (epErr) {
      console.warn('CKRF session profile recording error:', epErr)
    }
  }

  const effectiveModuleId = options?.moduleId || session.module_id

  // Collect candidate topics for this subject
  const subjectTopics = database.prepare(`
    SELECT mt.id, mt.module_id, mt.title, mt.has_new_material, mt.is_gap
    FROM module_topics mt
    JOIN syllabus_modules sm ON sm.id = mt.module_id
    WHERE sm.subject_id = ?
  `).all(session.subject_id) as Array<{ id: number; module_id: number; title: string; has_new_material: number; is_gap: number }>

  // Helper to match a topic title string to database module topics
  function matchTopicToSubject(topicStr: string): { id: number; module_id: number; title: string } | undefined {
    if (!topicStr || typeof topicStr !== 'string') return undefined
    const q = topicStr.trim().toLowerCase()
    const qAlnum = q.replace(/[^a-z0-9]/g, '')
    if (!qAlnum) return undefined

    // 1. Exact match within effective module or whole subject
    if (effectiveModuleId) {
      const modExact = subjectTopics.find(t => t.module_id === effectiveModuleId && t.title.trim().toLowerCase() === q)
      if (modExact) return modExact
    }
    const exact = subjectTopics.find(t => t.title.trim().toLowerCase() === q)
    if (exact) return exact

    // 2. Alphanumeric match (ignores punctuation/whitespace)
    if (effectiveModuleId) {
      const modAlnum = subjectTopics.find(t => t.module_id === effectiveModuleId && t.title.toLowerCase().replace(/[^a-z0-9]/g, '') === qAlnum)
      if (modAlnum) return modAlnum
    }
    const alnum = subjectTopics.find(t => t.title.toLowerCase().replace(/[^a-z0-9]/g, '') === qAlnum)
    if (alnum) return alnum

    // 3. Substring inclusion
    if (q.length >= 4) {
      const subMatch = subjectTopics.find(t => {
        const tLower = t.title.toLowerCase()
        return tLower.includes(q) || q.includes(tLower)
      })
      if (subMatch) return subMatch
    }

    // 4. Word-token overlap (matches e.g. "Opportunity Cost" to "Opportunity Cost and Trade-offs")
    const qWords = q.split(/\s+/).filter(w => w.length > 3)
    if (qWords.length > 0) {
      let bestMatch: { id: number; module_id: number; title: string } | undefined
      let bestScore = 0
      for (const t of subjectTopics) {
        const tWords = new Set(t.title.toLowerCase().split(/\s+/).filter(w => w.length > 3))
        let hits = 0
        for (const qw of qWords) {
          if (tWords.has(qw)) hits++
        }
        const score = hits / qWords.length
        if (score >= 0.5 && score > bestScore) {
          bestScore = score
          bestMatch = t
        }
      }
      if (bestMatch) return bestMatch
    }

    return undefined
  }

  // Determine which topics were covered in this session
  const topicsToLog = new Set<string>()
  if (Array.isArray(evaluation.topics_covered) && evaluation.topics_covered.length > 0) {
    for (const top of evaluation.topics_covered) {
      if (top && typeof top === 'string' && top.trim()) {
        topicsToLog.add(top.trim())
      }
    }
  }

  // If user targeted a specific small set of topics (<= 2), ensure they are also included in topicsToLog
  if (options?.targetTopics && Array.isArray(options.targetTopics) && options.targetTopics.length <= 2) {
    for (const t of options.targetTopics) {
      if (t && typeof t === 'string' && t.trim()) {
        topicsToLog.add(t.trim())
      }
    }
  }

  const touchedModuleIds = new Set<number>()
  if (effectiveModuleId) touchedModuleIds.add(effectiveModuleId)

  // Log covered topics in module_topic_study_log and clear new_content / gap flags
  for (const topStr of topicsToLog) {
    try {
      const modTopic = matchTopicToSubject(topStr)
      if (modTopic) {
        touchedModuleIds.add(modTopic.module_id)

        database.prepare(`
          INSERT OR REPLACE INTO module_topic_study_log (topic_id, user_id, studied_at)
          VALUES (?, ?, ?)
        `).run(modTopic.id, session.user_id, now)

        database.prepare(`
          UPDATE module_topics SET has_new_material = 0, is_gap = 0 WHERE id = ?
        `).run(modTopic.id)

        // Topic-SRS: Determine FSRS rating from dialogue evaluation
        const isStruggle = evaluation.struggles.some(s => s.toLowerCase().includes(topStr.toLowerCase()) || topStr.toLowerCase().includes(s.toLowerCase()))
        const isStrength = evaluation.strengths.some(s => s.toLowerCase().includes(topStr.toLowerCase()) || topStr.toLowerCase().includes(s.toLowerCase()))

        let srsRating: 1 | 2 | 3 | 4 = 3
        if (isStruggle && !isStrength) {
          srsRating = 1
        } else if (isStruggle && isStrength) {
          srsRating = 2
        } else if (isStrength && !isStruggle) {
          srsRating = 4
        } else {
          srsRating = 3
        }

        try {
          updateTopicSrsState(database, session.user_id, session.subject_id, modTopic.id, srsRating, now)
        } catch (srsErr) {
          console.warn('Failed to update topic SRS state:', srsErr)
        }
      }
    } catch { /* ignore */ }
  }

  // Recalculate and sync parent module completion statuses
  for (const modId of touchedModuleIds) {
    syncModuleCompletionStatus(database, modId, session.user_id)
  }

  return evaluation
}

// ── Response post-processing (fix garbled text) ──────────────────────────

function cleanupAIResponse(text: string): string {
  let cleaned = text
  // 1. Remove duplicate consecutive words ("WelcomeWelcome!" → "Welcome!")
  cleaned = cleaned.replace(/\b([A-Za-z]{3,})\s+\1\b/gi, '$1')
  // 2. Fix missing space after punctuation marks before a capital letter (not inside code/tables)
  cleaned = cleaned.replace(/([.!?])([A-Z])/g, '$1 $2')
  // 3. Normalize multiple horizontal spaces to single space without destroying newlines/paragraphs/tables
  cleaned = cleaned.replace(/[^\S\r\n]{2,}/g, ' ')
  // 4. Normalize excessive newlines to at most double newlines (paragraphs)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  // 5. Fix whitespace before punctuation (remove space before period/comma, not colons used in tables :---)
  cleaned = cleaned.replace(/[^\S\r\n]+([.,!?])/g, '$1')
  // 6. Trim leading/trailing whitespace
  cleaned = cleaned.trim()

  // Quality gate: log warning if response still looks bad
  if (cleaned) {
    const duplicateCount = (cleaned.match(/\b([A-Za-z]{3,})\s+\1\b/gi) || []).length
    const words = cleaned.split(/\s+/)
    const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / words.length
    if (duplicateCount > 2 || avgWordLen > 12) {
      console.warn(`[tutor] AI response quality warning: ${duplicateCount} dupes, avg word len ${avgWordLen.toFixed(1)}`)
    }
  }

  return cleaned
}

// ── Focus Block Prompt Builder ───────────────────────────────────────────

export interface BuildFocusBlockPromptParams {
  availableMinutes: number
  subjectBriefs: string
  completedText?: string
  contextType?: 'pre_event' | 'post_event' | 'standard'
  eventTitle?: string
  subjectName?: string
  subjectId?: number
  lectureTopic?: string
  materialsSummary?: string
}

export function buildFocusBlockPrompt(params: BuildFocusBlockPromptParams): string {
  const {
    availableMinutes,
    subjectBriefs,
    completedText = '',
    contextType,
    eventTitle,
    subjectName,
    lectureTopic,
    materialsSummary
  } = params

  let contextDirectives = ''

  if (contextType === 'post_event') {
    contextDirectives = `
SPECIAL CONTEXT: POST-LECTURE CONCEPT LOCK-IN SPRINT
- The student just finished class: "${eventTitle || 'Lecture'}" (${subjectName || 'Current Subject'}).
${lectureTopic ? `- Lecture Topic covered today: "${lectureTopic}".` : ''}
${materialsSummary ? `- Associated Material: ${materialsSummary}` : ''}
- High-Yield Cognitive Science Retention Protocol:
  1. Free Recall Brain Dump: 3-5 min retrieval of 2-3 core principles or mechanism summary (action_type: "tutor_drill", target_topic: "${lectureTopic || 'Lecture Recap'}", learning_objective: "Active retrieval of key concepts from today's lecture").
  2. Socratic Elaborative Dialogue: 5-15 min targeted deep-dive probing underlying mechanisms and misconceptions (action_type: "tutor_drill", target_topic: "${lectureTopic || 'Lecture Recap'}").
  3. Card Synthesis: 5-10 min flashcard review / generation to schedule into spaced repetition (action_type: "flashcards").
- Balance: Prioritize consolidating this lecture, while also ensuring overdue flashcards from any active subject are reviewed.
`
  } else if (contextType === 'pre_event') {
    contextDirectives = `
SPECIAL CONTEXT: PRE-CLASS PRIMER
- The student has an upcoming class: "${eventTitle || 'Upcoming Class'}" (${subjectName || 'Subject'}) starting soon.
- Prime the student's mind: focus on high-yield flashcard definitions, prerequisite concepts, and resolving prior misconceptions for ${subjectName || 'this subject'} so they step into class confident and ready to engage.
`
  }

  return `You are an expert academic coach and learning planner. The student is starting an immediate "Focus Block" study sprint right now.

AVAILABLE TIME WINDOW: ${availableMinutes} MINUTES TOTAL.
${contextDirectives}
STUDENT CLASSES & CURRENT STATUS:
${subjectBriefs}

${completedText}

TASK:
Create a focused 1 to 3 step study sprint that fits EXACTLY into the ${availableMinutes} minutes total.
Strict Prioritization Order:
1. Spaced Repetition Due Flashcards: If cards are due, include a card review step (typically 10-15 min, action_type: "flashcards").
2. Weakness Interventions: If the student has recorded struggles or misconceptions in tutor memory, allocate a targeted Socratic drill (typically 15-25 min, action_type: "tutor_drill") with a specific target_topic and pedagogical learning_objective.
3. Syllabus Forward Progress: If time remains, allocate time to reading or working through the current syllabus module (action_type: "syllabus_read").

CRITICAL CONSTRAINTS:
- The sum of estimated_minutes of all items in focus_items MUST equal ${availableMinutes} (within +/- 5 minutes).
- Return between 1 and 3 items total.
- Be specific, actionable, and encouraging.

Return ONLY valid JSON matching this schema:
{
  "focus_items": [
    {
      "subject_id": 1,
      "action_type": "flashcards" | "tutor_drill" | "syllabus_read",
      "suggested_action": "Clear, concise title of the step",
      "learning_objective": "1 sentence pedagogical focus or goal",
      "target_topic": "Specific topic name or null",
      "estimated_minutes": 15,
      "priority": 1
    }
  ]
}`
}

// ── Register all handlers ───────────────────────────────────────────────

export function registerTutorHandlers(): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // TUTOR SESSION CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tutor:createSession', (_event, subjectId: number, userId: number, sessionType?: string, moduleId?: number, config?: { duration_minutes: number | null; depth_level: number; never_studied: number | boolean; title?: string }) => {
    const now = new Date().toISOString()
    const nowMs = Date.now()
    // Use null for subject when 0 (general chat) — FK allows null
    const actualSubjectId = subjectId > 0 ? subjectId : null
    const actualUserId = userId > 0 ? userId : null
    const neverStudiedVal = config?.never_studied ? 1 : 0
    const initialTitle = config?.title || null
    const result = db.prepare(`
      INSERT INTO tutor_sessions (subject_id, user_id, session_type, phase, module_id, started_at, duration_minutes, depth_level, never_studied, title, last_message_at, is_pinned)
      VALUES (?, ?, ?, 'structured_qa', ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      actualSubjectId,
      actualUserId,
      sessionType || 'tutor',
      moduleId || null,
      now,
      config?.duration_minutes ?? null,
      config?.depth_level ?? 3,
      neverStudiedVal,
      initialTitle,
      nowMs
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

  ipcMain.handle('tutor:listSessions', (_event, subjectId?: number | null, limit: number = 50) => {
    if (subjectId !== undefined && subjectId !== null && subjectId > 0) {
      return db.prepare(`
        SELECT ts.*, s.name as subject_name,
          (SELECT content FROM messages WHERE conversation_id = ts.id AND role != 'system' ORDER BY created_at DESC LIMIT 1) as last_message_preview,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = ts.id AND role != 'system') as message_count
        FROM tutor_sessions ts
        LEFT JOIN subjects s ON s.id = ts.subject_id
        WHERE ts.subject_id = ?
        ORDER BY ts.is_pinned DESC, COALESCE(ts.last_message_at, strftime('%s', ts.started_at) * 1000) DESC, ts.id DESC
        LIMIT ?
      `).all(subjectId, limit)
    } else if (subjectId === 0) {
      return db.prepare(`
        SELECT ts.*, 'General Tutor' as subject_name,
          (SELECT content FROM messages WHERE conversation_id = ts.id AND role != 'system' ORDER BY created_at DESC LIMIT 1) as last_message_preview,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = ts.id AND role != 'system') as message_count
        FROM tutor_sessions ts
        WHERE ts.subject_id IS NULL OR ts.subject_id = 0
        ORDER BY ts.is_pinned DESC, COALESCE(ts.last_message_at, strftime('%s', ts.started_at) * 1000) DESC, ts.id DESC
        LIMIT ?
      `).all(limit)
    } else {
      return db.prepare(`
        SELECT ts.*, COALESCE(s.name, 'General Tutor') as subject_name,
          (SELECT content FROM messages WHERE conversation_id = ts.id AND role != 'system' ORDER BY created_at DESC LIMIT 1) as last_message_preview,
          (SELECT COUNT(*) FROM messages WHERE conversation_id = ts.id AND role != 'system') as message_count
        FROM tutor_sessions ts
        LEFT JOIN subjects s ON s.id = ts.subject_id
        ORDER BY ts.is_pinned DESC, COALESCE(ts.last_message_at, strftime('%s', ts.started_at) * 1000) DESC, ts.id DESC
        LIMIT ?
      `).all(limit)
    }
  })

  ipcMain.handle('tutor:updateSessionTitle', (_event, sessionId: number, title: string) => {
    db.prepare('UPDATE tutor_sessions SET title = ? WHERE id = ?').run(title.trim(), sessionId)
    return { success: true }
  })

  ipcMain.handle('tutor:toggleSessionPin', (_event, sessionId: number, isPinned: boolean) => {
    db.prepare('UPDATE tutor_sessions SET is_pinned = ? WHERE id = ?').run(isPinned ? 1 : 0, sessionId)
    return { success: true }
  })

  ipcMain.handle('tutor:updateSessionPhase', (_event, sessionId: number, phase: string) => {
    db.prepare('UPDATE tutor_sessions SET phase = ? WHERE id = ?').run(phase, sessionId)
    return { success: true }
  })

  ipcMain.handle('tutor:updateSessionDuration', (_event, sessionId: number, durationMinutes: number | null) => {
    db.prepare('UPDATE tutor_sessions SET duration_minutes = ? WHERE id = ?').run(durationMinutes, sessionId)
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
    const nowMs = Date.now()

    // Ensure a conversations record exists so the FK on messages is satisfied
    ensureConversationRecord(params.session_id)

    db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, content_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, params.session_id, params.role, params.content, params.content_type || 'text', now)

    // Update session timestamps
    db.prepare('UPDATE tutor_sessions SET ended_at = ?, last_message_at = ? WHERE id = ?').run(now, nowMs, params.session_id)

    // Auto-generate title if session does not have one yet
    try {
      const session = db.prepare('SELECT title, session_type FROM tutor_sessions WHERE id = ?').get(params.session_id) as { title?: string; session_type: string } | undefined
      if (session && (!session.title || session.title.trim() === '')) {
        let generatedTitle = ''
        if (params.role === 'user') {
          const text = params.content.trim()
          if (text.startsWith('Greet me and') || text.includes('Mode: SPACED RETENTION') || text.includes('Mode: FILL IN GAPS')) {
            const topicMatch = text.match(/Topic:\s*([^\n\r]+)/i) || text.match(/dive into ([^.]+)\./i) || text.match(/reinforcing ([^.]+)\./i) || text.match(/focus on ([^.]+)\./i)
            if (topicMatch && topicMatch[1]) {
              generatedTitle = topicMatch[1].trim()
            }
          } else {
            const firstLine = text.split('\n')[0].trim().replace(/^["'#*`]+/, '')
            generatedTitle = firstLine.length > 45 ? firstLine.slice(0, 42) + '...' : firstLine
          }
        }
        if (generatedTitle) {
          db.prepare('UPDATE tutor_sessions SET title = ? WHERE id = ?').run(generatedTitle, params.session_id)
        }
      }
    } catch (e) {
      console.warn('Auto-titling session failed:', e)
    }

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

    const prompt = `You are a Senior Cognitive Systems Engineer, Psychometric Assessment Specialist, and expert flashcard designer creating high-yield, atomic study cards from a tutoring session about "${subjectName}".${moduleContext}

<source_material>
${sessionContent.substring(0, 6000)}
</source_material>

Create a balanced MIX of atomic flashcards (term -> concise definition) and active recall questions (focused question -> concise mechanism/application) based on the session's key takeaways and trouble spots.${existingCardHints}

Generate 6-10 cards total. Format each card on its own line using this exact format:

**[Topic] Question or Term** -> Concise Answer or Definition

## STRICT PSYCHOMETRIC DESIGN RULES (CRITICAL):
1. **MINIMUM INFORMATION PRINCIPLE (ATOMICITY)**: Each card must test exactly ONE indivisible idea, mechanism, or fact. Never create compound cards or multi-item lists.
2. **ANSWER CONCISENESS (<15 WORDS / SINGLE BREATH)**:
   - Front: 1 clear, unambiguous question or term with optional domain tag in brackets (max 15 words). Do NOT include numbering (like "1.") inside the bold tags.
   - Back: Direct target answer (<15 words, speakable in a single breath). Get straight to the point—no filler, no paragraphs.
3. **SPOILER-FREE PROMPT FRAMING**: Never give away the answer or causal link inside the question (e.g. do NOT ask "Why does X cause Y?", ask "What effect is produced by X?").
4. **PROHIBITION OF LOW-EFFORT FORMATS**:
   - NO binary (Yes/No, True/False) prompts.
   - NO unranked list enumeration questions ("List the 4 types...").
5. **MATUSCHAK'S CONCEPTUAL LENSES**: Formulate items across defining attributes, differences (discrimination between confusable concepts), causes/effects, and practical implications.
6. **MATHEMATICAL NOTATION**: Wrap all equations and variables in LaTeX ($...$).
7. **STRICT ANTI-DUPLICATION**: Do NOT duplicate any existing cards listed above. Focus on fresh takeaways from this session.
8. **ZERO HALLUCINATIONS**: All cards MUST be derived strictly and exclusively from the <source_material> above.
9. Return ONLY the formatted cards. No introductory text, numbering outside format, or commentary.`

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

    // Build time context
    const timeContext = buildTimeContext({
      durationMinutes: params.durationMinutes ?? null,
      timeElapsedSeconds: params.timeElapsedSeconds,
      timeRemainingSeconds: params.timeRemainingSeconds,
      pacingStatus: params.pacingStatus,
      depthLevel: params.depthLevel
    })

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
          let contentSnippet = ''
          let topologySummary = ''
          if (mat.content_text.length <= 16000) {
            contentSnippet = mat.content_text
          } else {
            const topology = parseDocumentTopology(mat.content_text, mat.filename, 1000)
            topologySummary = `COMPLETE DOCUMENT STRUCTURE & TOPOLOGY (${topology.chunks.length} sections, ${mat.content_text.length.toLocaleString()} total characters):\n` +
              topology.chunks.map(c => `- Section ${c.index + 1}: "${c.title}" (${c.type}, approx. ${c.tokenEstimate} tokens)`).join('\n')

            const sampledChunks = topology.chunks.length <= 6
              ? topology.chunks
              : [
                  topology.chunks[0],
                  topology.chunks[Math.floor(topology.chunks.length * 0.25)],
                  topology.chunks[Math.floor(topology.chunks.length * 0.5)],
                  topology.chunks[Math.floor(topology.chunks.length * 0.75)],
                  topology.chunks[topology.chunks.length - 1]
                ].filter(Boolean)

            contentSnippet = sampledChunks.map(c => `=== SECTION ${c.index + 1}: ${c.title} ===\n${c.text}`).join('\n\n')
          }

          materialContextBlock = [
            '',
            `SPECIFIC MATERIAL STUDY FOCUS:`,
            `The student is studying the course document: "${mat.filename}".`,
            topologySummary ? `${topologySummary}\n` : '',
            `--- MATERIAL CONTENT SAMPLES & FOUNDATIONS START ---`,
            contentSnippet,
            `--- MATERIAL CONTENT SAMPLES & FOUNDATIONS END ---`,
            '',
            `CRITICAL SOURCE GROUNDING & PEDAGOGY DIRECTIVE:`,
            `1. STRICT SOURCE GROUNDING: You MUST base all questions, explanations, definitions, quizzes, and feedback on the content and concepts present across this material.`,
            `2. COMPLETE TOPOLOGY AWARENESS: You have the full outline and section topology above. Never claim a concept is "not in the uploaded material" if it belongs to any chapter, section, or topic outlined in this material.`,
            `3. UNUPLOADED SCOPE: Only if the student asks about a concept completely outside the discipline or this document, politely let them know and invite them to upload the relevant notes.`,
            ''
          ].filter(Boolean).join('\n')
        }
      } catch (err) {
        console.error('Failed to load specific material for tutor session:', err)
      }
    } else if (params.materialContent) {
      let contentSnippet = params.materialContent
      let topologySummary = ''
      if (params.materialContent.length > 16000) {
        const topology = parseDocumentTopology(params.materialContent, 'source_material', 1000)
        topologySummary = `COMPLETE DOCUMENT STRUCTURE & TOPOLOGY (${topology.chunks.length} sections, ${params.materialContent.length.toLocaleString()} characters):\n` +
          topology.chunks.map(c => `- Section ${c.index + 1}: "${c.title}"`).join('\n')

        const sampledChunks = topology.chunks.length <= 6
          ? topology.chunks
          : [
              topology.chunks[0],
              topology.chunks[Math.floor(topology.chunks.length * 0.25)],
              topology.chunks[Math.floor(topology.chunks.length * 0.5)],
              topology.chunks[Math.floor(topology.chunks.length * 0.75)],
              topology.chunks[topology.chunks.length - 1]
            ].filter(Boolean)

        contentSnippet = sampledChunks.map(c => `=== SECTION ${c.index + 1}: ${c.title} ===\n${c.text}`).join('\n\n')
      }

      materialContextBlock = [
        '',
        `SPECIFIC MATERIAL STUDY FOCUS:`,
        topologySummary ? `${topologySummary}\n` : '',
        `--- MATERIAL CONTENT START ---`,
        contentSnippet,
        `--- MATERIAL CONTENT END ---`,
        '',
        `CRITICAL SOURCE GROUNDING & PEDAGOGY DIRECTIVE:`,
        `1. STRICT SOURCE GROUNDING: Base all questions, explanations, definitions, quizzes, and feedback on the content provided above.`,
        `2. COMPLETE COVERAGE AWARENESS: You have the complete section outline and text samples. Engage with concepts across the entire document.`,
        `3. UNUPLOADED SCOPE: If the student asks about a topic completely unrelated to this material, guide them back to the covered topics.`,
        ''
      ].filter(Boolean).join('\n')
    } else {
      try {
        const subjectMaterials = db.prepare(`
          SELECT filename, content_text FROM materials
          WHERE subject_id = ? AND content_text IS NOT NULL AND LENGTH(content_text) > 50
          ORDER BY uploaded_at DESC LIMIT 5
        `).all(params.subjectId) as { filename: string; content_text: string }[]

        if (subjectMaterials.length > 0) {
          const combined = subjectMaterials.map(m => {
            if (m.content_text.length <= 8000) {
              return `[DOCUMENT: ${m.filename}]\n${m.content_text}`
            }
            const topology = parseDocumentTopology(m.content_text, m.filename, 800)
            const outline = `Outline: ${topology.chunks.map(c => c.title).join(' | ')}`
            const sample = topology.chunks.slice(0, 3).map(c => `[${c.title}]: ${c.text}`).join('\n\n')
            return `[DOCUMENT: ${m.filename} (${m.content_text.length.toLocaleString()} chars)]\n${outline}\n\n${sample}`
          }).join('\n\n---\n\n')

          materialContextBlock = [
            '',
            `SOURCE STUDY MATERIALS FOR THIS SUBJECT:`,
            `The student has uploaded the following course materials and lecture documents:`,
            `--- COURSE MATERIALS START ---`,
            combined,
            `--- COURSE MATERIALS END ---`,
            '',
            `CRITICAL NOTEBOOKLM GROUNDING DIRECTIVE:`,
            `1. STRICT SOURCE GROUNDING: Base all questions, explanations, definitions, quizzes, and feedback on the uploaded course materials and syllabus above.`,
            `2. MULTI-DOCUMENT AWARENESS: You are aware of all uploaded documents and their outlines above. Never claim a chapter or section is missing if it is outlined in the materials above.`,
            `3. UNUPLOADED TOPICS: If a student asks about a completely unuploaded course topic, invite them to upload the slides or notes.`,
            ''
          ].join('\n')
        } else {
          materialContextBlock = [
            '',
            `NOTICE: No study materials or lecture notes have been uploaded for this subject yet.`,
            `CRITICAL GROUNDING DIRECTIVE:`,
            `Politely inform the student that they should upload lecture slides, notes, or readings for this subject so you can tutor and quiz them based strictly on their actual class materials.`,
            ''
          ].join('\n')
        }
      } catch (err) {
        console.error('Failed to load subject materials for tutor session:', err)
      }
    }

    // ── Topic-SRS Spaced Maintenance / Interleaved Warmup Context ──
    let srsWarmupBlock = ''
    try {
      const resolvedUserId = userId || 1
      const summary = getSubjectRetentionSummary(db, resolvedUserId, params.subjectId)
      if (params.isSpacedReview) {
        // Dedicated Spaced Maintenance Session
        const targetTopicsList = params.spacedReviewTopics && params.spacedReviewTopics.length > 0
          ? params.spacedReviewTopics
          : summary.dueTopics.map(t => `${t.topicTitle} (Retention: ${Math.round(t.retrievability * 100)}%, Overdue: ${t.daysOverdue}d)`)
        
        srsWarmupBlock = [
          '',
          `DEDICATED SPACED REPETITION MAINTENANCE PROTOCOL (ACTIVE):`,
          `This session is a targeted SPICED RETENTION DRILL to combat memory decay.`,
          `Target due/fading topics requiring maintenance:`,
          ...targetTopicsList.map(t => `- ${t}`),
          `DIRECTIVES:`,
          `1. Focus strictly on rapid active recall, diagnostic hinge questions, and application scenarios for these decaying topics.`,
          `2. Do not spend time re-reading full textbook introductions; test the student's retrieval immediately.`,
          `3. If the student answers correctly with confidence, celebrate the retention and advance to the next due topic.`,
          `4. If the student exhibits retrieval lapse, provide a faded hint and test with a parallel problem to reset retention stability.`,
          ''
        ].join('\n')
      } else if (summary.dueTopics.length > 0) {
        // Interleaved Warmup inside a regular session
        const topDue = summary.dueTopics.slice(0, 2)
        srsWarmupBlock = [
          '',
          `COGNITIVE SPACED REPETITION WARMUP DIRECTIVE (INTERLEAVED RETRIEVAL):`,
          `Memory tracking shows the student is due for maintenance review on prerequisite topics:`,
          ...topDue.map(t => `- ${t.topicTitle} (Current Retention: ${Math.round(t.retrievability * 100)}%, Last studied: ${t.lastStudiedAt.split('T')[0]})`),
          `INTERLEAVING INSTRUCTION:`,
          `Before diving into new topics or during natural transition pauses, weave in ONE quick retrieval question testing one of these decaying concepts. This strengthens memory traces through spaced retrieval practice.`,
          ''
        ].join('\n')
      }
    } catch (srsErr) {
      console.warn('Failed to build SRS warmup block:', srsErr)
    }

    // Append all context blocks to syllabusContext
    syllabusContext += '\n' + timeContext + '\n' + depthBlock + '\n' + topicFocusBlock + '\n' + historicalMemoryBlock + '\n' + memoryBlock + '\n' + srsWarmupBlock + '\n' + materialContextBlock

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

PEDAGOGICAL RULES & 5-LAYER INSTRUCTIONAL FADING:
1. STRICT SOURCE GROUNDING: Ask questions and teach concepts present in the student's uploaded source materials.
2. Ask ONE question at a time — start with recall, progress to comprehension, then application and synthesis.
3. 5-LAYER INSTRUCTIONAL FADING PROTOCOL (Never give away answers immediately!):
   - Layer 1 (Meta-cognitive Probe): If the student is unsure or makes an error, ask them what specific principle or definition applies, or where their reasoning started.
   - Layer 2 (Conceptual Anchor): Identify the governing rule or theorem without doing the calculation/analysis for them.
   - Layer 3 (Faded Scaffold): Provide a partial structure or formula, prompting the student to actively execute the pivotal reasoning step.
   - Layer 4 (Explicit Model with Mirror Test): If still stuck after 2 failed attempts, demonstrate the method on a parallel ISOMORPHIC problem (never giving away the target problem directly), then immediately give them a mirror test to solve.
   - Layer 5 (Post-Reflection): Once correct, prompt them with: "Why did that step work?" or "What would happen if parameter X changed?" to cement deep transfer.
4. Give crisp, specific corrective feedback (what was right, what was missed) grounded in the source materials.
5. CONTINUOUS ADVANCEMENT: When the student has mastered a concept, smoothly elevate to harder multi-step scenarios, subtle counterfactuals, edge cases, or advance to the next syllabus subtopic. Never end early.
6. FORMATTING:
   - Use LaTeX for mathematical formulas, variables, and equations ($...$ inline, $$...$$ standalone, e.g. $P$, $Q$, $E = mc^2$, $(1, 2)$). Do NOT wrap currency amounts like $5 or $3 in LaTeX math — write currency as standard plain text ($5, $3).
   - ZERO-DEFECT TABLES: When presenting payoff matrices, comparison matrices, econometric regressions, financial schedules, or summary data, format them as clean Markdown tables (| Col 1 | Col 2 |) with each row on a new line. For numerical schedules, verify that vertical column sums match totals. For econometric tables, format clustered standard errors in parentheses directly below each coefficient and report significance markers ($^*p < 0.10, ^{**}p < 0.05, ^{***}p < 0.01$).
   - INTERACTIVE GRAPHS & VISUALIZATIONS (Vega-Lite):
     * USAGE FREQUENCY GUARDRAIL: Do NOT overuse charts. Only synthesize an interactive graph when explaining multi-variable models, equilibrium shifts (e.g., Supply/Demand, IS-LM, cost curves), phase diagrams, or dynamical systems, or when the student explicitly asks to visualize something. Never generate charts for simple definitions or single-variable facts.
     * HIGH-DEFINITION INTERACTIVE PARAMETERS: When adding sliders (params with bind: { input: "range", min: ..., max: ..., step: ... }), you MUST generate continuous coordinate points via data: { sequence: { start: 0, stop: N, step: S, as: "x" } } and calculate the curve values dynamically with transform: [{ calculate: "...", as: "y" }]. Use pow(base, exp) instead of ^ in expressions (e.g. C0 * pow(1 + r, datum.t)).
     * Output a valid Vega-Lite v5 JSON specification inside a vega-lite fenced code block with "width": "container".
7. STRICT SESSION COMPLETION RULE: Do NOT end the session, say goodbye, or output [SESSION_END] while time remains. Always conclude your message with a question or scenario.${syllabusContext}`,

      socratic: `You are now in the SOCRATIC DEEP DIVE phase for "${className}".

PEDAGOGICAL METHOD — Socratic Deep Dive & Diagnostic Probes:
1. STRICT SOURCE GROUNDING: Probe deeply into concepts, causal mechanisms, and applications found within the uploaded materials.
2. HINGE-POINT DIAGNOSTIC PROBES: Before advancing to a new concept, ask a Two-Tier Diagnostic question:
   - Tier 1: Ask for an outcome prediction in a novel or counterfactual scenario.
   - Tier 2: Challenge the student to justify the exact theoretical mechanism driving that outcome.
3. AUTHENTIC MISCONCEPTION ADDRESSING: If the student exhibits a common misconception, do not simply state that they are wrong. Formulate a brief Socratic counter-example that illuminates the logical contradiction.
4. Challenge the student to explain concepts in their own words as if explaining to an intelligent novice.
5. Ask them to connect concepts across different sections of the uploaded material.
6. Present plausible but subtly flawed claims based on the material and ask them to audit and correct the error.
7. Use the 5-Layer Fading Protocol when they struggle: scaffold the thinking rather than delivering the solution.
8. STRICT SESSION DURATION RULE: Do NOT end the session or output [SESSION_END] unless explicitly informed that session time has expired (0 min remaining). Always end with a challenging Socratic question.
9. FORMATTING:
   - When explaining formulas or equations, wrap inline math in $...$ (e.g. $E = mc^2$, coordinates $(1, 2)$) and standalone equations in $$...$$. Never use ^ for exponents — use proper LaTeX notation like $x^2$ or $x^{n+1}$. Do not wrap plain currency ($5, $10) in LaTeX.
   - When presenting payoff matrices, comparisons, econometric models, or tabular data, use clean Markdown tables with standard markdown table syntax (| Col 1 | Col 2 |) with each row on a new line and verified footing calculations.
   - INTERACTIVE GRAPHS & VISUALIZATIONS (Vega-Lite):
     * Use graphs judiciously (do not overuse). Only generate a vega-lite JSON specification when visualizing complex models, equilibrium shifts, curves, or counterfactual comparative statics.
     * When adding sliders (params with bind: { input: "range" }), use data: { sequence: ... } and transform: [{ calculate: "...", as: "..." }] with pow(a, b) so the curve dynamically moves when the slider is dragged.

Your goal: push beyond surface memorization of the material into deep conceptual transfer.${syllabusContext}`,

      summary: `You are wrapping up a tutoring session for "${className}".

PEDAGOGICAL METHOD — Session Summary Phase:
1. Summarize the key concepts from the uploaded materials that were explored during this session.
2. Identify what the student understood with clarity and precision (be specific).
3. Identify specific conceptual gaps or misconceptions that still require reinforcement.
4. Generate 5-7 high-yield study cards based strictly on the uploaded source material in this format (one per line):
   **[Topic] Question or Term** -> Concise Answer or Definition
5. STRICT RETRIEVAL ENGINEERING RULES:
   - Minimum Information Principle: Each card tests exactly ONE atomic proposition.
   - Answer Conciseness: Backs must be strictly concise (<15 words, spoken in a single breath).
   - Anti-Pattern Prohibitions: NO binary questions (Yes/No), NO unranked lists ("List the 5..."), NO spoiler prompts.
   - Mix contrast-pair discrimination cards AND 2-step application questions across Bloom's Taxonomy.
6. Cover BOTH mastered concepts (for retention) and identified weak areas.
7. End with a clear, actionable recommendation for what module or problem archetype to tackle next.${syllabusContext}
8. When showing formulas or equations, wrap inline math in $...$ (e.g. $E = mc^2$, $(1, 2)$) and standalone equations in $$...$$. Never use ^ for exponents. Do not wrap currency ($5, $10) in LaTeX. You can also use Markdown tables for comparison summaries.`
    }

    const systemInstruction = phaseInstructions[params.phase] ||
      `You are a helpful AI tutor for "${className}". Answer questions and help the student learn strictly from the provided source materials. Do not hallucinate or quiz on unuploaded topics. Wrap math in LaTeX ($...$) and format tabular data in Markdown tables (do not wrap currency in LaTeX). If visualizing complex economic or scientific models, you may provide a vega-lite specification, but do not overuse graphs.${syllabusContext}`

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
      userMessage = `[The student attached study material for context]\n\n${params.attachedContent.substring(0, 32000)}\n\n---\n\n${userMessage}`
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
      WHERE p.user_id = ? AND p.plan_date = ? AND (p.is_dismissed = 0 OR p.is_dismissed IS NULL)
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
      WHERE p.user_id = ? AND p.plan_date = ? AND (p.is_dismissed = 0 OR p.is_dismissed IS NULL)
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

  ipcMain.handle('plan:generateFocusBlock', async (
    _event,
    userId: number,
    availableMinutes: number,
    date: string,
    contextOptions?: {
      contextType?: 'pre_event' | 'post_event' | 'standard'
      eventTitle?: string
      subjectName?: string
      subjectId?: number
      lectureTopic?: string
      materialsSummary?: string
    }
  ) => {
    const totalMinutes = Math.max(10, Math.min(240, availableMinutes || 30))

    // Collect all active subjects
    const subjects = db.prepare(
      "SELECT id, name, course_code, time_commitment_minutes FROM subjects WHERE user_id = ? AND status != 'archived'"
    ).all(userId) as { id: number; name: string; course_code?: string; time_commitment_minutes: number }[]

    if (subjects.length === 0) {
      return []
    }

    // Keep completed items today; remove uncompleted ones so we don't pile up stale suggestions
    db.prepare('DELETE FROM daily_plans WHERE user_id = ? AND plan_date = ? AND is_completed = 0').run(userId, date)

    // Check completed tasks today to avoid duplicates
    const completedToday = db.prepare(`
      SELECT suggested_action, target_topic, subject_id FROM daily_plans
      WHERE user_id = ? AND plan_date = ? AND is_completed = 1
    `).all(userId, date) as { suggested_action: string; target_topic: string | null; subject_id: number }[]

    // Gather subjects state: due cards, weak topics, current modules, deadlines
    interface SubjectData {
      id: number
      name: string
      dueCardCount: number
      strugglingTopics: { topic: string; struggles: string | null; mastery_level: string }[]
      currentModule?: SyllabusModule
      nextModule?: SyllabusModule
      deadlines: { label: string; deadline_date: string }[]
    }

    const subjectsData: SubjectData[] = []

    for (const subject of subjects) {
      const dueCards = db.prepare(`
        SELECT COUNT(*) as count FROM card_schedule cs
        JOIN cards c ON c.id = cs.card_id
        WHERE cs.user_id = ? AND c.subject_id = ? AND cs.due_date <= ?
      `).get(userId, subject.id, date) as { count: number }

      let strugglingTopics: { topic: string; struggles: string | null; mastery_level: string }[] = []
      try {
        strugglingTopics = db.prepare(`
          SELECT topic, struggles, mastery_level FROM tutor_topic_memories
          WHERE user_id = ? AND subject_id = ? AND (mastery_level IN ('struggling', 'developing') OR struggles IS NOT NULL)
          ORDER BY last_studied_at DESC LIMIT 5
        `).all(userId, subject.id) as { topic: string; struggles: string | null; mastery_level: string }[]
      } catch {
        // In case table not yet created
        strugglingTopics = []
      }

      const modules = db.prepare(`
        SELECT * FROM syllabus_modules WHERE subject_id = ? ORDER BY sort_order ASC
      `).all(subject.id) as SyllabusModule[]

      const deadlines = db.prepare(`
        SELECT label, deadline_date FROM deadlines WHERE subject_id = ? ORDER BY deadline_date ASC
      `).all(subject.id) as { label: string; deadline_date: string }[]

      const currentModule = modules.find(m => m.status === 'in_progress')
      const nextModule = modules.find(m => m.status === 'pending')

      subjectsData.push({
        id: subject.id,
        name: subject.name,
        dueCardCount: dueCards?.count || 0,
        strugglingTopics,
        currentModule,
        nextModule,
        deadlines
      })
    }

    // Helper: deterministic fallback builder
    const buildDeterministicFocusBlock = (): any[] => {
      const items: any[] = []
      let remainingMinutes = totalMinutes

      if (contextOptions?.contextType === 'post_event') {
        const targetSubj = subjects.find(s => s.id === contextOptions.subjectId) || subjects[0]
        const topicName = contextOptions.lectureTopic || 'Today\'s Lecture'
        const drillMin = Math.max(10, Math.round(totalMinutes * 0.6))
        const cardMin = totalMinutes - drillMin

        items.push({
          subject_id: targetSubj.id,
          action_type: 'tutor_drill',
          suggested_action: `Post-Lecture Recall & Socratic Debrief: ${topicName}`,
          learning_objective: `Active retrieval of core mechanisms from ${topicName}`,
          target_topic: topicName,
          estimated_minutes: drillMin,
          priority: 1
        })

        if (cardMin >= 5) {
          items.push({
            subject_id: targetSubj.id,
            action_type: 'flashcards',
            suggested_action: `Flashcard Review & Synthesis: ${targetSubj.name}`,
            learning_objective: 'Reinforce new terms and review due cards',
            target_topic: topicName,
            estimated_minutes: cardMin,
            priority: 2
          })
        }
        return items
      }

      if (contextOptions?.contextType === 'pre_event') {
        const targetSubj = subjects.find(s => s.id === contextOptions.subjectId) || subjects[0]
        items.push({
          subject_id: targetSubj.id,
          action_type: 'flashcards',
          suggested_action: `Pre-Class Primer Drill: ${targetSubj.name}`,
          learning_objective: `Review definitions and prerequisite concepts before ${contextOptions.eventTitle || 'class'}`,
          target_topic: null,
          estimated_minutes: totalMinutes,
          priority: 1
        })
        return items
      }

      // 1. Due cards first
      const subjectsWithDue = subjectsData.filter(s => s.dueCardCount > 0).sort((a, b) => b.dueCardCount - a.dueCardCount)
      if (subjectsWithDue.length > 0 && remainingMinutes >= 10) {
        const topSubject = subjectsWithDue[0]
        const cardMinutes = Math.min(remainingMinutes >= 45 ? 20 : 15, remainingMinutes, Math.max(10, Math.ceil(topSubject.dueCardCount * 0.75)))
        items.push({
          subject_id: topSubject.id,
          action_type: 'flashcards',
          suggested_action: `Review ${topSubject.dueCardCount} due flashcards in ${topSubject.name}`,
          learning_objective: `Reinforce memory retention and clear the spaced repetition queue`,
          target_topic: null,
          estimated_minutes: cardMinutes,
          priority: 1
        })
        remainingMinutes -= cardMinutes
      }

      // 2. Overdue Topic-SRS Maintenance Drill (Curriculum Spaced Repetition)
      const dueMaintenanceTopics = getTopDueMaintenanceTopics(db, userId, 3)
      if (dueMaintenanceTopics.length > 0 && remainingMinutes >= 15) {
        const topDue = dueMaintenanceTopics[0]
        const drillMinutes = Math.min(remainingMinutes, 20)
        const subjName = subjects.find(s => s.id === topDue.subjectId)?.name || 'Curriculum'
        items.push({
          subject_id: topDue.subjectId,
          action_type: 'tutor_drill',
          suggested_action: `Spaced Retention Drill: ${topDue.topicTitle} (${subjName})`,
          learning_objective: `Combat forgetting: retention has decayed to ${Math.round(topDue.retrievability * 100)}% (due for review)`,
          target_topic: topDue.topicTitle,
          estimated_minutes: drillMinutes,
          priority: items.length + 1
        })
        remainingMinutes -= drillMinutes
      }

      // 3. Struggling topics / Tutor drill second
      const subjectsWithStruggles = subjectsData.filter(s => s.strugglingTopics.length > 0)
      if (subjectsWithStruggles.length > 0 && remainingMinutes >= 15) {
        const topSubject = subjectsWithStruggles[0]
        const weak = topSubject.strugglingTopics[0]
        const drillMinutes = Math.min(remainingMinutes, 25)
        items.push({
          subject_id: topSubject.id,
          action_type: 'tutor_drill',
          suggested_action: `Targeted Socratic Drill: ${weak.topic}`,
          learning_objective: weak.struggles ? `Work through misconceptions: ${weak.struggles}` : `Deepen understanding and strengthen recall for ${weak.topic}`,
          target_topic: weak.topic,
          estimated_minutes: drillMinutes,
          priority: items.length + 1
        })
        remainingMinutes -= drillMinutes
      }

      // 3. Syllabus progress third (or another subject's due cards/weak spots)
      if (remainingMinutes >= 10) {
        const nextSubject = subjectsData.find(s => s.currentModule || s.nextModule) || subjectsData[0]
        const mod = nextSubject.currentModule || nextSubject.nextModule
        const modTitle = mod ? (mod.chapter_number ? `Ch. ${mod.chapter_number}: ${mod.title}` : mod.title) : 'Course Material'
        items.push({
          subject_id: nextSubject.id,
          action_type: 'syllabus_read',
          suggested_action: `Study ${modTitle} (${nextSubject.name})`,
          learning_objective: `Advance through the syllabus and master key concepts`,
          target_topic: mod?.title || null,
          estimated_minutes: remainingMinutes,
          priority: items.length + 1
        })
        remainingMinutes = 0
      }

      // If items is still empty, add a general study sprint
      if (items.length === 0) {
        items.push({
          subject_id: subjectsData[0].id,
          action_type: 'tutor_drill',
          suggested_action: `Study Session: ${subjectsData[0].name}`,
          learning_objective: `Explore key concepts with your AI tutor`,
          target_topic: null,
          estimated_minutes: totalMinutes,
          priority: 1
        })
      }

      return items
    }

    let generatedItems: any[] = []

    try {
      const config = getAIConfig()
      const apiKey = getApiKey()

      if (!apiKey) {
        // Fall back to deterministic calculation
        generatedItems = buildDeterministicFocusBlock()
      } else {
        // Build prompt with rich context
        const subjectBriefs = subjectsData.map(s => {
          const lines = [`Class: ${s.name} (id: ${s.id})`]
          lines.push(`- Due Flashcards: ${s.dueCardCount}`)
          if (s.strugglingTopics.length > 0) {
            lines.push(`- Recorded Struggles/Weaknesses: ${s.strugglingTopics.map(t => `${t.topic} (${t.mastery_level}${t.struggles ? `: "${t.struggles}"` : ''})`).join(', ')}`)
          }
          if (s.currentModule) {
            lines.push(`- In-Progress Chapter: ${s.currentModule.chapter_number ? `Ch ${s.currentModule.chapter_number} ` : ''}${s.currentModule.title}`)
          } else if (s.nextModule) {
            lines.push(`- Next Chapter: ${s.nextModule.chapter_number ? `Ch ${s.nextModule.chapter_number} ` : ''}${s.nextModule.title}`)
          }
          if (s.deadlines.length > 0) {
            lines.push(`- Upcoming Deadlines: ${s.deadlines.map(d => `${d.label} (${d.deadline_date})`).join(', ')}`)
          }
          return lines.join('\n')
        }).join('\n\n')

        const completedText = completedToday.length > 0
          ? `Tasks already completed today (DO NOT repeat these):\n${completedToday.map(c => `- ${c.suggested_action}`).join('\n')}\n`
          : ''

        const prompt = buildFocusBlockPrompt({
          availableMinutes: totalMinutes,
          subjectBriefs,
          completedText,
          contextType: contextOptions?.contextType,
          eventTitle: contextOptions?.eventTitle,
          subjectName: contextOptions?.subjectName,
          subjectId: contextOptions?.subjectId,
          lectureTopic: contextOptions?.lectureTopic,
          materialsSummary: contextOptions?.materialsSummary
        })

        const responseText = await callAIMessages(
          [{ role: 'user', content: prompt }],
          { ...config, apiKey },
          { type: 'json_object' }
        )

        const parsed = safeParseAIJson<{ focus_items?: any[] }>(responseText, { focus_items: [] })
        if (Array.isArray(parsed.focus_items) && parsed.focus_items.length > 0) {
          generatedItems = parsed.focus_items
        } else {
          generatedItems = buildDeterministicFocusBlock()
        }
      }
    } catch (err) {
      console.warn('AI Focus Block generation failed, using deterministic planner:', err)
      generatedItems = buildDeterministicFocusBlock()
    }

    // Insert items into daily_plans
    const insertItems = db.transaction((items: any[]) => {
      for (const item of items) {
        const subject = subjects.find(s => s.id === item.subject_id) || subjects[0]
        db.prepare(`
          INSERT INTO daily_plans
            (user_id, plan_date, subject_id, suggested_action, estimated_minutes, priority, is_completed, action_type, learning_objective, target_topic)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `).run(
          userId,
          date,
          subject.id,
          item.suggested_action,
          item.estimated_minutes || 20,
          item.priority || 1,
          item.action_type || 'custom',
          item.learning_objective || null,
          item.target_topic || null
        )
      }
    })

    insertItems(generatedItems)

    return db.prepare(`
      SELECT p.*, s.name as subject_name
      FROM daily_plans p
      JOIN subjects s ON s.id = p.subject_id
      WHERE p.user_id = ? AND p.plan_date = ? AND (p.is_dismissed = 0 OR p.is_dismissed IS NULL)
      ORDER BY p.is_completed ASC, p.priority ASC, p.id ASC
    `).all(userId, date)
  })

  ipcMain.handle('plan:completeAction', (_event, planId: number) => {
    db.prepare('UPDATE daily_plans SET is_completed = 1 WHERE id = ?').run(planId)
    return { success: true }
  })

  ipcMain.handle('plan:dismissAction', (_event, planId: number) => {
    try {
      db.prepare('UPDATE daily_plans SET is_dismissed = 1 WHERE id = ?').run(planId)
    } catch {
      db.prepare('DELETE FROM daily_plans WHERE id = ?').run(planId)
    }
    return { success: true }
  })

  ipcMain.handle('plan:getCompletedTaskStats', (_event, userId: number) => {
    try {
      const plansRow = db.prepare(`
        SELECT COUNT(*) as count FROM daily_plans WHERE user_id = ? AND is_completed = 1
      `).get(userId) as { count: number } | undefined

      const topicsRow = db.prepare(`
        SELECT COUNT(*) as count FROM module_topic_study_log WHERE user_id = ?
      `).get(userId) as { count: number } | undefined

      const sessionsRow = db.prepare(`
        SELECT COUNT(*) as count FROM tutor_sessions WHERE user_id = ? AND (ended_at IS NOT NULL OR phase = 'complete')
      `).get(userId) as { count: number } | undefined

      const completedTasksCount = plansRow?.count || 0
      const completedTopicsCount = topicsRow?.count || 0
      const completedSessionsCount = sessionsRow?.count || 0

      return {
        completedTasksCount,
        completedTopicsCount,
        completedSessionsCount,
        totalCompleted: completedTasksCount + completedTopicsCount
      }
    } catch (err) {
      console.error('Error fetching completed task stats:', err)
      return {
        completedTasksCount: 0,
        completedTopicsCount: 0,
        completedSessionsCount: 0,
        totalCompleted: 0
      }
    }
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
    let actualUserId = userId
    if (!actualUserId) {
      const u = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: number } | undefined
      actualUserId = u?.id || 1
    }

    const modRow = db.prepare('SELECT subject_id FROM syllabus_modules WHERE id = ?').get(moduleId) as { subject_id: number } | undefined
    const subjectId = modRow?.subject_id || 0

    // Retrieve SRS retention metrics map for this module
    const srsMap = subjectId ? getTopicsRetention(db, actualUserId, subjectId, moduleId) : new Map()

    const rows = db.prepare(`
      SELECT mt.*,
        CASE WHEN EXISTS (
          SELECT 1 FROM module_topic_study_log sl
          WHERE sl.topic_id = mt.id AND sl.user_id = ?
        ) THEN 1 ELSE 0 END as completed,
        CASE WHEN EXISTS (
          SELECT 1 FROM module_topic_study_log sl
          WHERE sl.topic_id = mt.id AND sl.user_id = ?
        ) THEN 1 ELSE 0 END as studied
      FROM module_topics mt
      WHERE mt.module_id = ?
    `).all(actualUserId, actualUserId, moduleId) as (Omit<ModuleTopic, 'completed' | 'studied'> & { completed: number; studied: number })[]

    return rows.map(r => {
      const srs = srsMap.get(r.id)
      const isCompleted = Boolean(r.completed || r.studied)
      return {
        ...r,
        completed: isCompleted,
        studied: isCompleted,
        has_new_material: Boolean((r as any).has_new_material && !isCompleted),
        is_gap: Boolean((r as any).is_gap && !isCompleted),
        retrievability: srs ? srs.retrievability : undefined,
        retention_status: srs ? srs.retentionStatus : undefined,
        next_review_due: srs ? srs.nextReviewDue : undefined,
        stability: srs ? srs.stability : undefined,
        days_overdue: srs ? srs.daysOverdue : undefined
      }
    })
  })

  ipcMain.handle('syllabus:toggleTopicCompleted', (_event, topicId: number, completed: boolean, userId?: number) => {
    const topic = db.prepare('SELECT * FROM module_topics WHERE id = ?').get(topicId) as ModuleTopic | undefined
    if (!topic) return { success: false, error: 'Topic not found' }

    let actualUserId = userId
    if (!actualUserId) {
      const u = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: number } | undefined
      actualUserId = u?.id || 1
    }

    const modRow = db.prepare('SELECT subject_id FROM syllabus_modules WHERE id = ?').get(topic.module_id) as { subject_id: number } | undefined
    const subjectId = modRow?.subject_id || 0

    if (completed) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT OR REPLACE INTO module_topic_study_log (topic_id, user_id, studied_at)
        VALUES (?, ?, ?)
      `).run(topicId, actualUserId, now)
      db.prepare(`
        UPDATE module_topics SET has_new_material = 0, is_gap = 0 WHERE id = ?
      `).run(topicId)

      // Initialize or update SRS memory state with default rating 3 (Good)
      try {
        if (subjectId) {
          updateTopicSrsState(db, actualUserId, subjectId, topicId, 3, now)
        }
      } catch (srsErr) {
        console.warn('Failed to update topic SRS state on toggle:', srsErr)
      }
    } else {
      db.prepare(`
        DELETE FROM module_topic_study_log WHERE topic_id = ? AND user_id = ?
      `).run(topicId, actualUserId)
      db.prepare(`
        DELETE FROM topic_spaced_memory WHERE topic_id = ? AND user_id = ?
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

  // ═══════════════════════════════════════════════════════════════════════════
  // TOPIC SPACED REPETITION (TOPIC-SRS)
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle('tutor:getSubjectRetentionSummary', (_event, userId: number, subjectId: number) => {
    try {
      return getSubjectRetentionSummary(db, userId, subjectId)
    } catch (err) {
      console.error('Failed to get subject retention summary:', err)
      return {
        subjectId,
        totalTopics: 0,
        completedTopics: 0,
        averageRetention: 1.0,
        freshCount: 0,
        fadingCount: 0,
        overdueCount: 0,
        dueTopics: []
      }
    }
  })

  ipcMain.handle('tutor:getTopDueMaintenanceTopics', (_event, userId: number, limit?: number) => {
    try {
      return getTopDueMaintenanceTopics(db, userId, limit ?? 8)
    } catch (err) {
      console.error('Failed to get top due maintenance topics:', err)
      return []
    }
  })

  ipcMain.handle('tutor:getSubjectModuleStats', (_event, subjectId: number, userId?: number) => {
    try {
      if (!subjectId) return {}
      let rows: any[]
      if (userId && userId > 0) {
        rows = db.prepare(`
          SELECT 
            module_id,
            COUNT(*) as session_count,
            COALESCE(SUM(
              CASE 
                WHEN duration_minutes IS NOT NULL AND duration_minutes > 0 THEN duration_minutes
                WHEN ended_at IS NOT NULL AND started_at IS NOT NULL THEN MAX(1, ROUND((strftime('%s', ended_at) - strftime('%s', started_at)) / 60.0))
                ELSE 15 
              END
            ), 0) as total_minutes,
            AVG(COALESCE(depth_level, 3)) as avg_depth_level,
            GROUP_CONCAT(COALESCE(depth_level, 3)) as raw_depth_levels,
            MAX(COALESCE(ended_at, started_at)) as last_studied_at
          FROM tutor_sessions
          WHERE subject_id = ? AND module_id IS NOT NULL AND (user_id = ? OR user_id IS NULL)
          GROUP BY module_id
        `).all(subjectId, userId)
      } else {
        rows = db.prepare(`
          SELECT 
            module_id,
            COUNT(*) as session_count,
            COALESCE(SUM(
              CASE 
                WHEN duration_minutes IS NOT NULL AND duration_minutes > 0 THEN duration_minutes
                WHEN ended_at IS NOT NULL AND started_at IS NOT NULL THEN MAX(1, ROUND((strftime('%s', ended_at) - strftime('%s', started_at)) / 60.0))
                ELSE 15 
              END
            ), 0) as total_minutes,
            AVG(COALESCE(depth_level, 3)) as avg_depth_level,
            GROUP_CONCAT(COALESCE(depth_level, 3)) as raw_depth_levels,
            MAX(COALESCE(ended_at, started_at)) as last_studied_at
          FROM tutor_sessions
          WHERE subject_id = ? AND module_id IS NOT NULL
          GROUP BY module_id
        `).all(subjectId)
      }

      const result: Record<number, {
        moduleId: number
        sessionCount: number
        totalMinutes: number
        avgDepthLevel: number
        depthLevels: number[]
        lastStudiedAt: string | null
      }> = {}

      for (const row of rows) {
        if (row.module_id) {
          const depthLevels = typeof row.raw_depth_levels === 'string'
            ? row.raw_depth_levels.split(',').map((d: string) => Number(d)).filter((n: number) => !isNaN(n))
            : []
          result[row.module_id] = {
            moduleId: Number(row.module_id),
            sessionCount: Number(row.session_count) || 0,
            totalMinutes: Math.round(Number(row.total_minutes) || 0),
            avgDepthLevel: Number(row.avg_depth_level) || 3,
            depthLevels,
            lastStudiedAt: row.last_studied_at || null
          }
        }
      }

      return result
    } catch (err) {
      console.error('Failed to get subject module tutor stats:', err)
      return {}
    }
  })
}
