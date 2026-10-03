# Neuron Document Learning Workspace — Implementation Plan

## Goal

Build a macOS-first document-centered learning workspace that turns Neuron's existing linked class folders, lecture transcription, flashcards, math rendering, and tutor/RAG systems into one persistent Cornell-style study environment.

The original class files remain unchanged. Neuron stores annotations and Cornell notes in its local SQLite database, keyed to the source file identity and stable document locations, so reopening a material restores the learner's highlights, comments, questions, notes, and summary. AI context is selectable and includes the source material plus any selected learner annotations.

## Product decisions captured from Robert

- Reuse the existing linked class folder as the canonical source; do not create a second materials folder.
- Support PDF, PowerPoint, Word, Markdown/text, images, and EPUB materials in the Neuron viewer.
- Preserve source files by default; annotations are Neuron-owned sidecar data.
- Use a persistent three-region workspace: left Cornell cue/questions/notes pane, central document viewer, and separate bottom summary pane. The panes stay visible while the document is browsed.
- Highlights support multiple colors, comments, and a linked note/question in the left pane. Standalone Cornell notes remain possible.
- Highlight-to-card opens an editable AI-generated preview. The learner can request a revision before saving.
- DeepSeek is the optimized default, but every feature must use the existing provider abstraction and remain compatible with supported cloud and local models.
- Tutor context is explicitly selectable per session. In the Materials UI, attached lectures/materials and their notes/highlights are selected by default but can be deselected.
- Lecture recording/transcription remains separate from the lecture notetaker. The notetaker is a larger Cornell workspace used while listening and a summary space used afterward; there is no requirement for live AI note generation.
- macOS is the first-class platform; avoid regressions on other Electron platforms where practical.

## Existing seams and documentation to follow

These are the current project patterns discovered before planning:

- Linked-folder ingestion and lifecycle: `docs/superpowers/specs/2026-09-13-linked-class-folder-sync-design.md`, `electron/ipc/folderSyncService.ts`, `electron/ipc/folderHandlers.ts`, and the folder APIs in `electron/preload.ts`.
- Lecture persistence and processing contract: `docs/superpowers/specs/2026-09-14-lecture-recording-transcription-design.md`, `src/store/lectureRecordingStore.ts`, `electron/ipc/lectureHandlers.ts`, `electron/ipc/lectureNotesService.ts`, and the `lectures`/`materials` schema in `src/lib/db.ts`.
- Material/class UI: `src/pages/UnifiedSubjectDetail.tsx`, `src/components/classes/FileDropZone.tsx`, and the `Material`/`Lecture` contracts in `src/types/index.ts`.
- Parsing and math presentation: `src/lib/fileParser.ts`, `src/components/MarkdownRenderer.tsx`, `src/components/LatexText.tsx`, `src/lib/mathFormatter.ts`, and the existing KaTeX dependency.
- AI retrieval and tutor context: `src/lib/ragChunker.ts`, `src/lib/vectorSearch.ts`, `electron/ipc/ragHandlers.ts`, `electron/ipc/tutorHandlers.ts`, `src/pages/tutor/TutorSession.tsx`, and `src/pages/tutor/GeneralChat.tsx`.
- Card generation and quality gates: `src/components/CardImportModal.tsx`, `electron/ipc/cardGenHandlers.ts`, `src/lib/cardParser.ts`, `src/lib/cardValidator.ts`, `src/lib/promptBuilders.ts`, and the existing `Card.material_id`/`Card.note_id` relationships.
- Database evolution: the versioned migration pattern in `src/lib/db.ts`; every new table/index/column must use the existing initialization and migration conventions.

## Architecture contract

### Source identity and annotation sidecar

Add a durable document-annotation model rather than modifying source files. Each material gets a stable source identity based on subject, normalized path, file metadata, and a content hash. Annotation records contain:

- material/lecture ownership;
- annotation type (`highlight`, `comment`, `cue_note`, `summary`, `question`);
- document locator (page, slide, block/paragraph, character offsets, and renderer-specific fallback locator);
- selected text and a bounded surrounding-text snapshot;
- highlight color and comment/question linkage;
- creation/update timestamps and soft-delete state.

When a linked file changes, Neuron preserves annotations, attempts locator remapping using source text and the snapshot, and marks unresolved annotations for user review. It must never silently attach a comment to unrelated text.

### Viewer adapter boundary

Implement a common `DocumentViewer` contract with adapters per format. The contract exposes document metadata, navigable units, text selections, highlight rendering, and jump-to-locator. Renderer details stay behind adapters so PDF, slide, reflowable text, image, and EPUB support do not leak into Cornell state management.

The discovery task for each adapter must identify the actual library/API available in this repository or add a documented dependency. Do not assume that `pdf-parse` can render PDFs: it currently provides text extraction only.

### Cornell workspace state

The workspace owns a selected material/lecture, the viewer locator, visible annotations, cue notes, questions, and summary. Autosave is debounced and explicit save/error states are visible. A material update from folder sync refreshes source content without deleting the sidecar.

### AI context contract

Build one bounded context assembler that accepts selected source materials and selected annotations. It emits provenance-bearing blocks containing source name, page/slide/locator, annotation type, and text. Tutor prompts must distinguish learner-authored claims/questions from source evidence and must not treat annotation text as authoritative facts.

### Provider contract

All summarization, answer, flashcard, and revision actions use the existing configured provider path. DeepSeek receives optimized prompts and bounded context by default; local models and other configured providers receive the same structured request contract. Provider failures preserve drafts and never lose notes or annotations.

## Phases

### Phase 0 — Documentation and renderer discovery

**Implement:** Create a short technical decision record after inspecting the current parser, Electron IPC, build, and dependency constraints. Verify which renderer APIs support each requested file type, especially PDF, PPTX, DOCX, EPUB, images, and text. Confirm whether document text selections can be mapped to stable locators in each adapter.

**References:** `package.json`; `src/lib/fileParser.ts`; linked-folder and lecture specifications above; `electron/preload.ts`; existing Markdown/KaTeX components.

**Verification:** Produce a format capability matrix; run typecheck and a minimal parser smoke test; record exact APIs/dependencies and fallback behavior for unsupported features.

**Anti-pattern guards:** Do not use text-only parsing as a document viewer. Do not write annotations into linked source files without an explicit future export action. Do not invent preload methods before defining and implementing the IPC handler.

### Phase 1 — Annotation persistence and source identity

**Implement:** Add migrations, types, database accessors, IPC handlers, preload methods, and tests for documents, annotations, links, colors, locators, source snapshots, and unresolved-remap states. Add source hashing and safe migration/remap behavior for linked-folder updates and lecture-material regeneration.

**References:** `src/lib/db.ts` migration pattern; `src/types/index.ts`; `electron/ipc/folderSyncService.ts`; material update behavior in the linked-folder specification.

**Verification:** Unit tests cover create/update/delete, autosave idempotency, material changes, deleted source files, duplicate annotations, cross-subject isolation, and unresolved locator handling. Run `npm run typecheck`, focused Jest tests, and `git diff --check`.

**Anti-pattern guards:** Do not cascade-delete annotations when a source file disappears. Do not key annotations only by filename or array index. Do not allow one subject to read another subject's sidecar data.

### Phase 2 — Multi-format viewer adapters

**Implement:** Build the common viewer contract and adapters for PDF, PPT/PPTX, DOC/DOCX, Markdown/text, images, and EPUB. Add page/slide navigation, search, zoom, keyboard navigation, readable math, and a visible unsupported/error state. Use the existing material file path and parsed content rather than duplicating files.

**References:** Phase 0 decision record; `src/lib/fileParser.ts`; `src/components/MarkdownRenderer.tsx`; `src/components/LatexText.tsx`; existing Electron file-path APIs.

**Verification:** Per-format fixture tests verify open, navigation, text extraction, selection, and reload. macOS manual checks cover large PDFs, slide decks, Word documents, EPUB chapters, images, and math. Confirm source files remain byte-identical.

**Anti-pattern guards:** Do not expose arbitrary filesystem paths to the renderer. Do not load untrusted document HTML without sanitization. Do not block the entire UI while parsing a large document.

### Phase 3 — Three-region Cornell material workspace

**Implement:** Add a dedicated material study route launched from Materials. Layout: persistent left cue/questions/notes pane, central viewer, and separate persistent bottom summary pane. Add resizable panes, autosave status, standalone notes, linked notes, questions, keyboard shortcuts, and return-to-last-location behavior. Attach notes to material or lecture records as appropriate.

**References:** `src/pages/UnifiedSubjectDetail.tsx`; existing layout/sidebar patterns; Phase 1 data contract; Phase 2 viewer contract.

**Verification:** Component tests cover pane persistence, resize, note autosave/retry, reload recovery, material switching, and lecture/material ownership. Manual acceptance: read a source while adding cues, ask questions, write a summary without scrolling the document, close/reopen, and confirm everything returns.

**Anti-pattern guards:** Do not place the summary at the end of the document scroll. Do not make the notes pane disappear on ordinary navigation. Do not silently discard unsaved drafts during provider or IPC failures.

### Phase 4 — Highlights, comments, and annotation navigation

**Implement:** Add text selection/highlighting for every adapter that supports text, multi-color highlight controls, linked Google-Docs-style comments, standalone cue notes, annotation list/filtering, page/slide navigation, and “show all highlights” for a material. For image/PDF cases where selection differs, provide a robust region or text-layer fallback and preserve the locator.

**References:** Phase 1 annotation schema; Phase 2 viewer selection contract; Materials list in `UnifiedSubjectDetail.tsx`.

**Verification:** Tests cover multiple colors, comment linkage, deletion/restoration, jump-to-page/slide, reopening, source modifications, and unresolved remaps. Manual macOS check confirms annotations are visible each time a document opens and can be found from an index.

**Anti-pattern guards:** Do not make highlights merely visual and ephemeral. Do not couple comment content to a fragile DOM node. Do not claim an annotation is restored if its source locator was not verified.

### Phase 5 — Highlight-to-card generation and editable revision loop

**Implement:** Add the unobtrusive “Card” affordance near a selection/highlight. Send selected text plus bounded surrounding context and document provenance to the existing card-generation pipeline. Show an editable preview, type-aware math-safe rendering, validation feedback, and a revision request box. Save only after learner confirmation, link cards to the originating material/annotation, and retain source provenance.

**References:** `src/components/CardImportModal.tsx`; `electron/ipc/cardGenHandlers.ts`; `src/lib/cardValidator.ts`; `src/lib/promptBuilders.ts`; existing `Card.material_id` and `Card.note_id` fields.

**Verification:** Tests cover definition, phrase, equation, cloze, and concept selections; revision requests; malformed provider output; duplicate prevention; cancellation; and save/retry failure. Validate cards with the existing quality gate and confirm they appear under the material/class deck.

**Anti-pattern guards:** Do not auto-save a low-quality card. Do not send the entire document when a bounded context window is sufficient. Do not strip LaTeX or turn equations into opaque plain text.

### Phase 6 — Selectable annotation-aware tutor context

**Implement:** Extend tutor scope selection to show lectures/materials in expandable groups. Select attached materials and their notes/highlights by default; allow individual material, highlight, question, cue note, and summary selection. Add a context preview with provenance and feed the shared context assembler into tutor and general chat. Keep the current tutor scope behavior intact for users who choose no annotations.

**References:** `src/pages/tutor/TutorSession.tsx`; `src/pages/tutor/GeneralChat.tsx`; `electron/ipc/tutorHandlers.ts`; `electron/ipc/ragHandlers.ts`; `src/lib/vectorSearch.ts`; `src/lib/ragChunker.ts`.

**Verification:** Tests cover default selection, deselection, empty scope, current material only, whole class, multiple lectures, annotation provenance, privacy boundaries, and bounded prompt size. Manual check asks DeepSeek a question whose answer requires a saved note/highlight and verifies the response uses the selected source.

**Anti-pattern guards:** Do not leak all class materials when the learner selected one document. Do not treat a student question as source truth. Do not send hidden or deselected annotations to any provider.

### Phase 7 — Dedicated Cornell lecture notetaker

**Implement:** Add a lecture notetaker route that can be opened independently of the document viewer. Reuse the existing lecture recording/transcription identity and class ownership, but provide larger cue/questions and notes areas for live handwritten-style typing, plus a less prominent summary area for post-lecture recall. Add autosave, keyboard-friendly math input, bullet/list formatting, timestamp links to the recording/transcript where available, and “open related transcript/material” actions without forcing a viewer pane.

**References:** `docs/superpowers/specs/2026-09-14-lecture-recording-transcription-design.md`; `src/store/lectureRecordingStore.ts`; `src/components/classes/LectureNotesModal.tsx`; `src/pages/UnifiedSubjectDetail.tsx`; existing math input/rendering components.

**Verification:** Tests cover starting from a class or lecture, reload/recovery, recording already in progress, transcript linkage, offline editing, math, long notes, and summary completion. Manual macOS check records a lecture, takes independent notes while listening, then returns afterward to write a summary.

**Anti-pattern guards:** Do not merge live lecture notes into the generated transcript as if they were dictated words. Do not require the transcript to exist before taking notes. Do not make live note-taking compete with the recorder's existing global state.

### Phase 8 — Hardening, accessibility, performance, and release verification

**Implement:** Add keyboard navigation, accessible labels, focus management, undo/delete recovery, autosave telemetry, bounded document rendering, large-file performance safeguards, migration recovery, and macOS packaging checks. Document the sidecar data model, backup/export behavior, and provider privacy boundaries.

**Verification checklist:**

1. `npm run typecheck`
2. Focused Jest suites for migrations, adapters, annotations, Cornell workspace, cards, tutor context, and lecture notetaker
3. Full Jest run with known unrelated native watcher limitations recorded if still present
4. `npm run compile` and macOS packaging/build checks
5. `git diff --check`
6. Manual macOS acceptance across all requested formats
7. Byte comparison proving linked source files remain unchanged
8. Restart/reload acceptance proving notes, highlights, questions, summaries, and cards persist
9. Provider matrix: DeepSeek, another configured provider, and a local model where available
10. Privacy check proving deselected material/annotations never enter tutor prompts

## Completion criteria

The goal is complete only when a macOS user can link a class folder, open every requested material type inside Neuron, read it in the persistent Cornell three-pane layout, create and recover notes/questions/summaries, highlight and comment on source content, generate and revise a flashcard from a highlight, reopen the document and find all annotations, selectively provide those annotations to the tutor, and use a separate expanded Cornell notetaker while recording or reviewing a lecture. The original linked files must remain unchanged, all persisted data must survive restart, and automated plus macOS-focused manual verification must pass.

## Known risks to resolve during Phase 0

- Browser/Electron rendering support differs across PDF, PPTX, DOCX, and EPUB; the viewer adapter decision record must choose maintained, sandbox-safe implementations.
- Reflowable documents do not have universal page coordinates; locator fallback and remapping quality must be explicit.
- Large documents and long lecture transcripts require virtualization and bounded AI context.
- Existing native Electron launch limitations may prevent full GUI automation in the restricted environment; retain strong fixture/component tests and document any remaining manual-only checks.
- The current project status must be rechecked before each implementation phase so existing user changes are preserved.
