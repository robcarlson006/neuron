import React from 'react'

interface CurriculumProgressBarProps {
  completed: number
  total: number
}

export default function CurriculumProgressBar({
  completed,
  total
}: CurriculumProgressBarProps): React.JSX.Element {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">
        {completed}/{total} modules
      </span>
    </div>
  )
}
