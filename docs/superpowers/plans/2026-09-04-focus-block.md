# Focus Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy daily study plan with an intelligent, moment-based "Focus Block" generator that provides customized study sprints based on available time and guides the user through tasks with an integrated countdown timer and step-transition prompt.

**Architecture:** Backend gathers real-time due flashcards, historical topic struggles from AI tutor memory, and active syllabus modules, passing them with a chosen time budget (15m, 30m, 45m, 60m) to an AI prompt (with deterministic fallback). The frontend in `TutorHub.tsx` displays time selector chips and interactive sprint cards. A global Zustand timer manages the active sprint, displaying a persistent header timer and triggering a "+1 min / Move on" transition modal when a step finishes.

**Tech Stack:** React 18, TypeScript, Electron (IPC Main/Renderer), Zustand, Better-SQLite3, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-04-focus-block-design.md`

## Global Constraints
- Do not break existing `planGetDailyPlan`, `planCompleteAction`, or `planDismissAction` IPC handlers.
- Retain backwards compatibility for any existing `daily_plans` records.
- Timer state must persist across internal page navigation between `/tutor`, `/study/:id`, and `/tutor/:classId`.
- No silent failures: provide explicit error toasts or deterministic fallbacks if the AI key is unconfigured or encounters a network error.

---

### Task 1: Database Migration & Type Contracts

**Files:**
- Modify: `src/lib/db.ts:420-470`
- Modify: `src/types/index.ts:690-705`
- Modify: `electron/preload.ts:345-360`
- Modify: `tests/setup.ts:160-180`

**Interfaces:**
- Produces:
  - Extended `DailyPlan` interface with `action_type?: 'flashcards' | 'tutor_drill' | 'syllabus_read' | 'custom'`, `learning_objective?: string`, `target_topic?: string`.
  - `window.electronAPI.planGenerateFocusBlock(userId: number, availableMinutes: number, date: string): Promise<(DailyPlan & { subject_name: string })[]>`

- [ ] **Step 1: Update `src/lib/db.ts` to add schema migrations**
  Add safe column migrations in `src/lib/db.ts`:
  ```ts
  "ALTER TABLE daily_plans ADD COLUMN action_type TEXT DEFAULT 'custom'",
  "ALTER TABLE daily_plans ADD COLUMN learning_objective TEXT",
  "ALTER TABLE daily_plans ADD COLUMN target_topic TEXT",
  ```

- [ ] **Step 2: Update `src/types/index.ts` with new Focus Block types**
  Extend `DailyPlan`:
  ```ts
  export interface DailyPlan {
    id: number
    user_id: number
    plan_date: string
    subject_id: number
    module_id?: number
    suggested_action: string
    estimated_minutes: number
    priority: number
    is_completed: number
    created_at: string
    action_type?: 'flashcards' | 'tutor_drill' | 'syllabus_read' | 'custom'
    learning_objective?: string
    target_topic?: string
  }
  ```
  Add to `ElectronAPI`:
  ```ts
  planGenerateFocusBlock: (userId: number, availableMinutes: number, date: string) => Promise<(DailyPlan & { subject_name: string })[]>
  ```

- [ ] **Step 3: Expose `planGenerateFocusBlock` in `electron/preload.ts`**
  ```ts
  planGenerateFocusBlock: (userId: number, availableMinutes: number, date: string) =>
    ipcRenderer.invoke('plan:generateFocusBlock', userId, availableMinutes, date),
  ```

- [ ] **Step 4: Update mock electronAPI in `tests/setup.ts`**
  Add mock implementation:
  ```ts
  planGenerateFocusBlock: jest.fn().mockResolvedValue([]),
  ```

---

### Task 2: Backend IPC Handler `plan:generateFocusBlock`

**Files:**
- Modify: `electron/ipc/tutorHandlers.ts:1250-1380`

**Interfaces:**
- Consumes: `userId`, `availableMinutes`, `date`.
- Produces: IPC handler `plan:generateFocusBlock` returning `(DailyPlan & { subject_name: string })[]`.

- [ ] **Step 1: Implement context aggregator and AI prompt in `electron/ipc/tutorHandlers.ts`**
  Query:
  1. Active subjects.
  2. Due card count per subject (`card_schedule`).
  3. Topic memories with `mastery_level IN ('struggling', 'developing')` or non-null `struggles`.
  4. Active or pending `syllabus_modules` and upcoming `deadlines`.
  5. Completed plan items for today to avoid re-generating what was already done.

- [ ] **Step 2: AI synthesis with time-budget constraint**
  Construct prompt instructing the LLM:
  - "The student has exactly {availableMinutes} minutes for this study sprint."
  - "Allocate tasks such that the sum of estimated_minutes matches {availableMinutes} (split across 1-3 focused steps)."
  - "Prioritize due flashcards first, then targeted socratic tutor drills on logged misconceptions/struggles, then new syllabus modules."
  - Return JSON:
    ```json
    {
      "focus_items": [
        {
          "subject_id": 1,
          "action_type": "flashcards",
          "suggested_action": "Review 14 due cards in Macroeconomics",
          "learning_objective": "Reinforce memory retention before upcoming quiz",
          "target_topic": "Monetary Policy",
          "estimated_minutes": 15,
          "priority": 1
        }
      ]
    }
    ```

- [ ] **Step 3: Fallback generator if AI API fails or is unconfigured**
  If AI call fails or throws, deterministically pack items:
  - If due cards exist: create flashcard item (10-15 min).
  - If struggling topics exist: create tutor drill item (15-25 min) with target_topic set.
  - Remaining time: syllabus progression item.
  This ensures the user never gets an unhandled error or blank screen.

- [ ] **Step 4: Persist generated items into `daily_plans`**
  Clear prior incomplete items for today (or append depending on session) and insert new items with `action_type`, `learning_objective`, and `target_topic`.

---

### Task 3: Focus Block State & Step Timer in Zustand

**Files:**
- Modify: `src/store/appStore.ts`
- Create: `src/components/tutor/FocusBlockTimerBanner.tsx`
- Create: `src/components/tutor/FocusBlockTimeUpModal.tsx`
- Modify: `src/App.tsx` (to mount banner and modal globally)

**Interfaces:**
- Consumes: `DailyPlan` items.
- Produces:
  - `activeFocusBlock`:
    ```ts
    interface ActiveFocusBlockState {
      items: (DailyPlan & { subject_name: string })[]
      activeIndex: number
      remainingSeconds: number
      isRunning: boolean
      isOvertime: boolean
      showTimeUpModal: boolean
    }
    ```
  - Store actions: `startFocusBlock`, `pauseFocusBlock`, `resumeFocusBlock`, `extendFocusBlockTime`, `nextFocusBlockStep`, `endFocusBlock`.

- [ ] **Step 1: Add Focus Block state and actions to `src/store/appStore.ts`**
  Implement timer ticking, pause/resume, +1 min extension, and step progression.

- [ ] **Step 2: Create `src/components/tutor/FocusBlockTimerBanner.tsx`**
  Renders a floating top banner when `activeFocusBlock.isRunning`:
  - Current task title & duration badge.
  - Formatted countdown `MM:SS` (red when overtime).
  - Pause/Resume and "End Block" buttons.

- [ ] **Step 3: Create `src/components/tutor/FocusBlockTimeUpModal.tsx`**
  Renders when `showTimeUpModal` is true:
  - Notification header: *"Time's up on Step X!"*
  - Preview of next task (or completion celebration if last task).
  - `[ +1 Min ]`, `[ +5 Min ]`, `[ Move On → ]`, `[ Finish Block ]`.
  - Clicking `Move On →` invokes `nextFocusBlockStep()` and navigates to the next task's view.

- [ ] **Step 4: Mount `FocusBlockTimerBanner` and `FocusBlockTimeUpModal` in `src/App.tsx`**
  Ensure the banner is accessible while on `/tutor`, `/study/:id`, or `/tutor/:classId`.

---

### Task 4: Frontend UI in TutorHub

**Files:**
- Modify: `src/pages/tutor/TutorHub.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.planGenerateFocusBlock`, `window.electronAPI.planGetDailyPlan`, `useAppStore`.
- Produces: Updated TutorHub featuring Focus Block time chips and sprint item cards with smart actions.

- [ ] **Step 1: Replace legacy "Today's Plan" header with "Focus Block"**
  Add time chips:
  `[ 15 min ] [ 30 min ] [ 45 min ] [ 60 min ] [ Custom ]`
  Track selected time preset (default `30 min`).

- [ ] **Step 2: Update Generate button and loading state**
  Clicking a chip or "Generate Sprint" calls `window.electronAPI.planGenerateFocusBlock(user.id, selectedMinutes, planDate)`.
  Display spinning loader with friendly copy: *"Analyzing weaknesses and due cards..."*

- [ ] **Step 3: Render sprint cards with rich badges and smart default actions**
  Each card displays:
  - Badge: `⚡ Due Cards` / `🎯 Weak Spot` / `📖 Progress`.
  - Title and subject name.
  - `learning_objective` subtext.
  - Duration pill (`15 min`).
  - Action button:
    - Flashcards: navigates to `/study/:subjectId`.
    - Tutor Drill: opens `SessionConfigModal` pre-populated with `initialTopic = plan.target_topic` and `initialMode = 'custom'`, or starts session directly.
  - "Start Focus Block" button at the top to begin guided flow from Step 1.

---

### Task 5: Testing & Verification

**Files:**
- Create: `tests/unit/focusBlock.test.ts`

- [ ] **Step 1: Write unit tests for Focus Block store logic**
  Test initial state, timer tick, time-up trigger, +1 min extension, and step advancement.

- [ ] **Step 2: Manual End-to-End Verification**
  1. Open Tutor Hub; verify time chips (15m, 30m, 45m, 60m).
  2. Generate a 30m sprint; verify tasks add up to ~30 min and prioritize due cards / weak spots.
  3. Start the sprint; verify the timer banner appears.
  4. Test "+1 min" extension and "Move On ->" transition.
