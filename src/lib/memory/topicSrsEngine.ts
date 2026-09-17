/**
 * Topic Spaced Repetition (Topic-SRS) Engine
 *
 * Implements FSRS-5 continuous retrievability decay, interval scheduling,
 * and memory state persistence for curriculum topics in Neuron.
 *
 * Prevents topic forgetting by computing continuous retention R(t),
 * classifying topics into fresh / fading / overdue bands, and prioritizing
 * maintenance review drills in the Tutor and Focus Block scheduler.
 */

import {
  retrievability,
  fsrsNext,
  type FSRSRating,
  type FSRSMemory,
  DEFAULT_FSRS_PARAMS
} from '../fsrs'
import type { TopicRetentionStatus, TopicSpacedMemory } from '../../types'

export interface DatabaseLike {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
}

export interface TopicRetentionMetrics {
  topicId: number
  topicTitle: string
  moduleId: number
  moduleTitle?: string
  subjectId: number
  retrievability: number
  retentionStatus: TopicRetentionStatus
  stability: number
  difficulty: number
  lastStudiedAt: string
  nextReviewDue: string
  daysOverdue: number
  reps: number
  lapses: number
}

export interface SubjectRetentionSummary {
  subjectId: number
  totalTopics: number
  completedTopics: number
  averageRetention: number
  freshCount: number
  fadingCount: number
  overdueCount: number
  dueTopics: TopicRetentionMetrics[]
}

/**
 * Retrievability thresholds for curriculum topics:
 * - Fresh: R(t) >= 0.85
 * - Fading: 0.65 <= R(t) < 0.85
 * - Overdue: R(t) < 0.65 or nextReviewDue <= today
 */
export const RETENTION_THRESHOLDS = {
  FRESH_MIN: 0.85,
  FADING_MIN: 0.65
}

/**
 * Computes the elapsed fractional days between two ISO date/time strings.
 */
export function computeElapsedDays(fromISO: string, toISO?: string): number {
  const fromMs = new Date(fromISO).getTime()
  const toMs = toISO ? new Date(toISO).getTime() : Date.now()
  return Math.max(0, (toMs - fromMs) / (1000 * 60 * 60 * 24))
}

/**
 * Computes topic retrievability score R(t) in [0.0, 1.0] given stability in days.
 */
export function computeTopicRetrievability(stability: number, lastStudiedAt: string, nowISO?: string): number {
  if (stability <= 0) return 0
  const elapsedDays = computeElapsedDays(lastStudiedAt, nowISO)
  const r = retrievability(elapsedDays, stability)
  return Math.max(0, Math.min(1.0, Math.round(r * 1000) / 1000))
}

/**
 * Classifies a retrievability score and due date into a human-friendly status.
 */
export function classifyRetentionStatus(
  retrievabilityScore: number,
  nextReviewDue: string,
  todayStr = new Date().toISOString().split('T')[0]
): TopicRetentionStatus {
  if (nextReviewDue <= todayStr || retrievabilityScore < RETENTION_THRESHOLDS.FADING_MIN) {
    return 'overdue'
  }
  if (retrievabilityScore < RETENTION_THRESHOLDS.FRESH_MIN) {
    return 'fading'
  }
  return 'fresh'
}

/**
 * Ensures existing completed topics have corresponding topic_spaced_memory rows.
 * Backfills any studied topic that is missing an SRS record.
 */
export function backfillTopicSpacedMemories(
  db: DatabaseLike,
  userId: number,
  subjectId: number
): number {
  try {
    const missing = db.prepare(`
      SELECT sl.topic_id, sl.studied_at, mt.module_id, sm.subject_id
      FROM module_topic_study_log sl
      JOIN module_topics mt ON mt.id = sl.topic_id
      JOIN syllabus_modules sm ON sm.id = mt.module_id
      WHERE sl.user_id = ? AND sm.subject_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM topic_spaced_memory tsm
          WHERE tsm.topic_id = sl.topic_id AND tsm.user_id = ?
        )
    `).all(userId, subjectId, userId) as Array<{
      topic_id: number
      studied_at: string
      module_id: number
      subject_id: number
    }>

    let backfilled = 0
    for (const item of missing) {
      const stability = 3.0 // Standard initial stability for a studied curriculum topic
      const difficulty = 5.0
      const studiedAt = item.studied_at || new Date().toISOString()
      const r = computeTopicRetrievability(stability, studiedAt)
      
      const dueDate = new Date(new Date(studiedAt).getTime() + stability * 86400000)
        .toISOString()
        .split('T')[0]
      const status = classifyRetentionStatus(r, dueDate)

      db.prepare(`
        INSERT OR IGNORE INTO topic_spaced_memory
        (topic_id, user_id, subject_id, stability, difficulty, retrievability, reps, lapses, last_studied_at, next_review_due, status)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
      `).run(
        item.topic_id,
        userId,
        subjectId,
        stability,
        difficulty,
        r,
        studiedAt,
        dueDate,
        status
      )
      backfilled++
    }
    return backfilled
  } catch (err) {
    console.warn('Failed to backfill topic spaced memories:', err)
    return 0
  }
}

/**
 * Retrieves the updated SRS retention state for all topics within a module or subject.
 */
export function getTopicsRetention(
  db: DatabaseLike,
  userId: number,
  subjectId: number,
  moduleId?: number
): Map<number, TopicRetentionMetrics> {
  // Ensure existing studied topics are backfilled
  backfillTopicSpacedMemories(db, userId, subjectId)

  const query = moduleId
    ? `
      SELECT tsm.*, mt.title as topic_title, mt.module_id, sm.title as module_title
      FROM topic_spaced_memory tsm
      JOIN module_topics mt ON mt.id = tsm.topic_id
      JOIN syllabus_modules sm ON sm.id = mt.module_id
      WHERE tsm.user_id = ? AND tsm.subject_id = ? AND mt.module_id = ?
    `
    : `
      SELECT tsm.*, mt.title as topic_title, mt.module_id, sm.title as module_title
      FROM topic_spaced_memory tsm
      JOIN module_topics mt ON mt.id = tsm.topic_id
      JOIN syllabus_modules sm ON sm.id = mt.module_id
      WHERE tsm.user_id = ? AND tsm.subject_id = ?
    `

  const rows = (moduleId
    ? db.prepare(query).all(userId, subjectId, moduleId)
    : db.prepare(query).all(userId, subjectId)) as Array<
    TopicSpacedMemory & { topic_title: string; module_id: number; module_title: string }
  >

  const todayStr = new Date().toISOString().split('T')[0]
  const result = new Map<number, TopicRetentionMetrics>()

  for (const row of rows) {
    const currentR = computeTopicRetrievability(row.stability, row.last_studied_at)
    const status = classifyRetentionStatus(currentR, row.next_review_due, todayStr)

    // Calculate days overdue (positive if past due, negative or 0 if in the future)
    const dueTime = new Date(row.next_review_due).getTime()
    const nowTime = new Date(todayStr).getTime()
    const daysOverdue = Math.max(0, Math.floor((nowTime - dueTime) / 86400000))

    // Lazily sync DB retrievability score and status if changed significantly
    if (Math.abs(currentR - row.retrievability) >= 0.05 || status !== row.status) {
      try {
        db.prepare(`
          UPDATE topic_spaced_memory
          SET retrievability = ?, status = ?
          WHERE id = ?
        `).run(currentR, status, row.id)
      } catch { /* ignore non-fatal */ }
    }

    result.set(row.topic_id, {
      topicId: row.topic_id,
      topicTitle: row.topic_title,
      moduleId: row.module_id,
      moduleTitle: row.module_title,
      subjectId: row.subject_id,
      retrievability: currentR,
      retentionStatus: status,
      stability: row.stability,
      difficulty: row.difficulty,
      lastStudiedAt: row.last_studied_at,
      nextReviewDue: row.next_review_due,
      daysOverdue,
      reps: row.reps,
      lapses: row.lapses
    })
  }

  return result
}

/**
 * Updates a topic's SRS memory state after an assessment or review.
 * Rating: 1=Again, 2=Hard, 3=Good, 4=Easy.
 */
export function updateTopicSrsState(
  db: DatabaseLike,
  userId: number,
  subjectId: number,
  topicId: number,
  rating: FSRSRating,
  reviewTimestamp?: string
): TopicRetentionMetrics {
  const now = reviewTimestamp || new Date().toISOString()
  const todayStr = now.split('T')[0]

  const existing = db.prepare(`
    SELECT * FROM topic_spaced_memory
    WHERE topic_id = ? AND user_id = ?
  `).get(topicId, userId) as TopicSpacedMemory | undefined

  const topicRow = db.prepare(`
    SELECT mt.title as topic_title, mt.module_id, sm.title as module_title
    FROM module_topics mt
    JOIN syllabus_modules sm ON sm.id = mt.module_id
    WHERE mt.id = ?
  `).get(topicId) as { topic_title: string; module_id: number; module_title: string } | undefined

  const memory: FSRSMemory = existing
    ? {
        stability: existing.stability,
        difficulty: existing.difficulty,
        state: existing.reps === 0 ? 0 : 2,
        lapses: existing.lapses,
        lastReview: existing.last_studied_at.split('T')[0]
      }
    : {
        stability: 2.0,
        difficulty: 5.0,
        state: 0,
        lapses: 0
      }

  const next = fsrsNext(memory, rating, DEFAULT_FSRS_PARAMS, todayStr)

  const newReps = (existing?.reps ?? 0) + 1
  const newLapses = rating === 1 ? (existing?.lapses ?? 0) + 1 : (existing?.lapses ?? 0)
  const currentR = computeTopicRetrievability(next.stability, now)
  const status = classifyRetentionStatus(currentR, next.dueDate, todayStr)

  db.prepare(`
    INSERT INTO topic_spaced_memory
    (topic_id, user_id, subject_id, stability, difficulty, retrievability, reps, lapses, last_studied_at, next_review_due, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(topic_id, user_id) DO UPDATE SET
      stability = excluded.stability,
      difficulty = excluded.difficulty,
      retrievability = excluded.retrievability,
      reps = excluded.reps,
      lapses = excluded.lapses,
      last_studied_at = excluded.last_studied_at,
      next_review_due = excluded.next_review_due,
      status = excluded.status
  `).run(
    topicId,
    userId,
    subjectId,
    next.stability,
    next.difficulty,
    currentR,
    newReps,
    newLapses,
    now,
    next.dueDate,
    status
  )

  // Also ensure topic completion is recorded in study log
  db.prepare(`
    INSERT OR REPLACE INTO module_topic_study_log (topic_id, user_id, studied_at)
    VALUES (?, ?, ?)
  `).run(topicId, userId, now)

  return {
    topicId,
    topicTitle: topicRow?.topic_title || `Topic #${topicId}`,
    moduleId: topicRow?.module_id || 0,
    moduleTitle: topicRow?.module_title,
    subjectId,
    retrievability: currentR,
    retentionStatus: status,
    stability: next.stability,
    difficulty: next.difficulty,
    lastStudiedAt: now,
    nextReviewDue: next.dueDate,
    daysOverdue: 0,
    reps: newReps,
    lapses: newLapses
  }
}

/**
 * Returns overall retention summary for a subject, including list of due topics.
 */
export function getSubjectRetentionSummary(
  db: DatabaseLike,
  userId: number,
  subjectId: number
): SubjectRetentionSummary {
  const topicsMap = getTopicsRetention(db, userId, subjectId)
  const allTopicMetrics = Array.from(topicsMap.values())

  const totalTopics = db.prepare(`
    SELECT COUNT(*) as count FROM module_topics mt
    JOIN syllabus_modules sm ON sm.id = mt.module_id
    WHERE sm.subject_id = ?
  `).get(subjectId) as { count: number }

  let freshCount = 0
  let fadingCount = 0
  let overdueCount = 0
  let totalRetentionSum = 0

  const dueTopics: TopicRetentionMetrics[] = []

  for (const m of allTopicMetrics) {
    totalRetentionSum += m.retrievability
    if (m.retentionStatus === 'fresh') freshCount++
    else if (m.retentionStatus === 'fading') {
      fadingCount++
      dueTopics.push(m)
    } else if (m.retentionStatus === 'overdue') {
      overdueCount++
      dueTopics.push(m)
    }
  }

  // Sort due topics by highest urgency: lowest retrievability first
  dueTopics.sort((a, b) => a.retrievability - b.retrievability)

  const completedTopics = allTopicMetrics.length
  const averageRetention = completedTopics > 0
    ? Math.round((totalRetentionSum / completedTopics) * 100) / 100
    : 1.0

  return {
    subjectId,
    totalTopics: totalTopics?.count || completedTopics,
    completedTopics,
    averageRetention,
    freshCount,
    fadingCount,
    overdueCount,
    dueTopics
  }
}

/**
 * Queries the top maintenance topics due across all active subjects for a user.
 */
export function getTopDueMaintenanceTopics(
  db: DatabaseLike,
  userId: number,
  limit = 8
): TopicRetentionMetrics[] {
  const activeSubjects = db.prepare(`
    SELECT id FROM subjects WHERE user_id = ? AND status != 'archived'
  `).all(userId) as Array<{ id: number }>

  const allDue: TopicRetentionMetrics[] = []

  for (const s of activeSubjects) {
    const summary = getSubjectRetentionSummary(db, userId, s.id)
    allDue.push(...summary.dueTopics)
  }

  // Sort by lowest retrievability first
  allDue.sort((a, b) => a.retrievability - b.retrievability)
  return allDue.slice(0, limit)
}
