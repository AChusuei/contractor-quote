import { Outlet } from "react-router-dom"

const LOGO_URL = import.meta.env.VITE_CQ_LOGO_URL as string | undefined

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        {LOGO_URL
          ? <img src={LOGO_URL} alt="Logo" className="h-8 w-auto object-contain" />
          : <span className="font-semibold text-sm">Contractor Quote</span>
        }
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
