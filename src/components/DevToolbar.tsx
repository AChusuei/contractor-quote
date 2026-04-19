import { useState, useEffect, createContext, useContext, type ReactNode } from "react"

// ---------------------------------------------------------------------------
// Dev contractor dropdown
// ---------------------------------------------------------------------------

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
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
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

// ---------------------------------------------------------------------------
// Dev action slot — pages can register a fill action
// ---------------------------------------------------------------------------

interface DevAction {
  label: string
  onClick: () => void
}

const DevActionContext = createContext<{
  action: DevAction | null
  setAction: (action: DevAction | null) => void
}>({ action: null, setAction: () => {} })

export function DevActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<DevAction | null>(null)
  return (
    <DevActionContext.Provider value={{ action, setAction }}>
      {children}
    </DevActionContext.Provider>
  )
}

/** Pages call this to register a dev fill action. Clears on unmount. */
export function useDevAction(action: DevAction | null) {
  const { setAction } = useContext(DevActionContext)
  useEffect(() => {
    setAction(action)
    return () => setAction(null)
  }, [action?.label]) // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

type Theme = "system" | "light" | "dark"

function applyTheme(theme: Theme) {
  const prefersDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", prefersDark)
  localStorage.setItem("cq_theme", theme)
}

// ---------------------------------------------------------------------------
// Toolbar component
// ---------------------------------------------------------------------------

export function DevToolbar() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("cq_theme") as Theme) || "system"
  )
  const { action } = useContext(DevActionContext)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("system")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  if (!import.meta.env.DEV && !window.location.hostname.endsWith(".pages.dev")) return null

  const themeOptions: { value: Theme; label: string }[] = [
    { value: "system", label: "Auto" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ]

  return (
    <div className="fixed top-2 right-2 z-50 flex items-center gap-2 rounded-md border bg-background/80 backdrop-blur px-2 py-1 text-xs shadow-sm">
      <DevContractorDropdown />
      <span className="text-muted-foreground/40">|</span>
      {action && (
        <>
          <button
            onClick={action.onClick}
            className="rounded bg-amber-100 px-2 py-0.5 text-amber-700 hover:bg-amber-200 font-medium transition-colors dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
          >
            ⚡ {action.label}
          </button>
          <span className="text-muted-foreground/40">|</span>
        </>
      )}
      {themeOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={`rounded px-2 py-0.5 transition-colors ${
            theme === opt.value
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
