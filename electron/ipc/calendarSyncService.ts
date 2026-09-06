import type { CalendarEventType } from '../../src/types'

export interface SubjectLookup {
  id: number
  name: string
  courseCode?: string
}

export interface ParsedEventItem {
  external_id: string
  title: string
  description?: string
  location?: string
  start_time: string
  end_time: string
  all_day: number
  recurrence_rule?: string
  subject_id?: number
  event_type: CalendarEventType
}

/**
 * Matches an event title or description against a user's subjects.
 */
export function matchEventSubject(
  title: string,
  description: string = '',
  subjects: SubjectLookup[]
): number | undefined {
  const text = `${title} ${description}`.toLowerCase()

  // 1. Try exact or normalized course code match first
  for (const s of subjects) {
    if (s.courseCode) {
      const code = s.courseCode.toLowerCase().trim()
      const codeWithoutSpaces = code.replace(/\s+/g, '')
      const textWithoutSpaces = text.replace(/\s+/g, '')
      if (text.includes(code) || textWithoutSpaces.includes(codeWithoutSpaces)) {
        return s.id
      }
    }
  }

  // 2. Try subject name keyword match
  for (const s of subjects) {
    const name = s.name.toLowerCase().trim()
    // Match whole subject name
    if (text.includes(name)) {
      return s.id
    }
    // Match significant words in subject name (ignore common short stopwords)
    const words = name.split(/\s+/).filter(w => w.length > 3 && !['intro', 'introduction', 'basics', 'principles', 'advanced'].includes(w))
    if (words.length > 0 && words.every(w => text.includes(w))) {
      return s.id
    }
  }

  return undefined
}

/**
 * Detects the event type based on title and description keywords.
 */
export function detectEventType(title: string, hasSubjectMatch: boolean = false): CalendarEventType {
  const lower = title.toLowerCase()

  if (/\b(lab|laboratory|practicum)\b/i.test(lower)) return 'lab'
  if (/\b(seminar|colloquium)\b/i.test(lower)) return 'seminar'
  if (/\b(workshop|recitation|discussion|tutorial)\b/i.test(lower)) return 'workshop'
  if (/\b(lecture|class|lec)\b/i.test(lower)) return 'lecture'
  if (/\b(study|review|office hours|prep)\b/i.test(lower)) return 'study'

  return hasSubjectMatch ? 'lecture' : 'personal'
}

/**
 * Unfolds RFC 5545 lines.
 */
function unfoldLines(icsContent: string): string[] {
  const clean = icsContent.replace(/\r\n[ \t]|\r[ \t]|\n[ \t]/g, '')
  return clean.split(/\r\n|\r|\n/)
}

/**
 * Parses an iCal datetime string into a JavaScript Date object.
 */
function parseICalDate(val: string): { date: Date; allDay: boolean } {
  // Format: 20260906T130000Z or 20260906T130000 or 20260906
  const clean = val.replace(/^.*:/, '').trim()
  if (clean.length === 8 && !clean.includes('T')) {
    // All day date: YYYYMMDD
    const y = parseInt(clean.substring(0, 4), 10)
    const m = parseInt(clean.substring(4, 6), 10) - 1
    const d = parseInt(clean.substring(6, 8), 10)
    return { date: new Date(Date.UTC(y, m, d, 0, 0, 0)), allDay: true }
  }

  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (match) {
    const [, year, month, day, hour, min, sec, isUtc] = match
    const y = parseInt(year, 10)
    const m = parseInt(month, 10) - 1
    const d = parseInt(day, 10)
    const h = parseInt(hour, 10)
    const mi = parseInt(min, 10)
    const s = parseInt(sec, 10)

    if (isUtc) {
      return { date: new Date(Date.UTC(y, m, d, h, mi, s)), allDay: false }
    }
    return { date: new Date(y, m, d, h, mi, s), allDay: false }
  }

  const parsed = new Date(clean)
  return { date: isNaN(parsed.getTime()) ? new Date() : parsed, allDay: false }
}

/**
 * Formats a Date to local ISO string (YYYY-MM-DDTHH:mm:ss).
 */
function formatLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
}

interface ParsedRawVEvent {
  uid: string
  summary: string
  description?: string
  location?: string
  dtstart: { date: Date; allDay: boolean }
  dtend?: { date: Date; allDay: boolean }
  rrule?: string
}

/**
 * Parses raw RFC 5545 iCal content and expands recurring instances within window.
 */
export function parseICalFeed(
  icsContent: string,
  windowStart: Date,
  windowEnd: Date,
  subjects: SubjectLookup[] = []
): ParsedEventItem[] {
  const lines = unfoldLines(icsContent)
  const rawEvents: ParsedRawVEvent[] = []
  let currentEvent: Partial<ParsedRawVEvent> | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'BEGIN:VEVENT') {
      currentEvent = {}
    } else if (trimmed === 'END:VEVENT') {
      if (currentEvent && currentEvent.uid && currentEvent.dtstart) {
        rawEvents.push({
          uid: currentEvent.uid,
          summary: currentEvent.summary || 'Untitled Event',
          description: currentEvent.description,
          location: currentEvent.location,
          dtstart: currentEvent.dtstart,
          dtend: currentEvent.dtend,
          rrule: currentEvent.rrule
        })
      }
      currentEvent = null
    } else if (currentEvent) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const rawKey = line.substring(0, colonIdx)
      const value = line.substring(colonIdx + 1)
      const key = rawKey.split(';')[0].toUpperCase()

      switch (key) {
        case 'UID':
          currentEvent.uid = value
          break
        case 'SUMMARY':
          currentEvent.summary = value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n')
          break
        case 'DESCRIPTION':
          currentEvent.description = value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n')
          break
        case 'LOCATION':
          currentEvent.location = value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n')
          break
        case 'DTSTART':
          currentEvent.dtstart = parseICalDate(line)
          break
        case 'DTEND':
          currentEvent.dtend = parseICalDate(line)
          break
        case 'RRULE':
          currentEvent.rrule = value
          break
      }
    }
  }

  const results: ParsedEventItem[] = []

  for (const raw of rawEvents) {
    const subjectId = matchEventSubject(raw.summary, raw.description, subjects)
    const eventType = detectEventType(raw.summary, subjectId !== undefined)

    const startDate = raw.dtstart.date
    const durationMs = raw.dtend
      ? raw.dtend.date.getTime() - startDate.getTime()
      : raw.dtstart.allDay
      ? 24 * 60 * 60 * 1000
      : 60 * 60 * 1000

    if (!raw.rrule) {
      // Non-recurring event
      if (startDate >= windowStart && startDate <= windowEnd) {
        const endDate = new Date(startDate.getTime() + durationMs)
        results.push({
          external_id: raw.uid,
          title: raw.summary,
          description: raw.description,
          location: raw.location,
          start_time: formatLocalIso(startDate),
          end_time: formatLocalIso(endDate),
          all_day: raw.dtstart.allDay ? 1 : 0,
          subject_id: subjectId,
          event_type: eventType
        })
      }
    } else {
      // Recurring event expansion
      const rruleMap: Record<string, string> = {}
      raw.rrule.split(';').forEach(part => {
        const [k, v] = part.split('=')
        if (k && v) rruleMap[k.toUpperCase()] = v.toUpperCase()
      })

      const freq = rruleMap['FREQ']
      const byDay = rruleMap['BYDAY'] ? rruleMap['BYDAY'].split(',') : null
      const until = rruleMap['UNTIL'] ? parseICalDate(rruleMap['UNTIL']).date : null
      const count = rruleMap['COUNT'] ? parseInt(rruleMap['COUNT'], 10) : 100

      if (freq === 'WEEKLY' || freq === 'DAILY') {
        const targetDays = byDay
          ? byDay.map(d => DAY_NAME_TO_INDEX[d]).filter(d => d !== undefined)
          : [startDate.getDay()]

        // Start from either event start date or window start (normalized to start time hours)
        const cur = new Date(startDate.getTime())
        let generatedCount = 0

        // Advance day by day up to windowEnd
        while (cur <= windowEnd && (!until || cur <= until) && generatedCount < count) {
          if (cur >= startDate && targetDays.includes(cur.getDay())) {
            generatedCount++
            if (cur >= windowStart && cur <= windowEnd) {
              const instEnd = new Date(cur.getTime() + durationMs)
              results.push({
                external_id: `${raw.uid}_${cur.toISOString().split('T')[0]}`,
                title: raw.summary,
                description: raw.description,
                location: raw.location,
                start_time: formatLocalIso(cur),
                end_time: formatLocalIso(instEnd),
                all_day: raw.dtstart.allDay ? 1 : 0,
                recurrence_rule: raw.rrule,
                subject_id: subjectId,
                event_type: eventType
              })
            }
          }
          cur.setDate(cur.getDate() + 1)
        }
      }
    }
  }

  // Sort events chronologically
  results.sort((a, b) => a.start_time.localeCompare(b.start_time))
  return results
}
