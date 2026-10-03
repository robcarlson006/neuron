import React from 'react'

export type TopActionButtonVariant = 'primary' | 'accent' | 'soft' | 'quiet'

interface TopActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TopActionButtonVariant
  icon?: React.ReactNode
}

const variantClasses: Record<TopActionButtonVariant, string> = {
  primary: 'bg-violet-600 text-white shadow-sm shadow-violet-600/20 hover:bg-violet-700 focus-visible:ring-violet-500',
  accent: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700 focus-visible:ring-emerald-500',
  soft: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/80 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-800/70 dark:hover:bg-violet-900/50 focus-visible:ring-violet-500',
  quiet: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700 focus-visible:ring-violet-500'
}

export default function TopActionButton({
  variant = 'quiet',
  icon,
  className = '',
  type = 'button',
  children,
  ...props
}: TopActionButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  )
}
