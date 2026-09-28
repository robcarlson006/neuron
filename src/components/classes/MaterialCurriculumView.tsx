import React, { useEffect, useState } from 'react'
import type { MaterialCurriculumPlan } from '../../types'

export default function MaterialCurriculumView({ subjectId }: { subjectId: number }): React.JSX.Element {
  const [plan, setPlan] = useState<MaterialCurriculumPlan | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const load = async () => setPlan(await window.electronAPI.syllabusGetMaterialPlan(subjectId))
  useEffect(() => { void load() }, [subjectId])
  if (!plan) return <p className="text-sm text-slate-400 py-8">Loading class order…</p>
  const moveGroup = async (id: number, direction: -1 | 1) => {
    const ids = plan.groups.map(group => group.id); const index = ids.indexOf(id); const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setPlan(await window.electronAPI.syllabusReorderMaterialGroups({ subjectId, groupIds: ids }))
  }
  const moveMaterial = async (materialId: number, groupId: number | null, index: number) => setPlan(await window.electronAPI.syllabusMoveMaterial({ subjectId, materialId, targetGroupId: groupId, targetIndex: index }))
  const file = (material: { id: number; filename: string }, groupId: number | null, index: number) => (
    <li key={material.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs" draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', String(material.id)) }}>
      <span aria-hidden="true">📄</span><span className="flex-1 truncate">{material.filename}</span>
      <button type="button" aria-label={`Move ${material.filename} up`} onClick={() => void moveMaterial(material.id, groupId, Math.max(0, index - 1))}>↑</button>
      <button type="button" aria-label={`Move ${material.filename} down`} onClick={() => void moveMaterial(material.id, groupId, index + 1)}>↓</button>
      {groupId && <button type="button" aria-label={`Move ${material.filename} to unscheduled`} onClick={() => void moveMaterial(material.id, null, 0)}>Unscheduled</button>}
    </li>
  )
  return <div className="space-y-3" onDragOver={e => e.preventDefault()} onDrop={e => { const id = Number(e.dataTransfer.getData('text/plain')); if (id) void moveMaterial(id, null, 0) }}>
    <div className="flex gap-2"><input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Week 1" className="text-sm rounded-lg border px-3 py-2 flex-1" />
      <button type="button" className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm" onClick={async () => { if (!newTitle.trim()) return; await window.electronAPI.syllabusCreateMaterialGroup({ subjectId, title: newTitle }); setNewTitle(''); await load() }}>Add class unit</button></div>
    {plan.groups.map((group, groupIndex) => <section key={group.id} draggable className="rounded-xl border border-slate-200 dark:border-slate-700 p-3" onDragStart={e => e.dataTransfer.setData('application/x-neuron-group', String(group.id))} onDrop={e => { e.preventDefault(); const draggedGroup = Number(e.dataTransfer.getData('application/x-neuron-group')); if (draggedGroup && draggedGroup !== group.id) { const ids = plan.groups.map(g => g.id).filter(id => id !== draggedGroup); ids.splice(ids.indexOf(group.id), 0, draggedGroup); void window.electronAPI.syllabusReorderMaterialGroups({ subjectId, groupIds: ids }).then(setPlan); return }; const id = Number(e.dataTransfer.getData('text/plain')); if (id) void moveMaterial(id, group.id, group.materials.length) }}>
      <div className="flex items-center gap-2 mb-2">{editing === group.id ? <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onBlur={async () => { if (title.trim()) { await window.electronAPI.syllabusRenameMaterialGroup({ subjectId, groupId: group.id, title }); await load() }; setEditing(null) }} className="text-sm font-semibold flex-1" /> : <h3 className="font-semibold text-sm flex-1">{group.title}</h3>}
        <button type="button" aria-label={`Rename ${group.title}`} onClick={() => { setEditing(group.id); setTitle(group.title) }}>Rename</button><button type="button" aria-label={`Move ${group.title} up`} onClick={() => void moveGroup(group.id, -1)}>↑</button><button type="button" aria-label={`Move ${group.title} down`} onClick={() => void moveGroup(group.id, 1)}>↓</button>
        <button type="button" className="text-red-500" onClick={async () => { if (confirm(`Delete “${group.title}”? Its materials will return to Unscheduled.`)) setPlan(await window.electronAPI.syllabusDeleteMaterialGroup({ subjectId, groupId: group.id })) }}>Delete</button></div>
      <ul className="space-y-1 min-h-8">{group.materials.map((material, index) => file(material, group.id, index))}{group.materials.length === 0 && <li className="text-xs text-slate-400">Drag materials here.</li>}</ul>
      {groupIndex > 0 && <span className="sr-only">Group order {groupIndex + 1}</span>}
    </section>)}
    <section className="rounded-xl border border-dashed border-slate-300 p-3" aria-label="Unscheduled materials"><h3 className="font-semibold text-sm mb-2">Unscheduled</h3><ul className="space-y-1">{plan.unscheduled.map((material, index) => file(material, null, index))}{plan.unscheduled.length === 0 && <li className="text-xs text-slate-400">All uploaded materials are scheduled.</li>}</ul></section>
  </div>
}
