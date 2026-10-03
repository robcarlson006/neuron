# Neuron Document Learning Workspace — macOS Acceptance Matrix

This checklist is the manual release gate for the document-centered learning workspace. It is intentionally separate from unit tests because PDF/Office rendering, selection behavior, audio controls, and macOS folder permissions require a running packaged Electron application.

## Automated evidence

- [x] `npm run typecheck`
- [x] `npm run compile`
- [x] `npm test -- --runInBand` — 99 suites, 907 tests
- [x] `git diff --check`
- [x] Linked-folder watcher fallback covers macOS `EMFILE` errors
- [x] Source files are referenced by stored path and annotations are stored in SQLite sidecar records
- [x] Disk-backed SQLite restart regression recovers highlight text, color, and page locator after the database is closed and reopened.
- [x] Disk-backed SQLite restart regression recovers the complete Cornell annotation set—multiple highlights, linked comment, cue, question, and page summary—with resource ownership intact.
- [x] Linked-folder ingestion and repeated resync preserve source-file SHA-256 bytes; previews and annotations remain Neuron-owned artifacts.
- [x] Linked materials persist a SHA-256 content identity; same-size edits with a preserved mtime still trigger re-ingestion, and annotation reconciliation uses the digest when available.
- [x] Lecture transcripts and generated/Cornell notes export atomically into the linked class folder's hidden `.neuron/lectures` sidecar; the sync scanner ignores that sidecar to prevent duplicate materials.
- [x] Parser fixtures cover PPTX slide order/speaker notes, EPUB spine order, DOCX extraction, image/OCR delegation, and supported file classification.
- [x] macOS visual conversion smoke check rendered a real Inbox PPTX (`Lecture 6.1 - Employees and the Firm.pptx`) to a 26-page, 960×540-point PDF without modifying the source.
- [x] Digital PDF extraction preserves true `--- Page N ---` boundaries; scanned-PDF OCR uses the same page markers, so page-scoped Cornell annotations map to actual PDF pages.
- [x] Custom visual-file protocol accepts page/chapter fragments, so the original PDF/PowerPoint/EPUB surface remains loadable while the active Cornell unit changes.
- [x] Visual preview startup deduplicates concurrent URL/page-count requests per material and falls back to `pdfinfo` when `pdf-parse` cannot initialize its worker, preserving page-aware Office navigation on macOS.
- [x] Renderer regression uses the actual visual PDF page count when extracted PDF text has no explicit page markers, preventing arbitrary paragraph chunks from becoming fake sections.
- [x] EPUB chapters use the same shared zoom controls as other original-format visual surfaces.
- [x] Renderer regression tests cover selection-toolbar dismissal, explicit PowerPoint slide-text selection, and editable highlight-to-card generation with surrounding material context.
- [x] Renderer regression tests cover saving a non-default highlight color with its page-aware locator.
- [x] Renderer regression tests cover saving and restoring visual highlight rectangles directly over both PDF pages and PowerPoint slides; rectangles remain inside the zoomed original-page canvas.
- [x] Renderer regression verifies PDF extracted-text selection stays in a separate readable panel and does not persist misleading image-relative rectangles; direct PDF drawing remains rectangle-based.
- [x] Renderer regression verifies a live PowerPoint selection captures normalized visual rectangles in the persisted slide locator before saving the highlight.
- [x] Renderer regression covers direct drag-to-highlight on the original visual canvas for both PDF pages and PowerPoint slides, including normalized rectangle persistence and hiding Card for region-only annotations.
- [x] Annotation reconciliation keeps rectangle-only visual highlights resolved when the source hash is unchanged and marks them for review after the source changes.
- [x] Document annotation-index regression lists highlights and notes across pages/slides and jumps to the selected unit.
- [x] Card regression covers revising the generated card with a learner request before saving it to the originating material deck.
- [x] Card-generation failure regression confirms the selected text and Card action remain available when a provider is unavailable.
- [x] AI routing regression tests cover DeepSeek model normalization and local OpenAI-compatible runner authentication for card generation.
- [x] AI routing regression completes the local OpenAI-compatible response contract, including Ollama fallback authentication, JSON response parsing, and structured-output request fields.
- [x] Image materials retain their canonical source path for the in-app visual surface; EPUB fixtures verify chapter rendering, embedded images, and active-content sanitization.
- [x] Preview-service regression verifies image materials report one visual page and multi-chapter EPUB previews expose isolated chapter surfaces with correct chapter counts.
- [x] Renderer regression verifies EPUB highlights, linked comments, cues, and summaries persist with chapter-aware locators for tutor provenance and recovery.
- [x] Renderer regression verifies direct image-region drawing persists normalized page rectangles for image materials.
- [x] Renderer regression preserves the real visual PDF/DOCX page count even when extracted text collapses to one block, keeping every original page navigable.
- [x] Renderer regression preserves every known visual page for completely textless scanned PDFs, keeping visual-only pages navigable.
- [x] Clean linked-folder integration fixture syncs PDF, PPTX, DOCX, Markdown, text, PNG, JPEG, and EPUB together, records SHA-256 identities, and proves every source hash is unchanged.
- [x] Clean linked-folder integration fixture detects a same-size edit with preserved mtime through SHA-256 re-ingestion.
- [x] Tutor configuration regression tests verify material annotations are selected by default and omitted when the learner deselects them.
- [x] Packaged macOS runtime verified a real three-page `Seminar 1.docx`: page-aware Cornell labels (`PAGE 1 OF 3`), a single full central page surface without the embedded PDF thumbnail rail, separate non-overlapping navigation header, and working zoom controls.

## Manual macOS run

Run against a temporary linked class folder containing one fixture of each type: PDF, PPTX, DOCX, Markdown, plain text, PNG/JPEG, and a multi-chapter EPUB. Keep a SHA-256 hash of every fixture before and after the run.

### Linked materials and viewing

- [ ] Link the class folder from the class screen and confirm all supported files appear without copying or modifying them.
- [ ] Open each material from Materials and confirm the persistent Cornell layout remains visible: left cues/questions/notes, central document surface, bottom summary.
- [ ] Confirm PDF and image source surfaces render in-app; confirm PPT/PPTX slides and DOC/DOCX pages render in their original visual layout, with the selectable text layer available for annotations; confirm Markdown/text math and EPUB chapters are readable in their format-aware units.
- [ ] Switch materials and return to the original material; confirm the selected material and last visible unit remain correct.
- [ ] With a large document, scroll and search/read without freezing the window.

### Cornell notes and annotations

- [ ] Add an independent cue note, question, and summary. Close/reopen Neuron and confirm all three persist in their original panes and in the linked-folder lecture sidecar.
- [ ] Select a phrase, definition, equation, and image/PDF-readable text where available. Create yellow, blue, green, and pink highlights; confirm the toolbar disappears immediately when the selection collapses.
- [ ] Add a linked comment/question to a highlight and confirm it appears in the left pane and remains linked after restart.
- [ ] Use the left annotation list to jump to the correct page, slide, or EPUB chapter.
- [ ] Change a linked source file, resync, reopen it, and confirm recoverable highlights stay attached while ambiguous ones show “Needs review.”
- [ ] Confirm the original fixture hashes are unchanged.

### Highlight-to-card

- [ ] Generate a card from a definition, phrase, and math equation. Confirm surrounding context is included.
- [ ] Edit the front/back preview, request an AI revision, cancel once, and save only the accepted version.
- [ ] Confirm the saved card is linked to the originating material and appears in that material’s deck.
- [ ] Repeat with DeepSeek, another configured provider, and a local model where available; confirm failed generation leaves the selection and drafts intact.

### Tutor context

- [ ] Start a tutor session from a material and confirm attached materials/lectures and annotations are selected by default.
- [ ] Deselect one material and one annotation; ask a question that would require them and confirm their text is absent from the request context.
- [ ] Select a saved question/highlight and confirm the tutor sees its provenance and treats learner text as a question/claim, not authoritative source evidence.

### Lecture notetaker

- [ ] Open the lecture notetaker independently of a document viewer.
- [ ] Start or attach a recording, take notes in the large cue/question and notes areas, and verify recording/transcription remains separate.
- [ ] Add math, bullets, and a post-lecture summary; close/reopen and confirm recovery.
- [ ] Open the related transcript/material without losing the lecture notes.

## Current status

Automated gates are complete. A current arm64 packaged build was opened on macOS and manually verified for:

- [x] Linked class folder materials loaded in the Materials section.
- [x] Markdown material opened in the Cornell workspace with readable structured text and math content.
- [x] Image materials use the same single-page viewer contract: OCR text does not create fake extra pages, the visual surface is `Page 1`, and the shared zoom controls apply to the image.
- [x] DOCX material opened in the Cornell workspace with its original visual page layout rendered as one standalone page at a time, with Neuron-owned navigation/zoom and selectable extracted content; a real linked `Seminar 1.docx` was verified in the packaged macOS build.
- [x] PDF material opened in the Cornell workspace with its original visual layout rendered as one standalone page at a time, and readable extracted content; a real linked 21-page chapter PDF was verified in the packaged macOS build.
- [x] Follow-up packaged-runtime check opened the real linked `Chapter 5 Microeconomics.pdf` at `Page 3 of 3`; the original diagram-filled page, page-aware Cornell panes, `Select page text`, and active `Stop drawing` mode all rendered together.
- [x] PPTX material opened in the Cornell workspace with slide units and slide-aware labels; a real linked PPTX opened one original-layout slide at a time in the packaged macOS build, with selectable slide text below the visual surface. Linked Office visual-preview conversion and EPUB visual-preview generation are also covered by `tests/unit/documentPreviewService.test.ts`.
- [x] Packaged macOS runtime verified the `+` control changes the rendered page scale (100% → 110% → 120%) while keeping the active slide and Cornell panes synchronized; the `−` control reduces it back toward the 75% minimum.
- [x] Materials UI groups lecture recordings with expandable attached materials, annotation counts, Cornell-workspace actions, and tutor-context actions while retaining the linked folder as the canonical source.
- [x] Refreshed packaged-runtime check shows the linked Materials tab with all 17 material/context checkboxes selected by default and a visible `Deselect all` opt-out.
- [x] Saving, deleting, and restoring learner Cornell annotations re-exports the linked-folder `.notes.md` artifact while retaining the generated lecture notes.
- [x] Fresh packaged-runtime check opened the real linked lecture list and backfilled transcript/notes sidecars for five completed lectures under `/Users/robmcarlson/Desktop/ECNU211/.neuron/lectures` without altering the source materials.
- [x] Persistent three-region layout visibly rendered: cues/questions, central material, and separate summary.
- [x] Live text selection on a slide exposed the non-invasive color controls, linked-comment field, Highlight action, and Card action; selection was cancelled without changing user data.
- [x] PPTX visual pages expose an explicit `Select slide text` mode so extracted slide text can be selected for highlights, comments, and cards while the original slide remains available.
- [x] PDF and PowerPoint visual pages render saved color highlights directly over the original page/slide; PowerPoint retains its selectable text surface, while PDF text selection uses a readable extracted-text panel because extracted PDF text coordinates cannot be safely aligned to a rasterized page image.
- [x] PDF and PowerPoint visual pages expose a separate `Draw highlight` mode for dragging a rectangle directly over the rendered page/slide, including image-embedded text or diagrams.
- [x] PowerPoint text-selection mode keeps the full slide selectable, including the top edge; its instruction is outside the interactive text layer so it cannot cover slide content.
- [x] Saved visual highlights expose a `Remove highlight` action in the Cornell annotation pane; removal uses the existing durable soft-delete path and leaves the original source file unchanged.
- [x] Fresh packaged-runtime acceptance directly dragged and saved a yellow visual highlight on a real linked PowerPoint slide; leaving and reopening the material recovered the slide overlay, annotation index entry, and `1 highlights` count.
- [x] Fresh packaged-runtime acceptance directly dragged and saved a yellow visual highlight on a real linked PDF page; leaving and reopening the material recovered the page overlay, annotation index entry, and `1 highlights` count.
- [x] Fresh packaged-runtime acceptance increased the real PDF page from 100% to 110%; the rendered diagram visibly enlarged while the page-aware Cornell layout and saved overlay remained synchronized.
- [x] Fresh packaged-runtime acceptance drag-selected a phrase in the real PDF selectable-text layer; the toolbar exposed yellow/blue/green/pink colors, comment input, Highlight, and Card, and Cancel immediately removed the toolbar without saving a new annotation.
- [x] Fresh post-restart packaged-runtime acceptance confirms the installed PDF renderer keeps the original page unobstructed, exposes direct `Draw highlight`, and opens `Select page text` in the separate cleaned extracted-text panel.
- [x] Fresh packaged-runtime check confirmed the installed build's PDF zoom control changes the page scale from 100% to 110% while preserving the active page and Cornell panes.
- [x] Fresh packaged-runtime acceptance used the configured DeepSeek provider to generate an editable flashcard preview from that selected PDF phrase; the preview contained editable front/back fields and a revision-request field, then was cancelled before saving.
- [x] Fresh packaged-runtime acceptance submitted a revision request to the configured DeepSeek provider and received a changed front/back draft; the revised draft was cancelled before saving.
- [x] Lecture list exposed the independent “Take Notes” action.
- [x] Cornell lecture notetaker visibly rendered its large cues/questions, lecture notes, post-lecture summary, audio controls, and transcript disclosure.
- [x] Lecture notetaker regression tests verify that questions, lecture notes, and post-lecture summary reload as separate persisted sections and that editing lecture notes remains separate from the transcript.
- [x] Lecture notetaker formatting regression verifies bullet-list and equation insertion controls while preserving editable Markdown/math notes.
- [x] Lecture notetaker loads the lecture's linked material identity and exposes an `Open related material` action without merging the document viewer into the expanded note-taking workspace.
- [x] Fresh post-restart packaged-runtime check opened a real recorded lecture's Cornell notetaker and confirmed the separate cues/questions, lecture notes, post-lecture summary, formatting controls, transcript disclosure, and related-material action.
- [x] Lecture artifact regression verifies annotation saves, deletes, and restores refresh the linked-folder `.neuron/lectures` notes sidecar while preserving generated notes.

The manual matrix remains open for image/EPUB fixtures, complete selection/highlight/card flows, restart recovery, source-hash comparison, and configured DeepSeek/other-provider/local-model checks. The linked-source PDF/PPTX visual previews and page/slide-by-page Cornell synchronization are verified in a clean packaged build; the remaining items require a clean fixture folder and user-configured model credentials.
