# Neuron 4.17 stability and tutor hardening plan for GPT-5.6 Luna

Prepared 28 September 2026 against clean commit `76817ee` (`v4.17.3`) on `codex/tutor-improvements`.

## Outcome and current baseline

Deliver a release-candidate-quality stability tranche without redesigning the product. Preserve the implemented grading, readiness, graph, curriculum, and tutor improvements; harden the places where the current implementation is incomplete or unverified.

Already implemented and therefore **baseline, not new work**:

- Honest readiness, corrected review grading/undo, graph identity/routing/performance, dashboard aggregates, curriculum tree batching, grouped-card pagination, and isolated Electron user-data support from the earlier Luna plan.
- Evidence-gated tutor credit, repeat-safe application of one topic schedule update per session/topic, persisted tutor messages/config/timing, general chat without a class, request/session filtering, Stop, IME-safe drafts, lexical whole-library retrieval, and repaired focus-block navigation from the tutor safety pass.
- Antigravity's Class Order curriculum and Materials Quick Review: persisted material groups, `By Topic | Class Order`, multi-material selection, ordered document traversal, and active-source retrieval scaffolding.

Verified baseline:

- Clean working tree at `76817ee`; the previous mixed working changes are committed and pushed on `origin/codex/tutor-improvements`.
- `npm run typecheck` passes.
- `npm run compile` passes but emits one module-type warning and three mixed static/dynamic import warnings.
- Full Jest: 92/93 suites and 858/859 tests pass. `tests/unit/folderSyncService.test.ts:390` fails after `fs.watch` emits `EMFILE`; the suite also executes real PDF/OCR fallbacks and leaks asynchronous `FolderSyncService.init` work because two calls are not awaited.
- Native Playwright Electron launch aborts with `SIGABRT` inside the sandbox before the first window. This is not yet proof of an application launch defect; rerun outside the GUI sandbox with debug logging.
- `package.json` is `4.17.3`, while both tracked `package-lock.json` version fields remain `4.10.1`.

Confirmed defects to fix in this tranche:

- Materials Quick Review sends the whole selected material queue as retrieval scope before the active material, so another document can support the current answer (`TutorSession.tsx:658-664`, `tutorHandlers.ts:1841-1855`).
- Material/topic cursor state is persisted before a transition response is durably saved; a failed/cancelled response can advance the roadmap (`TutorSession.tsx:1049-1091`). Material jump/revisit still uses topic-only logic.
- Class Order's Clear action visually selects zero files, but Start Tutor/Spaced Review silently falls back to every file (`MaterialCurriculumView.tsx:456-480`, `:588-604`).
- New curriculum IPC behavior has no direct service/ownership/order tests; lazy `CREATE TABLE` calls in handlers can hide migration defects (`syllabusHandlers.ts:728-803`).
- Assistant persistence is renderer-owned and fire-and-forget after the done event; stream state is not durable, sender destruction is not tied to cancellation, and only an overall UI timeout exists.
- Finalization has a useful status/revision guard but no durable operation record or restart recovery. The current assessment table stores only one reduced observation per session/topic, not every answer event.
- Focus blocks remain localStorage-authoritative, write on every timer tick, and mark plan completion through fire-and-forget calls.

## Phase 0 — Establish the execution branch and allowed contracts

Create `codex/neuron-stability-4-17` from `76817ee`. Do not reset, rewrite tags, publish a release, replace the installed app, or touch the user's normal database/API credentials. Use synthetic fixtures and a unique `NEURON_TEST_USER_DATA_DIR` for every application test. Commit once per numbered phase.

Read before editing:

- Existing product contract and findings: `docs/neuron-tutor-deep-audit.md` and `docs/neuron-tutor-gpt6-sol-plan.md`.
- Current schema/migration pattern: `src/lib/db.ts`; transaction pattern: existing `better-sqlite3` `db.transaction(() => ...)()` calls.
- Current Class Order contracts: `src/types/index.ts`, `electron/ipc/syllabusHandlers.ts`, `electron/preload.ts`, and `src/components/classes/MaterialCurriculumView.tsx`.
- Current tutor retrieval/stream/finalization: `electron/services/tutorContextService.ts`, `electron/ipc/tutorHandlers.ts`, and `src/pages/tutor/TutorSession.tsx`.
- Current block state/navigation: `src/store/appStore.ts` and `src/lib/focusBlockNav.ts`.
- Electron E2E pattern: `tests/e2e/onboarding.spec.ts`; Playwright's installed Electron APIs are `_electron.launch`, `ElectronApplication.firstWindow`, `.process()`, and `.close()` from `node_modules/playwright-core/types/types.d.ts`.
- Router warning opt-ins are supported by the installed `HashRouter`/`MemoryRouter` `future` prop with `v7_startTransition` and `v7_relativeSplatPath`.

Allowed APIs/patterns:

- Additive SQLite tables/columns/indexes, parameterized SQL, and short synchronous `better-sqlite3` transactions. Never hold a transaction open across a provider call.
- IPC handlers as thin adapters over testable main-process services; preload exposes typed methods only.
- `retrieveTutorContext({ subjectId, materialIds, ... })`; for guided review, `materialIds` must contain exactly the active canonical material ID.
- Request/session IDs on every stream event; `webContents.isDestroyed()` and the documented `destroyed` event for cleanup.
- React Router state/navigation and future flags; no direct `window.location.pathname` routing.

Do not invent provider APIs, add a cloud backend, install a drag/drop framework, reuse `materials.module_id` for Class Order, trust renderer/model-supplied ownership, or retain false-credit behavior as a fallback.

Exit: record `git status`, `git log -1`, Node/npm/macOS versions, and baseline command results in `docs/audits/stability-2026-09-28/baseline.md`.

## Phase 1 — Harden Class Order persistence and selection semantics

Extract the database logic currently nested in `registerSyllabusHandlers` into `electron/services/materialCurriculumService.ts`; keep IPC names and preload signatures stable. Copy the handler's current query shapes, but enforce these invariants in the service:

- `getMaterialPlan(subjectId)` rejects a missing subject and returns metadata only—never `content_text`.
- Create/rename reject blank or overlong titles and verify the subject/group relationship.
- Delete rejects an unknown/foreign group and preserves materials as Unscheduled through the existing cascade.
- Reorder requires every subject-owned group exactly once and rebalances `sort_order` plus `updated_at` transactionally.
- Move validates material and target-group ownership, clamps `targetIndex`, rebalances both source and destination groups without gaps, and remains idempotent when repeated.
- Remove `ensureCurriculumTables`; fresh schema and `MIGRATIONS_SQL` are the only table-creation paths so migration failures cannot be masked at runtime.

Repair `MaterialCurriculumView`:

- Clear means zero selection. Disable Tutor, Spaced Review, and Generate Cards when zero files are selected; never substitute the full group after Clear.
- Keep Select all as the explicit way to restore all files. Reset stale selections when a moved/deleted material leaves a group.
- Surface mutation errors in the existing error/status region instead of console-only failure. Prevent duplicate rename submission from Enter followed by blur.
- Preserve ID-based drag/drop and keyboard Move controls; duplicate filenames remain independent.

Tests:

- Add service tests for fresh/migrated schema, metadata-only reads, cross-subject rejection, duplicate filenames, source/destination rebalancing, repeated moves, group deletion, and cascades.
- Add component tests for Clear/Select all, disabled zero-selection actions, mutation errors, rename-once, drag and keyboard-equivalent moves, and view switching.

Exit: focused curriculum/schema/cascade tests, typecheck, and `git diff --check` pass. Commit `fix(curriculum): harden class-order persistence and selection`.

## Phase 2 — Make tutor turns durable and material traversal correct

Add a main-process `tutorTurnService` and an additive `tutor_turns` table:

```ts
type TutorTurnStatus = 'queued' | 'streaming' | 'complete' | 'cancelled' | 'failed'

interface TutorTurn {
  id: string
  request_id: string
  session_id: number
  user_message_id: string
  assistant_message_id?: string
  status: TutorTurnStatus
  terminal_reason?: 'done' | 'cancelled' | 'first_token_timeout' | 'idle_timeout' | 'overall_timeout' | 'provider_error' | 'sender_destroyed'
  intended_cursor_json?: string
  session_revision: number
  created_at: string
  completed_at?: string
}
```

Use a unique `request_id` and unique accepted `user_message_id`. Replace renderer-owned save-then-stream with a typed `tutorQueueTurn` IPC that atomically persists the user message and queued turn before provider work begins. The main process then streams request/session/sequence-tagged chunks to the requesting `webContents`, persists the canonical assistant message, applies any cursor transition in the same final transaction, and emits one terminal event containing the durable message and committed cursor. The renderer may display an optimistic user message but replaces it with the canonical ID from the acknowledgement.

Lifecycle rules:

- The main process owns final assistant persistence. Do not save a second assistant copy from the renderer.
- Cancel on Stop, sender `destroyed`, navigation/session replacement, first-token timeout (30 s), idle body timeout (45 s), or overall timeout (120 s). Abort response-body consumption, not only the initial request.
- Preserve partial content as a cancelled/failed assistant message with terminal metadata when at least one chunk arrived; retain the user's draft when queueing fails.
- A retry creates a new request/turn linked in metadata to the failed turn; it never inserts the original user message twice.
- Remove global `cleanupAIResponse` mutation from the canonical path. Preserve code indentation/math exactly; render supported Markdown through existing safe renderers.

Material traversal rules:

- Replace the `QuickReviewTopic[]` cast in `SessionConfigModal` with a separate typed `selectedMaterialTargets` variable. Missing `quick_review_scope` continues to mean topics.
- Validate the stored material snapshot against the session subject on create/resume. Deleted/foreign material IDs produce an explicit unavailable item; never silently substitute another document.
- For a guided material turn, the backend derives the active canonical ID from stored config plus the intended cursor. Call retrieval with exactly `[activeMaterialId]`; the full queue is roadmap metadata only.
- Advance/jump/revisit sends an intended cursor with `from` and `to`. The visible/persisted cursor changes only in the successful assistant-message transaction. Failure/cancellation leaves the previous cursor active and offers Retry.
- Generalize the roadmap header/modal for topics or materials. Material labels, counts, jump controls, completion prompt, reload, and final-item boundaries must not use topic-only arrays/text.

Tests:

- Provider fixtures: success, first-token stall, mid-body stall, malformed SSE, cancellation after a chunk, provider failure, and sender destruction.
- Assert one durable user/assistant pair, ordered sequence handling, stale-event rejection, no duplicate retry message, terminal status, and partial persistence.
- Assert active-material-only source snippets, cursor commit after durable completion, no cursor movement on failure/cancel, material jump/revisit, deleted/foreign targets, reload/resume, and legacy topic/singular-material sessions.

Exit: no turn or cursor can be lost, duplicated, or advanced by a failed response. Commit `fix(tutor): persist turns and material review transitions`.

## Phase 3 — Finish evidence and finalization recovery

Keep `tutor_assessment_events` as the once-per-session/topic **applied review-group ledger** for compatibility. Add two additive tables:

- `tutor_answer_evidence`: immutable validated answer observations with session/topic/question/answer IDs, correctness, assistance, evidence/confidence, occurrence time, policy version, and optional `supersedes_id`; unique on `(session_id, topic_id, answer_message_id, policy_version)`.
- `tutor_finalizations`: operation ID, session ID, revision, sealed last-message ID, requested/outcome/status, evaluation version, error/result JSON, timestamps; unique on `(session_id, revision)`.

Move finalization into `tutorSessionService`, using the canonical main-process transcript and stored session config—not renderer summaries or target IDs. The command must:

1. Refuse or cancel an active turn explicitly, then seal a message watermark and create/return the finalization operation.
2. Run provider evaluation outside a transaction.
3. Validate exact subject-owned topic IDs and real assistant-question → later student-answer references; invalid/missing evidence remains unassessed.
4. Persist every valid answer observation, conservatively reduce one session/topic review group, and atomically apply the existing SRS/study-log/CKRF projections once.
5. Apply only if operation revision and sealed watermark still match. Duplicate/concurrent requests converge on the same operation/result.
6. On restart or `tutorGetFinalizationStatus`, recover `pending` operations; a failed operation is retryable without new credit.

Do not add a dispute UI in this tranche. Preserve correction-ready `supersedes_id`, but leave user-facing assessment correction and historical replay to the later tutor roadmap.

Tests: multiple answers for one topic are retained while scheduling advances once; assisted correct does not advance retention; malformed/empty assessment is unassessed; foreign topic/message references are rejected; injected projection failure rolls back; concurrent finish, crash-after-seal, restart recovery, retry, and late-turn races converge correctly; migration plus `PRAGMA foreign_key_check` pass.

Exit: transcript saving, closure, assessment, and projection status are independently truthful and recoverable. Commit `fix(tutor): make assessment finalization recoverable`.

## Phase 4 — Persist focus blocks and make advancement transactional

Add `focus_block_runs` and `focus_block_run_steps` as durable runtime snapshots over existing `daily_plans`. A run stores user/date/status/active-step/revision and active elapsed timestamps; steps store ordinal, source plan item, immutable activity payload, linked tutor session, budget, status, and elapsed time.

Expose typed commands: `start`, `resume`, `pause`, `extend`, `completeStep`, `skipStep`, and `abandon`, each with `runId` and `expectedRevision`. Main-process transactions are authoritative; Zustand holds a renderer projection only. Hydrate from the backend on launch, checkpoint active time every 15 seconds and on transitions/window close, and derive display time from timestamps rather than decrementing persisted state every second. Do not count sleep/overnight absence as active study.

Snapshot canonical activity payloads, including topic/module/material IDs and tutor mode, when a run starts. Remove title-based lookup from execution paths. All Next/time-up/finish actions call one completion command; mark the current plan item complete only after the activity checkpoint succeeds. Save failure keeps the step active and retryable. Use React Router navigation, never pathname inspection or custom events.

Tests: mixed completed/pending plans, same-title topics, tutor→cards handoff, last-step expiry, pause/extend agreement, route-away/restart/resume, sleep gap, duplicate Next, stale revision, save failure, and early abandon. Existing localStorage data may be imported once as an unverified resumable draft, then the backend becomes authoritative.

Exit: a focus block resumes the exact step/session once and never loses work through fire-and-forget completion. Commit `fix(blocks): persist runtime and transactional advancement`.

## Phase 5 — Remove the reproducible failure and actionable warnings

Folder sync:

- Inject a small watcher factory and parser dependency into `FolderSyncService`; production defaults remain `fs.watch` and `parseFileToText`.
- Unit-test debounce/error/cleanup with a deterministic fake watcher and fake parser. Await every `FolderSyncService.init` call, add an explicit test reset that clears static DB/window references, timers, watchers, and active syncs, and use modern fake timers for the 1.5 s debounce.
- Keep one separately named native macOS integration test for actual recursive `fs.watch`; skip with an explicit platform/capability reason when the environment returns `EMFILE`. The core Jest gate must not depend on host file-descriptor capacity.
- Move parser/OCR tests to the Node Jest environment so Tesseract does not receive a jsdom `http://localhost/...` worker path. For intentionally corrupt fixtures, assert the expected fallback warning/error and suppress only that exact expected console call within the test.

Warnings/build hygiene:

- Enable `v7_startTransition` and `v7_relativeSplatPath` on the app `HashRouter` and every test `MemoryRouter`; verify navigation behavior rather than filtering the warning.
- Add `tutorGetSubjectCurriculumTopics` to the global Electron API mock so `SessionConfigModal` no longer warns on every render.
- Rename `postcss.config.js` to `postcss.config.mjs`; do not add package-wide `"type": "module"`, which would break CommonJS Jest configuration.
- Replace the three ineffective dynamic imports in `classHandlers.ts` with the existing documented static exports from `promptBuilders`, `cardValidator`, and `cardGenHandlers`; verify no circular import and that the compile warnings disappear.
- Synchronize lock metadata with `npm version 4.17.3 --no-git-tag-version --allow-same-version`; inspect the diff and do not accept dependency/version drift beyond the root version metadata.

Exit: full Jest has zero failing suites and no unexpected application warnings; `npm run compile` has none of the four confirmed build warnings; package and lock versions agree. Commit `test: stabilize watcher and remove actionable warnings`.

## Phase 6 — Native E2E, CI gate, and evidence packet

Add a deterministic synthetic fixture profile and provider adapter gated by `NEURON_TEST_USER_DATA_DIR` plus an explicit E2E fixture flag. It must seed subjects, duplicate-title topics, materials/Class Order groups, due work, a mixed focus block, and tutor sessions without network or paid-provider calls. Updater and live folder auto-sync remain disabled in this profile.

Add Playwright Electron journeys:

1. Onboarding/fresh profile (retain existing coverage).
2. Create/rename/reorder/delete Class Order groups; move duplicate-filename materials; reload and verify persistence and zero-selection behavior.
3. Start Materials Quick Review, verify only the active document reaches the fixture provider, advance/jump, cancel a stalled turn, reload mid-session, resume the same cursor, and finalize once.
4. Start a mixed focus block, complete tutor then cards, pause/restart/resume, and verify no step replay.
5. Finish with malformed assessment and provider failure; transcript remains saved, status is honest, retry applies at most one review group.

Launch with Playwright debug output and capture Electron child exit code/signal/stderr. First run may require approved GUI execution because the current sandbox produces `SIGABRT`; distinguish environmental launch failure from an app crash. Do not treat fixture-browser screenshots as native E2E.

Add a non-publishing CI quality job (`npm ci`, typecheck, full Jest, compile) and make release jobs depend on it. Run Electron E2E on macOS with isolated profiles; archive trace/screenshot/error artifacts on failure. Do not create a new tag/version/release in this task.

Final verification order:

```text
git status --short
npm run typecheck
npm test -- --runInBand
npm run compile
npm run test:e2e -- --workers=1
git diff --check
```

Write `docs/audits/stability-2026-09-28/results.md` with exact commands, suite/test counts, Electron environment, migration/foreign-key results, before/after warning list, E2E traces, known limitations, and rollback guidance. Completion requires all deterministic gates to pass and every unresolved native/environmental limitation to be stated explicitly.

## Deferred after this stability tranche

Do not pull these larger roadmap items into the above commits: four-mode Learn/Practise/Review/Ask redesign, full teaching-policy state machine, shared retention projection redesign, deterministic study-plan allocator, full responsive/accessibility redesign, evidence-backed card/memory UX, 40-case model-quality benchmark, or claims of improved learning/retention. Re-evaluate those from S06-S11 of `docs/neuron-tutor-gpt6-sol-plan.md` after this checkpoint is stable.
