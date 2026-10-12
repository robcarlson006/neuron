# Unified Learning State Implementation Plan

## Goal

Make persistent, evidence-based concept learning state authoritative across Neuron while preserving the existing unified concept inventory, conversation history, curricula, and flashcard scheduling.

## Findings and decisions

- Audit: [learning-state-architecture-audit.md](../../docs/learning-state-architecture-audit.md).
- Reuse `topic_concepts` as the curriculum inventory and existing assessment/event tables; do not add a parallel concept catalog.
- Keep flashcard FSRS/SM-2 state card-specific. Learner prose remains personalization context.
- Introduce one deterministic derivation keyed to stable topic concept IDs and migrate consumers incrementally.
- Preserve old data. Avoid fuzzy mapping of label-only legacy states.

## Phases / checkpoints

1. Audit systems and document target architecture — complete.
2. Implement a versioned, deterministic concept-state derivation with explicit coverage, proficiency, evidence confidence, retention/review status, and explanation — complete for the migrated surfaces; rules are explicitly heuristic, not calibrated probabilities.
3. Expose IPC/API and use stable concept evidence for Tutor updates and planning — complete for tagged Tutor assessments and concept coverage; label-only history remains unmapped.
4. Migrate Curriculum, Analytics, Knowledge Graph, Dashboard, and subject detail — complete. Practice and flashcard evidence remain card/problem scoped until explicit concept links exist.
5. Preserve legacy data without granting unsupported mastery — complete for this pass; no fuzzy reconciliation or destructive migration was performed.
6. Add deterministic tests for classification, idempotency, multi-material scope, persistence, aggregation, and regressions — complete for implemented behavior; see verification outcome below.
7. Run tests/typecheck/build and final audit; document runtime limitations — complete, with one isolated flaky/unrelated test failure noted below.

## Verification strategy

- Unit tests for every classification rule and unknown/ambiguous evidence.
- SQLite-backed tests for idempotent writes, cross-subject isolation, stable concept association, and reconstruction.
- Existing Tutor/material selection, coverage, graph, analytics, and card scheduling tests.
- Run focused suites, full Jest, TypeScript checks, production compile, and `git diff --check` as implementation proceeds.
- Manual verification with the user's Week 1 materials and app restart, when provider/app runtime is available.

## Risks / limitations

- Existing records use free-text labels and cannot all be mapped safely to stable IDs.
- Legacy probability tables may continue to influence adaptive depth until every consumer is migrated.
- Full end-to-end live provider and restart verification depends on the local Electron app and saved material data.
- Assessment correction/supersession UI, practice-to-concept attribution, and complete retirement of legacy adaptive probability reads remain future work.
- No production deployment or destructive migration is authorized.

## Progress checkpoint — 2026-10-12

- Added `src/lib/learningState.ts`, explicit rules/version/explanations, and classification tests.
- Added nullable stable concept ID and learning-event idempotency columns/indexes; old records remain untouched.
- Added `concepts:getLearningStates` IPC projection and included derived state in topic concept reads.
- Updated Curriculum concept rows and tutor coverage planner to use categorical state where available.
- Corrected persistent topic extraction to use the topic's source material IDs or its module's assigned materials; it no longer substitutes arbitrary subject chunks or synthetic topic text.
- Focused verification so far: 3 suites / 34 tests pass; web and main-process TypeScript typechecks pass. Full application-wide consumer migration and full regression suite remain outstanding.
- Migrated Analytics, Knowledge Graph, Dashboard, and subject detail; added refresh events for open views and documented the audit/remaining gaps.
- Final verification: typecheck, compile, and `git diff --check` pass. Full Jest reported 130/131 suites (1162/1163 tests); the sole unrelated `MaterialStudyPage` selection-collapse test passes when rerun alone.
