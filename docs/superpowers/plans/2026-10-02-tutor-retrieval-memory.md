# Neuron Tutor Retrieval and Long-Term Memory Plan

Date: 2026-10-02

Status: Proposed architecture; implementation has not started.

## Outcome

Make Tutor accurate on documents of any practical size and genuinely adaptive across study sessions. The tutor should retrieve the passages relevant to the current question, cite the source passages it used, abstain when evidence is insufficient, and use learner memory to choose better questions and explanations without treating uncertain inferences as facts.

This plan deliberately avoids “send the whole document” as the solution. Long-context research shows that models can perform worse when relevant information is buried in the middle of a large prompt, so Neuron should keep the complete document indexed but send a small, query-selected evidence set.

## Design principles

1. Complete storage, selective context: retain every parsed document chunk locally; only inject relevant chunks into a model request.
2. Evidence before assertion: every source-grounded answer should carry internal source IDs and the tutor should say when the evidence is insufficient.
3. Typed memory: separate raw episodes, learner state, misconceptions, teaching strategies, and source knowledge. Do not flatten them into one prompt paragraph.
4. Uncertainty is data: mastery, memory confidence, and retrieval confidence need explicit values and recency, not only labels such as “mastered.”
5. Deterministic policy around model output: the model may propose memories and claims, but code validates, deduplicates, links evidence, resolves conflicts, and controls what is injected.
6. Retrieval practice is the learning loop: memory should drive the next diagnostic question and spaced review, not merely change the tutor’s tone.
7. Local-first and provider-agnostic: retain lexical retrieval and local operation; semantic retrieval, reranking, and extraction are optional adapters.

## Current baseline and why it is insufficient

The current code already has a useful foundation: `src/lib/ragChunker.ts`, `electron/ipc/ragHandlers.ts`, `src/lib/groundedRetrieval.ts`, provider-backed embeddings with lexical fallback, BKT/concept mastery, Glicko-style topic ratings, misconception tracking, episodic memories, and Topic-SRS.

The main problems are context selection and coordination. `tutorHandlers.ts` samples large documents by topology, limits a direct attachment to 32,000 characters, loads only the first three chunks of large automatic materials, injects up to 14,000 characters of retrieved evidence, and passes only the last 30 conversation messages. Existing memory types are persisted separately but are assembled into prompt text without one typed retrieval policy. The result is that the full source may be stored, while the exact evidence needed for a question is absent from the model request.

## Target architecture

```text
Document import
  -> structure-aware chunks + offsets + headings + hashes
  -> lexical index + embeddings
  -> query rewrite / intent classification
  -> hybrid candidate retrieval
  -> neighbor expansion + diversity filtering + reranker
  -> token-budgeted evidence pack with source IDs
  -> tutor answer with citations / abstention
  -> claim and citation verifier

Tutor interaction
  -> immutable transcript + assessment events
  -> session summarizer / memory extractor
  -> deterministic validator and conflict resolver
  -> typed learner memory store
  -> relevance + recency + uncertainty retrieval
  -> next-question and explanation policy
```

### A. Document knowledge store

Replace topology sampling as the primary material path. Parse each material into hierarchical chunks with `material_id`, `chunk_id`, heading path, page/section locator, character offsets, token estimate, hash, and parent/neighbor relationships. Preserve the original text and do not mutate it when embedding or summarizing.

Use hybrid retrieval for every Tutor turn:

- lexical/BM25-style matching for exact terminology, equations, names, and rare tokens;
- dense embeddings for paraphrase and conceptual questions;
- candidate fusion with explicit score normalization;
- optional reranking over a small candidate pool;
- adjacent-chunk expansion only after a chunk is selected;
- diversity limits so one document or section cannot crowd out all other evidence.

The current lexical fallback is valuable and should remain. The current 500-character chunk default is likely too small for many definitions and derivations; benchmark several section-aware sizes with overlap rather than choosing one globally.

### B. Context budget manager

Introduce one deep module, tentatively `TutorContextBuilder`, with a small interface such as:

```ts
buildTutorContext({ query, subjectId, materialId, session, learnerState }): Promise<{
  messages: TutorMessage[]
  evidence: EvidenceRef[]
  memories: MemoryRef[]
  budget: ContextBudgetReport
}>
```

It should allocate a token budget—not a character budget—across system policy, current question, retrieved source evidence, learner memory, and recent conversation. It should fail closed when evidence is weak: ask a clarifying question, state that the source does not establish the answer, or answer only the supported part.

Place the most relevant evidence first and last, label every passage, and avoid injecting a long outline that has no answer-bearing text. Keep a compact rolling session summary plus the recent turn window rather than relying on an arbitrary 30-message cutoff.

### C. Typed learner memory

Keep the transcript as an immutable episodic record. Add a unified memory read/write policy over these types:

| Type | Meaning | Example | Injection rule |
|---|---|---|---|
| Session state | Current working context | current topic, open question, unresolved step | high priority in the active session |
| Learning event | An observed attempt | concept, response, correctness, hint level, evidence | never injected verbatim; used to update state |
| Semantic learner fact | Durable fact about the learner | “confuses elasticity with slope” | only if validated and relevant |
| Episodic teaching memory | What happened and what helped | “graph analogy resolved the misconception” | retrieve for similar struggle |
| Concept state | Estimated mastery and uncertainty | probability, rating, observations, last evidence | drives diagnostic selection and difficulty |
| Misconception state | Active incorrect model and remediation status | misconception, occurrences, successful counterexamples | must be tested before declaring resolved |
| Teaching preference | Stable preference confirmed by repeated behavior | prefers worked examples | use cautiously; allow user correction |
| Source fact | Course knowledge | definition or derivation from material | must link to source chunks and version |

Every durable memory should include provenance (`session_id`, message/event IDs, source chunk IDs where applicable), confidence, created/updated timestamps, last verified timestamp, status (`active`, `uncertain`, `superseded`, `resolved`), and a contradiction/supersession link. A model-generated summary without evidence should remain a proposal, not a trusted fact.

### D. Memory consolidation

At the end of a session, and optionally during idle time, run a structured extraction pass over the transcript and assessment events. Extract only atomic candidates: concepts attempted, demonstrated evidence, misconception hypotheses, successful interventions, unresolved questions, and learner preferences. Validate candidates against deterministic schemas, deduplicate by canonical concept ID, attach evidence, and update the existing BKT/Glicko/FSRS engines through one coordinator.

Do not use the LLM to directly set “mastered.” Mastery should be updated from observable assessment outcomes, with partial credit and uncertainty retained. Three successful encounters can resolve a misconception only when they are spaced and sufficiently varied; the existing rule should become configurable and evidence-aware.

### E. Tutor decision policy

For each turn, select memory by a weighted policy combining:

- semantic relevance to the current question;
- exact concept/topic match;
- active misconception priority;
- due/overdue retrieval need;
- recency and temporal decay;
- confidence and evidence quality;
- diversity and a strict total token budget.

Use memory to choose among explain, diagnose, hint, mirror problem, interleave, spaced review, or advance. If memory confidence is low or contradictory, ask a diagnostic question instead of presenting the memory as fact.

## Implementation phases

### Phase 0 — Baseline and observability

Add a trace record for each Tutor request: model, prompt token estimate, selected evidence IDs, omitted evidence count, memory IDs, retrieval scores, answer citations, finish reason, and latency. Redact API keys and make transcript/source content opt-in for diagnostic export.

Add a fixed evaluation fixture containing small, medium, and large documents, questions whose answers appear at the beginning/middle/end, multi-hop questions, unsupported questions, equation-heavy passages, and cross-session learner scenarios. Record the current baseline before changing retrieval.

Likely files: `electron/ipc/tutorHandlers.ts`, `electron/ipc/ragHandlers.ts`, `src/lib/groundedRetrieval.ts`, `tests/unit/groundedRetrieval.test.ts`, new `tests/integration/tutorRetrievalEvaluation.test.ts`.

### Phase 1 — Complete, structure-aware indexing

Create a canonical chunk/index module. Extend the chunk schema with stable IDs, heading path, page/character offsets, token count, source hash, and previous/next chunk IDs. Index all chunks after import and re-index only changed material. Add unique constraints so duplicate indexing cannot create duplicate evidence.

Replace large-document topology sampling in Tutor with retrieval from the complete index. Keep topology as navigation metadata, not answer context. Add migration/backfill logic for existing `embeddings` rows.

Likely files: `src/lib/ragChunker.ts`, new `src/lib/documentIndex.ts`, `electron/ipc/ragHandlers.ts`, `src/lib/db.ts`, `electron/ipc/documentParser.ts`, tests for stable chunking and re-indexing.

### Phase 2 — Hybrid retrieval and evidence packing

Implement query rewriting for vague tutor questions, hybrid lexical/dense candidate fusion, neighbor expansion, score thresholds, section diversity, and optional reranking. Make the provider adapter optional; preserve lexical-only behavior offline.

Build `TutorContextBuilder` to enforce a token budget. Remove the unconditional sampled material blocks once the new retrieval path is proven. Keep only concise document metadata plus query-selected passages. Add source labels that can be rendered to the user later.

Likely files: `src/lib/groundedRetrieval.ts`, new `src/lib/tutorContextBuilder.ts`, `electron/ipc/tutorHandlers.ts`, `electron/ipc/aiHandlers.ts`, `src/types/index.ts`, RAG and prompt tests.

### Phase 3 — Evidence-grounded answering and verification

Require the tutor to emit structured internal citations such as `[SOURCE material:chunk]` for source-dependent claims. Strip/format them for the UI, but retain the citation map with the assistant message. Add a lightweight verifier that checks cited chunk IDs exist and that unsupported questions trigger an explicit uncertainty response.

Use a two-pass path only when needed: retrieve and answer first; verify citations/claims second for high-risk or low-confidence answers. Do not add a second model call to every turn until baseline measurements show it is worthwhile.

Likely files: `electron/ipc/tutorHandlers.ts`, `src/lib/groundedRetrieval.ts`, new `src/lib/tutorAnswerVerifier.ts`, message metadata migration, UI citation rendering, tests for unsupported and conflicting evidence.

### Phase 4 — Unified learner-memory coordinator

Add a `LearnerMemoryService` deep module with interfaces for `recordEvent`, `consolidateSession`, `retrieveForTurn`, `updateConceptState`, and `resolveConflict`. Internally it can use the existing CKRF, BKT, misconception, episodic, and Topic-SRS modules, but callers should stop assembling independent prompt blocks.

Add migrations for typed memory candidates/facts and evidence links. Keep existing tables during migration; backfill into the new read model, then gradually move Tutor reads to the coordinator. Add embedding/search fields for episodic memories only if lexical/topic retrieval is insufficient.

Likely files: `src/lib/memory/ckrfMemoryService.ts`, `src/lib/memory/topicSrsEngine.ts`, `src/lib/memory/temporalDecay.ts`, new `src/lib/memory/learnerMemoryService.ts`, `src/lib/db.ts`, `electron/ipc/tutorHandlers.ts`, `tests/unit/tutorMemory.test.ts` and new conflict/provenance tests.

### Phase 5 — Pedagogical control loop

Connect retrieved memory to a deterministic tutoring policy. Prioritize active misconceptions and low-confidence concepts, schedule due topics, interleave mastered maintenance, and select question difficulty from concept state uncertainty. Store the outcome of each diagnostic question as an event linked to the source evidence and the generated question.

Add user-visible controls: “Why did Tutor choose this?” showing the concept/memory/evidence behind a question; memory correction/deletion; and a way to mark a tutor inference as wrong. These controls are essential because incorrect long-term memory is more damaging than a missing memory.

### Phase 6 — Evaluation, rollout, and tuning

Run offline evaluations before enabling the new path by default. Measure:

- retrieval Recall@k and MRR for answer-bearing chunks;
- citation precision and unsupported-answer rate;
- answer factuality judged against the gold passage;
- contradiction handling;
- memory precision, recall, stale-memory rate, and unwanted injection rate;
- next-question usefulness, mastery calibration, and spaced-review adherence;
- latency, token use, embedding cost, and offline fallback behavior.

Roll out behind a feature flag: shadow retrieval first, then show diagnostics, then enable for a subset of sessions, then default-on after regression gates pass. Keep the old path as a rollback adapter until the new evaluation suite is stable.

## Proposed data model additions

Prefer additive migrations and preserve existing data:

- `document_chunks`: stable chunk identity, material/version hash, heading path, locator, offsets, token count, neighboring chunks.
- `retrieval_events`: query, candidate IDs/scores, selected evidence, retrieval mode, and model/index version.
- `learning_events`: session/message/question/answer, concept IDs, correctness/partial credit, confidence, hint level, and evidence links.
- `learner_memory_items`: typed durable memories with value JSON, confidence, status, timestamps, supersession, and provenance.
- `memory_evidence_links`: links from a memory item to learning events, transcript messages, and source chunks.
- `session_summaries`: compact rolling summaries with covered concepts, open loops, and source/version metadata.
- assistant-message metadata: selected source IDs, memory IDs, verifier status, and uncertainty reason.

The exact schema should be finalized after checking the existing migrations and SQLite version. Do not store embeddings without the embedding model, source hash, and index version needed to invalidate them safely.

## Accuracy safeguards

- Never treat a section title or outline as evidence for a factual claim.
- Never inject a memory without a relevance reason and confidence threshold.
- Prefer a clarifying question or “not established by the uploaded material” over a confident unsupported answer.
- Keep source versions; invalidate or re-verify memories tied to changed materials.
- Use exact lexical retrieval for equations, definitions, named entities, and symbols alongside semantic retrieval.
- Expand neighboring chunks only around a selected hit; do not reintroduce the entire document.
- Keep recent conversational context plus a rolling summary, not an unbounded transcript.
- Test relevant evidence at first, middle, and last positions to catch position bias.
- Separate learner-model updates from model-generated prose and require observable evidence for mastery changes.

## Verification gates

The implementation is ready for default-on only when:

1. Every answer-bearing fixture passage is retrieved within the configured top-k on lexical-only, semantic, and hybrid paths.
2. Large-document questions outperform the current topology-sampling baseline on answer accuracy and citation precision.
3. Unsupported questions produce abstention/clarification at an agreed threshold rather than invented source claims.
4. Memory retrieval improves cross-session tutoring cases without increasing stale or irrelevant memory injection.
5. Concept-state predictions are calibrated and show uncertainty when observations are sparse.
6. Existing Tutor, RAG, SRS, and memory tests pass, including migration tests on a pre-existing database.
7. The app remains usable with no embedding API configured.

## Recommended order

Implement Phases 0–2 first. They directly address the current accuracy problem and create the measurement seam needed to judge memory changes. Implement Phase 4 only after retrieval traces exist, because otherwise it will be difficult to tell whether a bad answer came from missing source evidence or bad learner memory.

## Research basis

The plan is informed by Liu et al.'s long-context position-bias findings; Lewis et al.'s retrieval-augmented generation work; Self-RAG's adaptive retrieval and critique approach; ColBERTv2's late-interaction retrieval results; LoCoMo/long-term conversational-memory evaluation; memory architecture work separating episodic and semantic memory; knowledge-tracing research; and educational reviews supporting spaced retrieval practice. Source registry and claim ledger are stored alongside this plan.
