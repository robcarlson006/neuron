import React, { useState, useMemo, useCallback } from 'react'
import type { Card, CardFolder, CardSchedule, Material } from '../types'

interface CardBrowserProps {
  cards: Card[]
  folders: CardFolder[]
  materials?: Material[]
  topics?: any[] // Kept for backwards compatibility
  schedules?: Map<number, CardSchedule>
  onCardClick?: (card: Card) => void
  onDeleteCards?: (cardIds: number[]) => void
  onMoveCards?: (cardIds: number[], folderId: number | null) => void
}

type ViewMode = 'material' | 'list'
const PAGE_SIZE = 50

const CardBrowser: React.FC<CardBrowserProps> = ({
  cards,
  folders,
  materials = [],
  schedules,
  onCardClick,
  onDeleteCards,
  onMoveCards,
}) => {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [folderFilter, setFolderFilter] = useState<number | 'all'>('all')
  const [materialFilter, setMaterialFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<'created' | 'front' | 'material'>('created')
  const [viewMode, setViewMode] = useState<ViewMode>('material')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Maps for fast lookups
  const folderMap = useMemo(() => {
    const map = new Map<number, string>()
    folders.forEach((f) => map.set(f.id, f.name))
    return map
  }, [folders])

  const materialMap = useMemo(() => {
    const map = new Map<number, string>()
    materials.forEach((m) => map.set(m.id, m.filename))
    return map
  }, [materials])

  // Multi-field Filtering & Sorting
  const filtered = useMemo(() => {
    let result = [...cards]

    // 1. Search Query (matches front, back, tags, material filename, folder name)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((c) => {
        const frontMatch = (c.front || '').toLowerCase().includes(q)
        const backMatch = (c.back || '').toLowerCase().includes(q)
        const tagsMatch = (c.tags || '').toLowerCase().includes(q)
        const materialName = c.material_id ? materialMap.get(c.material_id) || '' : ''
        const materialMatch = materialName.toLowerCase().includes(q)
        const folderName = c.folder_id ? folderMap.get(c.folder_id) || '' : ''
        const folderMatch = folderName.toLowerCase().includes(q)

        return frontMatch || backMatch || tagsMatch || materialMatch || folderMatch
      })
    }

    // 2. Type filter
    if (typeFilter !== 'all') {
      result = result.filter((c) => c.type === typeFilter)
    }

    // 3. Folder filter
    if (folderFilter !== 'all') {
      if (folderFilter === -1) {
        result = result.filter((c) => !c.folder_id)
      } else {
        result = result.filter((c) => c.folder_id === folderFilter)
      }
    }

    // 4. Material filter
    if (materialFilter !== 'all') {
      if (materialFilter === -1) {
        result = result.filter((c) => !c.material_id)
      } else {
        result = result.filter((c) => c.material_id === materialFilter)
      }
    }

    // 5. Sort
    result.sort((a, b) => {
      if (sortBy === 'created') {
        const timeA = a.created_at ? (Number.isNaN(new Date(a.created_at).getTime()) ? 0 : new Date(a.created_at).getTime()) : 0
        const timeB = b.created_at ? (Number.isNaN(new Date(b.created_at).getTime()) ? 0 : new Date(b.created_at).getTime()) : 0
        return timeB - timeA
      }
      if (sortBy === 'front') {
        return (a.front || '').localeCompare(b.front || '')
      }
      if (sortBy === 'material') {
        const matA = (a.material_id ? materialMap.get(a.material_id) : '') || 'ZZZ'
        const matB = (b.material_id ? materialMap.get(b.material_id) : '') || 'ZZZ'
        return matA.localeCompare(matB)
      }
      return 0
    })

    return result
  }, [cards, search, typeFilter, folderFilter, materialFilter, sortBy, folderMap, materialMap])

  // Grouped cards by Material
  const groupedByMaterial = useMemo(() => {
    const groups = new Map<string, Card[]>()

    filtered.forEach((card) => {
      const materialName = card.material_id ? (materialMap.get(card.material_id) || 'Uploaded Document') : 'General / Direct Text'
      if (!groups.has(materialName)) {
        groups.set(materialName, [])
      }
      groups.get(materialName)!.push(card)
    })

    return groups
  }, [filtered, materialMap])

  // Pagination for List View
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  )

  // Selection
  const targetIds = useMemo(
    () => (viewMode === 'list' ? paged.map((c) => c.id) : filtered.map((c) => c.id)),
    [viewMode, paged, filtered]
  )
  const isAllSelected = targetIds.length > 0 && targetIds.every((id) => selected.has(id))

  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        targetIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        targetIds.forEach((id) => next.add(id))
        return next
      })
    }
  }, [isAllSelected, targetIds])

  const handleSelect = useCallback((cardId: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }, [])

  const handleDeleteSelected = useCallback(() => {
    if (selected.size === 0) return
    if (window.confirm(`Delete ${selected.size} card(s)?`)) {
      onDeleteCards?.(Array.from(selected))
      setSelected(new Set())
    }
  }, [selected, onDeleteCards])

  const handleMoveSelected = useCallback(
    (folderId: number | null) => {
      if (selected.size === 0) return
      onMoveCards?.(Array.from(selected), folderId)
      setSelected(new Set())
    },
    [selected, onMoveCards]
  )

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const collapseAllGroups = () => {
    const allKeys = Array.from(groupedByMaterial.keys())
    setCollapsedGroups(new Set(allKeys))
  }

  const expandAllGroups = () => {
    setCollapsedGroups(new Set())
  }

  const clearAllFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setFolderFilter('all')
    setMaterialFilter('all')
  }

  const hasActiveFilters = search || typeFilter !== 'all' || folderFilter !== 'all' || materialFilter !== 'all'

  // Reset page when filters change
  React.useEffect(() => {
    setPage(0)
  }, [search, typeFilter, folderFilter, materialFilter, sortBy, viewMode])

  const renderCardItem = (card: Card) => {
    const materialLabel = card.material_id ? materialMap.get(card.material_id) : undefined
    const folderLabel = card.folder_id ? folderMap.get(card.folder_id) : undefined

    return (
      <div
        key={card.id}
        className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-violet-400 dark:hover:border-violet-600 transition-colors cursor-pointer group shadow-2xs"
        onClick={() => onCardClick?.(card)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCardClick?.(card)
        }}
      >
        <input
          type="checkbox"
          checked={selected.has(card.id)}
          onChange={(e) => {
            e.stopPropagation()
            handleSelect(card.id)
          }}
          className="rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select card ${card.id}`}
        />
        {/* Card preview */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            {/* Card Type */}
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                card.type === 'flashcard'
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : card.type === 'cloze'
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {card.type === 'active_recall' ? 'Recall' : card.type === 'cloze' ? 'Cloze' : 'Flashcard'}
            </span>

            {/* Material Badge */}
            {materialLabel && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  if (card.material_id) setMaterialFilter(card.material_id)
                }}
                className="text-xs font-medium px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 transition-colors"
                title={`Material: ${materialLabel}`}
              >
                📄 {materialLabel.length > 30 ? materialLabel.slice(0, 30) + '...' : materialLabel}
              </span>
            )}

            {/* Folder Badge */}
            {folderLabel && (
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-1.5 py-0.5 rounded">
                📁 {folderLabel}
              </span>
            )}
          </div>

          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
            {card.front.length > 110 ? card.front.slice(0, 110) + '...' : card.front}
          </p>
          {card.back && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {card.back.length > 120 ? card.back.slice(0, 120) + '...' : card.back}
            </p>
          )}
        </div>

        {/* Date & Due schedule */}
        <div className="text-right text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
          <div>{card.created_at && !Number.isNaN(new Date(card.created_at).getTime()) ? new Date(card.created_at).toLocaleDateString() : ''}</div>
          {schedules?.has(card.id) && !Number.isNaN(new Date(schedules.get(card.id)!.due_date).getTime()) && (
            <div className="text-violet-500 dark:text-violet-400 font-medium">
              Due: {new Date(schedules.get(card.id)!.due_date).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* View Mode Switcher + Material Group Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700">
        {/* View Mode Buttons */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-700 p-1 rounded-xl shadow-2xs">
          <button
            onClick={() => setViewMode('material')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === 'material'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-violet-600'
            }`}
          >
            📄 By Material ({groupedByMaterial.size})
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === 'list'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-violet-600'
            }`}
          >
            📋 All Cards ({filtered.length})
          </button>
        </div>

        {/* Group Controls when grouped by material */}
        {viewMode === 'material' && (
          <div className="flex items-center gap-2">
            <button
              onClick={expandAllGroups}
              className="text-xs px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:text-violet-600 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600"
            >
              Expand All
            </button>
            <button
              onClick={collapseAllGroups}
              className="text-xs px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:text-violet-600 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* Material Search & Filters Bar */}
      <div className="flex flex-wrap gap-2.5">
        {/* Universal Search */}
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder="Search questions, answers, materials, folders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-2xs"
            aria-label="Search cards"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Material Filter */}
        <select
          value={materialFilter === 'all' ? 'all' : materialFilter}
          onChange={(e) => setMaterialFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200 shadow-2xs focus:ring-2 focus:ring-violet-500"
          aria-label="Filter by material"
        >
          <option value="all">📄 All Materials</option>
          <option value={-1}>General / No Material</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.filename}
            </option>
          ))}
        </select>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200 shadow-2xs focus:ring-2 focus:ring-violet-500"
          aria-label="Filter by card type"
        >
          <option value="all">⚡ All Types</option>
          <option value="flashcard">Flashcards</option>
          <option value="active_recall">Active Recall</option>
          <option value="cloze">Cloze</option>
        </select>

        {/* Folder Filter */}
        <select
          value={folderFilter === 'all' ? 'all' : folderFilter}
          onChange={(e) => setFolderFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200 shadow-2xs focus:ring-2 focus:ring-violet-500"
          aria-label="Filter by folder"
        >
          <option value="all">📁 All Folders</option>
          <option value={-1}>No Folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200 shadow-2xs focus:ring-2 focus:ring-violet-500"
          aria-label="Sort cards"
        >
          <option value="created">🕒 Newest First</option>
          <option value="front">🔤 Alphabetical (A-Z)</option>
          <option value="material">📄 By Material</option>
        </select>

        {/* Clear Filters button */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 rounded-xl border border-rose-200 dark:border-rose-800 transition-colors"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 rounded-xl shadow-xs">
          <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">
            {selected.size} card{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors shadow-2xs"
            >
              Delete Selected
            </button>
            <select
              onChange={(e) => {
                const val = e.target.value
                if (val === 'no-folder') handleMoveSelected(null)
                else if (val) handleMoveSelected(Number(val))
                e.target.value = ''
              }}
              className="px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg dark:text-gray-200 font-medium"
              defaultValue=""
              aria-label="Move selected to folder"
            >
              <option value="" disabled>
                Move to folder...
              </option>
              <option value="no-folder">No Folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Select All bar */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
        <label className="flex items-center gap-2 cursor-pointer font-medium">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={handleSelectAll}
            className="rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
          />
          Select all {viewMode === 'list' ? `on this page (${paged.length})` : `cards (${filtered.length})`}
        </label>
        <span>
          Showing {filtered.length} of {cards.length} card{cards.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Cards Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasActiveFilters ? 'No cards match your search and filter criteria.' : 'No cards available yet.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="mt-3 px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 rounded-lg transition-colors shadow-2xs"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : viewMode === 'material' ? (
        /* Grouped by Material View */
        <div className="space-y-4">
          {Array.from(groupedByMaterial.entries()).map(([materialName, groupCards]) => {
            const isCollapsed = collapsedGroups.has(materialName)
            const flashcardCount = groupCards.filter((c) => c.type === 'flashcard').length
            const recallCount = groupCards.filter((c) => c.type === 'active_recall').length

            return (
              <div
                key={materialName}
                className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 space-y-2.5 transition-all shadow-2xs"
              >
                {/* Material Section Header */}
                <div
                  className="flex items-center justify-between cursor-pointer select-none group"
                  onClick={() => toggleGroupCollapse(materialName)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 truncate">
                      📄 {materialName}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 rounded-full border border-sky-200 dark:border-sky-800">
                      {groupCards.length} card{groupCards.length !== 1 ? 's' : ''}
                    </span>
                    {flashcardCount > 0 && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">
                        {flashcardCount} flashcard{flashcardCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {recallCount > 0 && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                        {recallCount} recall
                      </span>
                    )}
                  </div>
                  <button className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 text-sm px-1.5 py-0.5 font-bold">
                    {isCollapsed ? '▼' : '▲'}
                  </button>
                </div>

                {/* Cards in this material */}
                {!isCollapsed && (
                  <div className="space-y-2 pt-1">
                    {groupCards.map((card) => renderCardItem(card))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Flat List View */
        <div className="space-y-2">
          {paged.map((card) => renderCardItem(card))}
        </div>
      )}

      {/* Pagination for List View */}
      {viewMode === 'list' && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors dark:text-gray-200"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors dark:text-gray-200"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default CardBrowser
