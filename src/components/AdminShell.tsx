import { Outlet, Link, useLocation } from "react-router-dom"
import { useAuth, UserButton } from "@clerk/clerk-react"
import logoUrl from "@/assets/logo.png"

const LOGO_URL = logoUrl || (import.meta.env.VITE_CQ_LOGO_URL as string | undefined)
const CLERK_CONFIGURED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

// Only rendered inside a ClerkProvider (when CLERK_CONFIGURED is true)
function AdminUserButton() {
  const { isSignedIn } = useAuth()
  if (!isSignedIn) return null
  return <UserButton afterSignOutUrl="/admin/sign-in" />
}

export function AdminShell() {
  const location = useLocation()
  const navLinks = [{ label: "Quotes", href: "/admin/quotes" }]

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
        <div className="flex items-center gap-6">
          {LOGO_URL ? (
            <img src={LOGO_URL} alt="Logo" className="h-7 w-auto object-contain" />
          ) : (
            <span className="font-semibold text-sm">Admin</span>
          )}

          {CLERK_CONFIGURED && (
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    location.pathname === link.href
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {CLERK_CONFIGURED && <AdminUserButton />}
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
