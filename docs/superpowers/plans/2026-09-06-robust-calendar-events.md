# Robust Calendar Events & Calendar-Aware Focus Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Neuron's calendar into an active schedule hub with Google Calendar iCal sync, daily timeline events, smart gap detection, and a 1-hour pre/post-event study intelligence engine that powers primer drills and concept lock-in sprints.

**Architecture:** 
- SQLite persistence for `calendar_sources` and `calendar_events` with indexed start/end times and cascade deletes.
- Background iCal sync engine that parses Google Calendar secret feeds, expands RRULE recurrences into local instances, and auto-matches events to subjects.
- Context detector calculating if the student is within ±60 minutes of a class to trigger Pre-Event Primers or Post-Event Socratic Lock-In Sprints in Focus Block.
- Dual Calendar UI: Month Grid + Day Schedule Timeline with gap detection and optional drag/click time-boxing.

**Tech Stack:** TypeScript, Electron, React 18, Tailwind CSS, SQLite (`better-sqlite3` / `node:sqlite`), Zustand, Jest.

**Spec:** `docs/superpowers/specs/2026-09-06-robust-calendar-events-design.md`

## Global Constraints
- Target platform: macOS (Electron 41, Node 20+, React 18).
- SQLite cascade deletes must be preserved via `CascadeDB` and explicit ordering in `src/lib/db.ts`.
- Zero intrusive popups: schedule awareness surfaces when the user enters Focus Block or views the Calendar/Hub.
- Spaced repetition guarantee: Overdue flashcards (`due_date <= today`) and struggle memories (`mastery_level IN ('struggling', 'developing')`) must never be starved when generating calendar-tailored Focus Blocks.

---

### Task 1: Database Schema & Migrations for Calendar Events & Sources

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/types/index.ts`
- Test: `tests/unit/calendarDb.test.ts`

**Interfaces:**
- Consumes: `users(id)`, `subjects(id)` from `src/lib/db.ts`.
- Produces: `calendar_sources` and `calendar_events` tables and TypeScript interfaces (`CalendarSource`, `CalendarEvent`, `CalendarEventType`).

- [ ] **Step 1: Write the failing unit test for calendar schema creation**

Create `tests/unit/calendarDb.test.ts`:
```typescript
import { DatabaseSync } from 'node:sqlite'
import { SCHEMA, initDB } from '../../src/lib/db'

describe('Calendar Database Schema', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON;')
    db.exec(SCHEMA)
  })

  afterEach(() => {
    db.close()
  })

  test('creates calendar_sources and calendar_events tables', () => {
    const sourceTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='calendar_sources'").get()
    const eventsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='calendar_events'").get()
    expect(sourceTable).toBeDefined()
    expect(eventsTable).toBeDefined()
  })

  test('inserts and retrieves calendar source and event with cascade delete', () => {
    db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test User')").run()
    db.prepare("INSERT INTO subjects (id, name, color, user_id) VALUES (10, 'Macroeconomics', '#8b5cf6', 1)").run()

    db.prepare(`
      INSERT INTO calendar_sources (id, user_id, name, type, url, color)
      VALUES (100, 1, 'Google Calendar', 'ical', 'https://calendar.google.com/test.ics', '#8b5cf6')
    `).run()

    db.prepare(`
      INSERT INTO calendar_events (id, user_id, source_id, external_id, title, start_time, end_time, subject_id, event_type)
      VALUES (200, 1, 100, 'ext-1', 'Econ Lecture', '2026-09-06T10:00:00', '2026-09-06T11:00:00', 10, 'lecture')
    `).run()

    const event = db.prepare("SELECT * FROM calendar_events WHERE id = 200").get() as any
    expect(event.title).toBe('Econ Lecture')
    expect(event.subject_id).toBe(10)

    // Verify cascade delete when source is removed
    db.prepare("DELETE FROM calendar_sources WHERE id = 100").run()
    const deletedEvent = db.prepare("SELECT * FROM calendar_events WHERE id = 200").get()
    expect(deletedEvent).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/calendarDb.test.ts`
Expected: FAIL with missing tables `calendar_sources` or `calendar_events`.

- [ ] **Step 3: Update `src/types/index.ts` and `src/lib/db.ts`**

In `src/types/index.ts`, add:
```typescript
export type CalendarEventType = 'lecture' | 'seminar' | 'lab' | 'workshop' | 'study' | 'personal'

export interface CalendarSource {
  id: number
  user_id: number
  name: string
  type: 'ical' | 'manual' | 'google_oauth'
  url?: string
  color: string
  last_synced_at?: string
  created_at: string
}

export interface CalendarEvent {
  id: number
  user_id: number
  source_id?: number
  external_id?: string
  title: string
  description?: string
  location?: string
  start_time: string
  end_time: string
  all_day: boolean | number
  recurrence_rule?: string
  subject_id?: number
  event_type: CalendarEventType
  created_at: string
  updated_at: string
  subject_name?: string
  subject_color?: string
}
```

In `src/lib/db.ts`, append to `SCHEMA`:
```sql
  CREATE TABLE IF NOT EXISTS calendar_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('ical', 'manual', 'google_oauth')),
    url TEXT,
    color TEXT DEFAULT '#8b5cf6',
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_id INTEGER,
    external_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    recurrence_rule TEXT,
    subject_id INTEGER,
    event_type TEXT NOT NULL DEFAULT 'lecture' CHECK(event_type IN ('lecture', 'seminar', 'lab', 'workshop', 'study', 'personal')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_calendar_events_user_time
    ON calendar_events (user_id, start_time, end_time);
```

Add migration strings to `MIGRATIONS` array in `src/lib/db.ts` for existing databases:
```typescript
  "CREATE TABLE IF NOT EXISTS calendar_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('ical', 'manual', 'google_oauth')), url TEXT, color TEXT DEFAULT '#8b5cf6', last_synced_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_id INTEGER, external_id TEXT, title TEXT NOT NULL, description TEXT, location TEXT, start_time TEXT NOT NULL, end_time TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0, recurrence_rule TEXT, subject_id INTEGER, event_type TEXT NOT NULL DEFAULT 'lecture' CHECK(event_type IN ('lecture', 'seminar', 'lab', 'workshop', 'study', 'personal')), created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE, FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL)",
  "CREATE INDEX IF NOT EXISTS idx_calendar_events_user_time ON calendar_events (user_id, start_time, end_time)"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/calendarDb.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/db.ts tests/unit/calendarDb.test.ts
git commit -m "feat(db): add calendar_sources and calendar_events tables and types"
```

---

### Task 2: iCal Parser & Recurrence Sync Engine

**Files:**
- Create: `electron/ipc/calendarSyncService.ts`
- Test: `tests/unit/calendarSyncService.test.ts`

**Interfaces:**
- Consumes: Raw iCal ICS string, list of active subjects `{ id: number; name: string }[]`.
- Produces: `parseICalFeed(icsContent, windowStart, windowEnd, subjects)` returning parsed `CalendarEvent[]`.

- [ ] **Step 1: Write the failing unit test for iCal parser and subject matcher**

Create `tests/unit/calendarSyncService.test.ts`:
```typescript
import { parseICalFeed, matchEventSubject } from '../../electron/ipc/calendarSyncService'

describe('calendarSyncService', () => {
  const mockSubjects = [
    { id: 1, name: 'Macroeconomics' },
    { id: 2, name: 'Organic Chemistry' }
  ]

  test('matches event title to subject using keywords and fuzzy regex', () => {
    expect(matchEventSubject('ECON 201: Macro Lecture', mockSubjects)).toBe(1)
    expect(matchEventSubject('Orgo Chem Lab 3', mockSubjects)).toBe(2)
    expect(matchEventSubject('Gym Workout', mockSubjects)).toBeUndefined()
  })

  test('parses VEVENT with recurring RRULE into expanded instances within window', () => {
    const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:event-123@google.com
DTSTART:20260901T140000Z
DTEND:20260901T150000Z
RRULE:FREQ=WEEKLY;BYDAY=TU,TH
SUMMARY:Macroeconomics Seminar
DESCRIPTION:Discussion of Monetary Policy
LOCATION:Hall B
END:VEVENT
END:VCALENDAR`

    const windowStart = new Date('2026-09-01T00:00:00Z')
    const windowEnd = new Date('2026-09-10T00:00:00Z')

    const events = parseICalFeed(sampleIcs, windowStart, windowEnd, mockSubjects)
    expect(events.length).toBeGreaterThanOrEqual(3) // Sep 1 (Tue), Sep 3 (Thu), Sep 8 (Tue)
    expect(events[0].title).toBe('Macroeconomics Seminar')
    expect(events[0].subject_id).toBe(1)
    expect(events[0].event_type).toBe('seminar')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/calendarSyncService.test.ts`
Expected: FAIL with "Cannot find module '../../electron/ipc/calendarSyncService'".

- [ ] **Step 3: Implement `electron/ipc/calendarSyncService.ts`**

Implement RFC 5545 parser supporting VEVENT parsing, RRULE expansion (Weekly, Daily, specific days like MO,TU,WE,TH,FR), timezone normalization to ISO strings, event type detection (lecture, seminar, lab, workshop, personal), and subject title matching.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/calendarSyncService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/calendarSyncService.ts tests/unit/calendarSyncService.test.ts
git commit -m "feat(calendar): implement iCal parser, RRULE recurrence expansion, and subject matcher"
```

---

### Task 3: Calendar IPC Handlers, Database Ops, and Preload Exposure

**Files:**
- Create: `electron/ipc/calendarHandlers.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Test: `tests/unit/calendarHandlers.test.ts`

**Interfaces:**
- Consumes: `calendar_sources`, `calendar_events` SQLite tables and `parseICalFeed`.
- Produces: Electron IPC channels:
  - `calendar:getSources`
  - `calendar:saveSource`
  - `calendar:deleteSource`
  - `calendar:syncSource`
  - `calendar:getEvents`
  - `calendar:saveEvent`
  - `calendar:deleteEvent`
  - `calendar:detectCurrentContext`

- [ ] **Step 1: Write the failing unit test for calendar DB operations and context detection**

Create `tests/unit/calendarHandlers.test.ts`:
```typescript
import { DatabaseSync } from 'node:sqlite'
import { SCHEMA } from '../../src/lib/db'
import { CalendarRepo } from '../../electron/ipc/calendarHandlers'

describe('CalendarRepo & Context Detection', () => {
  let db: DatabaseSync
  let repo: CalendarRepo

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON;')
    db.exec(SCHEMA)
    db.prepare("INSERT INTO users (id, name) VALUES (1, 'Test')").run()
    db.prepare("INSERT INTO subjects (id, name, color, user_id) VALUES (1, 'Physics', '#3b82f6', 1)").run()
    repo = new CalendarRepo(db as any)
  })

  afterEach(() => {
    db.close()
  })

  test('detects pre-event context when within 60 min before start', () => {
    const now = new Date('2026-09-06T09:30:00')
    repo.saveEvent(1, {
      title: 'Physics Lecture',
      start_time: '2026-09-06T10:00:00',
      end_time: '2026-09-06T11:00:00',
      subject_id: 1,
      event_type: 'lecture'
    })

    const context = repo.detectCurrentContext(1, now)
    expect(context).not.toBeNull()
    expect(context?.type).toBe('pre_event')
    expect(context?.event.title).toBe('Physics Lecture')
    expect(context?.minutesUntilStart).toBe(30)
  })

  test('detects post-event context when within 60 min after end', () => {
    const now = new Date('2026-09-06T11:15:00')
    repo.saveEvent(1, {
      title: 'Physics Lecture',
      start_time: '2026-09-06T10:00:00',
      end_time: '2026-09-06T11:00:00',
      subject_id: 1,
      event_type: 'lecture'
    })

    const context = repo.detectCurrentContext(1, now)
    expect(context).not.toBeNull()
    expect(context?.type).toBe('post_event')
    expect(context?.event.title).toBe('Physics Lecture')
    expect(context?.minutesSinceEnd).toBe(15)
  })

  test('returns null when outside ±60 min window', () => {
    const now = new Date('2026-09-06T13:00:00')
    const context = repo.detectCurrentContext(1, now)
    expect(context).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/calendarHandlers.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `electron/ipc/calendarHandlers.ts` and register in `main.ts` + `preload.ts`**

Implement `CalendarRepo` and IPC handlers:
- `calendar:getSources`, `calendar:saveSource`, `calendar:deleteSource`
- `calendar:syncSource` (fetches HTTPS URL using Node `https`/`fetch`, calls `parseICalFeed`, wipes old events for source, inserts new events in SQLite transaction)
- `calendar:getEvents` (selects events joined with `subjects` for subject_name and subject_color)
- `calendar:saveEvent`, `calendar:deleteEvent`
- `calendar:detectCurrentContext`

Expose methods in `electron/preload.ts` under `window.electronAPI.calendar.*`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/calendarHandlers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/calendarHandlers.ts electron/preload.ts electron/main.ts tests/unit/calendarHandlers.test.ts
git commit -m "feat(calendar): add IPC handlers, repository, context detector, and preload bindings"
```

---

### Task 4: Calendar-Aware Focus Block Engine & Lock-In Sprint Integration

**Files:**
- Modify: `electron/ipc/tutorHandlers.ts`
- Test: `tests/unit/calendarFocusContext.test.ts`

**Interfaces:**
- Consumes: `plan:generateFocusBlock` IPC endpoint, `contextType: 'pre_event' | 'post_event'`, `lectureTopic`, `materials`.
- Produces: Tailored Focus Block items with 3-phase Lock-In sprint (Recall, Socratic Dialogue, Card Synthesis) and Tier-1 due card protection.

- [ ] **Step 1: Write the failing test for pre/post event Focus Block generation**

Create `tests/unit/calendarFocusContext.test.ts`:
```typescript
import { buildFocusBlockPrompt } from '../../electron/ipc/tutorHandlers'

describe('buildFocusBlockPrompt with Calendar Context', () => {
  test('injects post-event lock-in directives when context is post_event', () => {
    const prompt = buildFocusBlockPrompt({
      availableMinutes: 30,
      contextType: 'post_event',
      eventTitle: 'Bio 101 Lecture',
      subjectName: 'Biology',
      lectureTopic: 'Cellular Respiration & Krebs Cycle',
      dueCardsCount: 5,
      strugglingTopics: ['Mitochondrial Membrane']
    })

    expect(prompt).toContain('Post-Lecture Concept Lock-In Sprint')
    expect(prompt).toContain('Cellular Respiration & Krebs Cycle')
    expect(prompt).toContain('Free Recall')
    expect(prompt).toContain('Socratic')
    expect(prompt).toContain('Overdue flashcards: 5')
  })

  test('injects pre-event primer directives when context is pre_event', () => {
    const prompt = buildFocusBlockPrompt({
      availableMinutes: 15,
      contextType: 'pre_event',
      eventTitle: 'Bio 101 Seminar',
      subjectName: 'Biology',
      dueCardsCount: 0,
      strugglingTopics: ['Krebs Cycle']
    })

    expect(prompt).toContain('Pre-Class Primer')
    expect(prompt).toContain('Biology')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/calendarFocusContext.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `electron/ipc/tutorHandlers.ts`**

Export and update `buildFocusBlockPrompt` to incorporate calendar context (`pre_event`, `post_event`), the 3-phase cognitive retention protocol, lecture topics/notes input, and strictly guarantee Tier-1 due cards and Tier-2 weak point priorities.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/calendarFocusContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/tutorHandlers.ts tests/unit/calendarFocusContext.test.ts
git commit -m "feat(focus-block): integrate pre-event primer and post-lecture lock-in sprint into prompt generator"
```

---

### Task 5: DayScheduleTimeline Component & Gap Detection

**Files:**
- Create: `src/components/calendar/DayScheduleTimeline.tsx`
- Test: `tests/unit/DayScheduleTimeline.test.tsx`

**Interfaces:**
- Consumes: `events: CalendarEvent[]`, `selectedDate: string`, `onSlotClick?: (startTime: string, durationMinutes: number) => void`.
- Produces: React component rendering hourly agenda (8 AM - 9 PM), event cards with subject colors, and gap chips for open intervals >= 15 min.

- [ ] **Step 1: Write the failing unit test for DayScheduleTimeline and gap calculation**

Create `tests/unit/DayScheduleTimeline.test.tsx`:
```typescript
import React from 'react'
import { render, screen } from '@testing-library/react'
import DayScheduleTimeline, { calculateGaps } from '../../src/components/calendar/DayScheduleTimeline'
import type { CalendarEvent } from '../../src/types'

describe('DayScheduleTimeline & Gap Detection', () => {
  const mockEvents: CalendarEvent[] = [
    {
      id: 1,
      user_id: 1,
      title: 'Macroeconomics Lecture',
      start_time: '2026-09-06T09:00:00',
      end_time: '2026-09-06T10:00:00',
      all_day: 0,
      event_type: 'lecture',
      subject_name: 'Macroeconomics',
      subject_color: '#8b5cf6',
      created_at: '',
      updated_at: ''
    },
    {
      id: 2,
      user_id: 1,
      title: 'Chemistry Lab',
      start_time: '2026-09-06T11:00:00',
      end_time: '2026-09-06T13:00:00',
      all_day: 0,
      event_type: 'lab',
      subject_name: 'Chemistry',
      subject_color: '#10b981',
      created_at: '',
      updated_at: ''
    }
  ]

  test('calculates 60m free gap between 10:00 and 11:00', () => {
    const gaps = calculateGaps(mockEvents, '2026-09-06')
    const midGap = gaps.find(g => g.startTime === '10:00' && g.endTime === '11:00')
    expect(midGap).toBeDefined()
    expect(midGap?.durationMinutes).toBe(60)
  })

  test('renders events and gaps in timeline', () => {
    render(<DayScheduleTimeline events={mockEvents} selectedDate="2026-09-06" onSlotClick={() => {}} />)
    expect(screen.getByText('Macroeconomics Lecture')).toBeInTheDocument()
    expect(screen.getByText('Chemistry Lab')).toBeInTheDocument()
    expect(screen.getByText(/60m Free/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/DayScheduleTimeline.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `src/components/calendar/DayScheduleTimeline.tsx`**

Implement chronological time ladder from 8 AM to 9 PM, calculate free gaps, render subject-colored event cards, and clickable "+ Focus Block" action chips for each gap.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/unit/DayScheduleTimeline.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/DayScheduleTimeline.tsx tests/unit/DayScheduleTimeline.test.tsx
git commit -m "feat(ui): add DayScheduleTimeline with smart study gap detection"
```

---

### Task 6: Calendar Page Overhaul & Modals (Sync Google Calendar & Add Event)

**Files:**
- Create: `src/components/calendar/CalendarSyncModal.tsx`
- Create: `src/components/calendar/AddEventModal.tsx`
- Modify: `src/pages/Calendar.tsx`
- Modify: `src/components/CalendarView.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.calendar.*`, `DayScheduleTimeline`.
- Produces: Integrated Calendar page with Month Grid + Day Timeline, Sync Modal, and Add Event Modal.

- [ ] **Step 1: Implement `CalendarSyncModal.tsx`**

Provides URL input for Google Calendar private iCal link, instructions on how to find it in Google Calendar settings, color picker, "Sync Now" spinner, and success/error status toasts.

- [ ] **Step 2: Implement `AddEventModal.tsx`**

Provides clean modal for creating manual events: Title, Event Type (`lecture`, `seminar`, `lab`, `workshop`, `study`, `personal`), Subject dropdown, Start Time, End Time, and Date.

- [ ] **Step 3: Update `src/pages/Calendar.tsx` and `src/components/CalendarView.tsx`**

- Add "Sync Google Calendar" and "+ Add Event" buttons in Calendar header.
- Load calendar events for selected date range using `window.electronAPI.calendar.getEvents`.
- Render `DayScheduleTimeline` in the day details pane alongside cards due and deadlines.
- When a gap's "+ Focus Block" is clicked, navigate to Tutor Hub with pre-filled time parameters.

- [ ] **Step 4: Verify typecheck and build**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/CalendarSyncModal.tsx src/components/calendar/AddEventModal.tsx src/pages/Calendar.tsx src/components/CalendarView.tsx
git commit -m "feat(calendar): overhaul Calendar page with iCal sync modal, add event modal, and day timeline integration"
```

---

### Task 7: Tutor Hub Pre/Post-Event Smart Prompts & Lock-In Sprint Flow

**Files:**
- Create: `src/components/tutor/PostLecturePromptModal.tsx`
- Modify: `src/pages/tutor/TutorHub.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.calendar.detectCurrentContext()`, `plan:generateFocusBlock`.
- Produces: Dynamic banner on Tutor Hub alerting student to upcoming primer or post-lecture lock-in, with single topic input (text, existing subject materials, or file drop).

- [ ] **Step 1: Implement `PostLecturePromptModal.tsx`**

Modal/Card that appears when a post-lecture context is detected or clicked from the banner:
- Displays: *"Just finished [Event Title]. What was covered today?"*
- Input options:
  1. Text field for topic name/keywords.
  2. Dropdown to select from existing Subject Materials/Syllabus chapters.
  3. Drag-and-drop zone to drop today's lecture slides or notes.
- Time chips: `15m`, `30m`, `45m`.
- Button: `[ 🚀 Start Lock-In Sprint ]`.

- [ ] **Step 2: Update `src/pages/tutor/TutorHub.tsx`**

- On mount, call `window.electronAPI.calendar.detectCurrentContext(user.id)`.
- If context exists:
  - Render a top smart banner:
    - Pre-event: *"🔔 Upcoming [Subject] Seminar in X min — [ Start Primer ]"*
    - Post-event: *"🎓 [Subject] Lecture wrapped up — [ Lock In Today's Material ]"*
- On clicking banner or button, launch tailored Focus Block generation.

- [ ] **Step 3: Run full test suite & typecheck**

Run: `npm test && npm run typecheck`
Expected: All tests pass, 0 type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/tutor/PostLecturePromptModal.tsx src/pages/tutor/TutorHub.tsx
git commit -m "feat(tutor): integrate calendar context banners and post-lecture lock-in flow on Tutor Hub"
```
