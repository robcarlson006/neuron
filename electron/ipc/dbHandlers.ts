import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { sm2, defaultSchedule, boostForExam } from '../../src/lib/sm2'
import type {
  User,
  Subject,
  Card,
  CardFolder,
  CardSchedule,
  ReviewLog,
  Deadline,
  Diagnostic,
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
        'UPDATE cards SET front = ?, back = ?, type = ?, folder_id = ? WHERE id = ?'
      ).run(card.front, card.back, card.type, card.folder_id ?? null, card.id)
      return db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id) as Card
    } else {
      const result = db.prepare(
        'INSERT INTO cards (subject_id, material_id, type, front, back, is_manual, folder_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        card.subject_id,
        card.material_id || null,
        card.type,
        card.front,
        card.back,
        card.is_manual || 0,
        card.folder_id ?? null,
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

  // SM2 update (combined: update schedule + log review)
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
    const sm2Result = sm2(quality, currentSchedule)

    // Apply exam boost: if the card's subject has an upcoming study-affecting deadline, cap the interval
    const cardRow = db.prepare('SELECT subject_id FROM cards WHERE id = ?').get(cardId) as { subject_id: number } | undefined
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
        const boosted = boostForExam(sm2Result.interval, daysUntil)
        if (boosted < sm2Result.interval) {
          sm2Result.interval = boosted
          const dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + boosted)
          sm2Result.due_date = dueDate.toISOString().split('T')[0]
        }
      }
    }

    // Update schedule
    db.prepare(
      'UPDATE card_schedule SET interval = ?, repetitions = ?, ease_factor = ?, due_date = ?, last_reviewed_at = ? WHERE card_id = ? AND user_id = ?'
    ).run(sm2Result.interval, sm2Result.repetitions, sm2Result.ease_factor, sm2Result.due_date, new Date().toISOString(), cardId, userId)

    // Log review
    db.prepare(
      'INSERT INTO review_log (card_id, user_id, reviewed_at, quality, was_correct, user_answer, ai_feedback, response_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(cardId, userId, new Date().toISOString(), quality, wasCorrect ? 1 : 0, userAnswer || null, aiFeedback || null, responseTimeMs ?? null)

    return { sm2Result, success: true }
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
