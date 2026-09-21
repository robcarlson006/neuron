import React, { useState } from 'react'
import InteractiveGraph from './InteractiveGraph'
import { Activity, Maximize2, Minimize2, RefreshCw } from '../icons'

export interface GraphContainerProps {
  spec: Record<string, any>
  title?: string
  description?: string
  className?: string
}

export default function GraphContainer({
  spec,
  title,
  description,
  className = ''
}: GraphContainerProps): React.JSX.Element {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Detect dark mode from documentElement or parent theme class
  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const chartTitle = title || spec.title?.text || (typeof spec.title === 'string' ? spec.title : 'Interactive Model')
  const chartDesc = description || (spec.description ? spec.description : '')

  return (
    <div
      className={`my-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/40 p-3 shadow-xs transition-all ${
        isFullscreen
          ? 'fixed inset-4 z-50 flex flex-col bg-white dark:bg-slate-900 p-6 shadow-2xl border-slate-300 dark:border-slate-700'
          : ''
      } ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 mb-2.5 pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 shrink-0">
            <Activity size={14} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {chartTitle}
            </h4>
            {chartDesc && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {chartDesc}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Reset model parameters"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            title={isFullscreen ? 'Exit full screen' : 'Expand graph'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Main chart sandbox */}
      <div className={`w-full ${isFullscreen ? 'flex-1 overflow-auto' : ''}`}>
        <InteractiveGraph
          key={refreshKey}
          spec={spec}
          theme={isDarkMode ? 'dark' : 'light'}
          minHeight={isFullscreen ? 500 : 280}
        />
      </div>
    </div>
  )
}
