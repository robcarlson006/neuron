# Plan: reliable PDF/slide selection and fit-to-window viewing

## Goal

Make the active textbook page or lecture slide fully visible in the central viewer at fit scale, while allowing the learner to drag-select real visible PDF/slide text and save a durable Neuron highlight or card.

## Scope

In scope: PDF and PPT/PPTX visual rendering, text selection, highlight rectangle capture, fit/manual zoom, page navigation, existing sidecar annotations, scanned/image fallback, tests, and packaged macOS verification.

Out of scope: editing source PDFs/PPTX files, PresentationML text-box reconstruction, changing the annotation database contract, or redesigning the Cornell panes.

## Implementation sequence

### 1. Establish the renderer seam

- Add a renderer-side `PdfPageViewer` component and a small hook/state model for loaded PDF, active page, viewport, render task, text layer readiness, and errors.
- Add and pin `pdfjs-dist`; configure its worker through the Vite/Electron renderer build.
- Load the existing safe `neuron-file://visual/{materialId}` URL, which already resolves PDF and LibreOffice-converted Office previews in the main process.
- Confirm whether custom-scheme loading works directly. If not, add one explicit preload byte-loading method rather than exposing file paths.

### 2. Implement one-page fit and controlled zoom

- Render a single active page into a wrapper whose canvas and text layer share the exact viewport width/height.
- Use `ResizeObserver` to calculate `fitScale` from the available viewer rectangle and page dimensions.
- Default to fit scale. Manual zoom multiplies fit scale; zoom above fit enables panning/scrolling, while fit mode has no page scroll.
- Preserve the current page when resizing and reset selection actions on page changes.
- Keep the existing Previous/Next controls and last-location behavior.

### 3. Make selection geometry truthful

- Attach selection handling to the PDF.js text layer only.
- On `mouseup`/selection change, reject empty or out-of-page selections, preserve the browser range while the action toolbar is open, and capture the selected quote.
- Normalize each `Range.getClientRects()` rectangle against the exact page wrapper. Store those rectangles in the existing locator for text highlights; keep page/slide, quote, and offsets as the durable anchor.
- Render saved rectangles from the existing `activeHighlights` collection in the page overlay. Ensure overlays do not intercept pointer events.
- Keep “Card” available only for text selections; keep `Draw highlight` for region selections.

### 4. Unify PDFs and slides

- Use the same PDF.js adapter for `pdf`, `ppt`, and `pptx`. The current LibreOffice conversion becomes the slide visual source, so slide text and slide pixels share one coordinate system.
- Retain `documentParser.ts` extracted slide text for indexing, tutor context, and fallback messaging; do not use its paragraph order as a visual selection layer.
- Keep a clear fallback when conversion or PDF.js text content is unavailable: readable extracted text plus direct region drawing.

### 5. Preserve fallback behavior

- Keep image and scanned-PDF visual pages on the current image surface with `Draw highlight`.
- Keep extracted text below the visual page as a secondary searchable/accessible fallback, clearly labeled when no native PDF text layer exists.
- Do not alter source files or existing annotation remapping rules.

### 6. Verification gates

- Unit/component tests: fit-scale calculation; page navigation; stale render cancellation; selection toolbar lifecycle; multi-line selection rectangle normalization; PDF and PPTX selection persistence; region drawing; scanned/no-text fallback; source-hash review behavior.
- Fixture acceptance: one digital textbook PDF with equations, one scanned/image-only PDF, one PPTX with text near edges, a text-heavy slide, and a mixed diagram slide.
- Runtime acceptance on macOS: at the screenshot-sized window, a portrait textbook page fits entirely without scrolling; a slide remains fully visible; selecting a sentence produces a toolbar; saving shows a highlight over the exact visible words after reload; zooming in intentionally allows panning; page navigation never leaves stale selection UI.
- Run `npm run typecheck`, focused Jest suites, `npm run compile`, `git diff --check`, and a packaged arm64 launch check. Keep existing unrelated dirty work untouched.

## Definition of done

The user can open a PDF or slide, see one complete active page/slide at fit scale, drag-select visible text, save a color highlight and optional comment/card, navigate away and back, and see the annotation in the correct location. Image-only/scanned content still supports direct region drawing with an honest fallback message.

