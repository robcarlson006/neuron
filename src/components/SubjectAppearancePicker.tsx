import React, { useMemo, useState } from 'react'

export const DEFAULT_SUBJECT_ICON = 'book-open'
export const DEFAULT_SUBJECT_COLOR = '#8b5cf6'

export const SUBJECT_COLORS = [
  '#8b5cf6', '#2563eb', '#0891b2', '#059669', '#65a30d', '#ca8a04',
  '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#475569', '#0f766e'
]

type IconShape = { name: string; path: string; category: string }

// Deliberately kept as data rather than a component map so the catalog is easy to extend.
// These are simple, bundled SVG silhouettes that remain crisp at sidebar and card sizes.
export const SUBJECT_ICONS: IconShape[] = [
  ['book-open', 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z', 'Study'],
  ['graduation-cap', 'm3 10 9-5 9 5-9 5-9-5Zm3 2.5V17c3.5 2 8.5 2 12 0v-4.5M21 10v6', 'Study'],
  ['library', 'M3 21h18M5 18V8m4 10V8m6 10V8m4 10V8M3 8l9-5 9 5', 'Study'],
  ['pencil', 'm4 20 4.3-.9L19 8.4a2.1 2.1 0 0 0-3-3l-10.7 10.7zM13.5 7.5l3 3', 'Study'],
  ['flask', 'M9 3h6m-4 0v5l-5.5 9.2A1.8 1.8 0 0 0 7 20h10a1.8 1.8 0 0 0 1.5-2.8L13 8V3M7.5 16h9', 'Science'],
  ['microscope', 'M6 20h12M9 20a6 6 0 0 1 6-6h2M12 14V5m0 0 3-2m-3 2H9m6 0v5m-8 4h8M8 10h4', 'Science'],
  ['atom', 'M12 12h.01M19.1 4.9c2.7 2.7-1.2 8.9-7.1 13S.8 22.8 3.5 20.1 4.7 11.2 10.6 7.1 16.4 2.2 19.1 4.9ZM4.9 4.9C2.2 7.6 6.1 13.8 12 17.9s11.2 4.9 13.9 2.2-1.2-8.9-7.1-13S7.6 2.2 4.9 4.9Z', 'Science'],
  ['test-tube', 'M9 3h6m-5 0v6.2L5.5 17a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3L14 9.2V3M7 15h10', 'Science'],
  ['dna', 'M8 3c8 3 8 15 0 18M16 3C8 6 8 18 16 21M6 7h12M6 12h12M6 17h12', 'Science'],
  ['calculator', 'M5 3h14v18H5zM8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01', 'Math'],
  ['sigma', 'M18 5H6l6 7-6 7h12', 'Math'],
  ['chart', 'M4 19V5m0 14h16M8 16v-5m4 5V7m4 9v-8', 'Math'],
  ['function', 'M5 19c5 0 2-14 7-14 3 0 2 5 7 5M4 9h4m8 6h4', 'Math'],
  ['globe', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.2 2.4 3.2 5.4 3.2 9s-1 6.6-3.2 9c-2.2-2.4-3.2-5.4-3.2-9S9.8 5.4 12 3Z', 'Humanities'],
  ['landmark', 'M3 21h18M5 18h14M5 10h14M4 10l8-5 8 5M7 10v8m5-8v8m5-8v8', 'Humanities'],
  ['scroll', 'M6 3h12v15a3 3 0 0 1-3 3H6a3 3 0 0 1 0-6h12M6 15h12M9 7h6m-6 4h4', 'Humanities'],
  ['languages', 'M4 5h8M8 3v2a9 9 0 0 1-4 7m2-3c1 2 3 3 6 4M14 19l4-10 4 10m-6-3h4', 'Humanities'],
  ['music', 'M9 18V5l10-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm10-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z', 'Creative'],
  ['palette', 'M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a1.5 1.5 0 0 1 0-3h3a6 6 0 0 0 0-12ZM7 10h.01M9 7h.01M14 7h.01M17 10h.01', 'Creative'],
  ['camera', 'M4 7h4l1.5-2h5L16 7h4v12H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'Creative'],
  ['film', 'M4 4h16v16H4zM4 8h16M4 16h16M8 4v4m8-4v4m-8 8v4m8-4v4', 'Creative'],
  ['heart', 'm12 20-1.5-1.4C5 13.6 2 10.8 2 7.4A4.4 4.4 0 0 1 6.4 3c1.7 0 3.3.8 4.3 2.1A5.2 5.2 0 0 1 15.6 3 4.4 4.4 0 0 1 20 7.4c0 3.4-3 6.2-8.5 11.2z', 'Life'],
  ['stethoscope', 'M6 4v5a4 4 0 0 0 8 0V4M4 4h4m4 0h4m-4 9v3a4 4 0 0 0 8 0v-2m0 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'Life'],
  ['leaf', 'M20 4C10 4 4 8 4 14c0 3 2 6 6 6 6 0 10-6 10-16ZM4 20c3-5 7-8 12-10', 'Life'],
  ['brain', 'M9 4a3 3 0 0 0-5 2 3 3 0 0 0 1 5 3 3 0 0 0 3 5 3 3 0 0 0 4-2 3 3 0 0 0 5-3 3 3 0 0 0-1-5 3 3 0 0 0-5-2 3 3 0 0 0-3-2Zm3 0v16', 'Life'],
  ['briefcase', 'M4 7h16v13H4zM8 7V5h8v2M4 12h16M10 12v2h4v-2', 'Work'],
  ['target', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'Work'],
  ['rocket', 'm13 4 7-1-1 7-4 4-5-1-1-5zM9 15l-4 4m3-1-3 0 0-3m8-8 2 2M7 17l-3 3', 'Work'],
  ['lightbulb', 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3 11c.6.4 1 1.2 1 2h4c0-.8.4-1.6 1-2a6 6 0 0 0-3-11Z', 'Work'],
  ['calendar', 'M5 4h14v17H5zM8 2v4m8-4v4M5 9h14M8 13h3m-3 4h3', 'Work'],
  ['shield', 'm12 3 7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4', 'Work'],
  ['code', 'm8 9-4 3 4 3m8-6 4 3-4 3m-3 3 2-12', 'Technology'],
  ['database', 'M5 6c0-2 14-2 14 0v12c0 2-14 2-14 0zM5 6c0 2 14 2 14 0M5 12c0 2 14 2 14 0', 'Technology'],
  ['terminal', 'm5 7 4 5-4 5m6 0h7', 'Technology'],
  ['wifi', 'M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0m-9 4a4 4 0 0 1 6 0M12 20h.01', 'Technology'],
  ['wrench', 'm14 6 4-3 3 3-3 4 0 3-4 4-3 3-3-3-4-3 4-3 4-4-3-3-3-4 3 3-4 0-3 4 3 3-3 4 3 3Z', 'Technology'],
  ['coffee', 'M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v3m4-3v3m4-3v3', 'Everyday'],
  ['home', 'm3 11 9-8 9 8v9H3zM9 20v-6h6v6', 'Everyday'],
  ['map', 'm3 5 6-2 6 2 6-2v16l-6 2-6-2zM9 3v16m6-14v16', 'Everyday'],
  ['sun', 'M12 3v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M3 12h2m14 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'Everyday'],
  ['star', 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z', 'Everyday'],
  ['gamepad', 'M6 8h12a4 4 0 0 1 3.8 5l-1.1 4a2.5 2.5 0 0 1-4.2 1.1L14 16H10l-2.5 2.1A2.5 2.5 0 0 1 3.3 17l-1.1-4A4 4 0 0 1 6 8Zm1 3v4m-2-2h4m8-1h.01m3 2h.01', 'Everyday'],
  ['umbrella', 'M4 13a8 8 0 0 1 16 0H4Zm8 0v5a2 2 0 0 0 4 0', 'Everyday'],
].map(([name, path, category]) => ({ name, path, category }))

export function getSubjectIcon(iconName?: string): IconShape {
  return SUBJECT_ICONS.find(icon => icon.name === iconName) || SUBJECT_ICONS[0]
}

export function SubjectIcon({ name, color = DEFAULT_SUBJECT_COLOR, size = 24, title, className = '' }: { name?: string; color?: string; size?: number; title?: string; className?: string }): React.JSX.Element {
  const icon = getSubjectIcon(name)
  return (
    <svg aria-label={title} role={title ? 'img' : undefined} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`block shrink-0 ${className}`}>
      <path d={icon.path} />
    </svg>
  )
}

export default function SubjectAppearancePicker({ icon, color, onIconChange, onColorChange }: { icon?: string; color?: string; onIconChange: (value: string) => void; onColorChange: (value: string) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const selectedIcon = getSubjectIcon(icon)
  const selectedColor = color || DEFAULT_SUBJECT_COLOR
  const filteredIcons = useMemo(() => SUBJECT_ICONS.filter(item => !query.trim() || `${item.name} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase())), [query])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
        <div className="subject-icon-frame h-12 w-12 rounded-xl bg-white shadow-sm dark:bg-slate-800">
          <SubjectIcon name={selectedIcon.name} color={selectedColor} size={22} title={`${selectedIcon.name} preview`} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Subject logo</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Choose an icon and make it yours with a color.</p>
        </div>
      </div>

      <div>
        <label htmlFor="subject-icon-search" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Browse icons</label>
        <input id="subject-icon-search" className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search icons, like science or work" />
      </div>

      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          {filteredIcons.map(item => (
            <button key={item.name} type="button" aria-label={`Choose ${item.name} icon`} aria-pressed={selectedIcon.name === item.name} title={item.name.replace('-', ' ')} onClick={() => onIconChange(item.name)} className={`flex h-10 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 ${selectedIcon.name === item.name ? 'bg-violet-100 dark:bg-violet-900/50' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
              <SubjectIcon name={item.name} color={selectedIcon.name === item.name ? selectedColor : '#64748b'} size={21} />
            </button>
          ))}
        </div>
        {filteredIcons.length === 0 && <p className="p-4 text-center text-sm text-slate-400">No icons match that search.</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Logo color</label>
        <div className="flex flex-wrap items-center gap-2">
          {SUBJECT_COLORS.map(preset => <button key={preset} type="button" aria-label={`Choose color ${preset}`} aria-pressed={selectedColor.toLowerCase() === preset} onClick={() => onColorChange(preset)} className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${selectedColor.toLowerCase() === preset ? 'border-slate-900 dark:border-white' : 'border-transparent'}`} style={{ backgroundColor: preset }} />)}
          <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <input aria-label="Choose custom logo color" type="color" value={selectedColor} onChange={event => onColorChange(event.target.value)} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" />
            Custom
          </label>
        </div>
      </div>
    </div>
  )
}
