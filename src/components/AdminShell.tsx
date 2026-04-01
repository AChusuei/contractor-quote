import { useEffect, useState } from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
import { useAuth, UserButton } from "@clerk/clerk-react"
import staticLogoUrl from "@/assets/logo.png"
import { apiGet, setAuthProvider } from "@/lib/api"
import { useContractorSession } from "@/contexts/ContractorSession"

const CLERK_CONFIGURED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

// Only rendered inside a ClerkProvider (when CLERK_CONFIGURED is true)
function AdminUserButton() {
  const { isSignedIn } = useAuth()
  if (!isSignedIn) return null
  return <UserButton afterSignOutUrl="/admin/sign-in" />
}

// Navigation bar with platform admin check — only rendered inside ClerkProvider
function AdminNav({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const location = useLocation()

  const contractorLinks = [
    { label: "Quotes", href: "/admin/quotes" },
    { label: "Customers", href: "/admin/customers" },
    { label: "Settings", href: "/admin/settings" },
  ]

  const superAdminLinks = isPlatformAdmin
    ? [
        { label: "Contractors", href: "/admin/contractors" },
        { label: "Super Users", href: "/admin/super-users" },
      ]
    : []

  return (
    <nav className="flex items-center gap-1">
      {contractorLinks.map((link) => (
        <Link
          key={link.href}
          to={link.href}
          className={`rounded px-3 py-1.5 text-sm transition-colors ${
            location.pathname.startsWith(link.href)
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          {link.label}
        </Link>
      ))}
      {superAdminLinks.length > 0 && (
        <>
          <div className="mx-1 h-5 w-px bg-border" aria-hidden />
          {superAdminLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                location.pathname.startsWith(link.href)
                  ? "bg-amber-100 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                  : "text-amber-700 hover:bg-amber-50 hover:text-amber-900 dark:text-amber-400 dark:hover:bg-amber-900/20 dark:hover:text-amber-200"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </>
      )}
    </nav>
  )
}

// Wrapper that handles platform admin check inside ClerkProvider
function ClerkAdminHeader() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setAuthProvider(() => getToken())
    apiGet("/platform/check").then((res) => {
      setIsPlatformAdmin(res.ok)
    }).catch(() => {
      setIsPlatformAdmin(false)
    })
  }, [isLoaded, isSignedIn, getToken])

  return (
    <>
      <AdminNav isPlatformAdmin={isPlatformAdmin} />
      <div className="ml-auto flex items-center gap-3">
        <ContractorDropdown isPlatformAdmin={isPlatformAdmin} />
        <AdminUserButton />
      </div>
    </>
  )
}

interface ContractorInfo {
  id: string
  name: string
  slug?: string
}

// Contractor switcher dropdown — shown in the header when a super admin is
// impersonating a contractor. Lists all contractors for quick switching.
// Works independently of ContractorSessionProvider so it renders on ALL admin
// pages, including super admin routes outside the provider.
function ContractorDropdown({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const { getToken } = useAuth()
  const [open, setOpen] = useState(false)
  const [contractors, setContractors] = useState<ContractorInfo[]>([])

  const contractorId = sessionStorage.getItem("cq_super_contractor_id") ?? ""
  const contractorName = sessionStorage.getItem("cq_super_contractor_name") ?? ""

  useEffect(() => {
    if (!isPlatformAdmin || !contractorId) return
    setAuthProvider(() => getToken())
    apiGet<ContractorInfo[]>("/platform/contractors").then((res) => {
      if (res.ok) setContractors(res.data as ContractorInfo[])
    }).catch(() => {})
  }, [isPlatformAdmin, contractorId, getToken])

  if (!isPlatformAdmin || !contractorId) return null

  function handleSelect(contractor: { id: string; name: string }) {
    sessionStorage.setItem("cq_super_contractor_id", contractor.id)
    sessionStorage.setItem("cq_super_contractor_name", contractor.name)
    setOpen(false)
    window.location.reload()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50"
      >
        <span>Viewing: <strong>{contractorName}</strong></span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-50 w-max max-w-[90vw] rounded-md border border-border bg-background shadow-md">
            {contractors
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className={`w-full whitespace-nowrap text-left px-4 py-2 text-sm hover:bg-accent ${
                  c.id === contractorId ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {c.name}
                {c.slug && <span className="ml-2 text-xs text-muted-foreground font-mono">{c.slug}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Full shell content — only rendered when Clerk confirms user is signed in
function ClerkAdminShellContent() {
  const { isLoaded, isSignedIn } = useAuth()
  const { logoUrl: sessionLogoUrl } = useContractorSession()
  const logoUrl = sessionLogoUrl ?? staticLogoUrl

  // While Clerk loads or user is not authenticated, show no header.
  // ProtectedRoute (wrapping page content via Outlet) handles the loading
  // state and redirect to sign-in.
  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen bg-background">
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 shrink-0 items-center border-b bg-background px-6 gap-6">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-7 w-auto object-contain" />
        ) : (
          <span className="font-semibold text-sm">Admin</span>
        )}
        <ClerkAdminHeader />
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}

export function AdminShell() {
  if (CLERK_CONFIGURED) {
    return <ClerkAdminShellContent />
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 shrink-0 items-center border-b bg-background px-6 gap-6">
        {staticLogoUrl ? (
          <img src={staticLogoUrl} alt="Logo" className="h-7 w-auto object-contain" />
        ) : (
          <span className="font-semibold text-sm">Admin</span>
        )}
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
