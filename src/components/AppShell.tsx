import { Outlet } from "react-router-dom"
import { DevToolbar } from "@/components/DevToolbar"
import staticLogoUrl from "@/assets/logo.png"
import { useContractor } from "@/hooks/useContractor"

export function AppShell() {
  const { contractor, loading, error } = useContractor()
  const logoUrl = contractor?.logoUrl ?? staticLogoUrl

  return (
    <div className="min-h-screen bg-background">
      <DevToolbar />
      <header className="flex h-14 shrink-0 items-center border-b px-6">
        {logoUrl
          ? <img src={logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
          : <span className="font-semibold text-sm">Contractor Quote</span>
        }
      </header>
      <main className="p-6">
        {!loading && error && !contractor
          ? <p className="text-muted-foreground">{error}</p>
          : <Outlet />
        }
      </main>
    </div>
  )
}
