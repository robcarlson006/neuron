import React, { useEffect, useState } from 'react'

interface UndoToastProps {
  visible: boolean
  onUndo: () => void
  onTimeout: () => void
  timeoutMs?: number
}

const UndoToast: React.FC<UndoToastProps> = ({
  visible,
  onUndo,
  onTimeout,
  timeoutMs = 5000,
}) => {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    if (!visible) {
      setProgress(100)
      return
    }

    const interval = 50 // update every 50ms
    const step = (interval / timeoutMs) * 100
    setProgress(100)

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer)
          return 0
        }
        return prev - step
      })
    }, interval)

    const timeout = setTimeout(() => {
      clearInterval(timer)
      onTimeout()
    }, timeoutMs)

    return () => {
      clearInterval(timer)
      clearTimeout(timeout)
    }
  }, [visible, timeoutMs, onTimeout])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-50 animate-slide-in"
      role="status"
      aria-live="polite"
    >
      <div className="bg-gray-900 dark:bg-gray-700 text-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm">Review recorded</span>
          <button
            onClick={onUndo}
            className="px-3 py-1.5 text-sm font-medium bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400"
            aria-label="Undo last review"
          >
            Undo
          </button>
        </div>
        {/* Progress bar */}
        <div
          className="h-0.5 bg-purple-500 transition-all duration-75"
          style={{ width: `${Math.max(0, progress)}%` }}
        />
      </div>
    </div>
  )
}

export default UndoToast
