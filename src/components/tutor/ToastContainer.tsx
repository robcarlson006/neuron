import React from 'react'
import { useAppStore } from '../../store/appStore'

export default function ToastContainer(): React.JSX.Element | null {
  const { toasts, removeToast } = useAppStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => {
        const bgColor = toast.type === 'success'
          ? 'bg-emerald-600'
          : toast.type === 'error'
            ? 'bg-red-600'
            : 'bg-slate-800 dark:bg-slate-700'

        return (
          <div
            key={toast.id}
            className={`${bgColor} text-white rounded-xl shadow-2xl px-4 py-3 animate-slide-in flex items-start gap-3`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.message && (
                <p className="text-xs opacity-90 mt-0.5">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="opacity-70 hover:opacity-100 transition-opacity flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
