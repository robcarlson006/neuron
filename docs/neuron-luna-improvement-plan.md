# Neuron improvement plan for GPT-6 Luna

Prepared 25 September 2026 against local commit `b7d6a0c`, version 4.16.3.

## Goal and execution rules

Improve exam preparation and long-term retention in staged changes. Make the knowledge graph equally useful for exploring relationships and finding what to study next. Preserve the successful tutor, flashcard, and active-recall workflows.

Execute the numbered work packages in order, with one focused commit per package and a short handoff recording changes, tests, and remaining limitations. Recheck the repository before starting: this plan describes the audited revision, not necessarily the latest checkout. Use a `codex/` branch. Do not publish releases, replace the installed app, or modify the user's real study database during development. Use an isolated fixture profile for all application tests.

Keep Electron, React, TypeScript, SQLite, Zustand, and the existing FSRS implementation. Do not introduce a new learning algorithm, graph framework, cloud service, or app-wide redesign. Additive database migrations must preserve study history. Do not retroactively reinterpret historical grades whose original intent cannot be recovered.

## Audit findings and limits

The audit covered source, tests, and local Git history. The GitHub connector did not return repository data, so remote-only changes were not checked. A live UI walkthrough was interrupted; interaction latency and visual usability remain to be measured. No performance numbers below are claimed as existing measurements.

| Area | Confirmed behavior | Consequence |
|---|---|---|
| Graph study action | Sends `?concept=...`, but StudySession never reads that parameter | Selecting a concept opens an unrelated general queue |
| Graph meaning | Curriculum sequence and containment become prerequisite edges | Merely following a syllabus can label topics blocked; inferred links reappear after deletion |
| Graph consistency | Edge readiness and node blocking use different thresholds; card concepts/tags can double-count a card | Conflicting status and misleading counts |
| Graph rendering | Pan/zoom updates React state each frame; position lookup repeatedly searches nodes; force layout uses synchronous pairwise loops | Strong candidates for interaction stalls, requiring profiling |
| Review grading | Partial quality 3 maps to FSRS Good and `wasCorrect=true`; quality 5 maps to Easy | Partial knowledge receives success credit and ordinary correct answers can be overscheduled |
| Grading shortcuts | Normalization removes mathematical signs; near-exact acceptance precedes negation checks | Opposite numeric or verbal answers can receive full credit |
| Undo | Restores schedule and deletes review, but does not restore concept mastery | Undo leaves learning data inconsistent; resumed session progress also needs restoration |
| Readiness | Unmatched card concepts count toward curriculum coverage; no-card baseline begins at 50 | Readiness can imply more evidence than exists; grade/confidence claims are heuristic |
| Topic completion | Manually marking a topic complete records an SRS Good review | Exposure is counted as successful retrieval |
| Loading | Dashboard fetches full cards/schedules to calculate counts; subject page loads all tabs and requests topics serially | Unnecessary work before useful content appears |
| Rendering | Broad store subscriptions receive timer updates; grouped card browser renders every card | Avoidable rerenders and large document trees |

Baseline: `npm run typecheck` passed. Jest: 91/92 suites and 842/843 tests passed. The folder watcher test at `tests/unit/folderSyncService.test.ts:411` failed in the full run and an isolated rerun. Its cause is unresolved; this is not yet proof of a production watcher defect. Existing Electron E2E tests do not explicitly isolate userData and must be repaired before running.

The local history shows graph introduction in v4.16.0 followed by layout/gesture fixes through v4.16.3. Earlier versions already added adaptive tutoring, semantic grading, topic repetition, and card-generation safeguards. Improve these systems instead of rebuilding them.

## Ordered work packages

### 1. Establish safe, repeatable verification

- Add an explicit test-profile directory option, applied before database initialization. Require E2E tests to supply a unique temporary directory; disable updater checks, folder auto-sync, and paid AI calls in that test profile. Seed deterministic subjects, cards, topics, reviews, and dependencies.
- Repair the onboarding test to match the current class-creation flow. Add a real `test:e2e` package script and update obsolete README test instructions.
- Investigate the watcher failure separately: test debounce logic with a controllable watcher, then test native filesystem events as an isolated integration check. Report environmental failures clearly; do not hide them by increasing timeouts or deleting assertions.
- Capture reference timings and React commit counts for dashboard, subject navigation, graph gestures, card browsing, and tutor streaming with the focus timer running. Use fixtures of 1,000 and 10,000 cards, and graphs of 50, 200, and 500 nodes.

Acceptance: application tests never open the normal study database or use real API credentials. Record runtime, hardware, fixture sizes, and baseline failures with the measurements.

### 2. Correct grading, scheduling, and undo

- Introduce a typed review outcome separating correctness (`incorrect`, `partial`, `correct`), explicit FSRS rating, modality, and assistance. Carry answer text and feedback through the active-recall callback instead of returning only a number.
- Default mapping: incorrect or partial recall → Again; correct unassisted recall → Good. Reserve Hard for a fully correct but difficult recall, and Easy for an explicit learner choice. Retain the visible partial-credit feedback. Derive legacy quality and `wasCorrect` from this outcome at the persistence boundary; partial must not become a positive binary mastery observation.
- Keep existing flip-card confidence choices, with explicit rating semantics. Do not promote Good to Easy purely because of typing speed. Multiple-choice recognition remains distinguishable from free recall and must not be silently converted to Easy.
- Preserve mathematical signs, decimals, operators, units, and negation in exact-match validation. Guard fuzzy acceptance before awarding full credit. A negation mismatch should block the shortcut, not automatically reject a legitimate paraphrase. Use the existing AI evaluator when available; otherwise show uncertain evaluation and allow self-rating.
- Fix FSRS due-date calculation to use its supplied review date consistently. Add fixed-date tests, including month boundaries and daylight-saving transitions.
- Extend undo snapshots with the prior concept-mastery row, including whether it existed, and exact nullable schedule values. Undo must restore all review effects transactionally. Return the undone card/review identity and restore the prior queue position, summary, and saved session progress. Refuse stale undo if a later learning event changed the affected state. Legacy snapshots without enough information must not claim complete undo.

Acceptance: partial answers cannot lengthen intervals as successful recall; `-5` versus `5`, inequality reversal, and a negated near-match cannot receive exact credit. Review→undo restores the prior schedule, mastery, review count, current card, and session summary. A failed write advances neither queue nor learning state; duplicate submission records one review.

### 3. Repair graph identity, relationships, and study routing

- Introduce a shared subject-scoped learning-target resolver. Use module/topic IDs where available. For legacy cards, use normalized concept names only when the topic match is unique; ambiguous matches remain unassigned. Keep same-title topics in different modules distinct. Use the resolver for graph counts, study filtering, and readiness coverage.
- Represent graph edges as `prerequisite`, `contains`, or `related`, with an origin identifying saved versus inferred relationships. Syllabus order is suggested context, not proof of a prerequisite. Only explicit prerequisite relationships affect readiness recommendations, and recommendations never prevent a user from studying.
- Preserve saved legacy prerequisite edges. Treat module prerequisite text as suggested until confirmed. Show inferred structural links as read-only and saved links as editable. Display persistence errors; do not silently swallow them. Validate self-links, duplicates, and prerequisite cycles.
- Use one readiness predicate everywhere: an assessed prerequisite with mastery at least 0.50 is met. Show unassessed topics as Unknown, not a measured 30% weakness. Module containers summarize children and are not independently graded prerequisites. Count unique card IDs per node.
- Add typed study scope carrying topic ID or a normalized legacy concept key. Support the existing `concept` URL for compatibility. Apply scope before interleaving, paging, saved-session restoration, and retries. Include scope, study mode, and card type in the session progress key.
- A node with cards opens only its matching queue. A node without cards shows an honest empty state with existing tutor/curriculum actions. Never fall back silently to the full subject queue.

Acceptance: same-name topics stay separate, concept-plus-tag cards count once, inferred links never block learning, edge/node readiness agrees, and graph→study→resume preserves the selected scope.

### 4. Make the graph stable and readable

- Retain SVG rendering. Separate graph data, layout computation, camera control, and the details panel. Index nodes by ID, memoize node/edge layers, and update the camera transform through a ref in animation frames rather than rerendering the graph each frame.
- Use deterministic layout and cached positions keyed by subject, topology, and layout mode. Mastery refreshes update colors/status without moving nodes. Run force layout in a Web Worker, cancel obsolete requests, and discard stale results. Observe actual container size with ResizeObserver.
- Auto-fit only on first load or an explicit layout change. Dragging, selecting, hovering, and updating mastery must not trigger refit. Provide Fit All, Fit Selection, and Reset Layout. Keep in-session node positions and viewport when switching tabs.
- Default to module clusters with topics expanded on demand. Selecting a topic emphasizes its immediate relationships; provide an explicit full-map option. Search locates and focuses a result while preserving relationship context.
- Add two views over the same data: Explore for relationships, and Study Gaps for unknown, weak, and due topics with reasons and actionable study buttons. Use a side panel for details and full labels. Add keyboard selection, visible focus, a list alternative, and reduced-motion support.

Acceptance: pointer-anchored zoom, trackpad pan, drag, search, resize, and tab return behave predictably; dragging does not trigger selection or refit. On the recorded reference machine, target p95 gesture frame time ≤33 ms for 200 visible nodes and no layout-induced renderer task over 50 ms. Test 500 total nodes using collapsed clusters. Report measured results rather than assuming the targets were met.

### 5. Reduce loading and rendering work

- Replace dashboard full-card transfers with one typed aggregate IPC response containing due counts by modality, per-subject totals, deadlines, and streak inputs. Compute counts with grouped SQL. Include cloze cards in totals and time estimates.
- Add a single curriculum-tree read for modules and topics. Split subject loading by tab; load graph/readiness inputs when needed. Deduplicate shared requests and retain current content during background refresh. Cancel or ignore responses for a previous subject; show errors per panel.
- Replace broad Zustand subscriptions in App, layout, study, graph parents, and tutor views with field selectors. Timer ticks should update timer consumers only. Lazy-load major routes with a stable loading fallback.
- Apply the existing 50-card page limit in both list and grouped browser modes. Group the filtered page, preserve full-result group totals, reset pagination on filter changes, and test selection/edit/delete across page boundaries.

Acceptance: dashboard no longer transfers card bodies for statistics; loading curriculum uses a constant number of IPC calls as module count grows; background refresh does not blank the page; unrelated views do not rerender on timer ticks. The grouped browser renders at most 50 cards. Compare reference timings and payload sizes before/after, with no regressions in tutor streaming.

### 6. Make readiness honest and improve the learning loop

- Rename the predicted exam-grade presentation to Study Readiness. Remove letter-grade, statistical confidence interval, and guaranteed score-boost language until validated against actual outcomes. Keep useful breakdowns: curriculum coverage, observed recall, due work, and estimated retention at the exam date. Label model-derived estimates clearly.
- Count covered syllabus topics by resolved topic ID only. Unmatched cards remain visible as unassigned material and do not increase curriculum coverage. Show Not enough evidence when no assessed material exists; unknown topics remain visibly unknown.
- Separate Studied from Demonstrated recall. Manually ticking completion records exposure only and must not manufacture a Good SRS event. Preserve old records but apply corrected behavior prospectively.
- Preserve existing tutor modes, hints, adaptive difficulty, pause/resume, and quick review. Record whether a graded response followed a hint or revealed solution. After assistance, request one fresh unassisted check before awarding the same evidence as independent recall. Avoid duplicate mastery updates for a single response.
- After a mistake, provide concise corrective feedback and place a bounded retry after three other eligible items, or at session end when fewer remain. Allow one remedial retry per missed item per session; respect existing time limits. Tag same-session retries so they do not count as independent delayed-retention evidence.
- Extend the existing session summary with topics attempted, independently recalled, needing review, and the next scheduled review. Link each weak topic to a focused review or tutor action. Preserve manual mode choice and show a plain-language reason when adaptive mode changes modality.

Acceptance: unknown topics cannot imply exam readiness; manual completion does not improve retention estimates; assisted answers remain distinct from unassisted recall; retries are bounded; tutor and card reviews do not double-count the same evidence. Verify a new subject, overdue subject, near-exam subject, and subject with duplicate topic titles.

## Verification and completion

For each package, run its meaningful unit/component tests, `npm run typecheck`, and relevant isolated Electron scenarios. Before final handoff, run the full Jest suite and `npm run compile`, then the repaired E2E suite. Preserve any unresolved baseline failure explicitly; do not report all checks passing when one remains.

Add migration tests against an older fixture database and verify cards, schedules, reviews, and tutor sessions survive. Exercise offline/AI failure, rapid subject switching, interrupted saves, review undo, and restart/resume. Manually inspect graph and study flows in both themes and at the minimum supported window size.

Complete when all six packages meet their behavioral acceptance criteria, performance changes have before/after evidence, and there are no unexplained test regressions. Deliver a short changelog, test results, migration notes, and recorded performance measurements. Do not claim improved exam scores or retention from software tests alone; those require real delayed recall and outcome data.

Learning rationale: retrieval practice, distributed practice, and corrective feedback are well-supported foundations. The exact UI rules and retry spacing above are product defaults to evaluate, not experimentally proven constants. Sources: [Dunlosky et al., learning-techniques review](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html) and [researcher-authored spaced retrieval guide](https://pdf.retrievalpractice.org/SpacingGuide.pdf).
