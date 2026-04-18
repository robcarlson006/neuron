import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { defaultSchedule } from '../../src/lib/sm2'
import {
  fsrsNext,
  seedFromSM2,
  qualityToRating,
  adjustRatingByResponseTime,
  boostForExam,
  projectRetention,
  retrievability,
  DEFAULT_FSRS_PARAMS,
  type FSRSMemory
} from '../../src/lib/fsrs'
import { bktUpdate } from '../../src/lib/bkt'
import type {
  User,
  Subject,
  Card,
  CardFolder,
  CardSchedule,
  ReviewLog,
  Deadline,
  Diagnostic,
  ConceptMastery,
  SM2Result
} from '../../src/types'

let db: Database.Database

export function setDatabase(database: Database.Database): void {
  db = database
}

export function registerDbHandlers(): void {
  // User handlers
  ipcMain.handle('db:getUser', () => {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get() as User | undefined
    return user || null
  })

  ipcMain.handle('db:saveUser', (_event, name: string) => {
    const existing = db.prepare('SELECT * FROM users LIMIT 1').get() as User | undefined
    if (existing) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, existing.id)
      return { ...existing, name }
    } else {
      const result = db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)').run(
        name,
        new Date().toISOString()
      )
      return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User
    }
  })

  // Subject handlers
  ipcMain.handle('db:getSubjects', (_event, userId?: number) => {
    if (userId) {
      return db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Subject[]
    }
    return db.prepare('SELECT * FROM subjects ORDER BY created_at DESC').all() as Subject[]
  })

  ipcMain.handle('db:saveSubject', (_event, subject: Partial<Subject>) => {
    if (subject.id) {
      db.prepare(
        'UPDATE subjects SET name = ?, status = ?, course_code = ? WHERE id = ?'
      ).run(subject.name, subject.status, subject.course_code || null, subject.id)
      return db.prepare('SELECT * FROM subjects WHERE id = ?').get(subject.id) as Subject
    } else {
      const result = db.prepare(
        'INSERT INTO subjects (user_id, name, status, course_code, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        subject.user_id,
        subject.name,
        subject.status || 'active',
        subject.course_code || null,
        new Date().toISOString()
      )
      return db.prepare('SELECT * FROM subjects WHERE id = ?').get(result.lastInsertRowid) as Subject
    }
  })

  ipcMain.handle('db:deleteSubject', (_event, subjectId: number) => {
    // Cascade delete everything related to this subject
    const cards = db.prepare('SELECT id FROM cards WHERE subject_id = ?').all(subjectId) as { id: number }[]
    const cardIds = cards.map(c => c.id)
    if (cardIds.length > 0) {
      const placeholders = cardIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM card_schedule WHERE card_id IN (${placeholders})`).run(...cardIds)
      db.prepare(`DELETE FROM review_log WHERE card_id IN (${placeholders})`).run(...cardIds)
      db.prepare(`DELETE FROM cards WHERE id IN (${placeholders})`).run(...cardIds)
    }
    db.prepare('DELETE FROM deadlines WHERE subject_id = ?').run(subjectId)
    db.prepare('DELETE FROM diagnostics WHERE subject_id = ?').run(subjectId)
    db.prepare('DELETE FROM materials WHERE subject_id = ?').run(subjectId)
    db.prepare('DELETE FROM subjects WHERE id = ?').run(subjectId)
    return { success: true }
  })

  // Card handlers
  ipcMain.handle('db:getCards', (_event, subjectId: number) => {
    return db.prepare('SELECT * FROM cards WHERE subject_id = ? ORDER BY created_at DESC').all(subjectId) as Card[]
  })

  ipcMain.handle('db:saveCard', (_event, card: Partial<Card>) => {
    if (card.id) {
      db.prepare(
        'UPDATE cards SET front = ?, back = ?, type = ?, folder_id = ?, concept = ? WHERE id = ?'
      ).run(card.front, card.back, card.type, card.folder_id ?? null, card.concept ?? null, card.id)
      return db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id) as Card
    } else {
      const result = db.prepare(
        'INSERT INTO cards (subject_id, material_id, type, front, back, is_manual, folder_id, concept, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        card.subject_id,
        card.material_id || null,
        card.type,
        card.front,
        card.back,
        card.is_manual || 0,
        card.folder_id ?? null,
        card.concept ?? null,
        new Date().toISOString()
      )
      return db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid) as Card
    }
  })

  ipcMain.handle('db:deleteCard', (_event, cardId: number) => {
    db.prepare('DELETE FROM card_schedule WHERE card_id = ?').run(cardId)
    db.prepare('DELETE FROM review_log WHERE card_id = ?').run(cardId)
    db.prepare('DELETE FROM mc_review_log WHERE card_id = ?').run(cardId)
    db.prepare('DELETE FROM cards WHERE id = ?').run(cardId)
    return { success: true }
  })

  ipcMain.handle('db:saveManyCards', (_event, cards: Partial<Card>[], userId: number) => {
    const insertCard = db.prepare(
      'INSERT INTO cards (subject_id, material_id, type, front, back, is_manual, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertSchedule = db.prepare(
      'INSERT OR REPLACE INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )

    const savedCards: Card[] = []
    const saveMany = db.transaction(() => {
      for (const card of cards) {
        const result = insertCard.run(
          card.subject_id,
          card.material_id || null,
          card.type,
          card.front,
          card.back,
          card.is_manual || 0,
          card.folder_id ?? null,
          new Date().toISOString()
        )
        const cardId = result.lastInsertRowid as number
        const schedule = defaultSchedule(cardId, userId)
        insertSchedule.run(
          cardId,
          userId,
          schedule.interval,
          schedule.repetitions,
          schedule.ease_factor,
          schedule.due_date,
          null
        )
        savedCards.push(db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as Card)
      }
    })
    saveMany()
    return savedCards
  })

  // Schedule handlers
  ipcMain.handle('db:getSchedule', (_event, cardId: number, userId: number) => {
    return db.prepare('SELECT * FROM card_schedule WHERE card_id = ? AND user_id = ?').get(cardId, userId) as CardSchedule | undefined
  })

  ipcMain.handle('db:updateSchedule', (_event, cardId: number, userId: number, sm2Result: SM2Result) => {
    const existing = db.prepare('SELECT * FROM card_schedule WHERE card_id = ? AND user_id = ?').get(cardId, userId)
    if (existing) {
      db.prepare(
        'UPDATE card_schedule SET interval = ?, repetitions = ?, ease_factor = ?, due_date = ?, last_reviewed_at = ? WHERE card_id = ? AND user_id = ?'
      ).run(
        sm2Result.interval,
        sm2Result.repetitions,
        sm2Result.ease_factor,
        sm2Result.due_date,
        new Date().toISOString(),
        cardId,
        userId
      )
    } else {
      db.prepare(
        'INSERT INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(cardId, userId, sm2Result.interval, sm2Result.repetitions, sm2Result.ease_factor, sm2Result.due_date, new Date().toISOString())
    }
    return { success: true }
  })

  ipcMain.handle('db:getDueCards', (_event, userId: number, subjectId?: number) => {
    const today = new Date().toISOString().split('T')[0]
    if (subjectId) {
      return db.prepare(`
        SELECT c.*, cs.interval, cs.repetitions, cs.ease_factor, cs.due_date, cs.last_reviewed_at
        FROM cards c
        JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?
        WHERE c.subject_id = ? AND cs.due_date <= ?
        ORDER BY cs.due_date ASC
      `).all(userId, subjectId, today)
    }
    return db.prepare(`
      SELECT c.*, cs.interval, cs.repetitions, cs.ease_factor, cs.due_date, cs.last_reviewed_at
      FROM cards c
      JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?
      WHERE cs.due_date <= ?
      ORDER BY cs.due_date ASC
    `).all(userId, today)
  })

  ipcMain.handle('db:getAllCardsWithSchedule', (_event, userId: number, subjectId?: number) => {
    if (subjectId) {
      return db.prepare(`
        SELECT c.*, cs.interval, cs.repetitions, cs.ease_factor, cs.due_date, cs.last_reviewed_at
        FROM cards c
        JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?
        WHERE c.subject_id = ?
        ORDER BY cs.repetitions ASC, cs.due_date ASC
      `).all(userId, subjectId)
    }
    return db.prepare(`
      SELECT c.*, cs.interval, cs.repetitions, cs.ease_factor, cs.due_date, cs.last_reviewed_at
      FROM cards c
      JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?
      ORDER BY cs.repetitions ASC, cs.due_date ASC
    `).all(userId)
  })

  ipcMain.handle('db:getAllSchedules', (_event, userId: number, subjectId?: number) => {
    if (subjectId) {
      return db.prepare(
        'SELECT cs.* FROM card_schedule cs JOIN cards c ON c.id = cs.card_id WHERE cs.user_id = ? AND c.subject_id = ?'
      ).all(userId, subjectId) as CardSchedule[]
    }
    return db.prepare('SELECT * FROM card_schedule WHERE user_id = ?').all(userId) as CardSchedule[]
  })

  // Review log handlers
  ipcMain.handle('db:saveReviewLog', (_event, log: Partial<ReviewLog>) => {
    const result = db.prepare(
      'INSERT INTO review_log (card_id, user_id, reviewed_at, quality, was_correct, user_answer, ai_feedback) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      log.card_id,
      log.user_id,
      new Date().toISOString(),
      log.quality,
      log.was_correct || 0,
      log.user_answer || null,
      log.ai_feedback || null
    )
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('db:getReviewLogs', (_event, userId: number, days: number = 30) => {
    const since = new Date()
    since.setDate(since.getDate() - days)
    return db.prepare(
      'SELECT * FROM review_log WHERE user_id = ? AND reviewed_at >= ? ORDER BY reviewed_at DESC'
    ).all(userId, since.toISOString()) as ReviewLog[]
  })

  ipcMain.handle('db:getReviewLogsForCard', (_event, cardId: number, userId: number) => {
    return db.prepare(
      'SELECT * FROM review_log WHERE card_id = ? AND user_id = ? ORDER BY reviewed_at DESC'
    ).all(cardId, userId) as ReviewLog[]
  })

  // Deadline handlers
  ipcMain.handle('db:getDeadlines', (_event, subjectId?: number) => {
    if (subjectId) {
      return db.prepare('SELECT * FROM deadlines WHERE subject_id = ? ORDER BY deadline_date ASC').all(subjectId) as Deadline[]
    }
    return db.prepare('SELECT * FROM deadlines ORDER BY deadline_date ASC').all() as Deadline[]
  })

  ipcMain.handle('db:saveDeadline', (_event, deadline: Partial<Deadline>) => {
    if (deadline.id) {
      db.prepare('UPDATE deadlines SET label = ?, deadline_date = ?, deadline_type = ? WHERE id = ?').run(
        deadline.label,
        deadline.deadline_date,
        deadline.deadline_type || 'personal',
        deadline.id
      )
      return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(deadline.id) as Deadline
    } else {
      const result = db.prepare(
        'INSERT INTO deadlines (subject_id, label, deadline_date, deadline_type, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        deadline.subject_id,
        deadline.label,
        deadline.deadline_date,
        deadline.deadline_type || 'personal',
        new Date().toISOString()
      )
      return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(result.lastInsertRowid) as Deadline
    }
  })

  ipcMain.handle('db:deleteDeadline', (_event, deadlineId: number) => {
    db.prepare('DELETE FROM deadlines WHERE id = ?').run(deadlineId)
    return { success: true }
  })

  // Diagnostics handlers
  ipcMain.handle('db:getDiagnostics', (_event, subjectId: number) => {
    return db.prepare('SELECT * FROM diagnostics WHERE subject_id = ? ORDER BY ran_at DESC').all(subjectId) as Diagnostic[]
  })

  ipcMain.handle('db:saveDiagnostics', (_event, diagnostic: Partial<Diagnostic>) => {
    const result = db.prepare(
      'INSERT INTO diagnostics (subject_id, user_id, ran_at, summary_json) VALUES (?, ?, ?, ?)'
    ).run(
      diagnostic.subject_id,
      diagnostic.user_id,
      new Date().toISOString(),
      diagnostic.summary_json
    )
    return { id: result.lastInsertRowid }
  })

  // Materials handlers
  ipcMain.handle('db:getMaterials', (_event, subjectId: number) => {
    return db.prepare('SELECT * FROM materials WHERE subject_id = ? ORDER BY uploaded_at DESC').all(subjectId)
  })

  ipcMain.handle('db:saveMaterial', (_event, material: { subject_id: number; filename: string; file_type: string; content_text: string }) => {
    const result = db.prepare(
      'INSERT INTO materials (subject_id, filename, file_type, content_text, uploaded_at) VALUES (?, ?, ?, ?, ?)'
    ).run(material.subject_id, material.filename, material.file_type, material.content_text, new Date().toISOString())
    return { id: result.lastInsertRowid }
  })

  // App meta handlers (for seeding and settings)
  ipcMain.handle('db:getMeta', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value || null
  })

  ipcMain.handle('db:setMeta', (_event, key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value)
    return { success: true }
  })

  // Analytics: get mastery stats
  ipcMain.handle('db:getMasteryStats', (_event, userId: number, subjectId?: number) => {
    const query = subjectId
      ? `SELECT c.subject_id, cs.interval, cs.ease_factor
         FROM cards c
         JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?
         WHERE c.subject_id = ?`
      : `SELECT c.subject_id, cs.interval, cs.ease_factor
         FROM cards c
         JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?`

    const args = subjectId ? [userId, subjectId] : [userId]
    return db.prepare(query).all(...args)
  })

  // Streak data
  ipcMain.handle('db:getStreakData', (_event, userId: number) => {
    return db.prepare(`
      SELECT DATE(reviewed_at) as date, COUNT(*) as count
      FROM review_log
      WHERE user_id = ?
      GROUP BY DATE(reviewed_at)
      ORDER BY date DESC
      LIMIT 90
    `).all(userId)
  })

  // Weakest cards
  ipcMain.handle('db:getWeakestCards', (_event, userId: number, limit: number = 10) => {
    return db.prepare(`
      SELECT c.*, cs.interval, cs.ease_factor, cs.repetitions,
        (SELECT AVG(quality) FROM review_log rl WHERE rl.card_id = c.id AND rl.user_id = ?) as avg_quality
      FROM cards c
      JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?
      WHERE cs.repetitions > 0
      ORDER BY avg_quality ASC
      LIMIT ?
    `).all(userId, userId, limit)
  })

  // FSRS-5 review processing (combined: update schedule + log review + BKT concept update)
  ipcMain.handle('db:processReview', (_event, params: {
    cardId: number
    userId: number
    quality: number
    wasCorrect: boolean
    userAnswer?: string
    aiFeedback?: string
    responseTimeMs?: number
    currentSchedule: CardSchedule
  }) => {
    const { cardId, userId, quality, wasCorrect, userAnswer, aiFeedback, responseTimeMs, currentSchedule } = params

    // Always re-fetch schedule from DB so we see persisted FSRS state
    const dbSchedule = db.prepare(
      'SELECT * FROM card_schedule WHERE card_id = ? AND user_id = ?'
    ).get(cardId, userId) as CardSchedule | undefined
    const sched = dbSchedule ?? currentSchedule

    const mem: FSRSMemory = (sched.stability != null && sched.difficulty != null)
      ? {
          stability: sched.stability,
          difficulty: sched.difficulty,
          state: (sched.state ?? 0) as 0 | 1 | 2 | 3,
          lapses: sched.lapses ?? 0,
          lastReview: sched.last_reviewed_at?.split('T')[0]
        }
      : seedFromSM2(
          sched.interval,
          sched.ease_factor,
          sched.repetitions,
          sched.last_reviewed_at
        )

    // Base rating from grade
    let rating = qualityToRating(quality)
    // Response-time adjustment — use user-avg as anchor
    const avgRow = db.prepare(
      'SELECT AVG(response_time_ms) as avg_ms FROM review_log WHERE user_id = ? AND response_time_ms IS NOT NULL'
    ).get(userId) as { avg_ms: number | null }
    rating = adjustRatingByResponseTime(rating, responseTimeMs, avgRow?.avg_ms ?? null)

    // Load user's desired retention, fall back to 0.9
    const retentionMeta = db.prepare("SELECT value FROM app_meta WHERE key = 'desired_retention'").get() as { value: string } | undefined
    const desiredRetention = retentionMeta ? Math.min(0.98, Math.max(0.80, parseFloat(retentionMeta.value))) : DEFAULT_FSRS_PARAMS.desiredRetention

    const next = fsrsNext(mem, rating, { ...DEFAULT_FSRS_PARAMS, desiredRetention })

    // Exam boost: cap interval near study-affecting deadlines
    const cardRow = db.prepare('SELECT subject_id, concept, folder_id FROM cards WHERE id = ?').get(cardId) as { subject_id: number; concept: string | null; folder_id: number | null } | undefined
    let finalInterval = next.interval
    let finalDueDate = next.dueDate
    if (cardRow) {
      const today = new Date().toISOString().split('T')[0]
      const upcoming = db.prepare(
        `SELECT deadline_date FROM deadlines
         WHERE subject_id = ? AND deadline_date >= ? AND deadline_type != 'personal'
         ORDER BY deadline_date ASC LIMIT 1`
      ).get(cardRow.subject_id, today) as { deadline_date: string } | undefined
      if (upcoming) {
        const daysUntil = Math.ceil(
          (new Date(upcoming.deadline_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
        const boosted = boostForExam(finalInterval, daysUntil)
        if (boosted < finalInterval) {
          finalInterval = boosted
          const dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + boosted)
          finalDueDate = dueDate.toISOString().split('T')[0]
        }
      }
    }

    // Legacy SM-2 view, kept for backwards compat with existing UI reads
    const legacyReps = rating === 1 ? 0 : (sched.repetitions + 1)
    const legacyEase = Math.min(3.0, Math.max(1.3, 2.5 - (next.difficulty - 5) * 0.08))

    db.prepare(
      `UPDATE card_schedule SET
         interval = ?, repetitions = ?, ease_factor = ?,
         due_date = ?, last_reviewed_at = ?,
         stability = ?, difficulty = ?, state = ?, lapses = ?
       WHERE card_id = ? AND user_id = ?`
    ).run(
      finalInterval, legacyReps, legacyEase,
      finalDueDate, new Date().toISOString(),
      next.stability, next.difficulty, next.state, next.lapses,
      cardId, userId
    )

    db.prepare(
      'INSERT INTO review_log (card_id, user_id, reviewed_at, quality, was_correct, user_answer, ai_feedback, response_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(cardId, userId, new Date().toISOString(), quality, wasCorrect ? 1 : 0, userAnswer || null, aiFeedback || null, responseTimeMs ?? null)

    // BKT: update concept mastery posterior
    if (cardRow) {
      const conceptName = (cardRow.concept && cardRow.concept.trim())
        || (cardRow.folder_id
              ? (db.prepare('SELECT name FROM card_folders WHERE id = ?').get(cardRow.folder_id) as { name: string } | undefined)?.name
              : null)
        || 'General'
      const existing = db.prepare(
        'SELECT mastery_prob, observations FROM concept_mastery WHERE user_id = ? AND subject_id = ? AND concept = ?'
      ).get(userId, cardRow.subject_id, conceptName) as { mastery_prob: number; observations: number } | undefined
      const prior = existing?.mastery_prob ?? 0.3
      const posterior = bktUpdate(prior, wasCorrect)
      const obs = (existing?.observations ?? 0) + 1
      db.prepare(
        `INSERT INTO concept_mastery (user_id, subject_id, concept, mastery_prob, observations, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, subject_id, concept) DO UPDATE SET
           mastery_prob = excluded.mastery_prob,
           observations = excluded.observations,
           updated_at = excluded.updated_at`
      ).run(userId, cardRow.subject_id, conceptName, posterior, obs, new Date().toISOString())
    }

    const sm2Result: SM2Result = {
      interval: finalInterval,
      repetitions: legacyReps,
      ease_factor: legacyEase,
      due_date: finalDueDate
    }
    return { sm2Result, success: true, fsrs: { stability: next.stability, difficulty: next.difficulty, state: next.state, retention: desiredRetention } }
  })

  // Concept mastery (BKT posteriors)
  ipcMain.handle('db:getConceptMastery', (_event, userId: number, subjectId?: number) => {
    if (subjectId) {
      return db.prepare(
        'SELECT * FROM concept_mastery WHERE user_id = ? AND subject_id = ? ORDER BY mastery_prob ASC'
      ).all(userId, subjectId) as ConceptMastery[]
    }
    return db.prepare(
      'SELECT * FROM concept_mastery WHERE user_id = ? ORDER BY mastery_prob ASC'
    ).all(userId) as ConceptMastery[]
  })

  // FSRS retention forecast: aggregate predicted mean retention over horizon
  ipcMain.handle('db:getRetentionForecast', (_event, userId: number, horizonDays: number = 30, subjectId?: number) => {
    const rows = subjectId
      ? db.prepare(
          `SELECT cs.stability, cs.last_reviewed_at, cs.interval
           FROM card_schedule cs JOIN cards c ON c.id = cs.card_id
           WHERE cs.user_id = ? AND c.subject_id = ? AND cs.last_reviewed_at IS NOT NULL`
        ).all(userId, subjectId) as { stability: number | null; last_reviewed_at: string; interval: number }[]
      : db.prepare(
          `SELECT stability, last_reviewed_at, interval FROM card_schedule
           WHERE user_id = ? AND last_reviewed_at IS NOT NULL`
        ).all(userId) as { stability: number | null; last_reviewed_at: string; interval: number }[]

    const mems = rows.map(r => ({
      stability: r.stability && r.stability > 0 ? r.stability : Math.max(1, r.interval),
      lastReview: r.last_reviewed_at.split('T')[0]
    }))
    return projectRetention(mems, horizonDays)
  })

  // Current retention distribution (for heatmap buckets)
  ipcMain.handle('db:getCurrentRetentionBySubject', (_event, userId: number) => {
    const rows = db.prepare(
      `SELECT c.subject_id, cs.stability, cs.last_reviewed_at, cs.interval
       FROM card_schedule cs JOIN cards c ON c.id = cs.card_id
       WHERE cs.user_id = ? AND cs.last_reviewed_at IS NOT NULL`
    ).all(userId) as { subject_id: number; stability: number | null; last_reviewed_at: string; interval: number }[]
    const today = new Date()
    const bySubject = new Map<number, { sum: number; n: number }>()
    for (const r of rows) {
      const s = r.stability && r.stability > 0 ? r.stability : Math.max(1, r.interval)
      const elapsed = Math.max(0, (today.getTime() - new Date(r.last_reviewed_at).getTime()) / 86400000)
      const ret = retrievability(elapsed, s)
      const cur = bySubject.get(r.subject_id) ?? { sum: 0, n: 0 }
      cur.sum += ret
      cur.n += 1
      bySubject.set(r.subject_id, cur)
    }
    return Array.from(bySubject.entries()).map(([subject_id, v]) => ({
      subject_id,
      retention: v.n ? v.sum / v.n : 0,
      count: v.n
    }))
  })

  // Daily review aggregate, sourced from the review_daily SQL view
  ipcMain.handle('db:getDailyReviewStats', (_event, userId: number, days: number = 30) => {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().split('T')[0]
    return db.prepare(
      `SELECT date, reviews, correct, incorrect, avg_response_ms
       FROM review_daily WHERE user_id = ? AND date >= ? ORDER BY date ASC`
    ).all(userId, sinceStr) as { date: string; reviews: number; correct: number; incorrect: number; avg_response_ms: number | null }[]
  })

  // Interleaved due queue — round-robin across concept/folder buckets
  ipcMain.handle('db:getInterleavedDueCards', (_event, userId: number, subjectId?: number) => {
    const today = new Date().toISOString().split('T')[0]
    const rows = subjectId
      ? db.prepare(`
          SELECT c.*, cs.interval, cs.repetitions, cs.ease_factor, cs.due_date, cs.last_reviewed_at,
                 cs.stability, cs.difficulty, cs.state, cs.lapses,
                 COALESCE(c.concept, (SELECT name FROM card_folders cf WHERE cf.id = c.folder_id), 'General') AS bucket
          FROM cards c JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?
          WHERE c.subject_id = ? AND cs.due_date <= ?
          ORDER BY cs.due_date ASC
        `).all(userId, subjectId, today) as (Card & CardSchedule & { bucket: string })[]
      : db.prepare(`
          SELECT c.*, cs.interval, cs.repetitions, cs.ease_factor, cs.due_date, cs.last_reviewed_at,
                 cs.stability, cs.difficulty, cs.state, cs.lapses,
                 COALESCE(c.concept, (SELECT name FROM card_folders cf WHERE cf.id = c.folder_id), 'General') AS bucket
          FROM cards c JOIN card_schedule cs ON cs.card_id = c.id AND cs.user_id = ?
          WHERE cs.due_date <= ?
          ORDER BY cs.due_date ASC
        `).all(userId, today) as (Card & CardSchedule & { bucket: string })[]

    // Round-robin: pop one card from each bucket in turn
    const buckets = new Map<string, typeof rows>()
    for (const r of rows) {
      const arr = buckets.get(r.bucket) ?? []
      arr.push(r)
      buckets.set(r.bucket, arr)
    }
    const keys = Array.from(buckets.keys())
    const out: typeof rows = []
    let remaining = rows.length
    while (remaining > 0) {
      for (const k of keys) {
        const arr = buckets.get(k)!
        if (arr.length > 0) {
          out.push(arr.shift()!)
          remaining -= 1
        }
      }
    }
    return out
  })

  // Multiple choice review log
  ipcMain.handle('db:saveMCReview', (_event, params: { cardId: number; userId: number; wasCorrect: boolean }) => {
    const { cardId, userId, wasCorrect } = params
    const result = db.prepare(
      'INSERT INTO mc_review_log (card_id, user_id, reviewed_at, was_correct) VALUES (?, ?, ?, ?)'
    ).run(cardId, userId, new Date().toISOString(), wasCorrect ? 1 : 0)
    return { id: result.lastInsertRowid }
  })

  // Folder handlers
  ipcMain.handle('db:getFolders', (_event, subjectId: number) => {
    return db.prepare('SELECT * FROM card_folders WHERE subject_id = ? ORDER BY name ASC').all(subjectId) as CardFolder[]
  })

  ipcMain.handle('db:saveFolder', (_event, folder: Partial<CardFolder>) => {
    if (folder.id) {
      db.prepare('UPDATE card_folders SET name = ? WHERE id = ?').run(folder.name, folder.id)
      return db.prepare('SELECT * FROM card_folders WHERE id = ?').get(folder.id) as CardFolder
    } else {
      const result = db.prepare(
        'INSERT INTO card_folders (subject_id, name, created_at) VALUES (?, ?, ?)'
      ).run(folder.subject_id, folder.name, new Date().toISOString())
      return db.prepare('SELECT * FROM card_folders WHERE id = ?').get(result.lastInsertRowid) as CardFolder
    }
  })

  ipcMain.handle('db:deleteFolder', (_event, folderId: number) => {
    db.prepare('UPDATE cards SET folder_id = NULL WHERE folder_id = ?').run(folderId)
    db.prepare('DELETE FROM card_folders WHERE id = ?').run(folderId)
    return { success: true }
  })

  ipcMain.handle('db:updateCardFolder', (_event, cardId: number, folderId: number | null) => {
    db.prepare('UPDATE cards SET folder_id = ? WHERE id = ?').run(folderId, cardId)
    return { success: true }
  })

  // Card stats for detail popup
  ipcMain.handle('db:getCardStats', (_event, cardId: number, userId: number) => {
    const schedule = db.prepare(
      'SELECT * FROM card_schedule WHERE card_id = ? AND user_id = ?'
    ).get(cardId, userId) as CardSchedule | undefined

    const stats = db.prepare(`
      SELECT
        COUNT(*) as review_count,
        AVG(quality) as avg_quality,
        AVG(response_time_ms) as avg_response_time_ms
      FROM review_log
      WHERE card_id = ? AND user_id = ?
    `).get(cardId, userId) as { review_count: number; avg_quality: number | null; avg_response_time_ms: number | null }

    return { schedule: schedule || null, ...stats }
  })

  // Average response time across all cards
  ipcMain.handle('db:getAvgResponseTime', (_event, userId: number) => {
    return db.prepare(
      'SELECT AVG(response_time_ms) as avg_ms FROM review_log WHERE user_id = ? AND response_time_ms IS NOT NULL'
    ).get(userId) as { avg_ms: number | null }
  })

  ipcMain.handle('db:getMCStats', (_event, userId: number, days?: number) => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (days ?? 30))
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const rows = db.prepare(
      `SELECT was_correct FROM mc_review_log
       WHERE user_id = ? AND date(reviewed_at) >= ?`
    ).all(userId, cutoffStr) as { was_correct: number }[]

    const total = rows.length
    const correct = rows.filter(r => r.was_correct).length
    return { total, correct }
  })
}
