import React from 'react'

interface LoadingProgressBarProps {
  progress?: number // 0 to 100, or undefined for animated pulse
  label?: string
  sublabel?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function LoadingProgressBar({
  progress,
  label = 'Processing...',
  sublabel,
  className = '',
  size = 'md'
}: LoadingProgressBarProps): React.JSX.Element {
  const isIndeterminate = progress === undefined || progress === null
  const clampedProgress = isIndeterminate ? 0 : Math.min(100, Math.max(0, progress))

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4'
  }[size]

  return (
    <div className={`w-full space-y-2 ${className}`} data-testid="loading-progress-bar">
      {(label || sublabel) && (
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
            {label}
          </span>
          {!isIndeterminate && (
            <span className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400 shrink-0 tabular-nums">
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}

      {/* Progress Track */}
      <div className={`w-full bg-slate-100 dark:bg-slate-700/80 rounded-full overflow-hidden relative ${heightClasses}`}>
        {isIndeterminate ? (
          <div className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 rounded-full animate-pulse w-full" />
        ) : (
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all duration-300 ease-out shadow-xs"
            style={{ width: `${clampedProgress}%` }}
          />
        )}
      </div>

      {sublabel && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {sublabel}
        </p>
      )}
    </div>
  )
}
