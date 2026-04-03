import { Outlet } from "react-router-dom"
import { DevToolbar } from "@/components/DevToolbar"
import staticLogoUrl from "@/assets/logo.png"
import { useContractor } from "@/hooks/useContractor"

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)

export function AppShell() {
  const { contractor, loading, error } = useContractor()

  if (isLocalhost && !loading && !contractor) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          {error ?? "Select a contractor from the admin portal to preview the intake form."}
        </p>
      </div>
    )
  }


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
