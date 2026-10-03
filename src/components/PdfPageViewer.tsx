import React, { useEffect, useRef, useState } from 'react'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

export type PdfRect = { left: number; top: number; width: number; height: number }

interface PdfHighlight {
  id: number
  color?: string | null
  rects: PdfRect[]
}

interface PdfPageViewerProps {
  materialId: number
  sourceUrl: string
  fallbackUrl?: string
  pageNumber: number
  pageLabel: string
  zoom: number
  boldTextOverlay?: boolean
  drawMode: boolean
  highlights: PdfHighlight[]
  selectionRect?: PdfRect | null
  onRegionSelection: (rect: PdfRect, imageDataUrl: string | null) => void
}

type PdfPage = {
  getViewport: (options: { scale: number }) => any
  getTextContent: () => Promise<{ items: Array<{ str?: string }> }>
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; transform?: number[] }) => { promise: Promise<void>; cancel?: () => void }
}

export default function PdfPageViewer({ materialId, sourceUrl, fallbackUrl, pageNumber, pageLabel, zoom, boldTextOverlay = false, drawMode, highlights, selectionRect, onRegionSelection }: PdfPageViewerProps): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const textLayerInstanceRef = useRef<{ cancel?: () => void } | null>(null)
  const [page, setPage] = useState<PdfPage | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const [pageSize, setPageSize] = useState({ width: 800, height: 1000 })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [dragStart, setDragStart] = useState<{ left: number; top: number } | null>(null)
  const [dragRect, setDragRect] = useState<PdfRect | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorMessage('')
    setPage(null)
    async function loadPage(): Promise<void> {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        // The custom Electron URL is intentionally opaque. Prefer bytes when
        // available so PDF.js does not depend on custom-protocol range support.
        const byteLoader = (window.electronAPI as typeof window.electronAPI & { getMaterialVisualBytes?: (id: number) => Promise<Uint8Array | null> }).getMaterialVisualBytes
        let bytes: Uint8Array | null = null
        try {
          bytes = byteLoader ? await byteLoader(materialId) : null
        } catch {
          // Older installations may not have the byte bridge yet; retain the
          // opaque URL fallback while the app updates.
        }
        if (cancelled) return
        const loadingTask = bytes ? pdfjs.getDocument({ data: bytes }) : pdfjs.getDocument({ url: sourceUrl })
        const document = await loadingTask.promise
        const loadedPage = await document.getPage(pageNumber) as unknown as PdfPage
        if (cancelled) return
        const baseViewport = loadedPage.getViewport({ scale: 1 })
        if (cancelled) return
        setPageSize({ width: baseViewport.width, height: baseViewport.height })
        setPage(loadedPage)
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'The PDF page could not be rendered.')
      }
    }
    void loadPage()
    return () => { cancelled = true }
  }, [materialId, pageNumber, sourceUrl])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const updateFitScale = (): void => {
      const width = Math.max(1, element.clientWidth - 32)
      const height = Math.max(1, element.clientHeight - 32)
      setFitScale(Math.max(0.1, Math.min(width / pageSize.width, height / pageSize.height)))
    }
    updateFitScale()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateFitScale)
    observer.observe(element)
    return () => observer.disconnect()
  }, [pageSize])

  useEffect(() => {
    if (!page || !canvasRef.current || !textLayerRef.current || !pageRef.current) return
    let cancelled = false
    const viewportElement = viewportRef.current
    const previousScrollTop = viewportElement?.scrollTop || 0
    const previousScrollLeft = viewportElement?.scrollLeft || 0
    const scale = fitScale * Math.max(0.5, zoom)
    const viewport = page.getViewport({ scale })
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) return
    const outputScale = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const layer = textLayerRef.current
    layer.replaceChildren()
    layer.classList.toggle('text-overlay-visible', boldTextOverlay && !drawMode)
    layer.style.width = `${viewport.width}px`
    layer.style.height = `${viewport.height}px`
    const renderTask = page.render({ canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] })
    textLayerInstanceRef.current?.cancel?.()
    let textLayer: { render: () => Promise<unknown>; cancel?: () => void } | null = null
    void import('pdfjs-dist/legacy/build/pdf.mjs').then(async (pdfjs) => {
      if (cancelled || !textLayerRef.current) return
      const content = await page.getTextContent()
      if (cancelled || !textLayerRef.current) return
      textLayer = new pdfjs.TextLayer({ textContentSource: content as never, container: textLayerRef.current, viewport: viewport as never })
      textLayerInstanceRef.current = textLayer
      await textLayer.render()
    }).catch(() => { /* Canvas remains usable for region drawing if text rendering fails. */ })
    const restoreScrollFrame = window.requestAnimationFrame(() => {
      if (!cancelled && viewportElement) {
        viewportElement.scrollTop = previousScrollTop
        viewportElement.scrollLeft = previousScrollLeft
      }
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(restoreScrollFrame)
      renderTask.cancel?.()
      textLayer?.cancel?.()
      textLayerInstanceRef.current?.cancel?.()
      textLayerInstanceRef.current = null
    }
  }, [boldTextOverlay, drawMode, fitScale, page, zoom])

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>): { left: number; top: number } | null {
    const pageElement = pageRef.current
    if (!pageElement) return null
    const bounds = pageElement.getBoundingClientRect()
    return {
      left: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
      top: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)))
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode) return
    event.preventDefault()
    if ('pointerId' in event) event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = pointFromEvent(event)
    if (!point) return
    setDragStart(point)
    setDragRect({ ...point, width: 0, height: 0 })
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !dragStart) return
    const point = pointFromEvent(event)
    if (!point) return
    setDragRect({ left: Math.min(dragStart.left, point.left), top: Math.min(dragStart.top, point.top), width: Math.abs(point.left - dragStart.left), height: Math.abs(point.top - dragStart.top) })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drawMode || !dragStart) return
    const point = pointFromEvent(event)
    setDragStart(null)
    setDragRect(null)
    if (!point) return
    const rect = { left: Math.min(dragStart.left, point.left), top: Math.min(dragStart.top, point.top), width: Math.abs(point.left - dragStart.left), height: Math.abs(point.top - dragStart.top) }
    if (rect.width >= 0.005 && rect.height >= 0.005) {
      let imageDataUrl: string | null = null
      if (canvasRef.current && canvasRef.current.width > 0 && canvasRef.current.height > 0) {
        const crop = document.createElement('canvas')
        crop.width = Math.max(1, Math.round(rect.width * canvasRef.current.width))
        crop.height = Math.max(1, Math.round(rect.height * canvasRef.current.height))
        const context = crop.getContext('2d')
        if (context) {
          context.drawImage(canvasRef.current, Math.round(rect.left * canvasRef.current.width), Math.round(rect.top * canvasRef.current.height), crop.width, crop.height, 0, 0, crop.width, crop.height)
          imageDataUrl = crop.toDataURL('image/png')
        }
      }
      onRegionSelection(rect, imageDataUrl)
    }
  }

  const scalePercent = Math.round(fitScale * Math.max(0.5, zoom) * 100)
  return (
    <div ref={viewportRef} data-testid="pdf-page-viewport" className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-slate-200/70 p-4 dark:border-slate-700 dark:bg-slate-950">
      {status === 'loading' && <div className="absolute inset-0 z-30 flex items-center justify-center text-xs text-slate-500">Rendering {pageLabel}…</div>}
      {status === 'error' && <div className="absolute inset-0 z-30 flex items-center justify-center p-6 text-center text-xs text-amber-700 dark:text-amber-300">The visual page could not be rendered. Use the extracted text below or drag across the fallback page instead.<span className="sr-only">{errorMessage}</span></div>}
      {(page || fallbackUrl) && <div ref={pageRef} data-testid="visual-canvas" className={`relative shrink-0 bg-white shadow-md ${drawMode ? 'cursor-crosshair select-none' : ''}`} style={{ width: pageSize.width * fitScale * Math.max(0.5, zoom), height: pageSize.height * fitScale * Math.max(0.5, zoom), touchAction: drawMode ? 'none' : undefined }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onMouseDown={(event) => handlePointerDown(event as unknown as React.PointerEvent<HTMLDivElement>)} onMouseMove={(event) => handlePointerMove(event as unknown as React.PointerEvent<HTMLDivElement>)} onMouseUp={(event) => handlePointerUp(event as unknown as React.PointerEvent<HTMLDivElement>)}>
        {page ? <canvas ref={canvasRef} className="absolute inset-0 block" aria-label={`${pageLabel} rendered page`} /> : fallbackUrl && <img src={fallbackUrl} alt={`${pageLabel} fallback page`} className="absolute inset-0 block h-full w-full object-contain" onLoad={(event) => { const image = event.currentTarget; if (image.naturalWidth > 0 && image.naturalHeight > 0) setPageSize({ width: image.naturalWidth, height: image.naturalHeight }) }} />}
        <div ref={textLayerRef} className="textLayer neuron-pdf-text-layer pointer-events-none absolute inset-0 z-10" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
          {highlights.flatMap((highlight) => highlight.rects.map((rect, index) => <span key={`${highlight.id}-${index}`} data-testid="visual-highlight" className="absolute rounded-sm opacity-70 mix-blend-multiply" style={{ left: `${rect.left * 100}%`, top: `${rect.top * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: highlight.color || '#fde68a' }} />))}
          {selectionRect && <span data-testid="active-selection-region" className="absolute rounded-sm border-2 border-violet-500 bg-violet-300/20 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]" style={{ left: `${selectionRect.left * 100}%`, top: `${selectionRect.top * 100}%`, width: `${selectionRect.width * 100}%`, height: `${selectionRect.height * 100}%` }} />}
          {dragRect && <span data-testid="visual-drag-preview" className="absolute rounded-sm border-2 border-amber-500 bg-amber-300/35" style={{ left: `${dragRect.left * 100}%`, top: `${dragRect.top * 100}%`, width: `${dragRect.width * 100}%`, height: `${dragRect.height * 100}%` }} />}
        </div>
      </div>}
      <span className="absolute bottom-2 right-3 z-30 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-slate-900/80">{scalePercent}% fit scale</span>
    </div>
  )
}
