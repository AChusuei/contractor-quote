import { useEffect, useState } from "react"
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom"
import { useAuth, UserButton } from "@clerk/clerk-react"
import logoUrl from "@/assets/logo.png"
import { apiGet, setAuthProvider } from "@/lib/api"

const LOGO_URL = logoUrl || (import.meta.env.VITE_CQ_LOGO_URL as string | undefined)
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

  const navLinks = [
    { label: "Quotes", href: "/admin/quotes" },
    { label: "Customers", href: "/admin/customers" },
    { label: "Settings", href: "/admin/settings" },
    ...(isPlatformAdmin ? [{ label: "Platform", href: "/admin/platform" }] : []),
  ]

  return (
    <nav className="flex items-center gap-1">
      {navLinks.map((link) => (
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
      <div className="ml-auto">
        <AdminUserButton />
      </div>
    </>
  )
}

function SuperContractorBanner() {
  const navigate = useNavigate()
  const [contractorName, setContractorName] = useState<string | null>(null)

  useEffect(() => {
    const name = sessionStorage.getItem("cq_super_contractor_name")
    setContractorName(name)
  }, [])

  // Re-check on navigation (storage may change)
  useEffect(() => {
    function onStorage() {
      setContractorName(sessionStorage.getItem("cq_super_contractor_name"))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  if (!contractorName) return null

  function handleSwitch() {
    sessionStorage.removeItem("cq_super_contractor_id")
    sessionStorage.removeItem("cq_super_contractor_name")
    navigate("/admin/select")
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
      <span>Viewing as: <strong>{contractorName}</strong></span>
      <button
        onClick={handleSwitch}
        className="ml-1 underline underline-offset-2 hover:no-underline font-medium"
      >
        Switch
      </button>
    </div>
  )
}

export function AdminShell() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 shrink-0 items-center border-b bg-background px-6 gap-6">
        {LOGO_URL ? (
          <img src={LOGO_URL} alt="Logo" className="h-7 w-auto object-contain" />
        ) : (
          <span className="font-semibold text-sm">Admin</span>
        )}

        {CLERK_CONFIGURED && <ClerkAdminHeader />}
        <SuperContractorBanner />
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
