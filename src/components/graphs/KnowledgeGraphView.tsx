import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles,
  Search,
  Filter,
  Layers,
  Network,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Lock,
  Zap,
  Flame,
  CheckCircle2,
  X,
  Play,
  MessageSquare
} from '../icons'
import {
  buildConceptGraph
} from '../../lib/conceptGraphEngine'
import type {
  ConceptGraphNode,
  ConceptDependency,
  ConceptMastery,
  SyllabusModule,
  ModuleTopic,
  Card
} from '../../types'

export interface KnowledgeGraphViewProps {
  subjectId: number
  subjectName?: string
  dependencies?: ConceptDependency[]
  concepts?: ConceptMastery[]
  modules?: (SyllabusModule & { topics?: ModuleTopic[] })[]
  cards?: Card[]
  onAddDependency?: (prereq: string, target: string) => Promise<void>
  onDeleteDependency?: (prereq: string, target: string) => Promise<void>
  onOpenTutor?: (concept: string) => void
}

type FilterOption = 'all' | 'gaps' | 'blocked' | 'learning' | 'mastered' | 'bottlenecks'

export default function KnowledgeGraphView({
  subjectId,
  subjectName,
  dependencies = [],
  concepts = [],
  modules = [],
  cards = [],
  onAddDependency,
  onDeleteDependency,
  onOpenTutor
}: KnowledgeGraphViewProps): React.JSX.Element {
  const navigate = useNavigate()

  // State
  const [layoutMode, setLayoutMode] = useState<'hierarchical' | 'force'>('hierarchical')
  const [filter, setFilter] = useState<FilterOption>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showAddLinkModal, setShowAddLinkModal] = useState(false)
  const [newLinkPrereq, setNewLinkPrereq] = useState('')
  const [newLinkTarget, setNewLinkTarget] = useState('')
  const [isSavingLink, setIsSavingLink] = useState(false)

  // Zoom / Pan state & smooth animation refs
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const targetZoomRef = useRef(1.0)
  const currentZoomRef = useRef(1.0)
  const targetPanRef = useRef({ x: 0, y: 0 })
  const currentPanRef = useRef({ x: 0, y: 0 })
  const animFrameRef = useRef<number | null>(null)

  // Pan inertia velocity tracking
  const lastMoveTimeRef = useRef(0)
  const velocityRef = useRef({ vx: 0, vy: 0 })
  const inertiaFrameRef = useRef<number | null>(null)

  // Node Dragging state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [draggedPositions, setDraggedPositions] = useState<Record<string, { x: number; y: number }>>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [canvasDim, setCanvasDim] = useState({ width: 900, height: 600 })

  useEffect(() => {
    function updateDimensions() {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current
        setCanvasDim({
          width: Math.max(clientWidth, 600),
          height: Math.max(clientHeight, 500)
        })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Animation step loop (exponential ease lerp for silky smooth 60fps transitions)
  const startAnimation = useCallback(() => {
    if (animFrameRef.current) return

    const step = () => {
      const diffZ = targetZoomRef.current - currentZoomRef.current
      const diffPx = targetPanRef.current.x - currentPanRef.current.x
      const diffPy = targetPanRef.current.y - currentPanRef.current.y

      const isZoomClose = Math.abs(diffZ) < 0.001
      const isPanClose = Math.abs(diffPx) < 0.4 && Math.abs(diffPy) < 0.4

      if (isZoomClose && isPanClose) {
        currentZoomRef.current = targetZoomRef.current
        currentPanRef.current = { ...targetPanRef.current }
        setZoom(currentZoomRef.current)
        setPan(currentPanRef.current)
        animFrameRef.current = null
        return
      }

      currentZoomRef.current += diffZ * 0.22
      currentPanRef.current = {
        x: currentPanRef.current.x + diffPx * 0.22,
        y: currentPanRef.current.y + diffPy * 0.22
      }

      setZoom(currentZoomRef.current)
      setPan({ ...currentPanRef.current })

      animFrameRef.current = requestAnimationFrame(step)
    }

    animFrameRef.current = requestAnimationFrame(step)
  }, [])

  // Cleanup animation frames on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (inertiaFrameRef.current) cancelAnimationFrame(inertiaFrameRef.current)
    }
  }, [])

  // 1. Build Graph
  const graphData = useMemo(() => {
    return buildConceptGraph({
      subjectId,
      dependencies,
      concepts,
      modules,
      cards,
      layoutWidth: canvasDim.width,
      layoutHeight: canvasDim.height,
      layoutMode
    })
  }, [subjectId, dependencies, concepts, modules, cards, canvasDim.width, canvasDim.height, layoutMode])

  const getNodePos = useCallback((nodeId: string): { x: number; y: number } => {
    if (draggedPositions[nodeId]) return draggedPositions[nodeId]
    const n = graphData.nodes.find(node => node.id === nodeId)
    return { x: n?.x ?? 0, y: n?.y ?? 0 }
  }, [draggedPositions, graphData.nodes])

  // Fit to screen calculation
  const handleFitView = useCallback(() => {
    if (graphData.nodes.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of graphData.nodes) {
      const pos = getNodePos(n.id)
      if (pos.x < minX) minX = pos.x
      if (pos.x > maxX) maxX = pos.x
      if (pos.y < minY) minY = pos.y
      if (pos.y > maxY) maxY = pos.y
    }

    const pad = 80
    const graphW = Math.max(maxX - minX + pad * 2, 400)
    const graphH = Math.max(maxY - minY + pad * 2, 300)

    const scaleX = (canvasDim.width - 40) / graphW
    const scaleY = (canvasDim.height - 40) / graphH
    const fitZoom = Math.max(0.32, Math.min(scaleX, scaleY, 1.15))

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    const newPanX = canvasDim.width / 2 - centerX * fitZoom
    const newPanY = canvasDim.height / 2 - centerY * fitZoom

    targetZoomRef.current = fitZoom
    targetPanRef.current = { x: newPanX, y: newPanY }
    startAnimation()
  }, [graphData.nodes, getNodePos, canvasDim, startAnimation])

  // Auto-fit on graph load or layout switch
  useEffect(() => {
    if (graphData.nodes.length === 0) return undefined
    const timer = setTimeout(() => {
      handleFitView()
    }, 50)
    return () => clearTimeout(timer)
  }, [graphData.nodes.length, layoutMode, handleFitView])

  // Smooth Zoom By Factor relative to coordinate
  const zoomByFactor = useCallback((factor: number, centerX?: number, centerY?: number) => {
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current)
      inertiaFrameRef.current = null
    }

    const cx = centerX ?? canvasDim.width / 2
    const cy = centerY ?? canvasDim.height / 2

    const curZ = targetZoomRef.current
    const curPx = targetPanRef.current.x
    const curPy = targetPanRef.current.y

    const worldX = (cx - curPx) / curZ
    const worldY = (cy - curPy) / curZ

    const newZ = Math.min(3.5, Math.max(0.20, curZ * factor))
    const newPx = cx - worldX * newZ
    const newPy = cy - worldY * newZ

    targetZoomRef.current = newZ
    targetPanRef.current = { x: newPx, y: newPy }
    startAnimation()
  }, [canvasDim, startAnimation])

  const handleZoomIn = () => zoomByFactor(1.3)
  const handleZoomOut = () => zoomByFactor(0.77)
  const handleResetView = () => {
    setDraggedPositions({})
    handleFitView()
  }

  // Native non-passive Wheel Event Listener for continuous zoom toward cursor
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault()

      if (inertiaFrameRef.current) {
        cancelAnimationFrame(inertiaFrameRef.current)
        inertiaFrameRef.current = null
      }

      const rect = svgEl.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top

      const curTz = targetZoomRef.current
      const curTx = targetPanRef.current.x
      const curTy = targetPanRef.current.y

      const worldX = (cursorX - curTx) / curTz
      const worldY = (cursorY - curTy) / curTz

      // Trackpad pinch vs regular mouse wheel sensitivity
      const zoomFactor = e.ctrlKey
        ? Math.exp(-e.deltaY * 0.01)
        : Math.exp(-e.deltaY * 0.0018)

      const newTargetZoom = Math.min(4.0, Math.max(0.12, curTz * zoomFactor))
      const newTargetPanX = cursorX - worldX * newTargetZoom
      const newTargetPanY = cursorY - worldY * newTargetZoom

      targetZoomRef.current = newTargetZoom
      targetPanRef.current = { x: newTargetPanX, y: newTargetPanY }

      startAnimation()
    }

    svgEl.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => svgEl.removeEventListener('wheel', handleWheelNative)
  }, [startAnimation])

  // Active selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null
    return graphData.nodes.find(n => n.id === selectedNodeId) || null
  }, [selectedNodeId, graphData.nodes])

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return graphData.nodes.filter(node => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const matchesLabel = node.label.toLowerCase().includes(query)
        const matchesCat = (node.category || '').toLowerCase().includes(query)
        if (!matchesLabel && !matchesCat) return false
      }

      if (filter === 'all') return true
      if (filter === 'gaps') return node.status === 'gap'
      if (filter === 'blocked') return node.status === 'blocked'
      if (filter === 'learning') return node.status === 'learning' || node.status === 'shaky'
      if (filter === 'mastered') return node.status === 'mastered'
      if (filter === 'bottlenecks') return node.isBottleneck || (node.bottleneckScore ?? 0) > 1.0
      return true
    })
  }, [graphData.nodes, filter, searchQuery])

  const visibleNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes])

  // Filtered edges
  const visibleEdges = useMemo(() => {
    return graphData.edges.filter(
      edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    )
  }, [graphData.edges, visibleNodeIds])

  // Category clusters for visual grouping hulls
  const categoryClusters = useMemo(() => {
    const map = new Map<string, { nodes: ConceptGraphNode[]; minX: number; minY: number; maxX: number; maxY: number }>()

    filteredNodes.forEach(node => {
      const cat = node.category || 'General'
      const pos = getNodePos(node.id)
      const existing = map.get(cat)
      if (!existing) {
        map.set(cat, {
          nodes: [node],
          minX: pos.x,
          minY: pos.y,
          maxX: pos.x,
          maxY: pos.y
        })
      } else {
        existing.nodes.push(node)
        if (pos.x < existing.minX) existing.minX = pos.x
        if (pos.x > existing.maxX) existing.maxX = pos.x
        if (pos.y < existing.minY) existing.minY = pos.y
        if (pos.y > existing.maxY) existing.maxY = pos.y
      }
    })

    return Array.from(map.entries())
      .filter(([_, data]) => data.nodes.length >= 2)
      .map(([name, data]) => ({
        name,
        count: data.nodes.length,
        x: data.minX - 45,
        y: data.minY - 45,
        width: Math.max(data.maxX - data.minX + 90, 110),
        height: Math.max(data.maxY - data.minY + 90, 90)
      }))
  }, [filteredNodes, getNodePos])

  // Pan Canvas Mouse Events with Inertia
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
      setIsDraggingCanvas(true)
      setDragStart({ x: e.clientX - targetPanRef.current.x, y: e.clientY - targetPanRef.current.y })
      velocityRef.current = { vx: 0, vy: 0 }
      lastMoveTimeRef.current = performance.now()

      if (inertiaFrameRef.current) {
        cancelAnimationFrame(inertiaFrameRef.current)
        inertiaFrameRef.current = null
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDraggingCanvas) {
      const now = performance.now()
      const dt = Math.max(now - lastMoveTimeRef.current, 1)
      const newPx = e.clientX - dragStart.x
      const newPy = e.clientY - dragStart.y

      velocityRef.current = {
        vx: (newPx - targetPanRef.current.x) / dt,
        vy: (newPy - targetPanRef.current.y) / dt
      }
      lastMoveTimeRef.current = now

      targetPanRef.current = { x: newPx, y: newPy }
      currentPanRef.current = { x: newPx, y: newPy }
      setPan({ x: newPx, y: newPy })
    } else if (draggingNodeId) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const mouseX = (e.clientX - rect.left - currentPanRef.current.x) / currentZoomRef.current
        const mouseY = (e.clientY - rect.top - currentPanRef.current.y) / currentZoomRef.current
        setDraggedPositions(prev => ({
          ...prev,
          [draggingNodeId]: { x: mouseX, y: mouseY }
        }))
      }
    }
  }

  const handleMouseUp = () => {
    if (isDraggingCanvas) {
      setIsDraggingCanvas(false)

      const speed = Math.hypot(velocityRef.current.vx, velocityRef.current.vy)
      if (speed > 0.12) {
        let vx = velocityRef.current.vx * 14
        let vy = velocityRef.current.vy * 14

        const momentumStep = () => {
          vx *= 0.91
          vy *= 0.91

          if (Math.hypot(vx, vy) < 0.2) {
            inertiaFrameRef.current = null
            return
          }

          targetPanRef.current.x += vx
          targetPanRef.current.y += vy
          currentPanRef.current.x += vx
          currentPanRef.current.y += vy
          setPan({ ...currentPanRef.current })

          inertiaFrameRef.current = requestAnimationFrame(momentumStep)
        }

        inertiaFrameRef.current = requestAnimationFrame(momentumStep)
      }
    }
    setDraggingNodeId(null)
  }

  // Double Click Canvas to Zoom / Fit
  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName !== 'svg') return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    if (targetZoomRef.current < 0.85) {
      zoomByFactor(1.7, cx, cy)
    } else {
      handleFitView()
    }
  }

  // Focus on top bottleneck
  const handleFocusBottleneck = useCallback(() => {
    const targetId = graphData.metrics.suggestedNextConcept
    if (targetId) {
      setSelectedNodeId(targetId)
      const targetPos = getNodePos(targetId)
      if (targetPos.x && targetPos.y) {
        const curZ = Math.max(targetZoomRef.current, 0.85)
        targetZoomRef.current = curZ
        targetPanRef.current = {
          x: canvasDim.width / 2 - targetPos.x * curZ,
          y: canvasDim.height / 2 - targetPos.y * curZ
        }
        startAnimation()
      }
    }
  }, [graphData.metrics.suggestedNextConcept, getNodePos, canvasDim, startAnimation])

  // Add dependency action
  const handleSaveDependency = async () => {
    if (!newLinkPrereq.trim() || !newLinkTarget.trim()) return
    setIsSavingLink(true)
    try {
      if (onAddDependency) {
        await onAddDependency(newLinkPrereq.trim(), newLinkTarget.trim())
      } else if (window.electronAPI?.addConceptDependency) {
        await window.electronAPI.addConceptDependency(subjectId, newLinkPrereq.trim(), newLinkTarget.trim())
      }
      setShowAddLinkModal(false)
      setNewLinkPrereq('')
      setNewLinkTarget('')
    } catch {
      // Handled silently
    } finally {
      setIsSavingLink(false)
    }
  }

  // Delete dependency action
  const handleDeleteLink = async (prereq: string, target: string) => {
    try {
      if (onDeleteDependency) {
        await onDeleteDependency(prereq, target)
      } else if (window.electronAPI?.removeConceptDependencyEdge) {
        await window.electronAPI.removeConceptDependencyEdge(subjectId, prereq, target)
      }
    } catch {
      // Handled silently
    }
  }

  // Study Concept Cards action
  const handleStudyConcept = (conceptLabel: string) => {
    navigate(`/study/${subjectId}?concept=${encodeURIComponent(conceptLabel)}`)
  }

  // Node status colors and styles
  function getNodeStyle(node: ConceptGraphNode) {
    const isSelected = selectedNodeId === node.id
    let ringColor = 'stroke-rose-500'
    let fillColor = 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
    let statusLabel = 'Gap'

    if (node.status === 'mastered') {
      ringColor = 'stroke-emerald-500'
      fillColor = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
      statusLabel = 'Mastered'
    } else if (node.status === 'learning') {
      ringColor = 'stroke-blue-500'
      fillColor = 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
      statusLabel = 'Learning'
    } else if (node.status === 'shaky') {
      ringColor = 'stroke-amber-500'
      fillColor = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
      statusLabel = 'Shaky'
    } else if (node.status === 'blocked') {
      ringColor = 'stroke-slate-400'
      fillColor = 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700'
      statusLabel = 'Locked'
    }

    return { ringColor, fillColor, statusLabel, isSelected }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden shadow-sm">
      {/* ── Header Controls Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Network size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Knowledge & Concept Dependency Graph
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-medium">
                {graphData.metrics.totalConcepts} Concepts
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {subjectName ? `${subjectName} · ` : ''}Interactive prerequisite map with live mastery tracing & bottleneck detection
            </p>
          </div>
        </div>

        {/* Stats summary badges */}
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
            <CheckCircle2 size={12} /> {graphData.metrics.masteredCount} Mastered
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
            <Sparkles size={12} /> {graphData.metrics.learningCount + graphData.metrics.shakyCount} Learning
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60">
            <Flame size={12} /> {graphData.metrics.gapCount} Gaps
          </span>
          {graphData.metrics.blockedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <Lock size={12} /> {graphData.metrics.blockedCount} Blocked
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {graphData.metrics.suggestedNextConcept && (
            <button
              onClick={handleFocusBottleneck}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-semibold shadow-sm transition-colors"
              title="Focus on the highest leverage bottleneck concept"
            >
              <Zap size={14} /> Focus Bottleneck
            </button>
          )}

          <button
            onClick={() => setShowAddLinkModal(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
          >
            + Link Dependency
          </button>
        </div>
      </div>

      {/* ── Subtoolbar: Search, Filters, Layout Switcher & Zoom ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-200/60 dark:border-slate-800/60 text-xs">
        {/* Search */}
        <div className="relative w-48 sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search concepts or topics..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1">
          <span className="text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1">
            <Filter size={12} /> Filter:
          </span>
          {(['all', 'bottlenecks', 'gaps', 'blocked', 'mastered'] as FilterOption[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded-md font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-violet-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Layout & Zoom Controls */}
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                setLayoutMode('hierarchical')
                setDraggedPositions({})
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                layoutMode === 'hierarchical'
                  ? 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Layers size={12} /> Tree
            </button>
            <button
              onClick={() => {
                setLayoutMode('force')
                setDraggedPositions({})
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                layoutMode === 'force'
                  ? 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Network size={12} /> Web
            </button>
          </div>

          {/* Zoom Buttons & Fit View */}
          <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              onClick={handleZoomIn}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={handleFitView}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Fit to View"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={handleResetView}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              title="Reset View"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => zoomByFactor(1.0 / targetZoomRef.current)}
              className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded"
              title="Click to reset to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Graph Canvas Area & Inspector Panel ── */}
      <div className="relative flex-1 min-h-[450px] overflow-hidden" ref={containerRef}>
        {/* SVG Graph View */}
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <defs>
            {/* Standard Arrow Marker */}
            <marker
              id="arrow-met"
              viewBox="0 0 10 10"
              refX="22"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker
              id="arrow-unmet"
              viewBox="0 0 10 10"
              refX="22"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>
            <marker
              id="arrow-selected"
              viewBox="0 0 10 10"
              refX="22"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#8b5cf6" />
            </marker>
          </defs>

          {/* Graph Content Group with Pan and Zoom */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ willChange: 'transform' }}>
            {/* 0. Render Category Clusters / Module Hulls */}
            {categoryClusters.map(cluster => (
              <g key={cluster.name} className="pointer-events-none select-none">
                <rect
                  x={cluster.x}
                  y={cluster.y}
                  width={cluster.width}
                  height={cluster.height}
                  rx={20}
                  className="fill-violet-500/[0.03] dark:fill-violet-400/[0.04] stroke-violet-500/15 dark:stroke-violet-400/20 stroke-1"
                  strokeDasharray="6 4"
                />
                <text
                  x={cluster.x + 14}
                  y={cluster.y + 18}
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-bold tracking-wider uppercase select-none opacity-70"
                >
                  {cluster.name} ({cluster.count})
                </text>
              </g>
            ))}

            {/* 1. Render Directed Edges */}
            {visibleEdges.map(edge => {
              const srcPos = getNodePos(edge.source)
              const tgtPos = getNodePos(edge.target)
              if (!srcPos || !tgtPos) return null

              const isConnectedToSelected =
                selectedNodeId === edge.source || selectedNodeId === edge.target

              const dx = tgtPos.x - srcPos.x
              const dy = tgtPos.y - srcPos.y
              const cx1 = srcPos.x + dx * 0.5
              const cy1 = srcPos.y + dy * 0.1
              const cx2 = srcPos.x + dx * 0.5
              const cy2 = srcPos.y + dy * 0.9

              const strokeColor = isConnectedToSelected
                ? '#8b5cf6'
                : edge.isPrerequisiteMet
                ? '#10b981'
                : '#f43f5e'

              const markerEnd = isConnectedToSelected
                ? 'url(#arrow-selected)'
                : edge.isPrerequisiteMet
                ? 'url(#arrow-met)'
                : 'url(#arrow-unmet)'

              return (
                <g key={edge.id}>
                  <path
                    d={`M ${srcPos.x} ${srcPos.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tgtPos.x} ${tgtPos.y}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isConnectedToSelected ? 3 : 1.75}
                    strokeDasharray={edge.isPrerequisiteMet ? undefined : '4 3'}
                    strokeOpacity={isConnectedToSelected ? 0.95 : 0.6}
                    markerEnd={markerEnd}
                  />
                </g>
              )
            })}

            {/* 2. Render Concept Nodes */}
            {filteredNodes.map(node => {
              const pos = getNodePos(node.id)
              const { ringColor, isSelected } = getNodeStyle(node)
              const masteryPercent = Math.round(node.masteryProb * 100)
              const radius = 26
              const circumference = 2 * Math.PI * radius
              const strokeDashoffset = circumference - (circumference * node.masteryProb)

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-pointer transition-transform"
                  onClick={e => {
                    e.stopPropagation()
                    setSelectedNodeId(node.id)
                  }}
                  onMouseDown={e => {
                    e.stopPropagation()
                    setDraggingNodeId(node.id)
                  }}
                >
                  {/* Glowing selection halo */}
                  {isSelected && (
                    <circle
                      r={radius + 8}
                      className="fill-violet-500/20 stroke-violet-500 stroke-2 animate-pulse"
                    />
                  )}

                  {/* Bottleneck Flame Badge */}
                  {node.isBottleneck && (
                    <g transform={`translate(${radius - 4}, -${radius - 2})`}>
                      <circle r={9} className="fill-amber-500 stroke-white stroke-2" />
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="bold"
                        fill="#ffffff"
                      >
                        ⚡
                      </text>
                    </g>
                  )}

                  {/* Lock badge if blocked */}
                  {node.status === 'blocked' && (
                    <g transform={`translate(-${radius - 4}, -${radius - 2})`}>
                      <circle r={8} className="fill-slate-600 stroke-white stroke-1" />
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        fontSize="8"
                        fill="#ffffff"
                      >
                        🔒
                      </text>
                    </g>
                  )}

                  {/* Node Background Disc */}
                  <circle
                    r={radius}
                    className="fill-white dark:fill-slate-900 stroke-slate-200 dark:stroke-slate-700 stroke-1 shadow-md"
                  />

                  {/* Mastery Progress Ring */}
                  <circle
                    r={radius}
                    fill="none"
                    strokeWidth="3"
                    className={`${ringColor} transition-all duration-300`}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    transform="rotate(-90)"
                  />

                  {/* Node Inner Label / Percentage */}
                  <text
                    y={1}
                    textAnchor="middle"
                    className="fill-slate-900 dark:fill-slate-100 font-bold text-[11px]"
                  >
                    {masteryPercent}%
                  </text>
                  <text
                    y={11}
                    textAnchor="middle"
                    className="fill-slate-400 dark:fill-slate-500 text-[8px]"
                  >
                    {node.observations} obs
                  </text>

                  {/* Node Label Below (Semantic Zoom: visible when zoom >= 0.25 or selected) */}
                  {(zoom >= 0.25 || isSelected) && (
                    <g transform={`translate(0, ${radius + 14})`}>
                      <rect
                        x={-((isSelected ? node.label.length : Math.min(node.label.length, 26)) * 3.5 + 8)}
                        y={-9}
                        width={(isSelected ? node.label.length : Math.min(node.label.length, 26)) * 7 + 16}
                        height={18}
                        rx={6}
                        className={
                          isSelected
                            ? 'fill-violet-600 text-white shadow-sm'
                            : 'fill-white/95 dark:fill-slate-800/95 stroke-slate-200/80 dark:stroke-slate-700/80 stroke-1 shadow-sm'
                        }
                      />
                      <text
                        textAnchor="middle"
                        y={3}
                        className={`text-[10px] font-semibold ${
                          isSelected
                            ? 'fill-white'
                            : 'fill-slate-800 dark:fill-slate-200'
                        }`}
                      >
                        {!isSelected && node.label.length > 26 ? `${node.label.slice(0, 24)}…` : node.label}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* ── Floating Navigation HUD ── */}
        <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 shadow-sm pointer-events-auto">
          <span>Scroll to zoom · Drag to pan · Double-click to focus</span>
          <button
            onClick={handleFitView}
            className="px-2 py-0.5 rounded-lg bg-violet-50 dark:bg-violet-950/60 hover:bg-violet-100 dark:hover:bg-violet-900/80 text-violet-700 dark:text-violet-300 font-semibold text-[10px] transition-colors"
          >
            Fit View
          </button>
        </div>

        {/* ── Empty State if no nodes ── */}
        {graphData.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
            <div className="p-4 rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400 mb-3">
              <Network size={36} />
            </div>
            <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No Concept Dependencies Yet
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
              Add flashcards tagged with concepts, generate syllabus modules, or manually link prerequisites to explore your knowledge graph.
            </p>
            <button
              onClick={() => setShowAddLinkModal(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              + Create First Dependency Link
            </button>
          </div>
        )}

        {/* ── Concept Inspector Drawer (Right Panel) ── */}
        {selectedNode && (
          <div className="absolute top-3 right-3 bottom-3 w-80 max-w-[calc(100%-24px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-xl flex flex-col z-20 overflow-hidden animate-in slide-in-from-right-4 duration-200">
            {/* Inspector Header */}
            <div className="flex items-start justify-between p-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="space-y-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-medium">
                  {selectedNode.category || 'Concept'}
                </span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                  {selectedNode.label}
                </h4>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Inspector Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Status & Mastery Card */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] block">
                    BKT Knowledge Level
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    {Math.round(selectedNode.masteryProb * 100)}%
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {selectedNode.observations} test observations
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                      selectedNode.status === 'mastered'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : selectedNode.status === 'learning'
                        ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                        : selectedNode.status === 'shaky'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        : selectedNode.status === 'blocked'
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {selectedNode.status === 'blocked'
                      ? '🔒 Prerequisite Blocked'
                      : selectedNode.status.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {selectedNode.cardCount} Flashcards
                  </span>
                </div>
              </div>

              {/* Bottleneck Alert */}
              {selectedNode.isBottleneck && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <Zap size={14} className="text-amber-600 dark:text-amber-400" />
                    <span>Critical Knowledge Bottleneck</span>
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Mastering this concept will unblock {selectedNode.dependents.length} downstream topics!
                  </p>
                </div>
              )}

              {/* Prerequisites Section */}
              <div>
                <h5 className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>Prerequisites ({selectedNode.prerequisites.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal">Must learn before</span>
                </h5>
                {selectedNode.prerequisites.length === 0 ? (
                  <p className="text-slate-400 text-[11px] italic">No prerequisite dependencies.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedNode.prerequisites.map(pKey => {
                      const pNode = graphData.nodes.find(n => n.id === pKey)
                      const isMet = pNode && pNode.masteryProb >= 0.50
                      return (
                        <div
                          key={pKey}
                          onClick={() => setSelectedNodeId(pKey)}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            {isMet ? (
                              <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                            ) : (
                              <Lock size={13} className="text-rose-500 shrink-0" />
                            )}
                            <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                              {pNode?.label || pKey}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-500">
                              {pNode ? Math.round(pNode.masteryProb * 100) : 0}%
                            </span>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                handleDeleteLink(pNode?.label || pKey, selectedNode.label)
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded"
                              title="Delete Link"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Unlocked Downstream Topics */}
              <div>
                <h5 className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>Unlocks Next ({selectedNode.dependents.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal">Downstream concepts</span>
                </h5>
                {selectedNode.dependents.length === 0 ? (
                  <p className="text-slate-400 text-[11px] italic">No downstream topics connected.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedNode.dependents.map(dKey => {
                      const dNode = graphData.nodes.find(n => n.id === dKey)
                      return (
                        <div
                          key={dKey}
                          onClick={() => setSelectedNodeId(dKey)}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer transition-colors"
                        >
                          <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                            {dNode?.label || dKey}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">
                            {dNode ? Math.round(dNode.masteryProb * 100) : 0}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Inspector Action Buttons Footer */}
            <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
              <button
                onClick={() => handleStudyConcept(selectedNode.label)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white font-semibold text-xs shadow-sm transition-colors"
              >
                <Play size={13} /> Study {selectedNode.label} Cards
              </button>

              {onOpenTutor && (
                <button
                  onClick={() => onOpenTutor(selectedNode.label)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition-colors"
                >
                  <MessageSquare size={13} /> Ask Socratic AI Tutor
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add Link Dependency Modal ── */}
      {showAddLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Network size={18} className="text-violet-600 dark:text-violet-400" />
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                  Add Concept Dependency Link
                </h3>
              </div>
              <button
                onClick={() => setShowAddLinkModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  1. Prerequisite Concept (Must learn first)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Linear Algebra or Derivatives"
                  value={newLinkPrereq}
                  onChange={e => setNewLinkPrereq(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  2. Target Concept (Requires prerequisite)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Backpropagation or Quantum State"
                  value={newLinkTarget}
                  onChange={e => setNewLinkTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <p className="text-[11px] text-slate-400">
                In the knowledge graph, an arrow will point from the prerequisite to the target concept.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <button
                onClick={() => setShowAddLinkModal(false)}
                className="px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDependency}
                disabled={!newLinkPrereq.trim() || !newLinkTarget.trim() || isSavingLink}
                className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                {isSavingLink ? 'Saving...' : 'Create Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
