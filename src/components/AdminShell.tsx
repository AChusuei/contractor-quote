import { NavLink, Outlet } from "react-router-dom"
import { cn } from "@/lib/utils"
import logoUrl from "@/assets/logo.png"

const LOGO_URL = logoUrl || (import.meta.env.VITE_CQ_LOGO_URL as string | undefined)

const navItems = [
  { to: "/admin", label: "Quotes", end: true },
  { to: "/admin/queue", label: "Appointment Queue" },
  { to: "/admin/availability", label: "Availability" },
]

export function AdminShell() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 shrink-0 items-center border-b px-6 gap-6">
        {LOGO_URL ? (
          <img src={LOGO_URL} alt="Logo" className="h-8 w-auto object-contain" />
        ) : (
          <span className="font-semibold text-sm">Contractor Quote</span>
        )}
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide border-l pl-4">
          Admin
        </span>
      </header>
      <div className="flex">
        <nav className="w-48 shrink-0 border-r min-h-[calc(100vh-4rem)] p-4 space-y-1">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "block px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
