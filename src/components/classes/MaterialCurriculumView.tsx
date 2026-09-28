import React, { useEffect, useState } from 'react'
import type { MaterialCurriculumPlan } from '../../types'

interface MaterialCurriculumViewProps {
  subjectId: number
  subjectName?: string
  onStartTutor?: (groupId?: number, materialIds?: number[], groupTitle?: string, mode?: string) => void
  onStartSpacedReview?: (groupId?: number, materialIds?: number[], groupTitle?: string) => void
  onGenerateCards?: (groupId: number, materialIds: number[]) => void
  loadingCards?: Record<number, boolean>
}

export default function MaterialCurriculumView({
  subjectId,
  subjectName,
  onStartTutor,
  onStartSpacedReview,
  onGenerateCards,
  loadingCards
}: MaterialCurriculumViewProps): React.JSX.Element {
  const [plan, setPlan] = useState<MaterialCurriculumPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [dragOverTarget, setDragOverTarget] = useState<number | 'unscheduled' | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedMaterialsByGroup, setSelectedMaterialsByGroup] = useState<Record<string, Set<number>>>({})

  const getSelectedIds = (groupId: number | 'unscheduled', materials: { id: number }[]): number[] => {
    const key = String(groupId)
    const custom = selectedMaterialsByGroup[key]
    if (custom) return materials.filter(m => custom.has(m.id)).map(m => m.id)
    return materials.map(m => m.id)
  }

  const toggleMaterial = (groupId: number | 'unscheduled', materialId: number, materials: { id: number }[]) => {
    const key = String(groupId)
    setSelectedMaterialsByGroup(prev => {
      const current = prev[key] ? new Set(prev[key]) : new Set(materials.map(m => m.id))
      if (current.has(materialId)) {
        current.delete(materialId)
      } else {
        current.add(materialId)
      }
      return { ...prev, [key]: current }
    })
  }

  const selectAll = (groupId: number | 'unscheduled', materials: { id: number }[]) => {
    const key = String(groupId)
    setSelectedMaterialsByGroup(prev => ({
      ...prev,
      [key]: new Set(materials.map(m => m.id))
    }))
  }

  const clearAll = (groupId: number | 'unscheduled') => {
    const key = String(groupId)
    setSelectedMaterialsByGroup(prev => ({
      ...prev,
      [key]: new Set()
    }))
  }

  const load = async () => {
    try {
      setError(null)
      setPlan(await window.electronAPI.syllabusGetMaterialPlan(subjectId))
    } catch (err: any) {
      console.error('Failed to load material plan:', err)
      setError(err?.message || 'Failed to load class order.')
    }
  }

  useEffect(() => { void load() }, [subjectId])

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-sm">
        <p className="font-semibold mb-1">Error loading curriculum</p>
        <p>{error}</p>
        <button type="button" onClick={() => void load()} className="mt-2 text-red-700 dark:text-red-300 underline text-xs font-medium">Try again</button>
      </div>
    )
  }

  if (!plan) return <p className="text-sm text-slate-400 py-8">Loading class order…</p>

  const moveGroup = async (id: number, direction: -1 | 1) => {
    const ids = plan.groups.map(group => group.id)
    const index = ids.indexOf(id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      setIsUpdating(true)
      setPlan(await window.electronAPI.syllabusReorderMaterialGroups({ subjectId, groupIds: ids }))
    } catch (err: any) {
      console.error('Failed to reorder groups:', err)
    } finally {
      setIsUpdating(false)
    }
  }

  const moveMaterial = async (materialId: number, groupId: number | null, index: number) => {
    try {
      setIsUpdating(true)
      setPlan(await window.electronAPI.syllabusMoveMaterial({ subjectId, materialId, targetGroupId: groupId, targetIndex: index }))
    } catch (err: any) {
      console.error('Failed to move material:', err)
    } finally {
      setIsUpdating(false)
    }
  }

  const file = (
    material: { id: number; filename: string },
    groupId: number | null,
    index: number,
    groupMaterials: { id: number; filename: string }[]
  ) => {
    const scope = groupId ?? 'unscheduled'
    const selectedIds = getSelectedIds(scope, groupMaterials)
    const isSelected = selectedIds.includes(material.id)

    return (
      <li
        key={material.id}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white dark:bg-slate-800 border transition-colors shadow-xs text-xs cursor-grab active:cursor-grabbing ${
          isSelected
            ? 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            : 'border-slate-200/60 dark:border-slate-700/60 opacity-60'
        }`}
        draggable
        onDragStart={e => {
          e.stopPropagation()
          e.dataTransfer.setData('application/x-neuron-material', String(material.id))
          e.dataTransfer.setData('text/plain', String(material.id))
          e.dataTransfer.effectAllowed = 'move'
        }}
      >
        <span aria-hidden="true" className="text-slate-400 text-sm">⠿</span>

        {/* Selection Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleMaterial(scope, material.id, groupMaterials)}
          aria-label={`Select ${material.filename}`}
          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 cursor-pointer"
        />

        <span aria-hidden="true" className="text-sm">📄</span>
        <span className="flex-1 truncate font-medium text-slate-800 dark:text-slate-200" title={material.filename}>
          {material.filename}
        </span>

        {/* Individual Study & Card Action Buttons */}
        {onStartTutor && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onStartTutor(groupId ?? undefined, [material.id], material.filename, 'material')
            }}
            title={`Study ${material.filename} with AI Tutor`}
            className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>🎓</span>
            <span className="hidden sm:inline">Study</span>
          </button>
        )}

        {onGenerateCards && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onGenerateCards(groupId ?? 0, [material.id])
            }}
            title={`Generate flashcards from ${material.filename}`}
            className="px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>🃏</span>
            <span className="hidden sm:inline">Cards</span>
          </button>
        )}

        {/* Quick Move Dropdown */}
        <select
          aria-label={`Move ${material.filename} to unit`}
          value={groupId ?? 'unscheduled'}
          onChange={e => {
            const val = e.target.value
            if (val === 'unscheduled') {
              void moveMaterial(material.id, null, 0)
            } else {
              const targetG = plan.groups.find(g => g.id === Number(val))
              void moveMaterial(material.id, Number(val), targetG?.materials.length ?? 0)
            }
          }}
          className="text-[11px] bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-1 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="unscheduled">Unscheduled</option>
          {plan.groups.map(g => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>

        {/* Up/Down reordering inside group */}
        <div className="flex items-center gap-0.5 text-slate-400">
          <button
            type="button"
            aria-label={`Move ${material.filename} up`}
            onClick={() => void moveMaterial(material.id, groupId, Math.max(0, index - 1))}
            className="p-1 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${material.filename} down`}
            onClick={() => void moveMaterial(material.id, groupId, index + 1)}
            className="p-1 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            title="Move down"
          >
            ↓
          </button>
        </div>

        {groupId !== null && (
          <button
            type="button"
            aria-label={`Move ${material.filename} to unscheduled`}
            onClick={() => void moveMaterial(material.id, null, 0)}
            className="text-[11px] text-slate-400 hover:text-red-500 px-1 py-0.5 rounded transition-colors"
            title="Remove from unit"
          >
            ✕
          </button>
        )}
      </li>
    )
  }

  return (
    <div className={`space-y-4 ${isUpdating ? 'opacity-70 pointer-events-none transition-opacity' : ''}`}>
      {/* Create New Unit Bar */}
      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="e.g. Unit 1: Introduction"
          className="text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 flex-1 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          onKeyDown={async e => {
            if (e.key === 'Enter' && newTitle.trim()) {
              e.preventDefault()
              await window.electronAPI.syllabusCreateMaterialGroup({ subjectId, title: newTitle.trim() })
              setNewTitle('')
              await load()
            }
          }}
        />
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shadow-sm"
          onClick={async () => {
            if (!newTitle.trim()) return
            await window.electronAPI.syllabusCreateMaterialGroup({ subjectId, title: newTitle.trim() })
            setNewTitle('')
            await load()
          }}
        >
          Add class unit
        </button>
      </div>

      {/* Class Units List */}
      <div className="space-y-3">
        {plan.groups.map((group, groupIndex) => {
          const isOver = dragOverTarget === group.id
          return (
            <section
              key={group.id}
              className={`rounded-xl border transition-all p-3.5 ${
                isOver
                  ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-950/30 ring-2 ring-violet-500/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 shadow-sm'
              }`}
              onDragOver={e => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverTarget !== group.id) setDragOverTarget(group.id)
              }}
              onDragLeave={e => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                setDragOverTarget(null)
              }}
              onDrop={async e => {
                e.preventDefault()
                e.stopPropagation()
                setDragOverTarget(null)

                // 1. Check if dropping a material
                const materialId = Number(
                  e.dataTransfer.getData('application/x-neuron-material') ||
                  e.dataTransfer.getData('text/plain')
                )
                if (materialId) {
                  await moveMaterial(materialId, group.id, group.materials.length)
                  return
                }

                // 2. Check if reordering a group
                const draggedGroup = Number(e.dataTransfer.getData('application/x-neuron-group'))
                if (draggedGroup && draggedGroup !== group.id) {
                  const ids = plan.groups.map(g => g.id).filter(id => id !== draggedGroup)
                  ids.splice(ids.indexOf(group.id), 0, draggedGroup)
                  setPlan(await window.electronAPI.syllabusReorderMaterialGroups({ subjectId, groupIds: ids }))
                }
              }}
            >
              {/* Unit Header */}
              <div className="flex items-center gap-2 mb-2.5">
                {/* Drag handle for group reordering */}
                <span
                  draggable
                  onDragStart={e => {
                    e.stopPropagation()
                    e.dataTransfer.setData('application/x-neuron-group', String(group.id))
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 text-sm select-none"
                  title="Drag to reorder unit"
                >
                  ⠿
                </span>

                {editing === group.id ? (
                  <input
                    autoFocus
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        if (title.trim()) {
                          await window.electronAPI.syllabusRenameMaterialGroup({ subjectId, groupId: group.id, title: title.trim() })
                          await load()
                        }
                        setEditing(null)
                      } else if (e.key === 'Escape') {
                        setEditing(null)
                      }
                    }}
                    onBlur={async () => {
                      if (title.trim()) {
                        await window.electronAPI.syllabusRenameMaterialGroup({ subjectId, groupId: group.id, title: title.trim() })
                        await load()
                      }
                      setEditing(null)
                    }}
                    className="text-sm font-semibold flex-1 px-2 py-1 rounded border border-violet-400 bg-white dark:bg-slate-800"
                  />
                ) : (
                  <h3 className="font-semibold text-sm flex-1 text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {group.title}
                    <span className="text-xs font-normal text-slate-400">
                      ({group.materials.length} {group.materials.length === 1 ? 'item' : 'items'})
                    </span>
                  </h3>
                )}

                <button
                  type="button"
                  aria-label={`Rename ${group.title}`}
                  onClick={() => {
                    setEditing(group.id)
                    setTitle(group.title)
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-200/50 dark:hover:bg-slate-800"
                >
                  Rename
                </button>
                <button
                  type="button"
                  aria-label={`Move ${group.title} up`}
                  onClick={() => void moveGroup(group.id, -1)}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-1.5 py-1 rounded hover:bg-slate-200/50 dark:hover:bg-slate-800"
                  title="Move unit up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${group.title} down`}
                  onClick={() => void moveGroup(group.id, 1)}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-1.5 py-1 rounded hover:bg-slate-200/50 dark:hover:bg-slate-800"
                  title="Move unit down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={async () => {
                    if (confirm(`Delete “${group.title}”? Its materials will return to Unscheduled.`)) {
                      setPlan(await window.electronAPI.syllabusDeleteMaterialGroup({ subjectId, groupId: group.id }))
                    }
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Materials in Unit */}
              <ul className="space-y-1.5 min-h-[3rem] p-1 rounded-lg">
                {group.materials.map((material, index) => file(material, group.id, index, group.materials))}
                {group.materials.length === 0 && (
                  <li className="flex items-center justify-center py-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-400 dark:text-slate-500 select-none">
                    Drop materials here or use the &quot;Move to...&quot; dropdown.
                  </li>
                )}
              </ul>

              {/* Unit Study Options Footer */}
              {group.materials.length > 0 && (() => {
                const selectedGroupIds = getSelectedIds(group.id, group.materials)
                return (
                  <div className="mt-3 pt-3 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-700 flex-wrap">
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => selectAll(group.id, group.materials)}
                        className="text-violet-600 dark:text-violet-400 hover:underline font-medium text-[11px]"
                      >
                        Select all
                      </button>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <button
                        type="button"
                        onClick={() => clearAll(group.id)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-[11px]"
                      >
                        Clear
                      </button>
                      <span className="text-slate-400 text-[11px] ml-1">
                        ({selectedGroupIds.length}/{group.materials.length} selected)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {onStartTutor && (
                        <button
                          type="button"
                          onClick={() => {
                            const chosen = selectedGroupIds.length > 0 ? selectedGroupIds : group.materials.map(m => m.id)
                            onStartTutor(group.id, chosen, group.title, 'material')
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                          title={`Study all selected materials in ${group.title} with AI Tutor`}
                        >
                          <span>🎓</span>
                          <span>
                            {selectedGroupIds.length > 0 && selectedGroupIds.length < group.materials.length
                              ? `Start Tutor (${selectedGroupIds.length} item${selectedGroupIds.length !== 1 ? 's' : ''})`
                              : `Start Tutor (${group.title})`}
                          </span>
                        </button>
                      )}

                      {onStartSpacedReview && (
                        <button
                          type="button"
                          onClick={() => {
                            const chosen = selectedGroupIds.length > 0 ? selectedGroupIds : group.materials.map(m => m.id)
                            onStartSpacedReview(group.id, chosen, group.title)
                          }}
                          className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                          title="Launch focused spaced repetition review on this unit"
                        >
                          <span>⚡</span>
                          <span>Spaced Review</span>
                        </button>
                      )}

                      {onGenerateCards && (
                        <button
                          type="button"
                          onClick={() => {
                            const chosen = selectedGroupIds.length > 0 ? selectedGroupIds : group.materials.map(m => m.id)
                            onGenerateCards(group.id, chosen)
                          }}
                          disabled={loadingCards?.[group.id] || selectedGroupIds.length === 0}
                          className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                          title="Generate flashcards for all selected materials in this unit"
                        >
                          <span>🃏</span>
                          <span>{loadingCards?.[group.id] ? 'Generating...' : 'Generate Cards'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
              {groupIndex > 0 && <span className="sr-only">Group order {groupIndex + 1}</span>}
            </section>
          )
        })}
      </div>

      {/* Unscheduled Materials Section */}
      <section
        className={`rounded-xl border border-dashed transition-all p-3.5 ${
          dragOverTarget === 'unscheduled'
            ? 'border-violet-500 bg-violet-50/60 dark:bg-violet-950/30 ring-2 ring-violet-500/20 shadow-md'
            : 'border-slate-300 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/20'
        }`}
        aria-label="Unscheduled materials"
        onDragOver={e => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dragOverTarget !== 'unscheduled') setDragOverTarget('unscheduled')
        }}
        onDragLeave={e => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setDragOverTarget(null)
        }}
        onDrop={async e => {
          e.preventDefault()
          e.stopPropagation()
          setDragOverTarget(null)
          const materialId = Number(
            e.dataTransfer.getData('application/x-neuron-material') ||
            e.dataTransfer.getData('text/plain')
          )
          if (materialId) {
            await moveMaterial(materialId, null, 0)
          }
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            Unscheduled Materials
          </h3>
          <span className="text-xs text-slate-400">
            {plan.unscheduled.length} {plan.unscheduled.length === 1 ? 'material' : 'materials'}
          </span>
        </div>
        <ul className="space-y-1.5 min-h-[3rem] p-1 rounded-lg">
          {plan.unscheduled.map((material, index) => file(material, null, index, plan.unscheduled))}
          {plan.unscheduled.length === 0 && (
            <li className="flex items-center justify-center py-4 text-xs text-slate-400 dark:text-slate-500 select-none">
              All uploaded materials are organized into units.
            </li>
          )}
        </ul>

        {plan.unscheduled.length > 0 && (() => {
          const selectedUnscheduledIds = getSelectedIds('unscheduled', plan.unscheduled)
          return (
            <div className="mt-3 pt-3 flex items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-700/60 flex-wrap">
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => selectAll('unscheduled', plan.unscheduled)}
                  className="text-violet-600 dark:text-violet-400 hover:underline font-medium text-[11px]"
                >
                  Select all
                </button>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <button
                  type="button"
                  onClick={() => clearAll('unscheduled')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-[11px]"
                >
                  Clear
                </button>
                <span className="text-slate-400 text-[11px] ml-1">
                  ({selectedUnscheduledIds.length}/{plan.unscheduled.length} selected)
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {onStartTutor && (
                  <button
                    type="button"
                    onClick={() => {
                      const chosen = selectedUnscheduledIds.length > 0 ? selectedUnscheduledIds : plan.unscheduled.map(m => m.id)
                      onStartTutor(undefined, chosen, 'Unscheduled Materials', 'material')
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                    title="Study all selected unscheduled materials with AI Tutor"
                  >
                    <span>🎓</span>
                    <span>
                      {selectedUnscheduledIds.length > 0 && selectedUnscheduledIds.length < plan.unscheduled.length
                        ? `Start Tutor (${selectedUnscheduledIds.length} item${selectedUnscheduledIds.length !== 1 ? 's' : ''})`
                        : 'Start Tutor (Unscheduled)'}
                    </span>
                  </button>
                )}

                {onGenerateCards && (
                  <button
                    type="button"
                    onClick={() => {
                      const chosen = selectedUnscheduledIds.length > 0 ? selectedUnscheduledIds : plan.unscheduled.map(m => m.id)
                      onGenerateCards(0, chosen)
                    }}
                    disabled={loadingCards?.[0] || selectedUnscheduledIds.length === 0}
                    className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Generate flashcards for all selected unscheduled materials"
                  >
                    <span>🃏</span>
                    <span>{loadingCards?.[0] ? 'Generating...' : 'Generate Cards'}</span>
                  </button>
                )}
              </div>
            </div>
          )
        })()}
      </section>
    </div>
  )
}
