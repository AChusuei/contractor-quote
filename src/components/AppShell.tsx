import { useState, useEffect } from "react"
import { Outlet } from "react-router-dom"
import { DevToolbar } from "@/components/DevToolbar"
import staticLogoUrl from "@/assets/logo.png"
import { useContractor } from "@/hooks/useContractor"

const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)

interface ContractorOption {
  id: string
  slug: string
  name: string
}

function DevContractorDropdown() {
  const [open, setOpen] = useState(false)
  const [contractors, setContractors] = useState<ContractorOption[]>([])

  const contractorId = sessionStorage.getItem("cq_super_contractor_id") ?? ""
  const contractorName = sessionStorage.getItem("cq_super_contractor_name") ?? ""

  useEffect(() => {
    fetch("/api/v1/dev/contractors")
      .then((r) => r.json())
      .then((json: { ok: boolean; data: ContractorOption[] }) => {
        if (json.ok) setContractors(json.data)
      })
      .catch(() => {})
  }, [])

  function handleSelect(c: ContractorOption) {
    sessionStorage.setItem("cq_super_contractor_id", c.id)
    sessionStorage.setItem("cq_super_contractor_name", c.name)
    setOpen(false)
    window.location.reload()
  }

  return (
    <div className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        {contractorId
          ? <><span className="opacity-60">dev:</span> <strong>{contractorName}</strong></>
          : <span>Pick contractor</span>
        }
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-full rounded-md border border-border bg-background shadow-md">
            {contractors.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className={`w-full whitespace-nowrap text-left px-3 py-1.5 text-xs hover:bg-accent ${
                  c.id === contractorId ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {c.name}
                <span className="ml-1.5 font-mono opacity-50">{c.slug}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

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
        {import.meta.env.DEV && <DevContractorDropdown />}
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
