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
import { deleteSubjectCascade } from '../../src/lib/db'
import { getOrCreateMaterialFolder, syncCardsToMaterialFolders } from './materialFolderHelper'
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
    // Cascade delete everything related to this subject in dependency order.
    // Run inside a transaction so a mid-sequence failure cannot leave a
    // half-deleted subject behind. deleteSubjectCascade walks every table with a
    // foreign key to subjects/cards/materials (see SUBJECT_CHILD_TABLES /
    // CARD_CHILD_TABLES in src/lib/db.ts), so adding a new table can't silently
    // break subject deletion the way concept_mastery did.
    const remove = db.transaction(() => {
      deleteSubjectCascade(db, subjectId)
    })
    remove()
    return { success: true }
  })

  // Card handlers
  ipcMain.handle('db:getCards', (_event, subjectId: number) => {
    syncCardsToMaterialFolders(db)
    return db.prepare('SELECT * FROM cards WHERE subject_id = ? ORDER BY created_at DESC').all(subjectId) as Card[]
  })

  ipcMain.handle('db:saveCard', (_event, card: Partial<Card>) => {
    let folderId = card.folder_id ?? null
    if (!folderId && card.subject_id && card.material_id) {
      folderId = getOrCreateMaterialFolder(db, card.subject_id, card.material_id, card.concept)
    }

    if (card.id) {
      db.prepare(
        'UPDATE cards SET front = ?, back = ?, type = ?, folder_id = ?, concept = ?, topic_id = ?, material_id = ?, tags = ? WHERE id = ?'
      ).run(
        card.front,
        card.back,
        card.type,
        folderId,
        card.concept ?? null,
        card.topic_id ?? null,
        card.material_id ?? null,
        card.tags || '',
        card.id
      )
      return db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id) as Card
    } else {
      const result = db.prepare(
        'INSERT INTO cards (subject_id, material_id, type, front, back, is_manual, folder_id, concept, topic_id, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        card.subject_id,
        card.material_id || null,
        card.type,
        card.front,
        card.back,
        card.is_manual || 0,
        folderId,
        card.concept ?? null,
        card.topic_id ?? null,
        card.tags || '',
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
      'INSERT INTO cards (subject_id, material_id, type, front, back, is_manual, folder_id, concept, topic_id, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertSchedule = db.prepare(
      'INSERT OR REPLACE INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )

    const savedCards: Card[] = []
    const saveMany = db.transaction(() => {
      for (const card of cards) {
        let folderId = card.folder_id ?? null
        if (!folderId && card.subject_id && card.material_id) {
          folderId = getOrCreateMaterialFolder(db, card.subject_id, card.material_id, card.concept)
        }

        const result = insertCard.run(
          card.subject_id,
          card.material_id || null,
          card.type,
          card.front,
          card.back,
          card.is_manual || 0,
          folderId,
          card.concept ?? null,
          card.topic_id ?? null,
          card.tags || '',
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

  ipcMain.handle('db:getMaterial', (_event, materialId: number) => {
    return db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId) || null
  })

  ipcMain.handle('db:saveMaterial', (_event, material: { subject_id: number; filename: string; file_type: string; content_text: string }) => {
    const result = db.prepare(
      'INSERT INTO materials (subject_id, filename, file_type, content_text, uploaded_at) VALUES (?, ?, ?, ?, ?)'
    ).run(material.subject_id, material.filename, material.file_type, material.content_text, new Date().toISOString())
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('db:deleteMaterial', (_event, materialId: number) => {
    db.prepare('DELETE FROM materials WHERE id = ?').run(materialId)
    return { success: true }
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

    // Snapshot the pre-review schedule so the review can be undone.
    const previousScheduleJson = JSON.stringify({
      interval: sched.interval,
      repetitions: sched.repetitions,
      ease_factor: sched.ease_factor,
      due_date: sched.due_date,
      last_reviewed_at: sched.last_reviewed_at ?? null,
      stability: sched.stability ?? null,
      difficulty: sched.difficulty ?? null,
      state: sched.state ?? 0,
      lapses: sched.lapses ?? 0
    })

    // Persist the review atomically: schedule update + review log + undo entry
    // + concept-mastery update must either all commit or all roll back.
    db.transaction(() => {
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

      const reviewLogResult = db.prepare(
        'INSERT INTO review_log (card_id, user_id, reviewed_at, quality, was_correct, user_answer, ai_feedback, response_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(cardId, userId, new Date().toISOString(), quality, wasCorrect ? 1 : 0, userAnswer || null, aiFeedback || null, responseTimeMs ?? null)

      db.prepare(
        'INSERT INTO review_undo_log (user_id, card_id, review_log_id, previous_schedule_json, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, cardId, reviewLogResult.lastInsertRowid, previousScheduleJson, new Date().toISOString())

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
    })()

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
    syncCardsToMaterialFolders(db)
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

  // ── Cloze / Card Notes ──
  ipcMain.handle('db:getCardsByNoteId', (_event, noteId: number) => {
    return db.prepare('SELECT * FROM cards WHERE note_id = ? ORDER BY cloze_ordinal ASC').all(noteId)
  })

  ipcMain.handle('db:saveCardNote', (_event, note: { subject_id: number; note_type?: string; fields_json?: string }) => {
    const result = db.prepare(
      'INSERT INTO card_notes (subject_id, note_type, fields_json, created_at) VALUES (?, ?, ?, ?)'
    ).run(
      note.subject_id,
      note.note_type || 'basic',
      note.fields_json || '{}',
      new Date().toISOString()
    )
    return db.prepare('SELECT * FROM card_notes WHERE id = ?').get(result.lastInsertRowid)
  })

  // ── Undo ──
  ipcMain.handle('db:getUndoAvailable', (_event, userId: number) => {
    return db.prepare(
      'SELECT * FROM review_undo_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(userId) || null
  })

  ipcMain.handle('db:undoLastReview', (_event, userId: number) => {
    const undo = db.prepare(
      'SELECT * FROM review_undo_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(userId) as { id: number; card_id: number; review_log_id: number; previous_schedule_json: string } | undefined
    if (!undo) return { success: false }

    const prevSchedule = JSON.parse(undo.previous_schedule_json)
    db.transaction(() => {
      // Restore the schedule
      db.prepare(
        'UPDATE card_schedule SET interval = ?, repetitions = ?, ease_factor = ?, due_date = ?, last_reviewed_at = ?, stability = ?, difficulty = ?, state = ?, lapses = ? WHERE card_id = ? AND user_id = ?'
      ).run(
        prevSchedule.interval, prevSchedule.repetitions, prevSchedule.ease_factor,
        prevSchedule.due_date, prevSchedule.last_reviewed_at || new Date().toISOString(),
        prevSchedule.stability || null, prevSchedule.difficulty || null,
        prevSchedule.state || 0, prevSchedule.lapses || 0,
        undo.card_id, userId
      )
      // Delete the last review log
      if (undo.review_log_id) {
        db.prepare('DELETE FROM review_log WHERE id = ?').run(undo.review_log_id)
      }
      // Remove the undo entry
      db.prepare('DELETE FROM review_undo_log WHERE id = ?').run(undo.id)
    })()
    return { success: true, restoredSchedule: prevSchedule }
  })

  // ── Export / Import ──
  ipcMain.handle('db:exportAllData', (_event, userId: number) => {
    const subjects = db.prepare('SELECT * FROM subjects WHERE user_id = ?').all(userId) as any[]
    const deadlines = db.prepare('SELECT * FROM deadlines WHERE subject_id IN (SELECT id FROM subjects WHERE user_id = ?)').all(userId)
    const concept_mastery = db.prepare('SELECT * FROM concept_mastery WHERE user_id = ?').all(userId)
    const folders = db.prepare('SELECT * FROM card_folders WHERE subject_id IN (SELECT id FROM subjects WHERE user_id = ?)').all(userId)
    const settings = db.prepare('SELECT * FROM app_meta').all() as { key: string; value: string }[]
    const settingsMap: Record<string, string> = {}
    for (const s of settings) settingsMap[s.key] = s.value

    const subjectsWithCards = subjects.map((s: any) => {
      const cards = db.prepare('SELECT * FROM cards WHERE subject_id = ?').all(s.id) as any[]
      const cardsWithDetails = cards.map((c: any) => {
        const schedule = db.prepare('SELECT * FROM card_schedule WHERE card_id = ? AND user_id = ?').get(c.id, userId) || undefined
        const review_logs = db.prepare('SELECT * FROM review_log WHERE card_id = ? AND user_id = ? ORDER BY reviewed_at ASC').all(c.id, userId)
        return { ...c, schedule, review_logs }
      })
      return { ...s, cards: cardsWithDetails }
    })

    return {
      version: 1,
      exported_at: new Date().toISOString(),
      app_version: '1.8.0',
      subjects: subjectsWithCards,
      deadlines,
      concept_mastery,
      folders,
      settings: settingsMap,
    }
  })

  ipcMain.handle('db:importData', (_event, data: any, userId: number) => {
    const result: { subjectsCreated: number; cardsImported: number; deadlinesImported: number; errors: string[] } = {
      subjectsCreated: 0, cardsImported: 0, deadlinesImported: 0, errors: [],
    }

    const importTx = db.transaction(() => {
      if (data.subjects) {
        for (const s of data.subjects) {
          try {
            const subResult = db.prepare(
              'INSERT INTO subjects (user_id, name, status, course_code, created_at) VALUES (?, ?, ?, ?, ?)'
            ).run(userId, s.name, s.status || 'active', s.course_code || null, s.created_at || new Date().toISOString())
            const newSubjectId = subResult.lastInsertRowid as number
            result.subjectsCreated++

            if (s.cards) {
              for (const c of s.cards) {
                try {
                  const cardResult = db.prepare(
                    'INSERT INTO cards (subject_id, type, front, back, is_manual, folder_id, concept, tags, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                  ).run(
                    newSubjectId, c.type || 'flashcard', c.front, c.back,
                    c.is_manual || 0, c.folder_id || null, c.concept || null,
                    c.tags || '', c.image_url || '',
                    c.created_at || new Date().toISOString()
                  )
                  const newCardId = cardResult.lastInsertRowid as number
                  result.cardsImported++

                  if (c.schedule) {
                    const sch = c.schedule
                    db.prepare(
                      'INSERT INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date, last_reviewed_at, stability, difficulty, state, lapses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).run(newCardId, userId, sch.interval || 1, sch.repetitions || 0, sch.ease_factor || 2.5, sch.due_date || new Date().toISOString().split('T')[0], sch.last_reviewed_at || null, sch.stability || null, sch.difficulty || null, sch.state || 0, sch.lapses || 0)
                  }
                  if (c.review_logs) {
                    for (const rl of c.review_logs) {
                      db.prepare(
                        'INSERT INTO review_log (card_id, user_id, reviewed_at, quality, was_correct, user_answer, ai_feedback, response_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                      ).run(newCardId, userId, rl.reviewed_at, rl.quality, rl.was_correct || 0, rl.user_answer || null, rl.ai_feedback || null, rl.response_time_ms || null)
                    }
                  }
                } catch (e: any) {
                  result.errors.push(`Card import error: ${e.message}`)
                }
              }
            }
          } catch (e: any) {
            result.errors.push(`Subject import error: ${e.message}`)
          }
        }
      }

      if (data.deadlines) {
        for (const d of data.deadlines) {
          try {
            const subject = db.prepare('SELECT id FROM subjects WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as any
            if (subject) {
              db.prepare('INSERT INTO deadlines (subject_id, label, deadline_date, deadline_type) VALUES (?, ?, ?, ?)').run(subject.id, d.label, d.deadline_date, d.deadline_type || 'personal')
              result.deadlinesImported++
            }
          } catch (e: any) {
            result.errors.push(`Deadline import error: ${e.message}`)
          }
        }
      }
    })
    importTx()
    return result
  })

  // ── Anki Import ──
  ipcMain.handle('db:importAnkiDeck', (_event, deck: { name: string; cards: Array<{ front: string; back: string; tags?: string[]; type?: string }> }, userId: number, subjectId: number) => {
    const insertCard = db.prepare(
      'INSERT INTO cards (subject_id, type, front, back, is_manual, tags, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const insertSchedule = db.prepare(
      'INSERT INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date) VALUES (?, ?, ?, ?, ?, ?)'
    )

    const saved: any[] = []
    const tx = db.transaction(() => {
      for (const card of deck.cards) {
        const result = insertCard.run(
          subjectId, card.type || 'flashcard', card.front, card.back,
          1, (card.tags || []).join(' '), 'anki-import',
          new Date().toISOString()
        )
        const cardId = result.lastInsertRowid as number
        insertSchedule.run(cardId, userId, 1, 0, 2.5, new Date().toISOString().split('T')[0])
        saved.push(db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId))
      }
    })
    tx()
    return saved
  })

  // ── Gamification ──
  ipcMain.handle('db:getAchievements', (_event, userId: number) => {
    return db.prepare('SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked_at ASC').all(userId)
  })

  ipcMain.handle('db:getUserLevel', (_event, userId: number) => {
    let level = db.prepare('SELECT * FROM user_levels WHERE user_id = ?').get(userId) as any
    if (!level) {
      db.prepare('INSERT INTO user_levels (user_id, xp, level) VALUES (?, 0, 1)').run(userId)
      level = { user_id: userId, xp: 0, level: 1 }
    }
    return level
  })

  ipcMain.handle('db:getDailyQuests', (_event, userId: number) => {
    const today = new Date().toISOString().split('T')[0]
    let quests = db.prepare('SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ?').all(userId, today) as any[]
    if (quests.length === 0) {
      // Generate daily quests
      const defaultQuests = [
        { key: 'review_20', title: 'Daily Review', description: 'Review 20 cards today', required: 20, xp: 50 },
        { key: 'score_80', title: 'Accuracy Focus', description: 'Score 80%+ on 10 cards', required: 10, xp: 40 },
        { key: 'create_5', title: 'Card Creator', description: 'Create 5 new cards', required: 5, xp: 30 },
      ]
      const insertQuest = db.prepare(
        'INSERT INTO daily_quests (user_id, quest_key, title, description, required, progress, xp_reward, quest_date) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
      )
      for (const q of defaultQuests) {
        insertQuest.run(userId, q.key, q.title, q.description, q.required, q.xp, today)
      }
      quests = db.prepare('SELECT * FROM daily_quests WHERE user_id = ? AND quest_date = ?').all(userId, today)
    }
    return quests
  })

  ipcMain.handle('db:awardXP', (_event, userId: number, amount: number, _reason: string) => {
    let level = db.prepare('SELECT * FROM user_levels WHERE user_id = ?').get(userId) as any
    if (!level) {
      db.prepare('INSERT INTO user_levels (user_id, xp, level) VALUES (?, 0, 1)').run(userId)
      level = { user_id: userId, xp: 0, level: 1 }
    }
    const newXP = level.xp + amount
    const xpForNextLevel = (nl: number) => nl * 100
    let newLevel = level.level
    let xpRemaining = newXP
    while (xpRemaining >= xpForNextLevel(newLevel)) {
      xpRemaining -= xpForNextLevel(newLevel)
      newLevel++
    }
    db.prepare('UPDATE user_levels SET xp = ?, level = ? WHERE user_id = ?').run(newXP, newLevel, userId)

    // Check for level-based achievements
    const newAchievements: any[] = []
    const levelAchievements = [{ lv: 5, key: 'level_5' }, { lv: 10, key: 'level_10' }, { lv: 25, key: 'level_25' }, { lv: 50, key: 'level_50' }]
    for (const la of levelAchievements) {
      if (newLevel >= la.lv) {
        const existing = db.prepare('SELECT id FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, la.key)
        if (!existing) {
          db.prepare('INSERT INTO achievements (user_id, achievement_key, unlocked_at) VALUES (?, ?, ?)').run(userId, la.key, new Date().toISOString())
          newAchievements.push(db.prepare('SELECT * FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, la.key))
        }
      }
    }

    return { newLevel, newXP, achievementsUnlocked: newAchievements }
  })

  ipcMain.handle('db:checkAchievements', (_event, userId: number) => {
    const newAchievements: any[] = []

    // Helper to check if achievement is already unlocked
    const isUnlocked = (key: string) => {
      const existing = db.prepare('SELECT id FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, key)
      return !!existing
    }

    // first_review: has at least 1 review
    if (!isUnlocked('first_review')) {
      const count = db.prepare('SELECT COUNT(*) as cnt FROM review_log WHERE user_id = ?').get(userId) as any
      if (count.cnt > 0) {
        db.prepare('INSERT INTO achievements (user_id, achievement_key, unlocked_at) VALUES (?, ?, ?)').run(userId, 'first_review', new Date().toISOString())
        newAchievements.push(db.prepare('SELECT * FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, 'first_review'))
      }
    }

    // centurion: 100 reviews in a single day
    if (!isUnlocked('centurion')) {
      const today = new Date().toISOString().split('T')[0]
      const dayCount = db.prepare("SELECT COUNT(*) as cnt FROM review_log WHERE user_id = ? AND DATE(reviewed_at) = ?").get(userId, today) as any
      if (dayCount.cnt >= 100) {
        db.prepare('INSERT INTO achievements (user_id, achievement_key, unlocked_at) VALUES (?, ?, ?)').run(userId, 'centurion', new Date().toISOString())
        newAchievements.push(db.prepare('SELECT * FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, 'centurion'))
      }
    }

    // streak_7: 7+ consecutive days with reviews
    if (!isUnlocked('streak_7')) {
      const days = db.prepare("SELECT DISTINCT DATE(reviewed_at) as day FROM review_log WHERE user_id = ? ORDER BY day DESC LIMIT 90").all(userId) as any[]
      if (days.length >= 7) {
        let streak = 1, maxStreak = 1
        for (let i = 1; i < days.length; i++) {
          const diff = (new Date(days[i-1].day).getTime() - new Date(days[i].day).getTime()) / 86400000
          if (diff <= 1.5) { streak++; maxStreak = Math.max(maxStreak, streak) }
          else streak = 1
        }
        if (maxStreak >= 7) {
          db.prepare('INSERT INTO achievements (user_id, achievement_key, unlocked_at) VALUES (?, ?, ?)').run(userId, 'streak_7', new Date().toISOString())
          newAchievements.push(db.prepare('SELECT * FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, 'streak_7'))
        }
      }
    }

    // deck_creator: created 100+ cards
    if (!isUnlocked('deck_creator')) {
      const count = db.prepare('SELECT COUNT(*) as cnt FROM cards WHERE subject_id IN (SELECT id FROM subjects WHERE user_id = ?)').get(userId) as any
      if (count.cnt >= 100) {
        db.prepare('INSERT INTO achievements (user_id, achievement_key, unlocked_at) VALUES (?, ?, ?)').run(userId, 'deck_creator', new Date().toISOString())
        newAchievements.push(db.prepare('SELECT * FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, 'deck_creator'))
      }
    }

    // persistence: reviewed a card 10+ times
    if (!isUnlocked('persistence')) {
      const maxCount = db.prepare('SELECT MAX(cnt) as max_cnt FROM (SELECT COUNT(*) as cnt FROM review_log WHERE user_id = ? GROUP BY card_id)').get(userId) as any
      if (maxCount && maxCount.max_cnt >= 10) {
        db.prepare('INSERT INTO achievements (user_id, achievement_key, unlocked_at) VALUES (?, ?, ?)').run(userId, 'persistence', new Date().toISOString())
        newAchievements.push(db.prepare('SELECT * FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, 'persistence'))
      }
    }

    // strength_30
    if (!isUnlocked('streak_30')) {
      const days = db.prepare("SELECT DISTINCT DATE(reviewed_at) as day FROM review_log WHERE user_id = ? ORDER BY day DESC LIMIT 180").all(userId) as any[]
      if (days.length >= 30) {
        let streak = 1, maxStreak = 1
        for (let i = 1; i < days.length; i++) {
          const diff = (new Date(days[i-1].day).getTime() - new Date(days[i].day).getTime()) / 86400000
          if (diff <= 1.5) { streak++; maxStreak = Math.max(maxStreak, streak) }
          else streak = 1
        }
        if (maxStreak >= 30) {
          db.prepare('INSERT INTO achievements (user_id, achievement_key, unlocked_at) VALUES (?, ?, ?)').run(userId, 'streak_30', new Date().toISOString())
          newAchievements.push(db.prepare('SELECT * FROM achievements WHERE user_id = ? AND achievement_key = ?').get(userId, 'streak_30'))
        }
      }
    }

    return newAchievements
  })

  ipcMain.handle('db:completeQuest', (_event, questId: number) => {
    const quest = db.prepare('SELECT * FROM daily_quests WHERE id = ?').get(questId) as any
    if (!quest || quest.completed) return { xpAwarded: 0 }
    db.prepare('UPDATE daily_quests SET completed = 1, progress = required WHERE id = ?').run(questId)
    return { xpAwarded: quest.xp_reward }
  })

  // ── Study Sessions / Focus Mode ──
  ipcMain.handle('db:startStudySession', (_event, userId: number, subjectId?: number) => {
    const result = db.prepare(
      'INSERT INTO study_sessions (user_id, subject_id, started_at, cards_reviewed, correct_count, duration_minutes) VALUES (?, ?, ?, 0, 0, 0)'
    ).run(userId, subjectId || null, new Date().toISOString())
    return db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('db:endStudySession', (_event, sessionId: number, cardsReviewed: number, correctCount: number) => {
    const start = db.prepare('SELECT started_at FROM study_sessions WHERE id = ?').get(sessionId) as any
    const startedAt = start ? new Date(start.started_at).getTime() : Date.now()
    const durationMinutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000))
    db.prepare(
      'UPDATE study_sessions SET ended_at = ?, cards_reviewed = ?, correct_count = ?, duration_minutes = ? WHERE id = ?'
    ).run(new Date().toISOString(), cardsReviewed, correctCount, durationMinutes, sessionId)
    return { success: true }
  })

  ipcMain.handle('db:getFocusModeSettings', (_event, userId: number) => {
    const settings = db.prepare('SELECT * FROM focus_mode_settings WHERE user_id = ?').get(userId) as any
    if (!settings) {
      db.prepare('INSERT INTO focus_mode_settings (user_id) VALUES (?)').run(userId)
      return { focus_minutes: 25, break_minutes: 5, block_notifications: true, show_fullscreen: false, auto_start_break: true }
    }
    return settings
  })

  ipcMain.handle('db:saveFocusModeSettings', (_event, userId: number, settings: any) => {
    db.prepare(
      'INSERT OR REPLACE INTO focus_mode_settings (user_id, focus_minutes, break_minutes, block_notifications, show_fullscreen, auto_start_break) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, settings.focus_minutes, settings.break_minutes, settings.block_notifications ? 1 : 0, settings.show_fullscreen ? 1 : 0, settings.auto_start_break ? 1 : 0)
    return { success: true }
  })

  ipcMain.handle('db:getRecentStudySessions', (_event, userId: number, limit: number = 10) => {
    return db.prepare('SELECT * FROM study_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?').all(userId, limit)
  })

  // ── Published Decks ──
  ipcMain.handle('db:publishDeck', (_event, subjectId: number, userId: number, description?: string) => {
    const subject = db.prepare('SELECT name FROM subjects WHERE id = ? AND user_id = ?').get(subjectId, userId) as any
    if (!subject) return null
    const cardCount = db.prepare('SELECT COUNT(*) as cnt FROM cards WHERE subject_id = ?').get(subjectId) as any
    const slug = subject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
    const result = db.prepare(
      'INSERT INTO published_decks (subject_id, user_id, public_slug, title, description, card_count) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(subjectId, userId, slug, subject.name, description || null, cardCount?.cnt || 0)
    return db.prepare('SELECT * FROM published_decks WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('db:unpublishDeck', (_event, subjectId: number) => {
    db.prepare('DELETE FROM published_decks WHERE subject_id = ?').run(subjectId)
    return { success: true }
  })

  ipcMain.handle('db:getPublishedDecks', () => {
    return db.prepare('SELECT * FROM published_decks WHERE is_published = 1 ORDER BY download_count DESC').all()
  })

  ipcMain.handle('db:downloadPublishedDeck', (_event, deckId: number, userId: number) => {
    const deck = db.prepare('SELECT * FROM published_decks WHERE id = ?').get(deckId) as any
    if (!deck) return { subjectsCreated: 0, cardsImported: 0, deadlinesImported: 0, errors: ['Deck not found'] }
    db.prepare('UPDATE published_decks SET download_count = download_count + 1 WHERE id = ?').run(deckId)

    const subjectResult = db.prepare(
      'INSERT INTO subjects (user_id, name, status, created_at) VALUES (?, ?, ?, ?)'
    ).run(userId, deck.title, 'active', new Date().toISOString())
    const subjectId = subjectResult.lastInsertRowid as number
    const cards = db.prepare('SELECT * FROM cards WHERE subject_id = ?').all(deck.subject_id)
    let cardsImported = 0
    if (cards.length > 0) {
      for (const card of cards as any[]) {
        db.prepare(
          'INSERT INTO cards (subject_id, type, front, back, is_manual, concept, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(subjectId, card.type, card.front, card.back, 1, card.concept || null, card.tags || '', new Date().toISOString())
        cardsImported++
      }
    }
    return { subjectsCreated: 1, cardsImported, deadlinesImported: 0, errors: [] }
  })

  ipcMain.handle('db:getMyPublishedDecks', (_event, userId: number) => {
    return db.prepare('SELECT * FROM published_decks WHERE user_id = ? ORDER BY created_at DESC').all(userId)
  })

  // ── Study Groups ──
  ipcMain.handle('db:createStudyGroup', (_event, name: string, description: string, createdBy: number) => {
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const result = db.prepare(
      'INSERT INTO study_groups (name, description, invite_code, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(name, description, inviteCode, createdBy, new Date().toISOString())
    const groupId = result.lastInsertRowid as number
    db.prepare('INSERT INTO study_group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(groupId, createdBy, 'admin', new Date().toISOString())
    return db.prepare('SELECT * FROM study_groups WHERE id = ?').get(groupId)
  })

  ipcMain.handle('db:joinStudyGroup', (_event, inviteCode: string, userId: number) => {
    const group = db.prepare('SELECT * FROM study_groups WHERE invite_code = ?').get(inviteCode) as any
    if (!group) return null
    const existing = db.prepare('SELECT id FROM study_group_members WHERE group_id = ? AND user_id = ?').get(group.id, userId)
    if (!existing) {
      db.prepare('INSERT INTO study_group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(group.id, userId, 'member', new Date().toISOString())
    }
    return db.prepare('SELECT * FROM study_groups WHERE id = ?').get(group.id)
  })

  ipcMain.handle('db:getStudyGroups', (_event, userId: number) => {
    const groups = db.prepare(`
      SELECT sg.*, (SELECT COUNT(*) FROM study_group_members sgm WHERE sgm.group_id = sg.id) as member_count
      FROM study_groups sg
      JOIN study_group_members sgm ON sgm.group_id = sg.id
      WHERE sgm.user_id = ?
      ORDER BY sg.created_at DESC
    `).all(userId)
    return groups
  })

  ipcMain.handle('db:getStudyGroupMembers', (_event, groupId: number) => {
    return db.prepare('SELECT * FROM study_group_members WHERE group_id = ?').all(groupId)
  })

  ipcMain.handle('db:shareSubjectWithGroup', (_event, groupId: number, subjectId: number) => {
    db.prepare('INSERT OR IGNORE INTO study_group_subjects (group_id, subject_id) VALUES (?, ?)').run(groupId, subjectId)
    return { success: true }
  })

  // ── AnkiConnect / Plugins ──
  ipcMain.handle('db:registerPluginEndpoint', (_event, endpoint: any) => {
    if (endpoint.id) {
      db.prepare('UPDATE plugin_endpoints SET name = ?, description = ?, endpoint_type = ?, config_json = ?, is_active = ? WHERE id = ?').run(
        endpoint.name, endpoint.description || null, endpoint.endpoint_type, JSON.stringify(endpoint.config_json || {}), endpoint.is_active ?? 1, endpoint.id
      )
      return db.prepare('SELECT * FROM plugin_endpoints WHERE id = ?').get(endpoint.id)
    }
    const result = db.prepare(
      'INSERT INTO plugin_endpoints (name, description, endpoint_type, config_json, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(endpoint.name, endpoint.description || null, endpoint.endpoint_type || 'anki_connect', JSON.stringify(endpoint.config_json || {}), endpoint.is_active ?? 1, new Date().toISOString())
    return db.prepare('SELECT * FROM plugin_endpoints WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('db:getPluginEndpoints', () => {
    return db.prepare('SELECT * FROM plugin_endpoints ORDER BY created_at DESC').all()
  })

  ipcMain.handle('db:ankiConnectAddNote', (_event, note: any, userId: number) => {
    const front = note.fields?.Front || ''
    const back = note.fields?.Back || ''
    const tags = (note.tags || []).join(' ')

    // Find or create subject from deckName
    let subject = db.prepare('SELECT id FROM subjects WHERE name = ? AND user_id = ?').get(note.deckName, userId) as any
    if (!subject) {
      const result = db.prepare('INSERT INTO subjects (user_id, name, status, created_at) VALUES (?, ?, ?, ?)').run(userId, note.deckName, 'active', new Date().toISOString())
      subject = { id: result.lastInsertRowid }
    }

    const cardResult = db.prepare(
      'INSERT INTO cards (subject_id, type, front, back, is_manual, tags, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(subject.id, 'flashcard', front, back, 1, tags, 'anki-connect', new Date().toISOString())
    const cardId = cardResult.lastInsertRowid as number
    db.prepare('INSERT INTO card_schedule (card_id, user_id, interval, repetitions, ease_factor, due_date) VALUES (?, ?, ?, ?, ?, ?)').run(cardId, userId, 1, 0, 2.5, new Date().toISOString().split('T')[0])
    return { success: true, cardId }
  })

  ipcMain.handle('db:ankiConnectFindCards', (_event, query: string, userId: number) => {
    const likeQuery = '%' + query + '%'
    const cards = db.prepare(
      `SELECT c.id FROM cards c
       JOIN subjects s ON s.id = c.subject_id
       WHERE s.user_id = ? AND (c.front LIKE ? OR c.back LIKE ?)
       LIMIT 50`
    ).all(userId, likeQuery, likeQuery) as { id: number }[]
    return cards.map((c) => c.id)
  })

  // ── Semantic Similarity ──
  ipcMain.handle('db:getSemanticSimilarity', (_event, text1: string, text2: string) => {
    // Simple word-overlap based similarity (local, no API needed)
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2))
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2))
    if (words1.size === 0 || words2.size === 0) return { score: 0 }
    let intersection = 0
    for (const w of words1) if (words2.has(w)) intersection++
    const score = intersection / Math.max(words1.size, words2.size)
    return { score: Math.round(score * 100) / 100 }
  })

  // ── Accessibility Settings ──
  ipcMain.handle('db:getAccessibilitySettings', () => {
    const getMeta = (key: string, def: string) => {
      const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as any
      return row ? row.value : def
    }
    return {
      reduceMotion: getMeta('a11y_reduce_motion', 'false') === 'true',
      highContrast: getMeta('a11y_high_contrast', 'false') === 'true',
      largeText: getMeta('a11y_large_text', 'false') === 'true',
      showMasteryIcons: getMeta('a11y_show_mastery_icons', 'true') === 'true',
    }
  })

  ipcMain.handle('db:saveAccessibilitySettings', (_event, settings: any) => {
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('a11y_reduce_motion', ?)").run(settings.reduceMotion ? 'true' : 'false')
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('a11y_high_contrast', ?)").run(settings.highContrast ? 'true' : 'false')
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('a11y_large_text', ?)").run(settings.largeText ? 'true' : 'false')
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('a11y_show_mastery_icons', ?)").run(settings.showMasteryIcons ? 'true' : 'false')
    return { success: true }
  })

  // ── Onboarding Data ──
  ipcMain.handle('db:saveOnboardingData', (_event, data: any) => {
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('onboarding_name', ?)").run(data.name || '')
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('onboarding_goal', ?)").run(data.goal || '')
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('onboarding_completed', ?)").run(data.hasCompleted ? 'true' : 'false')
    return { success: true }
  })

  ipcMain.handle('db:getOnboardingData', () => {
    const getMeta = (key: string, def: string | null = null) => {
      const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as any
      return row ? row.value : def
    }
    const name = getMeta('onboarding_name')
    const goal = getMeta('onboarding_goal')
    const completed = getMeta('onboarding_completed', 'false')
    if (!name) return null
    return {
      name,
      goal: goal || undefined,
      hasCompleted: completed === 'true',
    }
  })

  // ── Personalized Retention ──
  ipcMain.handle('db:getOptimalRetention', (_event, userId: number) => {
    const { suggestRetention } = require('../../src/lib/fsrs')
    const meta = db.prepare("SELECT value FROM app_meta WHERE key = 'retention_probes'").get() as any
    const probes: Array<{ desired: number; actual: number }> = meta ? JSON.parse(meta.value) : []
    const currentMeta = db.prepare("SELECT value FROM app_meta WHERE key = 'desired_retention'").get() as any
    const current = currentMeta ? parseFloat(currentMeta.value) : 0.9
    // Compute actual recall from recent reviews
    const recent = db.prepare(
      'SELECT AVG(was_correct) as recall FROM review_log WHERE user_id = ? AND reviewed_at >= datetime("now", "-7 days")'
    ).get(userId) as any
    const actualRecall = recent?.recall ?? 0.8
    const suggested = suggestRetention(probes)
    return { suggested, current, actualRecall }
  })

  ipcMain.handle('db:recordRetentionProbe', (_event, _userId: number, desiredRetention: number, actualRecall: number) => {
    const meta = db.prepare("SELECT value FROM app_meta WHERE key = 'retention_probes'").get() as any
    const probes: Array<{ desired: number; actual: number; date: string }> = meta ? JSON.parse(meta.value) : []
    probes.push({ desired: desiredRetention, actual: actualRecall, date: new Date().toISOString().split('T')[0] })
    // Keep last 20 probes
    const trimmed = probes.slice(-20)
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('retention_probes', ?)").run(JSON.stringify(trimmed))
    return { success: true }
  })

  // ── Wipe Data ──
  ipcMain.handle('db:wipeAllData', () => {
    db.transaction(() => {
      db.exec('DELETE FROM review_log')
      db.exec('DELETE FROM card_schedule')
      db.exec('DELETE FROM mc_review_log')
      db.exec('DELETE FROM cards')
      db.exec('DELETE FROM card_notes')
      db.exec('DELETE FROM materials')
      db.exec('DELETE FROM deadlines')
      db.exec('DELETE FROM diagnostics')
      db.exec('DELETE FROM concept_mastery')
      db.exec('DELETE FROM card_folders')
      db.exec('DELETE FROM study_sessions')
      db.exec('DELETE FROM achievements')
      db.exec('DELETE FROM user_levels')
      db.exec('DELETE FROM daily_quests')
      db.exec('DELETE FROM review_undo_log')
      db.exec('DELETE FROM subjects')
      db.exec('DELETE FROM users')
      db.exec('DELETE FROM app_meta')
    })()
    return { success: true }
  })
}
