import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout({ onNewClass }: { onNewClass?: () => void }): React.JSX.Element {
  return (
    <div className="flex h-full w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar onNewClass={onNewClass} />
      <main className="flex-1 min-h-0 min-w-0 h-full overflow-y-auto overflow-x-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
