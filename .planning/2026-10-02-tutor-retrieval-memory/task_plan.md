# Tutor Retrieval and Memory Upgrade

## Goal

Design an implementation-ready plan to make Neuron's Tutor mode more accurate over large documents and more useful over repeated study sessions by combining relevance-based document retrieval with evidence-backed learner memory.

## Scope

- Audit the current Tutor prompt/context pipeline and memory persistence.
- Research current best practices for long-context retrieval, hybrid search, chunking, reranking, conversational memory, learner modeling, and evaluation.
- Define a target architecture, data model, interfaces, rollout phases, migration strategy, and verification criteria.
- Implement the approved retrieval, evidence, and learner-memory upgrade while preserving local-first operation.

## Phases

1. Repository audit — complete
2. Research and evidence collection — complete
3. Architecture and data-model design — complete
4. Phased implementation plan — complete
5. Retrieval/context implementation — complete
6. Evidence verification and learner-memory implementation — complete
7. Verification — complete for focused Tutor suite and TypeScript; broader suite has 9 unrelated visual-rendering failures

## Success Criteria

- The plan identifies exact current cutoffs and failure modes.
- Every major architectural recommendation is tied to source evidence or clearly labeled as an implementation inference.
- The design preserves source provenance and supports citations/abstention.
- Memory is separated into durable learner facts, session episodes, concept mastery, and retrieval artifacts.
- The plan contains concrete phases with files/modules, tests, migrations, rollout gates, and measurable accuracy targets.

## Delivered

- Canonical structure-aware document chunks and additive SQLite tables for retrieval traces, learning events, typed learner memories, evidence links, and session summaries.
- Hybrid lexical/semantic retrieval path with lexical-only fallback and canonical chunk cleanup.
- Token-budgeted `TutorContextBuilder` replacing large-document sampling in the Tutor request path.
- Citation metadata persistence, citation validation, and unsupported-answer detection.
- `LearnerMemoryService` for event recording, candidate promotion/upsert, retrieval, consolidation, and conflict resolution.
- Focused tests for context budgets, citation validation, memory deduplication/consolidation, schema migration, and existing grounded retrieval.

## Next Step

Run the remaining visual-rendering test investigation separately; it is outside the Tutor retrieval/memory patch.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Obsidian hot.md was empty | 1 | Continued with repository and source audit |
