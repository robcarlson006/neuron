/**
 * Concept Dependency & Knowledge Graph Engine
 *
 * Provides graph construction, topological dependency resolution,
 * prerequisite readiness gating, bottleneck impact scoring, and
 * deterministic/force-directed 2D layout coordinates for Neuron's
 * interactive knowledge graph.
 */

import type {
  ConceptDependency,
  ConceptMastery,
  ConceptGraphNode,
  ConceptGraphEdge,
  ConceptGraphData,
  SyllabusModule,
  ModuleTopic,
  Card
} from '../types'

export interface BuildGraphParams {
  subjectId: number
  dependencies?: ConceptDependency[]
  concepts?: ConceptMastery[]
  modules?: (SyllabusModule & { topics?: ModuleTopic[] })[]
  cards?: Card[]
  layoutWidth?: number
  layoutHeight?: number
  layoutMode?: 'hierarchical' | 'force'
}

/**
 * Normalizes a concept name string to a consistent key.
 */
export function normalizeConceptKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Infers natural prerequisite dependencies from curriculum structure when
 * explicit database dependencies are sparse.
 */
export function inferDependenciesFromCurriculum(
  modules: (SyllabusModule & { topics?: ModuleTopic[] })[]
): ConceptDependency[] {
  const inferred: ConceptDependency[] = []
  if (!modules || modules.length === 0) return inferred

  const sortedModules = [...modules].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  for (let i = 0; i < sortedModules.length; i++) {
    const currentMod = sortedModules[i]
    const subjectId = currentMod.subject_id

    // 1. Module prerequisite field explicit parsing
    if (currentMod.prerequisites) {
      const prereqNames = currentMod.prerequisites
        .split(/[,;\n]/)
        .map(s => s.trim())
        .filter(Boolean)

      for (const p of prereqNames) {
        inferred.push({
          subject_id: subjectId,
          prerequisite_concept: p,
          target_concept: currentMod.title,
          weight: 1.0
        })
      }
    } else if (i > 0) {
      // 2. Sequential module flow (Module i-1 is prerequisite of Module i)
      const prevMod = sortedModules[i - 1]
      inferred.push({
        subject_id: subjectId,
        prerequisite_concept: prevMod.title,
        target_concept: currentMod.title,
        weight: 0.8
      })
    }

    // 3. Topics within the module: connect module to its topics, and sequential topics
    const topics = currentMod.topics || []
    const sortedTopics = [...topics].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    if (sortedTopics.length > 0) {
      // First topic connects from module
      inferred.push({
        subject_id: subjectId,
        prerequisite_concept: currentMod.title,
        target_concept: sortedTopics[0].title,
        weight: 1.0
      })

      for (let j = 0; j < sortedTopics.length - 1; j++) {
        inferred.push({
          subject_id: subjectId,
          prerequisite_concept: sortedTopics[j].title,
          target_concept: sortedTopics[j + 1].title,
          weight: 0.9
        })
      }
    }
  }

  return inferred
}

/**
 * Builds the complete knowledge graph data with node mastery, dependency gating,
 * bottleneck ranking, and 2D layout coordinates.
 */
export function buildConceptGraph(params: BuildGraphParams): ConceptGraphData {
  const {
    dependencies = [],
    concepts = [],
    modules = [],
    cards = [],
    layoutWidth = 800,
    layoutHeight = 600,
    layoutMode = 'hierarchical'
  } = params

  // Merge explicit dependencies with curriculum-inferred dependencies if explicit is small
  const allDeps: ConceptDependency[] = [...dependencies]
  if (allDeps.length === 0 && modules.length > 0) {
    allDeps.push(...inferDependenciesFromCurriculum(modules))
  }

  // 1. Concept Registry Map
  const nodeMap = new Map<string, ConceptGraphNode>()

  function getOrCreateNode(rawName: string, category?: string, modId?: number, topId?: number): ConceptGraphNode {
    const key = normalizeConceptKey(rawName)
    if (nodeMap.has(key)) {
      const existing = nodeMap.get(key)!
      if (!existing.category && category) existing.category = category
      if (!existing.moduleId && modId) existing.moduleId = modId
      if (!existing.topicId && topId) existing.topicId = topId
      return existing
    }
    const node: ConceptGraphNode = {
      id: key,
      label: rawName.trim(),
      category: category || 'General',
      moduleId: modId,
      topicId: topId,
      masteryProb: 0.3, // Prior default
      status: 'gap',
      observations: 0,
      cardCount: 0,
      prerequisites: [],
      dependents: [],
      isBottleneck: false,
      bottleneckScore: 0,
      optimalStudyRank: 999
    }
    nodeMap.set(key, node)
    return node
  }

  // Register concepts from BKT concept_mastery table
  for (const cm of concepts) {
    if (!cm.concept) continue
    const node = getOrCreateNode(cm.concept)
    node.masteryProb = Math.min(Math.max(cm.mastery_prob ?? 0.3, 0), 1)
    node.observations = cm.observations ?? 0
  }

  // Register concepts and card counts from cards
  for (const card of cards) {
    if (card.concept) {
      const node = getOrCreateNode(card.concept)
      node.cardCount += 1
    }
    if (card.tags) {
      const tags = card.tags.split(',').map(t => t.trim()).filter(Boolean)
      for (const t of tags) {
        if (!nodeMap.has(normalizeConceptKey(t))) {
          // If concept is not already registered, optionally register prominent tags
          if (t.length > 2 && t.length < 30) {
            const tagNode = getOrCreateNode(t)
            tagNode.cardCount += 1
          }
        }
      }
    }
  }

  // Register concepts from modules & topics
  for (const mod of modules) {
    getOrCreateNode(mod.title, 'Module', mod.id)
    if (mod.topics) {
      for (const top of mod.topics) {
        const topNode = getOrCreateNode(top.title, mod.title, mod.id, top.id)
        if (top.card_count) topNode.cardCount += top.card_count
        if (top.retrievability !== undefined && top.retrievability > 0 && topNode.observations === 0) {
          topNode.masteryProb = top.retrievability
          topNode.observations = 1
        }
      }
    }
  }

  // Register concepts and links from dependencies
  const edgeList: ConceptGraphEdge[] = []
  const edgeSet = new Set<string>()

  for (const dep of allDeps) {
    if (!dep.prerequisite_concept || !dep.target_concept) continue
    const sourceKey = normalizeConceptKey(dep.prerequisite_concept)
    const targetKey = normalizeConceptKey(dep.target_concept)

    if (sourceKey === targetKey) continue // avoid self-loops

    const sourceNode = getOrCreateNode(dep.prerequisite_concept)
    const targetNode = getOrCreateNode(dep.target_concept)

    const edgeKey = `${sourceKey}->${targetKey}`
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey)

      if (!sourceNode.dependents.includes(targetKey)) {
        sourceNode.dependents.push(targetKey)
      }
      if (!targetNode.prerequisites.includes(sourceKey)) {
        targetNode.prerequisites.push(sourceKey)
      }

      // Is prerequisite met? (Prerequisite node has mastery >= 0.50 or observations > 2 with mastery >= 0.45)
      const isMet = sourceNode.masteryProb >= 0.50 || (sourceNode.observations >= 3 && sourceNode.masteryProb >= 0.45)

      edgeList.push({
        id: edgeKey,
        source: sourceKey,
        target: targetKey,
        weight: dep.weight ?? 1.0,
        isPrerequisiteMet: isMet
      })
    }
  }

  // 2. Topological Layering & Cycle Safety
  const nodes = Array.from(nodeMap.values())
  computeTopologicalLayers(nodes, nodeMap)

  // 3. Prerequisite Readiness & Status Assignment
  for (const node of nodes) {
    const hasUnmetPrereq = node.prerequisites.some(pKey => {
      const pNode = nodeMap.get(pKey)
      return !pNode || pNode.masteryProb < 0.50
    })

    if (hasUnmetPrereq && node.masteryProb < 0.50) {
      node.status = 'blocked'
    } else if (node.masteryProb >= 0.80) {
      node.status = 'mastered'
    } else if (node.masteryProb >= 0.55) {
      node.status = 'learning'
    } else if (node.masteryProb >= 0.40) {
      node.status = 'shaky'
    } else {
      node.status = 'gap'
    }
  }

  // 4. Bottleneck & Optimal Next Concept Scoring
  const bottlenecks = computeBottlenecks(nodes, nodeMap)
  const criticalBottlenecks = bottlenecks.slice(0, 3).map(n => n.id)

  // Determine suggested next concept (the top bottleneck that is NOT blocked)
  const studyCandidates = bottlenecks.filter(n => n.status !== 'blocked' && n.status !== 'mastered')
  const suggestedNextConcept = studyCandidates.length > 0 ? studyCandidates[0].id : (bottlenecks[0]?.id || null)

  // 5. 2D Coordinate Layout Computation
  if (layoutMode === 'hierarchical') {
    applyHierarchicalLayout(nodes, edgeList, layoutWidth, layoutHeight)
  } else {
    applyForceDirectedLayout(nodes, edgeList, layoutWidth, layoutHeight)
  }

  // 6. Calculate Layout Bounds
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const nx = n.x ?? 0
    const ny = n.y ?? 0
    if (nx < minX) minX = nx
    if (nx > maxX) maxX = nx
    if (ny < minY) minY = ny
    if (ny > maxY) maxY = ny
  }

  const paddingBounds = 80
  const layoutBounds = nodes.length > 0 ? {
    minX: Math.floor(Math.max(0, minX - paddingBounds)),
    minY: Math.floor(Math.max(0, minY - paddingBounds)),
    maxX: Math.ceil(maxX + paddingBounds),
    maxY: Math.ceil(maxY + paddingBounds),
    width: Math.ceil(Math.max(layoutWidth, maxX - minX + paddingBounds * 2)),
    height: Math.ceil(Math.max(layoutHeight, maxY - minY + paddingBounds * 2))
  } : undefined

  // 7. Metrics aggregation
  const metrics = {
    totalConcepts: nodes.length,
    masteredCount: nodes.filter(n => n.status === 'mastered').length,
    learningCount: nodes.filter(n => n.status === 'learning').length,
    shakyCount: nodes.filter(n => n.status === 'shaky').length,
    gapCount: nodes.filter(n => n.status === 'gap').length,
    blockedCount: nodes.filter(n => n.status === 'blocked').length,
    criticalBottlenecks,
    suggestedNextConcept
  }

  return {
    nodes,
    edges: edgeList,
    metrics,
    layoutBounds
  }
}

/**
 * Computes topological depth layer for each node (longest path from root),
 * handling potential cycles gracefully.
 */
function computeTopologicalLayers(nodes: ConceptGraphNode[], nodeMap: Map<string, ConceptGraphNode>): void {
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function getDepth(nodeKey: string): number {
    if (inStack.has(nodeKey)) return 0 // Cycle detected, break recursion
    const node = nodeMap.get(nodeKey)
    if (!node) return 0
    if (node.layer !== undefined) return node.layer

    inStack.add(nodeKey)
    let maxPrereqDepth = -1
    for (const pKey of node.prerequisites) {
      const d = getDepth(pKey)
      if (d > maxPrereqDepth) maxPrereqDepth = d
    }
    inStack.delete(nodeKey)

    const layer = maxPrereqDepth + 1
    node.layer = layer
    visited.add(nodeKey)
    return layer
  }

  for (const node of nodes) {
    getDepth(node.id)
  }
}

/**
 * Computes bottleneck scores for all nodes and ranks them.
 */
function computeBottlenecks(
  nodes: ConceptGraphNode[],
  nodeMap: Map<string, ConceptGraphNode>
): ConceptGraphNode[] {
  for (const node of nodes) {
    // Collect all downstream descendants
    const descendants = new Set<string>()
    const queue = [...node.dependents]

    while (queue.length > 0) {
      const curr = queue.shift()!
      if (!descendants.has(curr)) {
        descendants.add(curr)
        const dNode = nodeMap.get(curr)
        if (dNode) {
          queue.push(...dNode.dependents)
        }
      }
    }

    let blockedDescendantsCount = 0
    for (const dId of descendants) {
      const dNode = nodeMap.get(dId)
      if (dNode && (dNode.status === 'blocked' || dNode.masteryProb < 0.50)) {
        blockedDescendantsCount++
      }
    }

    // Bottleneck score formula:
    // High leverage if current concept is unmastered AND has many blocked downstream descendants
    const unmasteredDeficit = Math.max(0, 1.0 - node.masteryProb)
    const cardFactor = Math.min(node.cardCount * 0.05, 0.5)
    const score = unmasteredDeficit * (1 + blockedDescendantsCount * 2.0 + cardFactor)

    node.bottleneckScore = Number(score.toFixed(3))
    node.isBottleneck = score >= 2.0 && blockedDescendantsCount > 0
  }

  const sorted = [...nodes].sort((a, b) => (b.bottleneckScore ?? 0) - (a.bottleneckScore ?? 0))
  sorted.forEach((n, idx) => {
    n.optimalStudyRank = idx + 1
  })
  return sorted
}

/**
 * Removes overlaps between nodes ensuring adequate clearance for node circles and text labels.
 */
export function removeOverlaps(
  nodes: ConceptGraphNode[],
  minDistX: number = 100,
  minDistY: number = 60,
  iterations: number = 4
): void {
  if (nodes.length <= 1) return

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false
    for (let i = 0; i < nodes.length; i++) {
      const u = nodes[i]
      const ux = u.x ?? 0
      const uy = u.y ?? 0
      const uLabelHalf = Math.max(45, (u.label.length * 7 + 24) / 2)

      for (let j = i + 1; j < nodes.length; j++) {
        const v = nodes[j]
        const vx = v.x ?? 0
        const vy = v.y ?? 0
        const vLabelHalf = Math.max(45, (v.label.length * 7 + 24) / 2)

        const requiredX = Math.max(minDistX, uLabelHalf + vLabelHalf + 16)
        const requiredY = minDistY

        const dx = vx - ux
        const dy = vy - uy

        const normDistSq = (dx * dx) / (requiredX * requiredX) + (dy * dy) / (requiredY * requiredY)

        if (normDistSq < 1.0 && normDistSq > 1e-6) {
          const normDist = Math.sqrt(normDistSq)
          const overlap = 1.0 - normDist
          const pushFraction = overlap * 0.5

          const shiftX = (dx / normDist) * pushFraction * requiredX
          const shiftY = (dy / normDist) * pushFraction * requiredY

          u.x = ux - shiftX
          u.y = uy - shiftY
          v.x = vx + shiftX
          v.y = vy + shiftY
          moved = true
        } else if (normDistSq <= 1e-6) {
          const jitterX = (Math.random() - 0.5) * 40
          const jitterY = (Math.random() - 0.5) * 40
          u.x = ux - jitterX
          u.y = uy - jitterY
          v.x = vx + jitterX
          v.y = vy + jitterY
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

/**
 * Calculates clean hierarchical layer coordinates with anti-overlap spacing and multi-tier staggering.
 */
export function applyHierarchicalLayout(
  nodes: ConceptGraphNode[],
  _edges: ConceptGraphEdge[],
  width: number,
  height: number
): void {
  if (nodes.length === 0) return

  // Group nodes by layer
  const layerGroups = new Map<number, ConceptGraphNode[]>()
  let maxLayer = 0

  for (const node of nodes) {
    const layer = node.layer ?? 0
    if (layer > maxLayer) maxLayer = layer
    const group = layerGroups.get(layer) || []
    group.push(node)
    layerGroups.set(layer, group)
  }

  const totalLayers = maxLayer + 1

  // Determine needed canvas width based on maximum nodes in a layer and their label lengths
  let maxNeededWidth = 0
  layerGroups.forEach(group => {
    let layerWidth = 0
    for (const n of group) {
      const approxWidth = Math.max(120, n.label.length * 7.5 + 40)
      layerWidth += approxWidth
    }
    if (layerWidth > maxNeededWidth) maxNeededWidth = layerWidth
  })

  // Dynamic virtual canvas size
  const effectiveWidth = Math.max(width, maxNeededWidth + 240, 950)
  const layerStepY = Math.max(160, (Math.max(height, 600) - 160) / Math.max(totalLayers - 1, 1))
  const paddingX = 100
  const paddingY = 80

  layerGroups.forEach((group, layer) => {
    const baseY = paddingY + layer * layerStepY
    const count = group.length

    // Sort group by category/label for visual stability
    group.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.label.localeCompare(b.label))

    const shouldStagger = count > 6
    const usableWidth = effectiveWidth - paddingX * 2
    const stepX = count > 1 ? usableWidth / (count - 1) : 0
    const startX = count === 1 ? effectiveWidth / 2 : paddingX

    group.forEach((node, idx) => {
      node.x = count === 1 ? startX : startX + idx * stepX

      // Multi-tier staggered vertical offset if dense layer
      let yOffset = 0
      if (shouldStagger) {
        const staggerPattern = [0, -32, 32, -16, 16]
        yOffset = staggerPattern[idx % staggerPattern.length]
      }

      node.y = baseY + yOffset
      node.vx = 0
      node.vy = 0
    })
  })

  // Run overlap removal pass to resolve any tight bounds
  removeOverlaps(nodes, 105, 60, 4)
}

/**
 * Applies iterative 2D force simulation with dynamic virtual canvas scaling,
 * cosine annealing damping, center gravity, and post-layout overlap removal.
 */
export function applyForceDirectedLayout(
  nodes: ConceptGraphNode[],
  edges: ConceptGraphEdge[],
  width: number,
  height: number,
  iterations?: number
): void {
  if (nodes.length === 0) return

  const nodeCount = nodes.length
  const scaleFactor = Math.max(1.0, Math.sqrt(nodeCount / 20))
  const simWidth = Math.max(width * scaleFactor, 1200)
  const simHeight = Math.max(height * scaleFactor, 850)

  // First seed with hierarchical layout on scaled canvas for good initial dispersion
  applyHierarchicalLayout(nodes, edges, simWidth, simHeight)

  const nodeMap = new Map<string, ConceptGraphNode>()
  nodes.forEach(n => nodeMap.set(n.id, n))

  const totalIterations = iterations ?? Math.max(75, Math.min(160, 50 + Math.floor(nodeCount * 0.4)))
  const kRepulsion = 8000 + nodeCount * 30
  const kSpring = 0.04
  const idealLength = 150 + Math.min(120, Math.sqrt(nodeCount) * 8)
  const padding = 80
  const centerX = simWidth / 2
  const centerY = simHeight / 2
  const kCenterGravity = 0.005

  for (let iter = 0; iter < totalIterations; iter++) {
    const damping = 0.5 * (1 + Math.cos((Math.PI * iter) / totalIterations))

    // 1. Node-Node Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const u = nodes[i]
        const v = nodes[j]
        const dx = (u.x ?? 0) - (v.x ?? 0)
        const dy = (u.y ?? 0) - (v.y ?? 0)
        const distSq = dx * dx + dy * dy + 1e-4
        const dist = Math.sqrt(distSq)

        if (dist < 800) {
          const force = (kRepulsion / distSq) * damping
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force

          u.x = (u.x ?? 0) + fx
          u.y = (u.y ?? 0) + fy
          v.x = (v.x ?? 0) - fx
          v.y = (v.y ?? 0) - fy
        }
      }
    }

    // 2. Edge Springs
    for (const edge of edges) {
      const u = nodeMap.get(edge.source)
      const v = nodeMap.get(edge.target)
      if (!u || !v) continue

      const dx = (v.x ?? 0) - (u.x ?? 0)
      const dy = (v.y ?? 0) - (u.y ?? 0)
      const dist = Math.sqrt(dx * dx + dy * dy) + 1e-4
      const displacement = dist - idealLength
      const force = displacement * kSpring * damping

      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      u.x = (u.x ?? 0) + fx
      u.y = (u.y ?? 0) + fy
      v.x = (v.x ?? 0) - fx
      v.y = (v.y ?? 0) - fy
    }

    // 3. Gentle Center Gravity & Bounding Box Constraints
    for (const node of nodes) {
      const cx = (centerX - (node.x ?? centerX)) * kCenterGravity * damping
      const cy = (centerY - (node.y ?? centerY)) * kCenterGravity * damping
      node.x = Math.max(padding, Math.min(simWidth - padding, (node.x ?? centerX) + cx))
      node.y = Math.max(padding, Math.min(simHeight - padding, (node.y ?? centerY) + cy))
    }
  }

  // Post-simulation overlap removal sweep
  removeOverlaps(nodes, 105, 60, 4)
}

/**
 * Finds all transitive downstream concepts impacted by a failure in the given concept.
 */
export function getImpactedDownstreamConcepts(
  conceptId: string,
  graph: ConceptGraphData
): ConceptGraphNode[] {
  const nodeMap = new Map<string, ConceptGraphNode>()
  graph.nodes.forEach(n => nodeMap.set(n.id, n))

  const target = nodeMap.get(normalizeConceptKey(conceptId))
  if (!target) return []

  const impacted = new Set<string>()
  const queue = [...target.dependents]

  while (queue.length > 0) {
    const currId = queue.shift()!
    if (!impacted.has(currId)) {
      impacted.add(currId)
      const n = nodeMap.get(currId)
      if (n) queue.push(...n.dependents)
    }
  }

  return Array.from(impacted).map(id => nodeMap.get(id)!).filter(Boolean)
}

/**
 * Finds the shortest learning prerequisite chain to unlock a target concept.
 */
export function findShortestLearningPath(
  targetConceptId: string,
  graph: ConceptGraphData
): ConceptGraphNode[] {
  const nodeMap = new Map<string, ConceptGraphNode>()
  graph.nodes.forEach(n => nodeMap.set(n.id, n))

  const targetKey = normalizeConceptKey(targetConceptId)
  const target = nodeMap.get(targetKey)
  if (!target) return []

  const pathNodes = new Set<string>()
  const queue = [...target.prerequisites]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (!pathNodes.has(curr)) {
      pathNodes.add(curr)
      const pNode = nodeMap.get(curr)
      if (pNode) {
        queue.push(...pNode.prerequisites)
      }
    }
  }

  // Include target and sort by topological layer
  pathNodes.add(targetKey)
  return Array.from(pathNodes)
    .map(id => nodeMap.get(id)!)
    .filter(Boolean)
    .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0))
}
