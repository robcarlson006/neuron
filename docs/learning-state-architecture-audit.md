# Learning State Architecture Audit

Date: 2026-10-12

## Scope and method

This audit follows the local SQLite schema, Electron IPC handlers, Tutor and practice persistence services, and the progress-facing React pages/components. It distinguishes verified code paths from paths that require runtime/provider verification. The working tree already contained uncommitted multi-material Tutor changes when this audit began; those changes are preserved.

## Existing components and data flow

| Area | Existing responsibility and data | Persistence / calculation | Reuse and concern |
|---|---|---|---|
| Study materials and curriculum | `materials`, `document_chunks`, syllabus modules/topics, `topic_concepts` with source chunk IDs, prerequisite IDs, order, content hash, and active/superseded status | SQLite; lazy concept extraction in `electron/ipc/conceptCoverageHandlers.ts`; stable integer concept IDs within a topic | Reuse `topic_concepts` as the inventory. Concept extraction currently queries up to 40 subject chunks for a topic, rather than an explicit per-topic source set. The recent multi-material session inventory is persisted in the tutor learning plan and keeps source attribution. |
| Tutor concept coverage | `concept_progress` stores unseen/introduced/assessed and timestamps; `concept_assessments` stores score out of 10, key points, misconception, assistance, session | SQLite; topic rollups call `computeConceptMastery` in `src/lib/coverage/conceptCoverage.ts` | Useful stable-ID starting point, but the score aggregation is a separate mastery rule and lacks event idempotency, correction history, difficulty/type, and detailed answer provenance. |
| Tutor structured assessments | `tutor_turn_assessments` captures outcome, score, confidence, assistance, task type/difficulty, evidence span, misconception, source evidence, and unique idempotency key | Persisted by `LearnerMemoryService`; corresponding `learning_events` and `adaptive_concept_states` are written | Strong event/provenance foundation. Events currently identify concepts by free-text label, not `topic_concepts.id`; adaptive state is a separate mutable numeric projection. Tutor additionally writes `concept_mastery` and `concept_assessments` through distinct code paths. |
| Legacy/general learner memory | `learner_memory_items`, `memory_evidence_links`, `session_summaries`, `episodic_learning_memories`, `tutor_topic_memories`, `student_misconceptions` | SQLite; retrieved to personalize tutor context | Keep as conversational/pedagogical context. Summary and memory claims must not become authoritative proficiency without linked assessment evidence. |
| Adaptive tutor model | `adaptive_concept_states` and `concept_mastery` | `adaptiveTutorEngine` updates score/uncertainty/counts; other tutor/practice handlers update `concept_mastery` with probabilities | Multiple mutable projections are active. The code offers no repository-level validation showing probabilities are calibrated, so UI claims of Bayesian mastery are unsupported. Preserve for adaptive behavior during migration; do not silently promote these estimates to verified mastery. |
| Flashcards and review | `card_schedule`, `review_log`, `mc_review_log`, `review_undo_log`, plus `topic_spaced_memory`; `src/lib/fsrs.ts` implements FSRS and study-session comments identify an SM-2 path | Card schedule and review history persist. Analytics derives card performance/retention; topic SRS separately schedules topics | Reuse card scheduling and preserve history. Card recall should remain card-level evidence; current card review path also updates `concept_mastery` without guaranteed stable concept mapping, so that coupling needs removal or verified mapping. Topic and card schedules are separate. |
| Practice | `practice_problem_attempts`, `practice_guidance_events`, sessions and problems; practice handlers also update tutor memories and `concept_mastery` | SQLite; outcomes, user answer, assistance and correctness are retained | Assessment-quality signals exist, but they feed another label-based mastery path. Concept attribution needs explicit mapping before contributing to a stable concept. |
| Analytics | `db:getAnalyticsSnapshot`, `getMasteryStats`, Analytics page and `AnalyticsOverview` | Review logs, completed sessions, card schedules, `concept_mastery`, forecast outputs; several percentages are computed in page code | Study activity metrics are reusable. Concept mastery, card retention, and topic rollups currently appear together with different denominators and semantics. |
| Curriculum / concept coverage | `CurriculumView`, `UnifiedSubjectDetail`, concept coverage IPC | Topic status, `concept_progress`, `concept_assessments`; rollups use the coverage helper | Existing curriculum and inventory should remain. Coverage can be reused, but its separate mastery computation must consume the shared state derivation. |
| Knowledge Graph | `conceptGraphEngine` and `KnowledgeGraphView` | Graph input includes label-based `ConceptMastery`, card-derived nodes, priors, and inferred curriculum nodes; renders mastery probabilities | Relationships/layout are reusable. Defaults such as 0.3 and synthesized node scores are not evidence of student learning; learning state must be joined by stable concept ID and unknown shown as unknown. |
| Dashboard / subject cards | Dashboard calculates percent mastered from card schedules; `SubjectCard` displays the value | Card schedules | This is a card completion metric, not concept mastery. Relabel as card progress or replace with the shared concept summary. |

## Confirmed reliability issues

1. Several active representations coexist: `concept_mastery`, `adaptive_concept_states`, `concept_progress` + `concept_assessments`, `tutor_topic_memories`, `topic_competency_ratings`, and card/topic review schedules.
2. Concept IDs are stable in `topic_concepts`, but tutor turn assessments and learning events use free-text concepts. Exact/normalized label collisions and curriculum edits can split or transfer state incorrectly.
3. `conceptCoverageHandlers.ts` computes concept scores from all historical `score_10` values independently of adaptive tutor state and card-derived mastery.
4. Tutor/planning code reads `concept_mastery` and `tutor_topic_memories` to set adaptive depth and identify gaps, while curriculum coverage reads separate concept assessment/progress tables. Exam readiness blends card retrievability with BKT and injects heuristic values when card evidence is absent.
5. Dashboard mastery is derived from flashcard schedule counts. Analytics displays card metrics, probabilistic concept estimates, and retention projections alongside each other.
6. `concept_assessments` lacks a unique event key and correction/supersession metadata. `tutor_turn_assessments` has idempotency, but it is not linked by FK to the stable inventory concept.
7. Existing FSRS/card review should not be interpreted as concept retention; topic SRS is a separate schedule. Time without assessment is not evidence of forgetting.
8. Persistent inventory extraction reads up to 40 chunks across all materials in a subject, rather than materials assigned to the selected module/topic. Forced re-extraction supersedes old rows and creates new concept IDs while existing progress remains attached to the old rows.
9. The multi-material Tutor plan correctly combines selected source documents, but it is session-scoped and the cache is not fingerprinted against source changes.
10. Review undo restores card schedule/history but does not recompute the independently mutated `concept_mastery` value, so that projection can remain stale.

## Not yet confirmed / runtime risks

- Whether each tutor assessment path writes both event tables consistently under failures (transaction boundaries vary by handler).
- Whether all legacy records have enough provenance to map to current inventory concepts. No automatic migration from free-text labels is safe without exact, subject-scoped reconciliation.
- Whether all Analytics retention forecast values are calibrated; implementation details are present but require their model assumptions and fixtures to be checked before presenting them as concept retention.
- Whether curriculum regeneration consistently preserves/archives concept IDs and assessments; extraction supports superseded concepts, but full reconciliation behavior needs targeted tests.
- Whether BKT, CKRF, and forecast values are calibrated for current Neuron users; their names/precision do not establish calibration.
- Anonymous sessions intentionally or unintentionally skip durable learner assessment because structured assessment requires a user ID.
- Provider marking quality and saved-user-material behavior require manual runtime verification.

## Proposed target architecture

Keep `topic_concepts` as the sole curriculum concept inventory. Keep immutable, idempotent assessment evidence as the authority; attach evidence to a stable concept ID only when attribution is explicit and subject-consistent. Derive coverage, proficiency, confidence, misconception flags, and review status in one deterministic, versioned learning-state module. Retain card FSRS as card scheduling; it may inform a mapped retrieval event but cannot establish broad concept proficiency by itself. Retain prose learner memory as context only. Expose shared concept-state selectors/IPC for Tutor, Analytics, Curriculum, Knowledge Graph, and Dashboard. Unknown/unassessed states remain explicit; legacy probability tables remain readable for adaptive compatibility until consumers migrate.

Initial transparent classification proposal: `NOT_ASSESSED` with no assessment evidence; `NEEDS_WORK` when latest independent result is incorrect or there are repeated errors without a later independent success; `DEVELOPING` after partial/assisted evidence or a single independent correct result; `DEMONSTRATED` after at least two independent correct assessments on distinct question keys, including one assessment separated by at least one day; `STRONG_EVIDENCE` only after at least three such correct results spanning at least two days and including a transfer/application question. These are conservative product rules, not scientifically calibrated probabilities. A delayed correct assessment provides retention evidence; elapsed time alone only changes review eligibility.

## Migration risks

- Do not delete or rewrite old progress records. Existing stable-ID assessment history can be read as legacy evidence only after assistance/question independence limitations are considered. Label-only probability/memory state remains legacy context.
- Historical free-text records can be ambiguously mapped or collide across topics. No fuzzy auto-merge.
- A new unique idempotency key must not retroactively collapse historical assessments.
- Curriculum re-extraction can supersede concept IDs. Preserve old evidence and require explicit alias/reconciliation for transfer.
- Existing UI callers may rely on numeric scores. Migrate consumers incrementally and preserve card-specific scheduling contracts.

## Component migration inventory

| Component | Current behavior | Required migration |
|---|---|---|
| Tutor | Reads probability/memory tables; writes assessments, events, and mutable scores via multiple paths | Read shared concept states for planning; write idempotent stable-ID evidence; stop using conversational summary as mastery |
| Analytics | Mixes card, topic, probabilistic mastery and retention measures | Add scoped concept coverage/proficiency/review metrics with explicit denominators; label card metrics separately |
| Curriculum | Coverage and score from its own progress/assessment tables | Preserve curriculum structure; obtain proficiency/review from shared selector |
| Knowledge Graph | Label-based estimates and defaults | Match stable IDs; show unknown without evidence; preserve edges and layout |
| Dashboard / SubjectCard | Card schedules described as mastery | Show shared concept summary or clearly labeled card progress |
| Flashcards / StudySession | FSRS/SM-2 card history and card-level outcomes | Preserve scheduler; only bridge to concept state with explicit mapping and card evidence type |
| Practice | Attempts and guidance persist, but concept mastery updates use labels | Preserve attempts; add explicit concept attribution before authoritative contribution |
| Session summaries / learner memory | Useful personalization and open-loop memory | Keep as context; link claims to evidence and never make them authoritative |

## Reusable functionality

`topic_concepts`, source chunk links/prerequisites, `concept_progress`, `concept_assessments`, `tutor_turn_assessments` idempotency/provenance, `LearnerMemoryService`, FSRS/card history, practice attempts, graph relationships/layout, and Analytics activity aggregation.

## Audit conclusion

The repository already has substantial concept extraction, tutoring assessment, memory, and scheduling infrastructure; a second concept database is unnecessary. The confirmed defect is fragmentation: each subsystem owns a different projection and some views call card progress or probabilistic score “mastery.” The central change should converge consumer reads on one derivation over stable inventory concepts and assessment evidence, while retaining old records and card scheduling compatibly.

## Implementation completed in this pass

- Added `src/lib/learningState.ts` as a deterministic `evidence-rules-v1` derivation with explicit coverage, proficiency, confidence, review eligibility, evidence counts, misconceptions, and explanations. It intentionally does not report a calibrated probability.
- Added `concept_id` links and idempotency support to tutor assessment/event persistence. Tagged Tutor assessments attach to active inventory concepts; duplicate turn retries do not add a second rubric assessment.
- Added `concepts:getLearningStates`, joining stable concept IDs to tutor assessment evidence with subject/user scoping. Existing unmapped label-only history is retained but is not promoted into concept state.
- Corrected curriculum extraction to use topic/module-assigned material sources and return no synthetic concept when those sources are absent. Multi-material Tutor plans are fingerprinted against selected source content.
- Migrated curriculum coverage, concept graph, subject detail, Analytics, and Dashboard labels to evidence-derived state or clearly named card-level metrics. Analytics includes an inventory coverage tracker. Assessment-change events refresh open views.
- Preserved legacy BKT/adaptive and card scheduler storage for compatibility; legacy probabilities are no longer presented as concept proficiency in the migrated views.

## Verification and remaining limits

- `npm run typecheck -- --pretty false`: passed.
- `npm run compile`: passed; Vite emitted existing dynamic/static import and package module-format warnings.
- `git diff --check`: passed.
- Full Jest: 130/131 suites passed (1162/1163 tests). The single failure was the unrelated `MaterialStudyPage` browser-selection dismissal test; rerunning that case alone passed.
- Remaining gaps: no safe automatic reconciliation of free-text legacy history or superseded concept IDs; practice and flashcard attempts are not yet mapped as concept-level events; assessment correction/supersession UI is not implemented; adaptive Tutor internals may still read legacy probability projections; provider-backed saved-material and app-restart behavior needs manual runtime verification. These limitations are also reflected in the interface by avoiding unsupported mastery claims.
