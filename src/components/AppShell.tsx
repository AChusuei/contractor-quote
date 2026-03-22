import { Outlet } from "react-router-dom"

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <span className="font-semibold text-sm">Contractor Quote</span>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
