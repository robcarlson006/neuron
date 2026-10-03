# Document Viewer Adapter Decision — 2026-10-01

## Current evidence

Neuron currently has a reliable main-process text-ingestion path in `electron/ipc/documentParser.ts`:

- PDF text extraction uses `pdf-parse`, with OCR fallbacks for scanned pages.
- PPTX text, slide boundaries, and speaker notes are extracted with `JSZip`.
- DOCX text is extracted with `mammoth` and a ZIP/XML fallback.
- Markdown, text, CSV, RTF, and HTML are normalized to text.
- Images are OCR'd through the existing `ocrHelper` pipeline.
- PDF pages can be rendered to images on macOS through the existing `osascript`/PDFKit path in `ocrHelper.ts`.
- EPUB was not previously recognized; this turn adds ZIP/OPF spine text ingestion using the existing `JSZip` dependency.

The existing parser is not a viewer: it deliberately returns `contentText` and cannot provide selection rectangles, page surfaces, slide canvases, or stable visual locators. The viewer must therefore be a renderer-side adapter layer, while parsing remains the indexing fallback.

## Adapter matrix

| Format | Existing source capability | First viewer strategy | Locator strategy | Known limitation |
| --- | --- | --- | --- | --- |
| PDF | Text extraction, OCR fallback, macOS page rendering helper | Add a maintained PDF renderer with a text layer; keep source path outside renderer | Page + text quote + offsets; page region fallback | Exact renderer dependency must be selected and fixture-tested in Phase 2 |
| PPT/PPTX | Ordered slide text and speaker notes | Temporary macOS LibreOffice conversion to PDF for the original visual slide surface, with one selectable extracted-text unit per slide for annotations and AI context | Slide + quote + offsets | Conversion is view-only; the source PowerPoint remains unchanged |
| DOC/DOCX | Clean extracted text | Reflowed document adapter; add sanitized HTML conversion where supported | Block/paragraph + quote + offsets | Word layout fidelity is not guaranteed |
| Markdown/text/HTML/CSV/RTF | Normalized text | Native sanitized reflowed text adapter with math rendering for Markdown | Block + quote + offsets | CSV needs table-aware selection later |
| Images | OCR text and image files | Image surface with OCR text layer/region fallback | Region when available + OCR quote | Selection depends on OCR quality |
| EPUB | New OPF spine text extraction in `parseEPUB` | Reflowed chapter adapter in spine order | Chapter + block + quote + offsets | EPUB CSS/layout fidelity requires a dedicated renderer pass |

## Decisions

1. All adapters implement a common renderer contract: open, close, navigate, search, select text, create a locator, jump to locator, and report a visible fallback state.
2. The first release prioritizes dependable reading and annotation recovery over pixel-perfect office-document layout. Source files remain untouched.
3. The sidecar stores both a structural locator and a quoted source snapshot. A locator is only considered restored when the quote is verified; otherwise the UI marks it unresolved.
4. The main process owns filesystem access and parsing. The renderer receives bounded document data and safe media handles through explicit preload APIs.
5. `pdf-parse` remains an indexing/parser dependency, never the visual viewer. PDFs use their original PDF surface; Office files use a temporary PDF viewing copy produced by LibreOffice when available, with a clear text fallback if conversion is unavailable.

## Verification required before viewer implementation

- Add fixtures for one file of every requested format, including a multi-chapter EPUB.
- Prove `parseEPUB` follows OPF spine order and ignores non-spine assets.
- Prove linked-folder sync recognizes EPUB and image materials without deleting existing records.
- Select and document the actual PDF and office rendering APIs before adding imports or preload methods.
- Keep source-file byte hashes unchanged throughout viewer and annotation tests.
