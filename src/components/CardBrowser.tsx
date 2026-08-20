import React, { useState, useMemo, useCallback } from 'react'
import type { Card, CardFolder, CardSchedule } from '../types'

interface CardBrowserProps {
  cards: Card[]
  folders: CardFolder[]
  schedules?: Map<number, CardSchedule>
  onCardClick?: (card: Card) => void
  onDeleteCards?: (cardIds: number[]) => void
  onMoveCards?: (cardIds: number[], folderId: number | null) => void
}

const PAGE_SIZE = 50

const CardBrowser: React.FC<CardBrowserProps> = ({
  cards,
  folders,
  schedules,
  onCardClick,
  onDeleteCards,
  onMoveCards,
}) => {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [folderFilter, setFolderFilter] = useState<number | 'all'>('all')
  const [sortBy, setSortBy] = useState<'created' | 'front'>('created')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  const folderMap = useMemo(() => {
    const map = new Map<number, string>()
    folders.forEach((f) => map.set(f.id, f.name))
    return map
  }, [folders])

  // Filtering
  const filtered = useMemo(() => {
    let result = [...cards]

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)
      )
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((c) => c.type === typeFilter)
    }

    // Folder filter
    if (folderFilter !== 'all') {
      result = result.filter((c) => c.folder_id === folderFilter)
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'created') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return a.front.localeCompare(b.front)
    })

    return result
  }, [cards, search, typeFilter, folderFilter, sortBy])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page]
  )

  // Selection
  const handleSelectAll = useCallback(() => {
    if (selectAll) {
      setSelected(new Set())
      setSelectAll(false)
    } else {
      setSelected(new Set(paged.map((c) => c.id)))
      setSelectAll(true)
    }
  }, [paged, selectAll])

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
      setSelectAll(false)
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

  // Reset page when filters change
  React.useEffect(() => {
    setPage(0)
  }, [search, typeFilter, folderFilter, sortBy])

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
          aria-label="Search cards"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200"
          aria-label="Filter by card type"
        >
          <option value="all">All Types</option>
          <option value="flashcard">Flashcards</option>
          <option value="active_recall">Active Recall</option>
          <option value="cloze">Cloze</option>
        </select>
        <select
          value={folderFilter === 'all' ? 'all' : folderFilter}
          onChange={(e) => setFolderFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200"
          aria-label="Filter by folder"
        >
          <option value="all">All Folders</option>
          <option value={-1}>No Folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'created' | 'front')}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm dark:text-gray-200"
          aria-label="Sort cards"
        >
          <option value="created">Newest First</option>
          <option value="front">Alphabetical</option>
        </select>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
          <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
            {selected.size} selected
          </span>
          <button
            onClick={handleDeleteSelected}
            className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
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
            className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg dark:text-gray-200"
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
      )}

      {/* Select All checkbox */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={selectAll && paged.length > 0}
            onChange={handleSelectAll}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Select all on this page ({paged.length} cards)
        </label>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          ({filtered.length} total filtered)
        </span>
      </div>

      {/* Card List */}
      <div className="space-y-2">
        {paged.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500">
            {search ? 'No cards match your search.' : 'No cards yet. Import or create some!'}
          </div>
        ) : (
          paged.map((card) => (
            <div
              key={card.id}
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-700 transition-colors cursor-pointer group"
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
                className="rounded border-gray-300 dark:border-gray-600"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select card ${card.id}`}
              />
              {/* Card preview */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      card.type === 'flashcard'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                        : card.type === 'cloze'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300'
                    }`}
                  >
                    {card.type === 'active_recall' ? 'Recall' : card.type === 'cloze' ? 'Cloze' : 'Card'}
                  </span>
                  {card.folder_id && folderMap.has(card.folder_id) && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {folderMap.get(card.folder_id)}
                    </span>
                  )}
                  {card.concept && (
                    <span className="text-xs text-purple-400">{card.concept}</span>
                  )}
                </div>
                <p className="text-sm dark:text-gray-200 truncate">
                  {card.front.length > 100 ? card.front.slice(0, 100) + '...' : card.front}
                </p>
              </div>
              {/* Date & Schedule info */}
              <div className="text-right text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                <div>{new Date(card.created_at).toLocaleDateString()}</div>
                {schedules?.has(card.id) && (
                  <div className="text-purple-400 dark:text-purple-500">
                    Due: {new Date(schedules.get(card.id)!.due_date).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors dark:text-gray-200"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 rounded-lg transition-colors dark:text-gray-200"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default CardBrowser
