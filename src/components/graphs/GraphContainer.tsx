import React, { useState } from 'react'
import InteractiveGraph from './InteractiveGraph'
import { Activity, Maximize2, Minimize2, RefreshCw, Plus, Minus } from '../icons'
import { latexToUnicodeText } from './latexGraphUtils'

export interface GraphContainerProps {
  spec: Record<string, any>
  title?: string
  description?: string
  className?: string
}

type HeightPreset = 'compact' | 'standard' | 'tall'

const HEIGHT_PRESETS: Record<HeightPreset, { label: string; height: number; fsHeight: number }> = {
  compact: { label: 'Compact', height: 280, fsHeight: 460 },
  standard: { label: 'Standard', height: 360, fsHeight: 560 },
  tall: { label: 'Tall', height: 480, fsHeight: 680 }
}

export default function GraphContainer({
  spec,
  title,
  description,
  className = ''
}: GraphContainerProps): React.JSX.Element {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [scale, setScale] = useState(1.0)
  const [heightPreset, setHeightPreset] = useState<HeightPreset>('standard')

  // Detect dark mode from documentElement or parent theme class
  const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const rawTitle = title || spec.title?.text || (typeof spec.title === 'string' ? spec.title : 'Interactive Model')
  const rawDesc = description || (spec.description ? spec.description : '')

  const chartTitle = latexToUnicodeText(rawTitle)
  const chartDesc = latexToUnicodeText(rawDesc)

  const currentHeightConfig = HEIGHT_PRESETS[heightPreset]
  const targetMinHeight = isFullscreen ? currentHeightConfig.fsHeight : currentHeightConfig.height

  function handleZoomIn() {
    setScale((prev) => Math.min(2.0, Number((prev + 0.15).toFixed(2))))
  }

  function handleZoomOut() {
    setScale((prev) => Math.max(0.6, Number((prev - 0.15).toFixed(2))))
  }

  function handleResetScale() {
    setScale(1.0)
  }

  function handleFullReset() {
    setScale(1.0)
    setHeightPreset('standard')
    setRefreshKey((k) => k + 1)
  }

  return (
    <div
      className={`my-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/40 p-3.5 shadow-xs transition-all ${
        isFullscreen
          ? 'fixed inset-4 z-50 flex flex-col bg-white dark:bg-slate-900 p-6 shadow-2xl border-slate-300 dark:border-slate-700'
          : ''
      } ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 shrink-0">
            <Activity size={15} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs md:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {chartTitle}
            </h4>
            {chartDesc && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {chartDesc}
              </p>
            )}
          </div>
        </div>

        {/* Action & Scaling Controls */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Height Preset Selector */}
          <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-slate-200/60 dark:bg-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-400">
            {(['compact', 'standard', 'tall'] as HeightPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setHeightPreset(preset)}
                className={`px-2 py-0.5 rounded-md transition-all capitalize ${
                  heightPreset === preset
                    ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-300 shadow-xs font-semibold'
                    : 'hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title={`Adjust graph height to ${preset}`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Scale / Zoom controls */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 0.6}
              title="Zoom out (Scale down)"
              className="p-1 rounded text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <Minus size={12} />
            </button>
            <button
              type="button"
              onClick={handleResetScale}
              title="Click to reset scale to 100%"
              className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 font-mono tracking-tighter"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 2.0}
              title="Zoom in (Scale up)"
              className="p-1 rounded text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Reset Model & View */}
          <button
            type="button"
            onClick={handleFullReset}
            title="Reset model parameters and view"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw size={13} />
          </button>

          {/* Fullscreen Expand/Collapse */}
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
          scale={scale}
          onScaleChange={setScale}
          minHeight={targetMinHeight}
        />
      </div>
    </div>
  )
}
