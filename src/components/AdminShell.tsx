import { useEffect, useState } from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
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
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
