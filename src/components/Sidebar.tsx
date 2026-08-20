import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import NeuronLogo from './NeuronLogo'

function IconGrid(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

function IconCalendar(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M5 2V4M11 2V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 7H14" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" />
      <circle cx="10.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  )
}

function IconChart(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="11" y="3" width="3" height="11" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconTutor(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7z" fill="currentColor" opacity="0.6" />
      <path d="M8 4.5a2 2 0 100 4 2 2 0 000-4zM4.5 11.5c0-1.5 1.5-2.5 3.5-2.5s3.5 1 3.5 2.5" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

function IconCog(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.596 3.404L11.535 4.465M4.465 11.535L3.404 12.596M12.596 12.596L11.535 11.535M4.465 4.465L3.404 3.404" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconMoon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 8.5C11.5 9 10.4 9.3 9.2 9.3C5.9 9.3 3.2 6.6 3.2 3.3C3.2 2.1 3.5 1 4 0.2C2 1 0.5 3 0.5 5.3C0.5 8.6 3.2 11.3 6.5 11.3C8.8 11.3 10.8 10 12.5 8.5Z" fill="currentColor" />
    </svg>
  )
}

function IconSun(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="3" fill="currentColor" />
      <path d="M7 1V2M7 12V13M1 7H2M12 7H13M2.929 2.929L3.636 3.636M10.364 10.364L11.071 11.071M2.929 11.071L3.636 10.364M10.364 3.636L11.071 2.929" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const mainNavItems = [
  { to: '/', label: 'Dashboard', icon: <IconGrid /> },
  { to: '/tutor', label: 'Tutor', icon: <IconTutor /> },
  { to: '/calendar', label: 'Calendar', icon: <IconCalendar /> },
]

const progressNavItems = [
  { to: '/analytics', label: 'Analytics', icon: <IconChart /> },
]

const settingsNavItems = [
  { to: '/settings', label: 'Settings', icon: <IconCog /> },
]

export default function Sidebar({ onNewClass }: { onNewClass?: () => void }): React.JSX.Element {
  const { user, subjects, toggleTheme, theme } = useAppStore()

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <aside className="w-60 min-h-screen bg-neuron-100 dark:bg-neuron-950 border-r border-neuron-200 dark:border-neuron-800 flex flex-col flex-shrink-0">
      {/* App branding */}
      <div className="px-5 pt-10 pb-5 border-b border-neuron-200 dark:border-neuron-800">
        <div className="flex items-center gap-3">
          <NeuronLogo size={32} className="flex-shrink-0 rounded-lg" />
          <span className="font-semibold text-neuron-900 dark:text-neuron-100 text-base tracking-tight">Neuron</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {/* STUDY section */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neuron-400 dark:text-neuron-500 px-2 mb-2">
            Study
          </p>
          <div className="space-y-0.5">
            {mainNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-neuron-200 dark:bg-neuron-800/50 text-neuron-700 dark:text-neuron-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-neuron-200/60 dark:hover:bg-neuron-900/40 hover:text-neuron-800 dark:hover:text-neuron-200'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-neuron-600 dark:text-neuron-400' : 'text-slate-400 dark:text-slate-500'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        {/* PROGRESS section */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neuron-400 dark:text-neuron-500 px-2 mb-2">
            Progress
          </p>
          <div className="space-y-0.5">
            {progressNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-neuron-200 dark:bg-neuron-800/50 text-neuron-700 dark:text-neuron-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-neuron-200/60 dark:hover:bg-neuron-900/40 hover:text-neuron-800 dark:hover:text-neuron-200'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-neuron-600 dark:text-neuron-400' : 'text-slate-400 dark:text-slate-500'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        {/* All subjects — merged from Classes + Subjects */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-xs font-medium uppercase tracking-wide text-neuron-400 dark:text-neuron-500">
              Subjects
            </p>
            {onNewClass && (
              <button
                onClick={onNewClass}
                className="w-5 h-5 rounded flex items-center justify-center text-neuron-400 hover:text-neuron-600 dark:hover:text-neuron-400 hover:bg-neuron-200 dark:hover:bg-neuron-800 text-sm leading-none transition-colors"
                title="New subject / class"
              >
                +
              </button>
            )}
          </div>
          <div className="space-y-0.5 max-h-44 overflow-y-auto">
            {subjects.filter(s => s.status !== 'archived').map((subject) => (
              <NavLink
                key={subject.id}
                to={`/subject/${subject.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors truncate ${
                    isActive
                      ? 'bg-neuron-200 dark:bg-neuron-800/50 text-neuron-700 dark:text-neuron-300'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-neuron-200/60 dark:hover:bg-neuron-900/40 hover:text-neuron-800 dark:hover:text-neuron-200'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex-shrink-0 ${isActive ? 'text-neuron-500' : 'text-slate-400'}`}>
                      {subject.subject_type === 'book' ? '📖' : subject.subject_type === 'class' ? '🏫' : '•'}
                    </span>
                    <span className="truncate">{subject.name}</span>
                  </>
                )}
              </NavLink>
            ))}
            {subjects.filter(s => s.status !== 'archived').length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 px-2.5 py-1">No subjects yet</p>
            )}
          </div>
        </div>

        {/* SETTINGS section */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neuron-400 dark:text-neuron-500 px-2 mb-2">
            Settings
          </p>
          <div className="space-y-0.5">
            {settingsNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-neuron-200 dark:bg-neuron-800/50 text-neuron-700 dark:text-neuron-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-neuron-200/60 dark:hover:bg-neuron-900/40 hover:text-neuron-800 dark:hover:text-neuron-200'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-neuron-600 dark:text-neuron-400' : 'text-slate-400 dark:text-slate-500'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Footer: user + theme toggle */}
      <div className="px-3 py-4 border-t border-neuron-200 dark:border-neuron-800 space-y-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-neuron-500 dark:text-neuron-400 hover:bg-neuron-200 dark:hover:bg-neuron-900/40 hover:text-neuron-700 dark:hover:text-neuron-200 transition-colors"
        >
          <span className="text-neuron-400 dark:text-neuron-500">
            {theme === 'light' ? <IconMoon /> : <IconSun />}
          </span>
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>

        {/* User */}
        {user && (
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-neuron-400 to-sky-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {initials}
            </div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
              {user.name}
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
