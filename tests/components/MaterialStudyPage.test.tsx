import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MaterialStudyPage from '../../src/pages/MaterialStudyPage'
import type { Material } from '../../src/types'

jest.mock('pdfjs-dist', () => {
  class TextLayer {
    constructor(private readonly options: { container: HTMLElement }) {}
    async render(): Promise<void> {
      const span = document.createElement('span')
      span.textContent = 'Scarcity means resources are limited.'
      span.style.left = '0px'
      span.style.top = '0px'
      span.style.fontSize = '16px'
      this.options.container.appendChild(span)
    }
    cancel(): void {}
  }
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    TextLayer,
    getDocument: jest.fn(() => ({
      promise: Promise.resolve({
        getPage: jest.fn().mockResolvedValue({
          getViewport: jest.fn(() => ({ width: 800, height: 1000 })),
          getTextContent: jest.fn().mockResolvedValue({ items: [{ str: 'Scarcity means resources are limited.' }] }),
          render: jest.fn(() => ({ promise: Promise.resolve(), cancel: jest.fn() }))
        })
      })
    }))
  }
})

const material: Material = {
  id: 10,
  subject_id: 1,
  filename: 'microeconomics.md',
  file_type: 'md',
  content_text: 'First concept: scarcity is the condition of limited resources.\n\nSecond concept: choice follows scarcity.',
  file_path: null,
  uploaded_at: '2026-10-01T00:00:00.000Z'
}

function renderWorkspace(testMaterial: Material = material): void {
  const testApi = window.electronAPI as unknown as Record<string, jest.Mock>
  testApi.getMaterial.mockResolvedValue(testMaterial)
  render(
    <MemoryRouter initialEntries={['/subject/1/material/10']}>
      <Routes>
        <Route path="/subject/:subjectId/material/:materialId" element={<MaterialStudyPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MaterialStudyPage selection actions', () => {
  const api = window.electronAPI as unknown as Record<string, jest.Mock>

  beforeEach(() => {
    jest.resetAllMocks()
    localStorage.clear()
    api.getMaterial.mockResolvedValue(material)
    api.getSubjects.mockResolvedValue([])
    api.reconcileMaterialAnnotations.mockResolvedValue([])
    api.getMaterialFileUrl.mockResolvedValue(null)
    api.getMaterialVisualUrl.mockResolvedValue(null)
    api.getMaterialVisualPageCount.mockResolvedValue(null)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('does not change the active unit or reset scroll when the study viewer scrolls', async () => {
    renderWorkspace()
    const viewer = await screen.findByTestId('material-viewer')
    viewer.scrollTop = 48
    fireEvent.scroll(viewer)
    expect(viewer.scrollTop).toBe(48)
    expect(screen.getByText(/CUES & NOTES · SECTION 1/i)).toBeInTheDocument()
  })

  it('autosaves a summary and keeps its draft while annotations refresh', async () => {
    jest.useFakeTimers()
    renderWorkspace()
    const summary = await screen.findByPlaceholderText(/Summarize section 1/i)
    fireEvent.change(summary, { target: { value: 'A durable summary.' } })
    expect(localStorage.getItem('neuron:material-study:summary:10:0')).toBe('A durable summary.')

    await act(async () => { jest.advanceTimersByTime(900) })
    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'summary',
      body: 'A durable summary.'
    })))
  })

  it('restores note drafts and clears them only after Add note succeeds', async () => {
    localStorage.setItem('neuron:material-study:cue:10:0', 'Recover this note.')
    api.saveDocumentAnnotation.mockResolvedValueOnce({ id: 90, kind: 'cue', body: 'Recover this note.', deleted_at: null })
    renderWorkspace()
    const note = await screen.findByPlaceholderText('Write a cue or note…')
    expect(note).toHaveValue('Recover this note.')
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(localStorage.getItem('neuron:material-study:cue:10:0')).toBeNull())
  })

  it('opens the selection toolbar and dismisses it when selection is cleared by clicking away', async () => {
    const selection = {
      toString: () => 'scarcity',
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace()

    const text = await screen.findByText(/First concept:/)
    fireEvent.mouseUp(text)
    expect(await screen.findByLabelText('Highlighted text')).toHaveValue('scarcity')

    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByLabelText('Highlighted text')).not.toBeInTheDocument())
  })

  it('floats the selection editor without moving the document viewer', async () => {
    const selection = {
      toString: () => 'scarcity',
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace()

    const viewer = await screen.findByTestId('material-viewer')
    viewer.scrollTop = 48
    fireEvent.mouseUp(await screen.findByText(/First concept:/))

    const editor = (await screen.findByText('Highlight editor')).closest('section')
    expect(screen.getByTestId('highlight-editor-overlay')).toHaveClass('pointer-events-none', 'absolute', 'top-[-4rem]', 'z-50')
    expect(editor).toHaveClass('pointer-events-auto', 'max-h-[min(42rem,calc(100vh-13rem))]', 'overflow-y-auto')
    expect(editor).not.toHaveClass('shrink-0')
    expect(viewer).toHaveAttribute('data-testid', 'material-viewer')
    expect(viewer.scrollTop).toBe(48)
  })

  it('dismisses the selection toolbar when the browser selection collapses', async () => {
    const selection = {
      toString: jest.fn(() => 'scarcity'),
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace()

    fireEvent.mouseUp(await screen.findByText(/First concept:/))
    expect(await screen.findByLabelText('Highlighted text')).toHaveValue('scarcity')

    selection.toString.mockReturnValue('')
    fireEvent(document, new Event('selectionchange'))
    await waitFor(() => expect(screen.queryByLabelText('Highlighted text')).not.toBeInTheDocument())
  })

  it('creates an editable card draft from the current selection before saving', async () => {
    const selection = {
      toString: () => 'scarcity',
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    api.tutorExtractCardFromSnippet.mockResolvedValueOnce({
      success: true,
      normalizedText: 'Scarcity is the condition of limited resources.',
      cards: [{ front: 'What is scarcity?', back: 'Limited resources relative to wants.', type: 'flashcard', concept: 'Scarcity' }]
    })
    renderWorkspace()

    fireEvent.mouseUp(await screen.findByText(/First concept:/))
    fireEvent.click(await screen.findByRole('button', { name: 'Card' }))

    expect(await screen.findByText('Editable AI card preview')).toBeInTheDocument()
    expect(screen.getByLabelText('Flashcard front')).toHaveValue('What is scarcity?')
    expect(screen.getByLabelText('Flashcard back')).toHaveValue('Limited resources relative to wants.')
    expect(screen.getByLabelText('Highlighted text')).toHaveValue('Scarcity is the condition of limited resources.')
    expect(screen.getByLabelText('Flashcard feedback')).toBeInTheDocument()
    expect(api.tutorExtractCardFromSnippet).toHaveBeenCalledWith(
      1,
      expect.stringContaining('Surrounding material context:'),
      'microeconomics.md',
      expect.objectContaining({
        highlightText: 'scarcity',
        sourceContext: expect.stringContaining('First concept: scarcity'),
        materialTitle: 'microeconomics.md'
      })
    )
  })

  it('saves the first generated card without requiring feedback', async () => {
    const selection = {
      toString: () => 'scarcity',
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    api.tutorExtractCardFromSnippet.mockResolvedValueOnce({
      success: true,
      normalizedText: 'Scarcity limits available choices.',
      cards: [{ front: 'What does scarcity limit?', back: 'Available choices.', type: 'flashcard', concept: 'Scarcity' }]
    })
    renderWorkspace()

    fireEvent.mouseUp(await screen.findByText(/First concept:/))
    fireEvent.click(await screen.findByRole('button', { name: 'Card' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save card' }))

    await waitFor(() => expect(api.saveCard).toHaveBeenCalledWith(expect.objectContaining({
      front: 'What does scarcity limit?',
      source: 'highlight'
    })))
  })

  it('saves a selection comment as a child of its highlight', async () => {
    const selection = {
      toString: () => 'scarcity',
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    api.saveDocumentAnnotation
      .mockResolvedValueOnce({ id: 41, kind: 'highlight', selected_text: 'scarcity', deleted_at: null })
      .mockResolvedValueOnce({ id: 42, kind: 'comment', parent_id: 41, body: 'Why is this limited?', deleted_at: null })
    renderWorkspace()

    fireEvent.mouseUp(await screen.findByText(/First concept:/))
    fireEvent.change(screen.getByPlaceholderText('Optional comment or question…'), { target: { value: 'Why is this limited?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save highlight' }))

    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledTimes(2))
    expect(api.saveDocumentAnnotation.mock.calls[1][0]).toEqual(expect.objectContaining({
      kind: 'comment',
      parent_id: 41,
      body: 'Why is this limited?'
    }))
  })

  it('persists the learner-selected highlight color with the page-aware locator', async () => {
    const selection = {
      toString: () => 'scarcity',
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    api.saveDocumentAnnotation.mockResolvedValueOnce({ id: 43, kind: 'highlight', selected_text: 'scarcity', deleted_at: null })
    renderWorkspace()

    fireEvent.mouseUp(await screen.findByText(/First concept:/))
    fireEvent.click(screen.getByRole('button', { name: 'Use Blue highlight' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save highlight' }))

    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'highlight',
      color: '#bfdbfe',
      locator: expect.objectContaining({ page: 1, quote: 'scarcity' })
    })))
  })

  it('supports AI card revision before saving the accepted card to the material deck', async () => {
    const selection = {
      toString: () => 'scarcity',
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    api.tutorExtractCardFromSnippet
      .mockResolvedValueOnce({ success: true, cards: [{ front: 'What is scarcity?', back: 'Limited resources.', type: 'flashcard', concept: 'Scarcity' }] })
      .mockResolvedValueOnce({ success: true, cards: [{ front: 'Why does scarcity force choice?', back: 'Because resources have alternative uses.', type: 'flashcard', concept: 'Scarcity' }] })
    renderWorkspace()

    fireEvent.mouseUp(await screen.findByText(/First concept:/))
    fireEvent.click(await screen.findByRole('button', { name: 'Card' }))
    fireEvent.change(await screen.findByLabelText('Flashcard feedback'), { target: { value: 'Make it an application question.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revise with feedback' }))

    await waitFor(() => expect(screen.getByLabelText('Flashcard front')).toHaveValue('Why does scarcity force choice?'))
    expect(api.tutorExtractCardFromSnippet.mock.calls[1][1]).toContain('Learner revision request:')
    expect(api.tutorExtractCardFromSnippet.mock.calls[1][3]).toEqual(expect.objectContaining({
      feedback: 'Make it an application question.',
      previousCard: expect.objectContaining({ front: 'What is scarcity?' })
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }))

    await waitFor(() => expect(api.saveCard).toHaveBeenCalledWith(expect.objectContaining({
      subject_id: 1,
      material_id: 10,
      source: 'highlight',
      front: 'Why does scarcity force choice?'
    })))
  })

  it('keeps the selection toolbar and learner text intact when card generation fails', async () => {
    const selection = {
      toString: () => 'scarcity',
      removeAllRanges: jest.fn()
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    api.tutorExtractCardFromSnippet.mockRejectedValueOnce(new Error('Provider unavailable'))
    renderWorkspace()

    fireEvent.mouseUp(await screen.findByText(/First concept:/))
    fireEvent.click(await screen.findByRole('button', { name: 'Card' }))

    await waitFor(() => expect(screen.getByText('Provider unavailable')).toBeInTheDocument())
    expect(screen.getByLabelText('Highlighted text')).toHaveValue('scarcity')
    expect(screen.getByRole('button', { name: 'Card' })).toBeInTheDocument()
  })

  it('renders image materials through the canonical material source', async () => {
    const imageMaterial = { ...material, filename: 'diagram.png', file_type: 'image', content_text: 'OCR text from diagram.' }
    api.getMaterial.mockResolvedValue(imageMaterial)
    api.getMaterialFileUrl.mockResolvedValue('neuron-file://material/10')
    renderWorkspace(imageMaterial)

    const image = await screen.findByRole('img', { name: 'Page 1 of diagram.png' })
    expect(image).toHaveAttribute('src', 'neuron-file://material/10')
    expect(screen.getByText(/CUES & NOTES · PAGE 1/i)).toBeInTheDocument()
    expect(screen.getByText('OCR text from diagram.')).toBeInTheDocument()
  })

  it('renders EPUB materials with a chapter-aware visual frame and Cornell unit label', async () => {
    const epubMaterial = {
      ...material,
      filename: 'textbook.epub',
      file_type: 'epub',
      content_text: '--- Chapter 1 ---\nChapter one text.\n\n--- Chapter 2 ---\nChapter two text.'
    }
    api.getMaterial.mockResolvedValue(epubMaterial)
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    renderWorkspace(epubMaterial)

    const frame = await screen.findByTitle('Original view of textbook.epub')
    expect(frame).toHaveAttribute('src', 'neuron-file://visual-epub-page/10/1')
    expect(screen.getByText(/CUES & NOTES · CHAPTER 1/i)).toBeInTheDocument()
    expect(screen.getByText(/SUMMARY · CHAPTER 1/i)).toBeInTheDocument()
  })

  it('explains how to restore an EPUB original when the linked source is unavailable', async () => {
    const epubMaterial = {
      ...material,
      filename: 'missing-textbook.epub',
      file_type: 'epub',
      content_text: '--- Chapter 1 ---\nSaved extracted chapter text.'
    }
    api.getMaterialVisualUrl.mockResolvedValue(null)
    api.getMaterialFileUrl.mockResolvedValue(null)
    renderWorkspace(epubMaterial)

    expect(await screen.findByText(/original file is not currently available/i)).toBeInTheDocument()
    expect(screen.getByText(/sync the linked class folder again/i)).toBeInTheDocument()
  })

  it('persists EPUB highlights, comments, notes, and summaries with chapter locators', async () => {
    const epubMaterial = {
      ...material,
      filename: 'textbook.epub',
      file_type: 'epub',
      content_text: '--- Chapter 1 ---\nChapter one text.'
    }
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.saveDocumentAnnotation
      .mockResolvedValueOnce({ id: 81, kind: 'highlight', selected_text: 'Chapter one', deleted_at: null })
      .mockResolvedValueOnce({ id: 82, kind: 'comment', parent_id: 81, body: 'Why?', deleted_at: null })
      .mockResolvedValueOnce({ id: 83, kind: 'cue', body: 'Remember this', deleted_at: null })
      .mockResolvedValueOnce({ id: 84, kind: 'summary', body: 'Chapter summary', deleted_at: null })
    const selection = { toString: () => 'Chapter one', removeAllRanges: jest.fn() }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace(epubMaterial)

    fireEvent.mouseUp(await screen.findByText(/Chapter one text/))
    fireEvent.change(screen.getByPlaceholderText('Optional comment or question…'), { target: { value: 'Why?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save highlight' }))

    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'highlight',
      locator: expect.objectContaining({ chapter: '1' })
    })))

    fireEvent.change(screen.getByPlaceholderText('Write a cue or note…'), { target: { value: 'Remember this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'cue',
      locator: expect.objectContaining({ chapter: '1' })
    })))

    fireEvent.change(screen.getByPlaceholderText(/Summarize chapter 1/i), { target: { value: 'Chapter summary' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }))
    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'summary',
      locator: expect.objectContaining({ chapter: '1' })
    })))
  })

  it('keeps extracted slide text directly below the visual slide', async () => {
    const pptMaterial = {
      ...material,
      filename: 'lecture.pptx',
      file_type: 'pptx',
      content_text: '--- Slide 1 ---\nScarcity means resources are limited.'
    }
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    const selection = { toString: () => 'Scarcity', removeAllRanges: jest.fn() }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace(pptMaterial)

    const selectableCopies = await screen.findAllByText(/Scarcity means resources are limited/)
    fireEvent.mouseUp(selectableCopies[selectableCopies.length - 1])
    expect(await screen.findByLabelText('Highlighted text')).toHaveValue('Scarcity')
  })

  it('clears a previous selection when moving to another page or slide', async () => {
    const pptMaterial = {
      ...material,
      filename: 'lecture.pptx',
      file_type: 'pptx',
      content_text: '--- Slide 1 ---\nScarcity means resources are limited.\n\n--- Slide 2 ---\nChoice follows scarcity.'
    }
    api.getMaterial.mockResolvedValue(pptMaterial)
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    const selection = { toString: () => 'Scarcity', removeAllRanges: jest.fn() }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace(pptMaterial)

    const selectableCopies = await screen.findAllByText(/Scarcity means resources are limited/)
    fireEvent.mouseUp(selectableCopies[selectableCopies.length - 1])
    expect(await screen.findByLabelText('Highlighted text')).toHaveValue('Scarcity')

    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    await waitFor(() => expect(screen.queryByLabelText('Highlighted text')).not.toBeInTheDocument())
    expect(screen.getByText(/CUES & NOTES · SLIDE 2/i)).toBeInTheDocument()
  })

  it('persists a page-aware locator when selecting extracted PowerPoint text', async () => {
    const pptMaterial = {
      ...material,
      filename: 'lecture.pptx',
      file_type: 'pptx',
      content_text: '--- Slide 1 ---\nScarcity means resources are limited.'
    }
    const selection = {
      toString: () => 'Scarcity',
      removeAllRanges: jest.fn(),
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    api.saveDocumentAnnotation.mockResolvedValueOnce({ id: 63, kind: 'highlight', selected_text: 'Scarcity', deleted_at: null })
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    renderWorkspace(pptMaterial)

    const selectableCopies = await screen.findAllByText(/Scarcity means resources are limited/)
    fireEvent.mouseUp(selectableCopies[selectableCopies.length - 1])
    fireEvent.click(await screen.findByRole('button', { name: 'Save highlight' }))

    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      locator: expect.objectContaining({
        slide: 1,
        quote: 'Scarcity'
      })
    })))
  })

  it('supports drawing a highlight rectangle directly on the original PowerPoint slide', async () => {
    const pptMaterial = {
      ...material,
      filename: 'lecture.pptx',
      file_type: 'pptx',
      content_text: '--- Slide 1 ---\nA diagram is embedded in this slide.'
    }
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.saveDocumentAnnotation.mockResolvedValueOnce({ id: 64, kind: 'highlight', selected_text: 'Visual region on Slide 1', deleted_at: null })
    renderWorkspace(pptMaterial)

    const canvas = await screen.findByTestId('visual-canvas')
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.mouseDown(canvas, { clientX: 100, clientY: 120 })
    fireEvent.mouseMove(canvas, { clientX: 400, clientY: 240 })
    expect(screen.getByTestId('visual-drag-preview')).toBeInTheDocument()
    fireEvent.mouseUp(canvas, { clientX: 400, clientY: 240 })

    fireEvent.change(await screen.findByLabelText('Highlighted text'), { target: { value: 'Diagram text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save highlight' }))
    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      selected_text: 'Diagram text',
      locator: expect.objectContaining({
        slide: 1,
        rects: [expect.objectContaining({ left: 0.1, top: 0.2, width: expect.closeTo(0.3), height: 0.2 })]
      })
    })))
  })

  it('supports drawing a highlight rectangle directly on the original PDF page', async () => {
    const pdfMaterial = {
      ...material,
      filename: 'chapter.pdf',
      file_type: 'pdf',
      content_text: '--- Page 1 ---\nA scanned equation is embedded on this page.'
    }
    api.getMaterial.mockResolvedValue(pdfMaterial)
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.saveDocumentAnnotation.mockResolvedValueOnce({ id: 65, kind: 'highlight', selected_text: 'Visual region on Page 1', deleted_at: null })
    renderWorkspace(pdfMaterial)

    const canvas = await screen.findByTestId('visual-canvas')
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 1000, right: 800, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.mouseDown(canvas, { clientX: 80, clientY: 200 })
    fireEvent.mouseUp(canvas, { clientX: 320, clientY: 280 })
    fireEvent.change(await screen.findByLabelText('Highlighted text'), { target: { value: 'Equation text' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save highlight' }))

    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      selected_text: 'Equation text',
      locator: expect.objectContaining({ page: 1, rects: [expect.objectContaining({ left: 0.1, top: 0.2, width: expect.closeTo(0.3), height: expect.closeTo(0.08) })] })
    })))
  })

  it('supports drawing a highlight rectangle directly on an image material', async () => {
    const imageMaterial = { ...material, filename: 'diagram.png', file_type: 'image', content_text: 'OCR text from diagram.' }
    api.getMaterialFileUrl.mockResolvedValue('neuron-file://material/10')
    api.saveDocumentAnnotation.mockResolvedValueOnce({ id: 66, kind: 'highlight', selected_text: 'Visual region on Page 1', deleted_at: null })
    renderWorkspace(imageMaterial)

    const canvas = await screen.findByTestId('visual-canvas')
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.mouseDown(canvas, { clientX: 80, clientY: 160 })
    fireEvent.mouseUp(canvas, { clientX: 320, clientY: 320 })
    fireEvent.change(await screen.findByLabelText('Highlighted text'), { target: { value: 'Diagram text' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Save highlight' }))

    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      selected_text: 'Diagram text',
      locator: expect.objectContaining({ page: 1, rects: [expect.objectContaining({ left: 0.1, top: 0.2, width: expect.closeTo(0.3), height: expect.closeTo(0.2) })] })
    })))
  })

  it('keeps PDF extracted-text selection below the original page instead of misaligning it over the image', async () => {
    const pdfMaterial = {
      ...material,
      filename: 'chapter.pdf',
      file_type: 'pdf',
      content_text: '--- Page 1 ---\nScarcity means resources are limited.'
    }
    api.getMaterial.mockResolvedValue(pdfMaterial)
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.saveDocumentAnnotation.mockResolvedValueOnce({ id: 66, kind: 'highlight', selected_text: 'Scarcity', deleted_at: null })
    const selection = {
      toString: () => 'Scarcity',
      removeAllRanges: jest.fn(),
      rangeCount: 1,
      getRangeAt: () => ({ commonAncestorContainer: document.createElement('span'), getClientRects: () => [{ left: 10, top: 20, width: 30, height: 8 }] })
    }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace(pdfMaterial)

    expect(await screen.findByText('Extracted study text')).toBeInTheDocument()
    const extractedTextCopies = screen.getAllByText(/Scarcity means resources are limited/)
    fireEvent.mouseUp(extractedTextCopies[extractedTextCopies.length - 1])
    fireEvent.click(await screen.findByRole('button', { name: 'Save highlight' }))

    await waitFor(() => expect(api.saveDocumentAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      selected_text: 'Scarcity',
      locator: expect.not.objectContaining({ rects: expect.anything() })
    })))
  })

  it('renders a saved PowerPoint highlight directly over the original visual slide', async () => {
    const pptMaterial = {
      ...material,
      filename: 'lecture.pptx',
      file_type: 'pptx',
      content_text: '--- Slide 1 ---\nScarcity means resources are limited.'
    }
    const visualHighlight = {
      id: 61,
      kind: 'highlight',
      selected_text: 'Scarcity',
      body: '',
      deleted_at: null,
      locator_json: JSON.stringify({ slide: 1, rects: [{ left: 0.12, top: 0.2, width: 0.3, height: 0.04 }] })
    }
    api.getMaterial.mockResolvedValue(pptMaterial)
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.reconcileMaterialAnnotations.mockResolvedValueOnce([]).mockResolvedValueOnce([visualHighlight])
    api.saveDocumentAnnotation.mockResolvedValueOnce(visualHighlight)
    const selection = { toString: () => 'Scarcity', removeAllRanges: jest.fn() }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace(pptMaterial)

    const selectableCopies = await screen.findAllByText(/Scarcity means resources are limited/)
    fireEvent.mouseUp(selectableCopies[selectableCopies.length - 1])
    fireEvent.click(await screen.findByRole('button', { name: 'Save highlight' }))

    expect(await screen.findByTestId('visual-highlight')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove highlight' }))
    await waitFor(() => expect(api.deleteDocumentAnnotation).toHaveBeenCalledWith(61))
  })

  it('renders a saved PDF highlight directly over the original visual page', async () => {
    const pdfMaterial = {
      ...material,
      filename: 'chapter.pdf',
      file_type: 'pdf',
      content_text: '--- Page 1 ---\nScarcity means resources are limited.'
    }
    const visualHighlight = {
      id: 62,
      kind: 'highlight',
      selected_text: 'Scarcity',
      body: '',
      deleted_at: null,
      locator_json: JSON.stringify({ page: 1, rects: [{ left: 0.18, top: 0.3, width: 0.24, height: 0.035 }] })
    }
    api.getMaterial.mockResolvedValue(pdfMaterial)
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/11')
    api.reconcileMaterialAnnotations.mockResolvedValueOnce([]).mockResolvedValueOnce([visualHighlight])
    api.saveDocumentAnnotation.mockResolvedValueOnce(visualHighlight)
    const selection = { toString: () => 'Scarcity', removeAllRanges: jest.fn() }
    jest.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection)
    renderWorkspace(pdfMaterial)

    const selectableCopies = await screen.findAllByText(/Scarcity means resources are limited/)
    fireEvent.mouseUp(selectableCopies[selectableCopies.length - 1])
    fireEvent.click(await screen.findByRole('button', { name: 'Save highlight' }))

    expect(await screen.findByTestId('visual-highlight')).toBeInTheDocument()
  })

  it('lists annotations across the document with page or slide jump targets', async () => {
    const pptMaterial = {
      ...material,
      filename: 'lecture.pptx',
      file_type: 'pptx',
      content_text: '--- Slide 1 ---\nScarcity means resources are limited.\n\n--- Slide 2 ---\nChoice follows scarcity.'
    }
    api.getMaterial.mockResolvedValue(pptMaterial)
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.reconcileMaterialAnnotations.mockResolvedValue([
      { id: 51, kind: 'highlight', selected_text: 'Choice follows scarcity.', body: '', locator_json: JSON.stringify({ slide: 2, quote: 'Choice follows scarcity.' }), deleted_at: null },
      { id: 52, kind: 'question', selected_text: '', body: 'Why must choices be made?', locator_json: JSON.stringify({ slide: 1 }), deleted_at: null }
    ])
    renderWorkspace(pptMaterial)

    expect(await screen.findByText('All document annotations')).toBeInTheDocument()
    expect(screen.getByText('Slide 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /highlight.*Slide 2/i }))
    expect(await screen.findByText(/CUES & NOTES · SLIDE 2/i)).toBeInTheDocument()
  })

  it('uses the visual Office page count instead of paragraph count for Cornell units', async () => {
    const wordMaterial = {
      ...material,
      filename: 'seminar.docx',
      file_type: 'docx',
      content_text: 'Page one paragraph.\n\nPage two paragraph.\n\nPage three paragraph.\n\nPage three continuation.'
    }
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.getMaterialVisualPageCount.mockResolvedValue(3)
    renderWorkspace(wordMaterial)

    expect(await screen.findByText(/PAGE 1 OF 3/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Page 1 of seminar.docx' })).toHaveAttribute('src', 'neuron-file://visual-page/10/1')
    expect(screen.getByText(/CUES & NOTES · PAGE 1/i)).toBeInTheDocument()
  })

  it('uses the visual PDF page count instead of arbitrary extracted-text chunks', async () => {
    const pdfMaterial = {
      ...material,
      filename: 'textbook.pdf',
      file_type: 'pdf',
      content_text: 'Paragraph one.\n\nParagraph two.\n\nParagraph three.\n\nParagraph four.'
    }
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.getMaterialVisualPageCount.mockResolvedValue(3)
    renderWorkspace(pdfMaterial)

    expect(await screen.findByText(/PAGE 1 OF 3/i)).toBeInTheDocument()
    expect(screen.getByTestId('visual-canvas')).toBeInTheDocument()
    expect(screen.getByText(/CUES & NOTES · PAGE 1/i)).toBeInTheDocument()
    expect(screen.queryByText(/SECTION 4 OF/i)).not.toBeInTheDocument()
  })

  it('keeps rendered pages navigable when a source has only one extracted text block', async () => {
    const pdfMaterial = {
      ...material,
      filename: 'scanned-textbook.pdf',
      file_type: 'pdf',
      content_text: 'One extracted text block for the whole document.'
    }
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.getMaterialVisualPageCount.mockResolvedValue(3)
    renderWorkspace(pdfMaterial)

    expect(await screen.findByText(/PAGE 1 OF 3/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(await screen.findByText(/PAGE 2 OF 3/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(await screen.findByText(/PAGE 3 OF 3/i)).toBeInTheDocument()
  })

  it('keeps all visual pages navigable when a scanned source has no extracted text', async () => {
    const pdfMaterial = {
      ...material,
      filename: 'image-only-scan.pdf',
      file_type: 'pdf',
      content_text: ''
    }
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.getMaterialVisualPageCount.mockResolvedValue(3)
    renderWorkspace(pdfMaterial)

    expect(await screen.findByText(/PAGE 1 OF 3/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(await screen.findByText(/PAGE 3 OF 3/i)).toBeInTheDocument()
  })

  it('applies the shared zoom controls to the original EPUB chapter view', async () => {
    const epubMaterial = {
      ...material,
      filename: 'textbook.epub',
      file_type: 'epub',
      content_text: '--- Chapter 1 ---\nChapter content.'
    }
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/epub')
    api.getMaterialVisualPageCount.mockResolvedValue(1)
    renderWorkspace(epubMaterial)

    await screen.findByTitle('Original view of textbook.epub')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('110%')).toBeInTheDocument()
  })

  it('restores the last page or slide when the material is reopened', async () => {
    const wordMaterial = {
      ...material,
      filename: 'seminar.docx',
      file_type: 'docx',
      content_text: 'Page one paragraph.\n\nPage two paragraph.\n\nPage three paragraph.'
    }
    localStorage.setItem('neuron:material-study:last-unit:10', '1')
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    api.getMaterialVisualPageCount.mockResolvedValue(3)
    renderWorkspace(wordMaterial)

    expect(await screen.findByText(/PAGE 2 OF 3/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Page 2 of seminar.docx' })).toHaveAttribute('src', 'neuron-file://visual-page/10/2')
    expect(screen.getByText(/CUES & NOTES · PAGE 2/i)).toBeInTheDocument()
  })

  it('updates the workspace zoom percentage without changing the active page', async () => {
    api.getMaterialVisualUrl.mockResolvedValue('neuron-file://visual/10')
    renderWorkspace({ ...material, file_type: 'pdf', filename: 'chapter.pdf' })

    await screen.findByText(/PAGE 1 OF/i)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('110%')).toBeInTheDocument()
    expect(screen.getByTestId('visual-canvas')).toHaveStyle({ width: '88px' })
    expect(screen.getByText(/PAGE 1 OF/i)).toBeInTheDocument()
  })
})
