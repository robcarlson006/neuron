import React, { useMemo, useState } from 'react'
import type { ManualSyllabusWeek, Material } from '../../types'

interface ManualSyllabusViewProps {
  subjectId: number
  weeks: ManualSyllabusWeek[]
  materials: Material[]
  onReload: () => Promise<void>
  onTutorMaterial: (material: Material) => void
  onOpenMaterial: (material: Material) => void
}

export default function ManualSyllabusView({ subjectId, weeks, materials, onReload, onTutorMaterial, onOpenMaterial }: ManualSyllabusViewProps): React.JSX.Element {
  const [newWeekTitle, setNewWeekTitle] = useState('')
  const [editingWeekId, setEditingWeekId] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const assignedIds = useMemo(() => new Set(weeks.flatMap(week => week.materials.map(material => material.id))), [weeks])
  const unassigned = materials.filter(material => !assignedIds.has(material.id))

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
    return (
      <div key={material.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
        <span className="text-sm">📄</span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{material.filename}</span>
        <button type="button" onClick={() => onTutorMaterial(material)} className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300">Tutor</button>
        <button type="button" onClick={() => onOpenMaterial(material)} className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">Open</button>
        {week && <>
          <button type="button" aria-label={`Move ${material.filename} up`} onClick={() => void moveMaterial(week, material.id, -1)} disabled={week.materials[0]?.id === material.id} className="px-1 text-[10px] text-slate-400 disabled:opacity-30">↑</button>
          <button type="button" aria-label={`Move ${material.filename} down`} onClick={() => void moveMaterial(week, material.id, 1)} disabled={week.materials[week.materials.length - 1]?.id === material.id} className="px-1 text-[10px] text-slate-400 disabled:opacity-30">↓</button>
          <button type="button" aria-label={`Remove ${material.filename} from week`} onClick={() => void unassignMaterial(material.id)} className="px-1 text-xs text-slate-400 hover:text-red-500">×</button>
        </>}
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

      {weeks.map((week, index) => (
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
            {week.materials.map(material => renderMaterial(material, week))}
            <select aria-label={`Add material to ${week.title}`} defaultValue="" onChange={event => { const id = Number(event.target.value); if (id) void assignMaterial(week.id, id); event.target.value = '' }} className="input w-full text-sm">
              <option value="">+ Add a material to this week</option>
              {unassigned.map(material => <option key={material.id} value={material.id}>{material.filename}</option>)}
            </select>
          </div>
        </section>
      ))}

      {unassigned.length > 0 && <section className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700"><h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Unassigned materials</h3><div className="space-y-2">{unassigned.map(material => renderMaterial(material))}</div></section>}
    </div>
  )
}
