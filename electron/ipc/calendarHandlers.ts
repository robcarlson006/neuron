import { ipcMain } from 'electron'
import type { CalendarSource, CalendarEvent, CalendarScheduleContext } from '../../src/types'
import { parseICalFeed, SubjectLookup } from './calendarSyncService'

export class CalendarRepo {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  getSources(userId: number): CalendarSource[] {
    return this.db.prepare(`
      SELECT * FROM calendar_sources WHERE user_id = ? ORDER BY created_at ASC
    `).all(userId) as CalendarSource[]
  }

  getSourceById(sourceId: number): CalendarSource | undefined {
    return this.db.prepare(`
      SELECT * FROM calendar_sources WHERE id = ?
    `).get(sourceId) as CalendarSource | undefined
  }

  saveSource(data: {
    id?: number
    userId: number
    name: string
    type: 'ical' | 'manual' | 'google_oauth'
    url?: string
    color?: string
  }): CalendarSource {
    if (data.id) {
      this.db.prepare(`
        UPDATE calendar_sources
        SET name = ?, type = ?, url = ?, color = ?
        WHERE id = ? AND user_id = ?
      `).run(data.name, data.type, data.url || null, data.color || '#8b5cf6', data.id, data.userId)
      return this.getSourceById(data.id)!
    }

    const res = this.db.prepare(`
      INSERT INTO calendar_sources (user_id, name, type, url, color)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.userId, data.name, data.type, data.url || null, data.color || '#8b5cf6')

    const newId = Number(res.lastInsertRowid)
    return this.getSourceById(newId)!
  }

  deleteSource(sourceId: number): boolean {
    const res = this.db.prepare(`
      DELETE FROM calendar_sources WHERE id = ?
    `).run(sourceId)
    return res.changes > 0
  }

  getEvents(userId: number, startDate?: string, endDate?: string): CalendarEvent[] {
    let query = `
      SELECT e.*, s.name as subject_name
      FROM calendar_events e
      LEFT JOIN subjects s ON e.subject_id = s.id
      WHERE e.user_id = ?
    `
    const params: any[] = [userId]

    if (startDate) {
      query += ` AND e.end_time >= ?`
      params.push(startDate)
    }
    if (endDate) {
      query += ` AND e.start_time <= ?`
      params.push(endDate)
    }

    query += ` ORDER BY e.start_time ASC`
    return this.db.prepare(query).all(...params) as CalendarEvent[]
  }

  getEventById(eventId: number): CalendarEvent | undefined {
    return this.db.prepare(`
      SELECT e.*, s.name as subject_name
      FROM calendar_events e
      LEFT JOIN subjects s ON e.subject_id = s.id
      WHERE e.id = ?
    `).get(eventId) as CalendarEvent | undefined
  }

  saveEvent(userId: number, event: Partial<CalendarEvent>): CalendarEvent {
    if (event.id) {
      this.db.prepare(`
        UPDATE calendar_events
        SET title = ?, description = ?, location = ?, start_time = ?, end_time = ?,
            all_day = ?, subject_id = ?, event_type = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(
        event.title,
        event.description || null,
        event.location || null,
        event.start_time,
        event.end_time,
        event.all_day ? 1 : 0,
        event.subject_id || null,
        event.event_type || 'lecture',
        event.id,
        userId
      )
      return this.getEventById(event.id)!
    }

    const res = this.db.prepare(`
      INSERT INTO calendar_events (
        user_id, source_id, external_id, title, description, location,
        start_time, end_time, all_day, recurrence_rule, subject_id, event_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      event.source_id || null,
      event.external_id || null,
      event.title,
      event.description || null,
      event.location || null,
      event.start_time,
      event.end_time,
      event.all_day ? 1 : 0,
      event.recurrence_rule || null,
      event.subject_id || null,
      event.event_type || 'lecture'
    )

    const newId = Number(res.lastInsertRowid)
    return this.getEventById(newId)!
  }

  deleteEvent(eventId: number): boolean {
    const res = this.db.prepare(`
      DELETE FROM calendar_events WHERE id = ?
    `).run(eventId)
    return res.changes > 0
  }

  detectCurrentContext(userId: number, referenceTime: Date = new Date()): CalendarScheduleContext | null {
    const pad = (n: number) => String(n).padStart(2, '0')
    const formatLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

    const pastOneHour = formatLocal(new Date(referenceTime.getTime() - 60 * 60 * 1000))
    const nextOneHour = formatLocal(new Date(referenceTime.getTime() + 60 * 60 * 1000))

    const events = this.getEvents(userId, pastOneHour, nextOneHour)

    for (const evt of events) {
      const startTime = new Date(evt.start_time).getTime()
      const endTime = new Date(evt.end_time).getTime()
      const refTimeMs = referenceTime.getTime()

      // Check Pre-Event: Starts within next 60 minutes
      if (startTime > refTimeMs && startTime <= refTimeMs + 60 * 60 * 1000) {
        const minutesUntilStart = Math.round((startTime - refTimeMs) / 60000)
        return {
          type: 'pre_event',
          event: evt,
          minutesUntilStart
        }
      }

      // Check Post-Event: Ended within past 60 minutes
      if (endTime <= refTimeMs && endTime >= refTimeMs - 60 * 60 * 1000) {
        const minutesSinceEnd = Math.round((refTimeMs - endTime) / 60000)
        return {
          type: 'post_event',
          event: evt,
          minutesSinceEnd
        }
      }
    }

    return null
  }

  async syncSource(sourceId: number): Promise<{ success: boolean; eventCount: number; error?: string }> {
    const source = this.getSourceById(sourceId)
    if (!source || !source.url) {
      return { success: false, eventCount: 0, error: 'Source or URL not found' }
    }

    try {
      const resp = await fetch(source.url)
      if (!resp.ok) {
        throw new Error(`HTTP error ${resp.status} fetching calendar feed`)
      }
      const icsText = await resp.text()

      // Fetch user's subjects
      const subjects = this.db.prepare(`
        SELECT id, name, course_code as courseCode FROM subjects WHERE user_id = ?
      `).all(source.user_id) as SubjectLookup[]

      const now = new Date()
      const windowStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

      const parsedEvents = parseICalFeed(icsText, windowStart, windowEnd, subjects)

      // Insert events inside a transaction
      const deleteExisting = this.db.prepare(`
        DELETE FROM calendar_events WHERE source_id = ?
      `)
      const insertEvent = this.db.prepare(`
        INSERT INTO calendar_events (
          user_id, source_id, external_id, title, description, location,
          start_time, end_time, all_day, recurrence_rule, subject_id, event_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      this.db.transaction(() => {
        deleteExisting.run(sourceId)
        for (const evt of parsedEvents) {
          insertEvent.run(
            source.user_id,
            sourceId,
            evt.external_id,
            evt.title,
            evt.description || null,
            evt.location || null,
            evt.start_time,
            evt.end_time,
            evt.all_day,
            evt.recurrence_rule || null,
            evt.subject_id || null,
            evt.event_type
          )
        }
        this.db.prepare(`
          UPDATE calendar_sources SET last_synced_at = datetime('now') WHERE id = ?
        `).run(sourceId)
      })()

      return { success: true, eventCount: parsedEvents.length }
    } catch (err: any) {
      console.error('Calendar sync error:', err)
      return { success: false, eventCount: 0, error: err.message || 'Failed to sync feed' }
    }
  }
}

let repoInstance: CalendarRepo | null = null

export function setCalendarDatabase(database: any): void {
  repoInstance = new CalendarRepo(database)
}

export function getCalendarRepo(): CalendarRepo {
  if (!repoInstance) {
    throw new Error('CalendarRepo database not initialized')
  }
  return repoInstance
}

export function registerCalendarHandlers(): void {
  ipcMain.handle('calendar:getSources', async (_, userId: number) => {
    return getCalendarRepo().getSources(userId)
  })

  ipcMain.handle('calendar:saveSource', async (_, data: any) => {
    return getCalendarRepo().saveSource(data)
  })

  ipcMain.handle('calendar:deleteSource', async (_, sourceId: number) => {
    return getCalendarRepo().deleteSource(sourceId)
  })

  ipcMain.handle('calendar:syncSource', async (_, sourceId: number) => {
    return getCalendarRepo().syncSource(sourceId)
  })

  ipcMain.handle('calendar:getEvents', async (_, { userId, startDate, endDate }: { userId: number; startDate?: string; endDate?: string }) => {
    return getCalendarRepo().getEvents(userId, startDate, endDate)
  })

  ipcMain.handle('calendar:saveEvent', async (_, { userId, event }: { userId: number; event: Partial<CalendarEvent> }) => {
    return getCalendarRepo().saveEvent(userId, event)
  })

  ipcMain.handle('calendar:deleteEvent', async (_, eventId: number) => {
    return getCalendarRepo().deleteEvent(eventId)
  })

  ipcMain.handle('calendar:detectCurrentContext', async (_, userId: number) => {
    return getCalendarRepo().detectCurrentContext(userId)
  })
}
