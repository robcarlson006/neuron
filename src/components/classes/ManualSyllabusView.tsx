import React, { useMemo, useState } from 'react'
import GenerateCardsModal from './GenerateCardsModal'
import type { Card, ManualSyllabusWeek, Material, ModuleCardGenOptions } from '../../types'

interface ManualSyllabusViewProps {
  subjectId: number
  subjectName?: string
  weeks: ManualSyllabusWeek[]
  materials: Material[]
  cards?: Card[]
  loadingCards?: Record<number, boolean>
  onReload: () => Promise<void>
  onTutorMaterial: (material: Material) => void
  onTutorMaterials: (materials: Material[], weekTitle?: string) => void
  onOpenMaterial: (material: Material) => void
  onGenerateCards: (week: ManualSyllabusWeek, materialIds: number[], options?: ModuleCardGenOptions) => Promise<void>
}

export default function ManualSyllabusView({
  subjectId,
  subjectName,
  weeks,
  materials,
  cards,
  loadingCards,
  onReload,
  onTutorMaterial,
  onTutorMaterials,
  onOpenMaterial,
  onGenerateCards
}: ManualSyllabusViewProps): React.JSX.Element {
  const [newWeekTitle, setNewWeekTitle] = useState('')
  const [editingWeekId, setEditingWeekId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [selectedMaterialsByWeek, setSelectedMaterialsByWeek] = useState<Record<number, Set<number>>>({})
  const [modalWeek, setModalWeek] = useState<ManualSyllabusWeek | null>(null)
  const [modalInitialMaterialId, setModalInitialMaterialId] = useState<number | undefined>(undefined)

  const assignedIds = useMemo(() => new Set(weeks.flatMap(week => week.materials.map(material => material.id))), [weeks])
  const unassigned = materials.filter(material => !assignedIds.has(material.id))

  const materialCardCounts = useMemo(() => {
    const counts = new Map<number, number>()
    if (cards) {
      for (const card of cards) {
        if (card.material_id) {
          counts.set(card.material_id, (counts.get(card.material_id) || 0) + 1)
        }
      }
    }
    return counts
  }, [cards])

  function toggleMaterialSelection(weekId: number, materialId: number): void {
    setSelectedMaterialsByWeek(prev => {
      const current = new Set(prev[weekId] || [])
      if (current.has(materialId)) {
        current.delete(materialId)
      } else {
        current.add(materialId)
      }
      return { ...prev, [weekId]: current }
    })
  }

  function selectAllMaterials(weekId: number, weekMaterials: Material[]): void {
    setSelectedMaterialsByWeek(prev => ({
      ...prev,
      [weekId]: new Set(weekMaterials.map(m => m.id))
    }))
  }

  function clearMaterialSelection(weekId: number): void {
    setSelectedMaterialsByWeek(prev => ({
      ...prev,
      [weekId]: new Set()
    }))
  }

  async function createWeek(): Promise<void> {
    const title = newWeekTitle.trim()
    if (!title) return
    await window.electronAPI.manualSyllabusCreateWeek(subjectId, title)
    setNewWeekTitle('')
    await onReload()
  }

  async function assignMaterial(weekId: number, materialId: number): Promise<void> {
    await window.electronAPI.manualSyllabusAssignMaterial(weekId, materialId)
    await onReload()
  }

  async function unassignMaterial(materialId: number): Promise<void> {
    await window.electronAPI.manualSyllabusUnassignMaterial(materialId)
    await onReload()
  }

  async function saveTitle(week: ManualSyllabusWeek): Promise<void> {
    if (editingTitle.trim()) await window.electronAPI.manualSyllabusUpdateWeek(week.id, editingTitle.trim())
    setEditingWeekId(null)
    await onReload()
  }

  async function deleteWeek(week: ManualSyllabusWeek): Promise<void> {
    if (!confirm(`Delete ${week.title}? Its materials will become unassigned.`)) return
    await window.electronAPI.manualSyllabusDeleteWeek(week.id)
    await onReload()
  }

  async function moveWeek(weekId: number, direction: -1 | 1): Promise<void> {
    const index = weeks.findIndex(week => week.id === weekId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= weeks.length) return
    const ids = weeks.map(week => week.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await window.electronAPI.manualSyllabusReorderWeeks(subjectId, ids)
    await onReload()
  }

  async function moveMaterial(week: ManualSyllabusWeek, materialId: number, direction: -1 | 1): Promise<void> {
    const index = week.materials.findIndex(material => material.id === materialId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= week.materials.length) return
    const ids = week.materials.map(material => material.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await window.electronAPI.manualSyllabusReorderMaterials(week.id, ids)
    await onReload()
  }

  function renderMaterial(material: Material, week?: ManualSyllabusWeek): React.JSX.Element {
    const isSelected = week ? (selectedMaterialsByWeek[week.id]?.has(material.id) ?? false) : false
    const cardCount = materialCardCounts.get(material.id) ?? 0

    return (
      <div
        key={material.id}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all ${
          isSelected
            ? 'border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60'
        }`}
      >
        {week && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleMaterialSelection(week.id, material.id)}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500 cursor-pointer flex-shrink-0"
            title="Select material"
          />
        )}
        <span className="text-sm shrink-0">📄</span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{material.filename}</span>

        {/* Card Count Badge */}
        {cardCount > 0 ? (
          <span
            title={`${cardCount} card${cardCount === 1 ? '' : 's'} created for this material`}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0"
          >
            <span>🃏</span>
            <span>{cardCount} card{cardCount === 1 ? '' : 's'}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (week) {
                setModalWeek(week)
                setModalInitialMaterialId(material.id)
              }
            }}
            title="No cards created for this material yet. Click to generate targeted cards."
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>⚠️ 0 cards</span>
            <span className="text-[9px] opacity-75 font-normal">· + Add</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onTutorMaterial(material)}
          className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 cursor-pointer"
        >
          Tutor
        </button>
        <button
          type="button"
          onClick={() => onOpenMaterial(material)}
          className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 cursor-pointer"
        >
          Open
        </button>
        {week && (
          <>
            <button type="button" aria-label={`Move ${material.filename} up`} onClick={() => void moveMaterial(week, material.id, -1)} disabled={week.materials[0]?.id === material.id} className="px-1 text-[10px] text-slate-400 disabled:opacity-30 cursor-pointer">↑</button>
            <button type="button" aria-label={`Move ${material.filename} down`} onClick={() => void moveMaterial(week, material.id, 1)} disabled={week.materials[week.materials.length - 1]?.id === material.id} className="px-1 text-[10px] text-slate-400 disabled:opacity-30 cursor-pointer">↓</button>
            <button type="button" aria-label={`Remove ${material.filename} from week`} onClick={() => void unassignMaterial(material.id)} className="px-1 text-xs text-slate-400 hover:text-red-500 cursor-pointer">×</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Manual</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Create your own weeks and place materials where you want them. Nothing here changes the AI Curriculum.</p>
        </div>
        <div className="flex gap-2">
          <input value={newWeekTitle} onChange={event => setNewWeekTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createWeek() }} placeholder="e.g. Week 1" className="input w-36 text-sm" />
          <button type="button" onClick={() => void createWeek()} className="btn-primary text-sm">+ Add week</button>
        </div>
      </div>

      {weeks.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">Create your first week, then add materials to it.</div>}

      {weeks.map((week, index) => {
        const selectedCount = selectedMaterialsByWeek[week.id]?.size || 0

        return (
          <section key={week.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {editingWeekId === week.id ? (
                <input autoFocus value={editingTitle} onChange={event => setEditingTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void saveTitle(week) }} className="input flex-1 text-sm" />
              ) : <h3 className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{week.title}</h3>}
              {editingWeekId === week.id ? <button type="button" onClick={() => void saveTitle(week)} className="btn-secondary text-xs">Save</button> : <button type="button" onClick={() => { setEditingWeekId(week.id); setEditingTitle(week.title) }} className="btn-secondary text-xs">Rename</button>}
              <button type="button" onClick={() => void moveWeek(week.id, -1)} disabled={index === 0} className="btn-secondary px-2 text-xs disabled:opacity-30">↑</button>
              <button type="button" onClick={() => void moveWeek(week.id, 1)} disabled={index === weeks.length - 1} className="btn-secondary px-2 text-xs disabled:opacity-30">↓</button>
              <button type="button" onClick={() => void deleteWeek(week)} className="px-2 text-xs text-slate-400 hover:text-red-500">Delete</button>
            </div>

            <div className="space-y-2">
              {/* Materials header with select all / clear */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  MATERIALS ({week.materials.length})
                </span>
                {week.materials.length > 0 && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => selectAllMaterials(week.id, week.materials)}
                      className="text-violet-600 dark:text-violet-400 hover:underline font-medium cursor-pointer"
                    >
                      Select all
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <button
                      type="button"
                      onClick={() => clearMaterialSelection(week.id)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {week.materials.map(material => renderMaterial(material, week))}

              <select aria-label={`Add material to ${week.title}`} defaultValue="" onChange={event => { const id = Number(event.target.value); if (id) void assignMaterial(week.id, id); event.target.value = '' }} className="input w-full text-sm">
                <option value="">+ Add a material to this week</option>
                {unassigned.map(material => <option key={material.id} value={material.id}>{material.filename}</option>)}
              </select>
            </div>

            {/* Action buttons matching CurriculumView */}
            <div className="mt-3 pt-3 flex items-center gap-2 border-t border-slate-200 dark:border-slate-700 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const selectedSet = selectedMaterialsByWeek[week.id] || new Set()
                  const targetMaterials = selectedSet.size > 0
                    ? week.materials.filter(m => selectedSet.has(m.id))
                    : week.materials
                  onTutorMaterials(targetMaterials, week.title)
                }}
                disabled={week.materials.length === 0}
                title={week.materials.length === 0 ? 'Add materials to this week first' : 'Launch AI Tutor for this week'}
                className="flex-1 min-w-[120px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
              >
                <span>🎓</span>
                <span>
                  {selectedCount > 0
                    ? `Start Tutor (${selectedCount} material${selectedCount > 1 ? 's' : ''})`
                    : 'Start Tutor'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalWeek(week)
                  const selectedSet = selectedMaterialsByWeek[week.id]
                  if (selectedSet && selectedSet.size === 1) {
                    setModalInitialMaterialId(Array.from(selectedSet)[0])
                  } else {
                    setModalInitialMaterialId(undefined)
                  }
                }}
                disabled={week.materials.length === 0 || Boolean(loadingCards?.[week.id])}
                title={week.materials.length === 0 ? 'Add materials to this week first' : 'Generate flashcards or active recall questions'}
                className="flex-1 min-w-[120px] px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>{loadingCards?.[week.id] ? '⏳' : '🃏'}</span>
                <span>
                  {loadingCards?.[week.id]
                    ? 'Generating...'
                    : selectedCount > 0
                      ? `Generate Cards (${selectedCount})`
                      : 'Generate Cards'}
                </span>
              </button>
            </div>
          </section>
        )
      })}

      {unassigned.length > 0 && (
        <section className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Unassigned materials</h3>
          <div className="space-y-2">{unassigned.map(material => renderMaterial(material))}</div>
        </section>
      )}

      {/* Card Generation Modal for Week */}
      {modalWeek && (
        <GenerateCardsModal
          isOpen={!!modalWeek}
          week={modalWeek}
          subjectName={subjectName}
          initialMaterialId={modalInitialMaterialId}
          isGenerating={Boolean(loadingCards?.[modalWeek.id])}
          onClose={() => {
            setModalWeek(null)
            setModalInitialMaterialId(undefined)
          }}
          onGenerate={async (options) => {
            const wk = modalWeek
            const selectedSet = selectedMaterialsByWeek[wk.id]
            const targetMaterialIds = options.materialIds || (selectedSet && selectedSet.size > 0
              ? Array.from(selectedSet)
              : wk.materials.map(m => m.id))
            setModalWeek(null)
            setModalInitialMaterialId(undefined)
            await onGenerateCards(wk, targetMaterialIds, options)
          }}
        />
      )}
    </div>
  )
}

