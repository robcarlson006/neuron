# Progress

## 2026-10-02

- Read project instructions and confirmed `hot.md` is empty.
- Read deep-research, codebase-design, and planning-with-files instructions.
- Audited Tutor handler, AI transport, TutorSession, GeneralChat, ChatInput, types, and existing retrieval/memory references.
- Created this isolated planning ledger.
- Inspected grounded retrieval, embeddings, RAG indexing, chunking, database memory tables, CKRF memory, and existing tests.
- Collected primary research on long-context use, RAG, adaptive retrieval/critique, late-interaction retrieval, conversational memory, knowledge tracing, and retrieval practice.
- Synthesized the target architecture, typed learner-memory model, implementation phases, data-model additions, safeguards, evaluation metrics, and rollout gates.
- Wrote the implementation plan and citation-tracked research artifacts under `docs/superpowers/plans/` and `docs/research/`.
- Implemented additive SQLite schema for canonical chunks, retrieval events, learning events, typed learner memories, evidence links, and rolling session summaries.
- Replaced Tutor large-document sampling with token-budgeted context assembly and hybrid grounded retrieval integration.
- Added source citation verification, abstention detection, persisted verifier metadata, and lexical-only fallback behavior.
- Added `LearnerMemoryService` integration for event recording, memory retrieval, session consolidation, and conflict resolution.
- Added focused tests; 40 Tutor/retrieval/memory tests pass and both TypeScript projects compile.
- Full Jest run: 922 passed, 9 existing MaterialStudyPage visual-rendering tests failed outside this change.
