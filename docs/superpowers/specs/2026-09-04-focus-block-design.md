# Focus Block: Dynamic AI Study Planner & Guided Session Timer

## Overview
The **Focus Block** feature replaces the legacy "Today's Plan" generator with an intelligent, moment-based study planning system. Instead of generating a rigid 24-hour daily checklist that becomes stale and anxiety-inducing, Focus Block allows students to generate customized, high-yield study sprints based on the exact amount of time they have available right now (e.g., 15m, 30m, 45m, 60m+).

Each Focus Block item is synthesized by AI using real student state:
1. **Spaced Repetition Due Counts** (from `card_schedule` and `cards`).
2. **Recorded Weaknesses and Misconceptions** (from `tutor_topic_memories`).
3. **Syllabus Progress & Upcoming Deadlines** (from `syllabus_modules` and `deadlines`).

When a Focus Block is started, an integrated step timer guides the student from task to task, prompting them when time is up with options to extend (`+1 min`) or smoothly transition to the next study step.

---

## User Stories & Core Workflows

### 1. Generating a Focus Block
- **Context**: A student opens the AI Tutor Hub in the morning before class with 45 minutes to spare.
- **Action**: The student clicks the `45 min` time chip (or enters a custom time).
- **Outcome**: The AI analyzes the student's active subjects, due cards, historical topic memories, and current syllabus chapters. It generates an optimal 45-minute sprint:
  - *Step 1 (15 min)*: Macroeconomics Due Flashcard Review (12 cards).
  - *Step 2 (30 min)*: Corporate Finance Targeted Tutor Drill on WACC & Cost of Capital (addressing misconceptions logged yesterday).
- **Subsequent Sprints**: When the student returns in the afternoon with 30 minutes, they tap `30 min`. The system recognizes that the morning flashcards were finished and serves the next highest-yield items with zero duplicates.

### 2. Guided Step Timer & Transitions
- **Context**: The student clicks "Start Focus Block" or "Start Step".
- **Action**: The app transitions into the active mode (e.g., Flashcard study session or Tutor Session) with an overarching Focus Block banner/timer.
- **Timer Expiration**:
  - When the countdown reaches `00:00`, a clean modal dialog appears:
    - *"⏰ Time's up on Step 1 (Flashcards)!"*
    - Displays preview of the next task: *"Next up: 30 min Socratic Drill on WACC"*.
    - **Buttons**:
      - `[ +1 Min ]` / `[ +5 Min ]` to finish the active card or thought.
      - `[ Move On → ]` to immediately start the next step.
      - `[ End Block Early ]` to save current progress and return to Hub.

### 3. Session Completion
- When all steps in the block are finished, a celebration summary card appears highlighting total time studied, cards reviewed, and topics strengthened.

---

## Architecture & Data Flow

### 1. Backend IPC & AI Integration (`electron/ipc/tutorHandlers.ts`)

#### Handler: `plan:generateFocusBlock`
- **Input**:
  ```ts
  {
    userId: number,
    availableMinutes: number, // e.g. 15, 30, 45, 60, custom
    date: string // YYYY-MM-DD
  }
  ```
- **Context Gathering**:
  - Active subjects for the user.
  - Due cards count per subject (`card_schedule` where `due_date <= today`).
  - Historical learning memories from `tutor_topic_memories` (filtering for `mastery_level IN ('struggling', 'developing')` or non-null `struggles`).
  - Current syllabus modules in progress or upcoming deadlines within 14 days.
  - Items already completed today to prevent duplicate recommendations.
- **AI Prompt Construction**:
  - Informs the LLM of exact available minutes and constraints.
  - Instructs the LLM to create 1–3 prioritized, actionable items where the sum of `estimated_minutes` matches `availableMinutes`.
  - Enforces JSON output format with structured fields:
    ```json
    {
      "focus_items": [
        {
          "subject_id": 1,
          "action_type": "flashcards" | "tutor_drill" | "syllabus_read",
          "title": "Macroeconomics: 12 Due Flashcards",
          "learning_objective": "Review and reinforce key terms before the upcoming quiz",
          "target_topic": "Monetary Policy",
          "estimated_minutes": 15,
          "priority": 1
        }
      ]
    }
    ```
- **Database Persistence**:
  - Inserts generated items into `daily_plans` with additional metadata (`action_type`, `learning_objective`, `target_topic`).

### 2. State Management (`src/store/appStore.ts` & Local State)
- **Active Focus Block State**:
  - `activeFocusBlock`: List of items, current active item index, remaining seconds in current step, isRunning, isPaused.
  - Persists block state in memory/localStorage so navigating between flashcard view and tutor session retains timer context.

### 3. Frontend Components (`src/pages/tutor/TutorHub.tsx`, `src/components/tutor/FocusBlock...`)
- **`FocusBlockHeader`**: Time chips (`15m`, `30m`, `45m`, `60m`, `Custom`), status summary, and "Regenerate" trigger.
- **`FocusBlockItemList`**: Visual cards with priority badges (`⚡ Due Cards`, `🎯 Weak Spot`, `📖 Progress`), duration, objective description, and smart action triggers.
- **`FocusBlockTimerModal`**: Floating step countdown bar during active sessions and "Time's Up" transition modal.

---

## Edge Cases & Error Handling

1. **AI API Key Missing or Invalid**:
   - If the API key is not configured, the UI shows a clear callout with a link to Settings rather than a silent failure.
   - A deterministic fallback generator packs the top due cards and flagged weak spots into the requested time block so the user is never stranded.
2. **Zero Due Cards & No Weaknesses**:
   - The AI smoothly allocates time to advancing the next uncompleted syllabus module or running a review drill on recently mastered topics.
3. **User Pauses or Leaves App**:
   - Timers track elapsed time against timestamp deltas to prevent drift if the computer sleeps.
4. **Time Overrun**:
   - If the user ignores the "Time's up" dialog, timer displays `+01:15` overtime with a gentle reminder.

---

## Verification Plan

### Automated Tests
- Unit test for `plan:generateFocusBlock` IPC handler checking:
  - Total minutes sum constraint matching `availableMinutes`.
  - Inclusion of due cards when backlog exists.
  - Inclusion of weak spot topics when `tutor_topic_memories` has struggling items.
- Component test for `FocusBlockTimer` handling countdown, `+1 min` extension, and step transition.

### Manual Verification
1. Launch app with test subject containing due flashcards and a struggling topic memory.
2. Generate a 30m Focus Block; verify that it splits time appropriately between flashcards and tutor drill.
3. Start the first step; verify the timer runs and hits `00:00`.
4. Click `+1 Min`; verify timer extends. Click `Move On →`; verify it transitions to the next step.
