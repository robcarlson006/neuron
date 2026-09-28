# Neuron tutor: deep audit

Prepared 26 September 2026 for an implementation by GPT-6 Sol. Audited version: 4.16.3, local HEAD `b7d6a0c`, **including existing uncommitted changes**. Findings describe that working tree, not just the commit. Implementation plan: [neuron-tutor-gpt6-sol-plan.md](neuron-tutor-gpt6-sol-plan.md).

## Main conclusion

Neuron has the ingredients of a strong tutor: several teaching modes, course materials, conversation history, math input/rendering, adaptive memory, topic scheduling, cards, calendar context, and timed study blocks. The largest opportunity is to make these behave as one trustworthy learning system. Today, the application can confuse choosing a topic with demonstrating knowledge, finishing a timer with finishing an activity, and an estimated retention value with proven understanding.

The first release should fix those correctness problems and recovery paths. The next should improve source-grounded teaching and assessment. Then simplify the interface around a clear recommendation, an understandable session goal, and an honest record of what the learner can do independently.

## What was examined and verified

- Source tracing across tutor setup, hub, general chat, session state, streaming/provider adapters, prompt construction, memory/evaluation, Topic-SRS, curriculum, card generation, focus-block planning/navigation/timers, calendar handoff, SQLite schema, IPC and relevant tests.
- Independent audits of chat/backend, curriculum/retention, and study blocks. Detailed evidence is preserved in [chat-backend.md](audits/tutor-2026-09-26/chat-backend.md), [curriculum-retention.md](audits/tutor-2026-09-26/curriculum-retention.md), and [study-blocks.md](audits/tutor-2026-09-26/study-blocks.md). Their priority labels are local to each report; the consolidated ordering below is authoritative.
- `npm run typecheck`: passed. `npm run compile`: passed, with existing module/chunk warnings.
- Focused Jest run: **14 suites, 66 tests passed**: tutorMemory, tutorSrsIntegration, tutorPause, quickReview, topicSrsEngine, topicCompletion, topicMasteryAndDismiss, focusBlock, focusBlockNav, calendarFocusContext, CurriculumView, SessionConfigModal, ChatInput, ChatMessage. SessionConfigModal tests warn about an unmocked Quick Review API; passing assertions do not cover that path. The curriculum reviewer separately ran syllabus reconciliation coverage.
- Rendered the compiled application with a synthetic, isolated Electron-API fixture in Chromium at 1440×1000 and 900×720. This confirms layout behavior only. [Hub](audits/tutor-2026-09-26/hub-fixture.png), [session](audits/tutor-2026-09-26/session-fixture.png), [narrow session](audits/tutor-2026-09-26/session-narrow-fixture.png). Chat text and retention values in these captures are fixture data, not real model output or measurements.
- Full Electron walkthrough was attempted using a temporary user-data directory. The sandboxed launch failed; the elevated launch timed out waiting for its first window. **Native end-to-end behavior remains unverified.** No live provider benchmark, real learner outcome study, screen-reader audit, contrast measurement, or performance profiling was performed.
- No production code, installed app, real study database, or provider configuration was changed. Ruflo tools were not available in the exposed tool inventory; the review used the available parallel agents and local evidence.

## Consolidated findings

P0 means release-blocking learning-data integrity; P1 means core learning or session reliability; P2 means important usability, performance, or quality improvement. These are code-grounded defects or risks unless explicitly marked as a product proposal. File line references are for the audited working tree and will move.

| ID | Priority | Finding and learner consequence | Evidence |
|---|---|---|---|
| A01 | P0 | Ending a session adds all requested topics/IDs to reviewed topics. Unassessed targets can receive default Good, completion, and cleared gaps even after evaluator failure. | `electron/ipc/tutorHandlers.ts:1046`, `:1096`, `:1109`; `TutorSession.tsx:1053` |
| A02 | P0 | Completion marks the session complete before evaluation and reapplies effects on retry. Duplicate requests can increase repetitions/mastery twice; failures can leave partial state. | `tutorHandlers.ts:1365`, `:831` |
| A03 | P0 | Fuzzy title matching chooses curriculum records; direct-ID fallbacks lack subject ownership validation. Ambiguous or stale targets can change the wrong topic. | `tutorHandlers.ts:1003`, `:1064`, `:1090` |
| A04 | P1 | Free-text strengths/struggles become correctness observations, fixed-difficulty memory scores and FSRS ratings. There is no required answer evidence or assistance level. Positive mastery can oscillate good→mastered→good. | `tutorHandlers.ts:752`, `:846`, `:854`, `:885` |
| A05 | P1 | Retention is announced as “100%” even after a lapse; no-history summary defaults to 1. Coverage, mastery and current estimated recall are conflated. | `TutorSession.tsx:1083`; `src/lib/memory/topicSrsEngine.ts:308`, `:338`, `:403` |
| A06 | P1 | Full mode/target/material config is not persisted at session creation; refresh restores many fields from an absent URL config. Adaptive depth becomes numeric 3. Freshly set React state is also read by the initial stream call from its earlier closure. | `TutorSession.tsx:257`, `:300`, `:426`, `:533`, `:583`; `electron/preload.ts:344` |
| A07 | P1 | Active Recall setup sets `is_active_recall`, but TutorSession does not forward `isActiveRecall` and the backend does not use it. A visible mode lacks an end-to-end contract. | `SessionConfigModal.tsx:320`; `src/types/index.ts:757`; absent use in TutorSession/backend |
| A08 | P1 | Chunk listener with empty dependencies captures initial messages/runtime. Text/error chunks are not request-filtered. Question extraction splits away `?` before checking for it, so its question count stays empty. | `TutorSession.tsx:822`, `:841`, `:869`, `:884`, `:919` |
| A09 | P1 | Tutor user messages are included in history, then appended again by the backend. Input clears before durable acceptance; save failures can lose the draft. Send guard starts after saving. | `TutorSession.tsx:922`, `:941`; `tutorHandlers.ts:2060`, `:2070`; `ChatInput.tsx:77` |
| A10 | P1 | Streaming lacks exposed cancellation, request IDs and sender isolation. Abort propagation ends after response headers; stalled response bodies can hang. UI timeout does not cancel provider work. | `tutorHandlers.ts:1710`, `:2073`; `aiHandlers.ts:450`; `TutorSession.tsx:562` |
| A11 | P1 | HashRouter is checked through pathname in block Next. Expiry paths bypass tutor finalization altogether. Intended handoff ignores next-step intent; summary can end the whole block. | `src/App.tsx:206`; `FocusBlockTimerBanner.tsx:50`; `FocusBlockTimeUpModal.tsx:25`; `TutorSession.tsx:180`, `:1395` |
| A12 | P1 | Resume Step indexes a newly loaded plan array and starts the timer/session over. Block and tutor clocks pause/extend independently. Block state is not persisted. | `TutorHub.tsx:167`, `:484`; `appStore.ts:274`, `:336`; `TutorSession.tsx:648` |
| A13 | P1 | Planned retention drills drop topic IDs and spaced-review mode. The AI planner omits maintenance metrics that the fallback planner uses. Identical work behaves differently by entry path/provider availability. | `tutorHandlers.ts:2419`, `:2498`, `:2554`; `src/lib/focusBlockNav.ts:51` |
| A14 | P1 | Regeneration deletes unfinished plans before a valid replacement exists, including IDs an active block may reference. Completed plan items can run again. | `tutorHandlers.ts:2289`; `TutorHub.tsx:450`; `appStore.ts:364` |
| A15 | P1 | Sources are fixed-position excerpts/latest documents, not question-relevant retrieval. An outline is treated as proof the tutor has the content. There is no visible evidence chain for an answer. | `tutorHandlers.ts:1797`, `:1827`, `:1872` |
| A16 | P1 | General chat without any class cannot reliably create its required conversations row because its subject foreign key is non-null. Message saves overwrite ended_at even during an active session. | `tutorHandlers.ts:55`, `:1449`; `src/lib/db.ts:313` |
| A17 | P1 | Ending-session errors still set sessionEnded. Exit can navigate away after a failed completion. UI can report completion without a successful save. | `TutorSession.tsx:1093`, `:2180` |
| A18 | P2 | Forced welcome/question templates conflict with beginner explanation, direct-answer requests, stopping, and summary. Repetition avoidance can prohibit useful delayed retrieval; depth can encourage needless length. | `tutorHandlers.ts:117`, `:155`, `:181`, `:335`, `:1979`, `:2024` |
| A19 | P2 | Evaluation reads only the first 8,000 transcript characters; chat uses a last-30-message cutoff. Late corrections or early goals disappear. Memory retrieval is weakly related to the current topic. | `tutorHandlers.ts:734`, `:2060`; `ckrfMemoryService.ts:328` |
| A20 | P2 | Cards treat dialogue as authoritative material, enforce arbitrary quotas, and count generation calls rather than saved cards. Incorrect student statements can become persistent study content. | `tutorHandlers.ts:1544`, `:1570`, `:1585` |
| A21 | P2 | Global response cleanup can corrupt indentation/code. The done event returns cleaned content but current renderers persist accumulated raw chunks, producing competing response representations. | `tutorHandlers.ts:1145`, `:2088`; `TutorSession.tsx:831`; `GeneralChat.tsx:119` |
| A22 | P2 | Topic scheduling ignores the card path's desired-retention setting. Legacy manual coverage gets assumed stability; unmarking coverage leaves SRS rows counted as completion. Due-today is called overdue; invalid dates can produce NaN. | `topicSrsEngine.ts:73`, `:94`, `:148`, `:304`, `:402`; `tutorHandlers.ts:2790` |
| A23 | P2 | Calendar-selected start/date are ignored by the hub, which plans for today's UTC date. AI plan duration/resource/topic output is weakly validated. | `Calendar.tsx:170`; `TutorHub.tsx:61`, `:80`; `tutorHandlers.ts:2537` |
| A24 | P2 | Activity destinations do not match promises: “Card Synthesis” routes to due-card review; some module/topic scopes disappear. | `tutorHandlers.ts:1208`; `focusBlockNav.ts:13`, `:62` |
| A25 | P2 | Two persistent sidebars consume 560px at the tested 900px width; the session header clips controls and the conversation is cramped. Hover-only actions, unlabeled send control, missing dialog semantics/focus handling, and forced refocus reduce accessibility. | Fixture captures; `TutorChatSidebar.tsx:211`; `ChatMessage.tsx:77`; `ChatInput.tsx:43`, `:196`; modal JSX |
| A26 | P2 | Tutor smart-scroll listener binds before its loading view contains the scroll element and does not rebind; General Chat scrolls to bottom on every update. Reading older messages can be disrupted. | `TutorSession.tsx:161`, `:1245`; `GeneralChat.tsx:69` |
| A27 | P2 | Hub/modal initialization serially fetches modules/topics. General Chat samples up to ten file prefixes, rejects offline use even when a local provider may work, and lacks a durable error/retry flow. | `TutorHub.tsx:88`; `SessionConfigModal.tsx:94`; `GeneralChat.tsx:157`, `:188` |

## The improved learner experience

1. **Arrive:** “What would help most now?” The hub offers Resume, Review due, or Learn next with a reason and an adjustable time budget. One primary recommendation; all classes remain accessible.
2. **Choose:** Learn, Practise, Review, or Ask. Advanced controls retain material, curriculum topic, difficulty, and custom goal. “New to this” changes scaffolding rather than mysteriously raising a numeric depth setting. The current seven modes map explicitly into the new model rather than disappearing.
3. **Learn:** The tutor states one useful objective, explains just enough, and asks one manageable task at a time. The learner can request a hint, a worked example, simpler explanation, harder problem, direct answer, or stop. It can use equations/diagrams when they clarify the concept.
4. **Assess:** The tutor distinguishes independent retrieval from an answer after help. It corrects the specific error and uses a fresh problem to check transfer. Unknown or ambiguous evidence remains unknown. The learner can challenge a grade.
5. **Finish:** “You independently explained diffusion. Active transport still needs practice. Enzymes was not reached.” The summary shows what was saved, the next review, and optional useful cards. Saving and assessment status are explicit.
6. **Return:** The same session, source, target, difficulty, draft and paused time return. Due work reflects recorded evidence and the learner's selected retention settings. The study block continues to the correct next pending activity.

Example tutoring behavior, proposed rather than observed:

> Learner: “I have never studied osmosis.”
>
> Tutor: “Osmosis is the net movement of water across a selectively permeable membrane. Imagine two sides with different concentrations of dissolved particles. Let's use that picture first: which side has fewer free water molecules?”
>
> Learner: “I don't know.”
>
> Tutor: “Start with the side containing more dissolved particles. Those particles reduce the proportion of water. Here is a simple diagram… Now try a new two-sided example.”

The first “I don't know” is evidence of an unsuccessful retrieval attempt only if a valid retrieval question had been presented at an appropriate stage. A worked example is instruction; it must not become a fabricated success. After help, a later independent check can establish new evidence without erasing the earlier struggle.

## Visual audit matrix

The existing brand and native system font are serviceable. Visual changes should improve hierarchy, readability, focus and accessibility; they are not a reason to delay correctness repairs.

| Area | Current state | Proposed design | Implementation direction |
|---|---|---|---|
| Hub | Several unrelated entry points, long maintenance heading, numeric certainty and urgent red state | One recommended action; compact “Review due” list with reason, time and next action; separate class browsing | Shared semantic surface/text/status tokens; clear primary/secondary actions |
| Session | App sidebar + 320px history + narrow bubbles; technical phase label | History drawer below 1100px; compact app rail while studying; dominant readable conversation and objective | `min-w-0`, responsive drawer, 65–75ch reading width, wrapping header |
| Review | Card grid puts estimated percent above the reason to review | Scan-friendly topic rows; due today vs overdue; confidence and sources in details | Tabular numbers for time; icon + text status; no color-only meaning |
| Typography | Native stack with Roboto/Arial fallbacks; frequent 10–12px labels | Keep local SF/system readability; 15–16px study body; 12–14px secondary labels; consistent heading scale | Shared type tokens; measure at 200% zoom; do not add a remote-font dependency |
| Surfaces | Repeated violet/slate classes and card borders | Quiet layered neutral surfaces; restrained brand accent and selected-state contrast | Semantic HSL/OKLCH tokens; optional translucent elevated overlay, opaque high-contrast fallback |
| Motion | Mixed ease/linear utilities, loading/entry animations, repeated smooth scrolling | Short functional transitions; preserve reading position; visible new-response affordance | 150–220ms opacity/transform, cubic-bezier(0.16,1,0.3,1); reduced-motion overrides |
| Composer/actions | Icon-only send; actions mounted only on hover; input clears immediately | Labeled send/stop, retained draft, hint/example controls, accessible persistent action menu | Semantic buttons, IME-safe Enter, focus-visible, live status announcements |
| End/pause/time-up | Multiple nested-div dialogs and independent timers | One coordinated timer and accessible finish flow, with partial completion and next-step option | Shared dialog primitive, focus trap/restore, Escape policy, polite status region |

## Research informing the recommendations

- The IES practice guide supports spacing, retrieval, worked-example/problem alternation, and explanatory questions. This supports a varied teaching loop, not a rule to quiz before every explanation. [IES practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1).
- A high-school mathematics trial found unguided AI assistance could undermine later unassisted performance; its safeguarded tutor mitigated that harm. Neuron should measure independent performance and track help separately. This is a design inference, not evidence that Neuron currently causes that outcome. [Bastani et al., PNAS, 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/).
- A physics-course RCT supports the promise of structured AI tutoring. It does not establish effectiveness for every subject or Neuron, and immediate post-test results are not proof of long-term retention. [Kestin et al., Scientific Reports, 2025](https://www.nature.com/articles/s41598-025-97652-6).
- Status changes should be announced without unnecessarily moving focus. Apply that to response generation, save success, error and completion, with screen-reader testing. [W3C status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

The numerical thresholds and interaction defaults in the execution plan are proposed engineering/product choices. They must be evaluated rather than presented as established learning-science constants.
