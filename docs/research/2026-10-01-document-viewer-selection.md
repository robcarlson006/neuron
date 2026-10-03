# Research: reliable document selection and single-page viewing

Date: 2026-10-01

## Question

How should Neuron let a learner select and highlight real text in PDFs and PowerPoint slides while fitting one complete page/slide into the available window?

## Current-state finding

Neuron currently converts Office files to a temporary PDF, rasterizes one PDF page to PNG, and places either a reconstructed Markdown/text block or an extracted-text overlay beside/on top of that image. The saved annotation model is already suitable for the next step: it stores page/slide locators, quotes, offsets, and normalized rectangles. The weak link is the renderer: the displayed pixels and selectable text are not produced from the same layout model.

## Evidence-backed findings

1. PDF.js is designed as a display-layer renderer, and its official examples render a page from a page viewport. Its viewer layer includes a positioned text layer intended to sit over the rendered page. The current `pdf-parse` dependency is appropriate for extraction/indexing, not visual selection. Sources: [PDF.js getting started](https://github.com/mozilla/pdf.js/blob/master/docs/contents/getting_started/index.md), [PDF.js rendering example](https://github.com/mozilla/pdf.js/blob/master/examples/learning/helloworld.html), [PDF.js text-layer discussion](https://github.com/mozilla/pdf.js/discussions/20010).

2. A PDF.js text layer is aligned by the same page viewport as the canvas. That is materially different from placing Neuron's page text in a generic Markdown block: PDF.js receives the page's text items and positions individual spans using the page transform, so browser selection follows the visible document geometry. Source: [PDF.js TextLayerBuilder discussion](https://github.com/mozilla/pdf.js/discussions/20010).

3. The existing Office pipeline already converts PowerPoint to PDF with LibreOffice. Reusing that converted PDF in PDF.js gives slides the same page geometry, selection behavior, zoom model, and highlight coordinate system as PDFs. Parsing PresentationML text separately is useful for indexing, but Microsoft documents it as a way to retrieve slide text—not as a rendered geometry/selection layer. Sources: [Microsoft PresentationML overview](https://learn.microsoft.com/en-us/office/open-xml/presentation/overview), [Microsoft: get all text in a slide](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-get-all-the-text-in-a-slide-in-a-presentation).

4. “Fit one page” should be computed from the page viewport and the viewer box, not from a fixed width percentage. PDF.js exposes intrinsic page dimensions through its viewport. For image fallback pages, CSS `object-fit: contain` preserves the aspect ratio and fits the entire image inside its box. Sources: [PDF.js examples](https://mozilla.github.io/pdf.js/examples/index.html), [MDN `object-fit`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/object-fit).

5. Neuron should keep its own annotation sidecar rather than attempting to mutate the source PDF/PPTX. The selection API supplies a live `Range`; its client rectangles can be normalized against the exact page box, while the durable anchor remains page/slide + quote + offsets. Source: [W3C Selection API](https://www.w3.org/TR/selection-api/).

## Options considered

### A. Keep the current raster page and improve the extracted-text panel

Reject as the primary solution. It can make text easier to select, but the selected words still do not correspond to the visible coordinates, and a highlight cannot be reliably drawn over the original text. It is a valid fallback for scanned PDFs and files where no digital text layer exists.

### B. Extract PowerPoint shape coordinates and build a custom slide text layer

Reject for the first implementation. It requires handling DrawingML transforms, text boxes, font metrics, wrapping, rotations, tables, grouped shapes, theme fonts, and LibreOffice/PowerPoint rendering differences. It duplicates work already solved by the existing PDF conversion step.

### C. Use PDF.js for the converted PDF surface and its official text layer

Recommend. It gives PDFs and converted slides one geometry model, native browser selection, page-aware rendering, zoom, and a path to precise selected-range rectangles. It adds a focused dependency and requires a small renderer adapter, worker configuration, and PDF.js CSS.

## Recommended design

Create a `PdfPageViewer` renderer component used for both `pdf` and `ppt/pptx` materials:

- Load the safe `neuron-file://visual/{materialId}` PDF URL through PDF.js.
- Render only the active page with a canvas and PDF.js `TextLayer`/`TextLayerBuilder` in one positioned page wrapper.
- Compute `fit` scale as `min((viewerWidth - padding) / pageWidth, (viewerHeight - padding) / pageHeight)`; never let fit mode create a vertical page scroll.
- Keep manual zoom as a multiplier over fit scale. At zoom above fit, allow intentional pan/scroll; at fit, keep the complete page visible.
- On text selection, accept only ranges inside the active PDF.js text layer. Capture selected text, page number, quote/offset data, and normalized `Range.getClientRects()` relative to the page wrapper.
- Render Neuron's saved normalized highlight rectangles above the PDF canvas but below the text layer; use `pointer-events: none` so selection remains native.
- Keep `Draw highlight` for scanned pages, diagrams, equations, and image-only PDFs. Region annotations continue to use normalized rectangles.
- Keep the extracted Markdown text below as a fallback/search/context surface, not as the primary PDF/PPT selection surface.

## Risks and mitigations

- Worker/bundler compatibility: add a renderer smoke test that opens a fixture PDF in the packaged Electron build and logs text-layer readiness. Pin a compatible `pdfjs-dist` version rather than relying on a transitive package.
- Custom Electron URL loading: verify PDF.js can fetch `neuron-file://visual/{id}` in the renderer. If range requests or worker fetches are incompatible, add a narrowly scoped preload method returning the PDF bytes and call `getDocument({ data })`; do not expose arbitrary paths.
- Scanned PDFs: PDF.js has no selectable text when the source has no text layer. Keep OCR/extracted-text selection and draw-region fallback explicit in the UI.
- Source changes: continue using the existing source hash and quote verification. Visual rectangles should be marked for review only when the source snapshot/hash changed.
- Performance: render one active page at a time, cancel stale render tasks when navigating, and cache the loaded PDF document per material.

## Research conclusion

The problem is not primarily a CSS sizing bug. It is a mismatch between a raster visual surface and a separately reconstructed text surface. The next implementation should establish one PDF.js page coordinate system for native PDFs and converted slides, then layer Neuron's sidecar annotations onto that system. Single-page fit should be a first-class viewport scale, not a wider image inside a scrolling column.

