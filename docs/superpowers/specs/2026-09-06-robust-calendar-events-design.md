# Robust Calendar Events & Calendar-Aware Focus Block System

## Overview
This feature elevates Neuron's calendar from a passive deadline & card-count viewer into an intelligent, schedule-aware study orchestration hub. By integrating daily routines and classes (via Google Calendar iCal sync and manual event entry), Neuron understands students' real-time schedules and automatically adapts **Focus Blocks** around upcoming seminars and just-finished lectures.

Crucially, it incorporates cognitive science retention principles (Immediate Free Recall + Socratic Elaborative Interrogation) to turn post-lecture moments into high-yield memory consolidation sprints, all while strictly honoring the student's available time and guaranteeing no weak points or due cards are left behind.

---

## Core Pillars & Workflows

### 1. Daily Event Management & Google Calendar Sync
* **Calendar Sources (`calendar_sources`)**:
  * Users can connect external calendars by pasting their private Google Calendar iCal link (Settings or Calendar page).
  * Auto-syncs on startup, periodically in the background (every 30 minutes), or on-demand via "Sync Now".
  * Parses repeating schedules (RRULE: MWF classes, recurring labs, weekly seminars) for a rolling window (-14 to +60 days) using `node-ical`.
  * Allows offline-first access with local SQLite persistence (`calendar_events`).
* **Manual Event Creation**:
  * Quick `+ Add Event` modal to log ad-hoc review sessions, workshops, or personal study blocks.
* **AI & Heuristic Subject Matching**:
  * Incoming events are automatically tagged to existing subjects based on keywords, course codes, and fuzzy matching (e.g., `"CHEM 201 Lab"` ➔ *Organic Chemistry*).
  * One-click manual reassignment when needed; Neuron remembers user mappings for future recurring instances.

### 2. Dual Calendar View & Optional Time-Boxing
* **Month View Grid**:
  * Clean monthly grid showing cards due, deadline indicators, and day chips for scheduled classes.
* **Daily Schedule Timeline (Day Agenda)**:
  * Chronological hourly view (8:00 AM – 9:00 PM) showing classes, labs, and deadlines with color coding by subject.
  * **Smart Gap Detection**: Empty slots between events are visually highlighted with duration labels (e.g., *"45m Free Gap between Econ and Chem"*).
  * **Optional Drag-and-Drop Time-Boxing**:
    * Students can optionally drag a 15m, 30m, or 45m study block chip into an open time slot (or click a slot) to visually plan their day.
    * 100% optional: spontaneous study via Focus Block works without any manual slotting.

### 3. Pre-Event Window: 1-Hour Primer Mode
* **Trigger Condition**: Current time is within 60 minutes before a scheduled class, lab, or seminar.
* **Focus Block Context**:
  * When opening Focus Block on the Tutor Hub or Calendar, a non-intrusive banner notes:
    > *"Upcoming: Organic Chemistry Seminar in 45m — Primer Mode"*
  * Sizing: Student selects available time (e.g., 15m or 30m).
  * Content: Focus Block prioritizes high-yield prerequisite flashcards, core definitions, and recent misconceptions for that subject so the student steps into class mentally primed.

### 4. Post-Event Window: 1-Hour Concept Lock-In Sprint
* **Cognitive Science Foundation**:
  * **Ebbinghaus Forgetting Curve**: 50–70% of new lecture content is forgotten within 24 hours without immediate active retrieval.
  * **Testing Effect & Elaborative Interrogation (Dunlosky et al., 2013; Roediger & Karpicke, 2006)**: Immediate free retrieval coupled with targeted "Why/How" questions produces the highest long-term retention.
* **Trigger Condition**: Current time is within 60 minutes after a lecture or workshop ends.
* **Material & Topic Input**:
  * A single, clean prompt appears in Focus Block:
    > *"Just finished Macroeconomics Lecture. What was covered today?"*
  * Student can:
    1. Type a quick topic/chapter name (e.g., *"Fiscal Multipliers & IS-LM"*).
    2. Pick an existing module or material already uploaded to that subject.
    3. Drag & drop today's lecture slides, notes, or PDF handout.
* **Lock-In Sprint Execution** (scaled to user's time: 15m, 30m, etc.):
  1. **Phase 1: Free Recall Brain Dump (3–5 min)**:
     * Student lists the 3 biggest takeaways or solves a core prompt without looking at notes.
  2. **Phase 2: Socratic Elaborative Dialogue (5–10 min)**:
     * AI Tutor asks 2 targeted Socratic questions bridging today's lecture to foundational concepts (e.g., *"How does an increase in government spending shift the IS curve, and why does crowding-out occur?"*).
  3. **Phase 3: Card Synthesis & Retention Hand-Off (5 min)**:
     * High-yield flashcards or quiz items are generated from the debrief and saved to the subject's deck.
     * Topic is saved to `tutor_topic_memories` with mastery state, and new cards are scheduled into `card_schedule` so spaced repetition begins immediately.

### 5. "No Material Left Behind" Multi-Tier Guarantee
Every Focus Block generation balances immediate calendar context with systemic spaced repetition:
1. **Tier 1 (Urgent)**: Overdue & due cards (`card_schedule` where `due_date <= today`). Never starved.
2. **Tier 2 (Targeted)**: Flagged struggle topics (`tutor_topic_memories` where `mastery_level IN ('struggling', 'developing')`).
3. **Tier 3 (Contextual)**: Immediate pre-event primer or post-event lock-in topics.
4. **Tier 4 (Progression)**: Next syllabus module advancement.

---

## Data Model & Database Architecture

### SQLite Schema (`src/lib/db.ts`)

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

---

## System Components & File Boundaries

1. **Backend IPC Handlers (`electron/ipc/calendarHandlers.ts`)**:
   * `calendar:getSources(userId)`
   * `calendar:saveSource({ userId, name, url, color })`
   * `calendar:deleteSource(sourceId)`
   * `calendar:syncSource(sourceId)`: Fetches iCal feed, parses with `node-ical`, expands RRULE recurrences into `calendar_events`.
   * `calendar:getEvents({ userId, startDate, endDate })`: Returns chronologically sorted events.
   * `calendar:saveEvent(eventData)`: Creates/updates manual events.
   * `calendar:deleteEvent(eventId)`: Deletes manual event.
   * `calendar:detectCurrentContext(userId)`: Determines if user is within ±60 minutes of a lecture/seminar and returns relevant event & subject data.

2. **IPC Integration (`electron/ipc/tutorHandlers.ts`)**:
   * Enhances `plan:generateFocusBlock` to accept `contextType` (`pre_event` | `post_event` | `standard`), `calendarEventId`, and `lectureTopic`.
   * When `contextType === 'post_event'`, builds the 3-phase Lock-In Sprint (Free Recall ➔ Socratic Dialogue ➔ Card Synthesis).

3. **Frontend Components**:
   * `src/pages/Calendar.tsx`: Upgraded with tabbed or side-by-side Day Timeline and Month View.
   * `src/components/calendar/DayScheduleTimeline.tsx`: Hourly visual schedule with gap detection and optional drag-and-drop / click-to-slot.
   * `src/components/calendar/CalendarSyncModal.tsx`: Modal for entering private Google Calendar iCal link and triggering sync.
   * `src/components/calendar/AddEventModal.tsx`: Quick event creator.
   * `src/pages/tutor/TutorHub.tsx`: Displays contextual pre/post event banners and integrates lecture topic selection (typing, material picker, or file drop).

---

## Edge Cases & Error Handling

1. **Invalid or Unreachable iCal Link**:
   * Clear user-friendly toast; caches previous events so calendar never wipes out during network issues.
2. **Event with No Matched Subject**:
   * Treated as general schedule blocking for gap detection; does not trigger subject-specific pre/post reviews unless user tags a subject.
3. **Overlapping Events**:
   * Handled gracefully in Day Timeline by rendering overlapping items side-by-side or stacked.
4. **Time Zone Offsets**:
   * Normalized using standard UTC/ISO datetime strings and rendered in local client time.
5. **Zero Gaps in Day**:
   * If a student's calendar is packed, Focus Block suggests micro-sprints (10–15 min) or post-event decompression review.

---

## Verification Plan

### Automated Tests
1. **Unit Test: iCal Sync & RRULE Expansion (`tests/unit/calendarSync.test.ts`)**:
   * Verify correct parsing of recurring MWF events, UTC timezone conversions, and database upserts.
2. **Unit Test: Focus Block Context Engine (`tests/unit/calendarContext.test.ts`)**:
   * Test ±60m boundary detection (pre-event primer vs post-event lock-in).
   * Verify multi-tier priority algorithm ensures due cards and struggle topics are included.
3. **Component Test: DayScheduleTimeline (`tests/unit/DayScheduleTimeline.test.tsx`)**:
   * Verify gap calculation between events and click/drag action dispatch.

### Manual Verification
1. Paste a test Google Calendar iCal feed and confirm recurring classes appear in Month and Day views.
2. Adjust system/test time to 30 min before a seminar; verify Tutor Hub surfaces the "Primer Mode" Focus Block.
3. Adjust system/test time to 15 min after a lecture; verify the "Concept Lock-In" prompt with topic input & Socratic handoff.
